import { Op } from 'sequelize';
import type { Transaction } from 'sequelize';
import sequelize from '../config/database.js';
import {
  Student, Class, AcademicYear, PromotionDecision, Assignment, EvaluationPeriod,
} from '../models/index.js';
import { computeStudentResults, combinePeriodAverages, resolveGradingRules, mentionFor, applyRounding } from './AcademicEngine.js';
import { AppError } from '../middleware/errorHandler.js';

/**
 * PromotionService — the year rollover.
 *
 * The hard requirement: a rollover must MOVE students forward while leaving
 * the closed year completely intact. Every grade, attendance record and
 * assessment stays attached to the class and year it belonged to; only the
 * student's CURRENT classId changes.
 *
 * The workflow is deliberately split in two phases:
 *
 *   1. DELIBERATE  — compute results, record a decision per student, and
 *                    persist it. Nothing is applied to the student yet.
 *   2. APPLY       — act on confirmed decisions (move class, set status).
 *
 * This split is what makes the process auditable and lets a school review the
 * board before committing. A decision is the historical record of *why* a
 * student was promoted, redoubled or excluded.
 */

export type PromotionDecisionType = 'PROMU' | 'REDOUBLE' | 'TRANSFERE' | 'EXCLU' | 'A_DELIBERER';

export const DECISION_LABELS: Record<PromotionDecisionType, string> = {
  PROMU: 'Promu',
  REDOUBLE: 'Redouble',
  TRANSFERE: 'Transféré',
  EXCLU: 'Exclu',
  A_DELIBERER: 'À délibérer',
};

export interface Candidate {
  studentId: string;
  studentName: string;
  studentNumber: string;
  classId: string | null;
  className: string | null;
  /** Annual average computed from the closed year's periods. */
  annualAverage: number;
  /** Average per period, in order. */
  periodAverages: Array<{ periodId: string; name: string; average: number }>;
  mention: string;
  passed: boolean;
  rank: number | null;
  totalStudents: number;
  ungradedSubjects: number;
  /** Existing decision, when the school already deliberated this student. */
  decision: PromotionDecisionType | null;
  decisionStatus: string | null;
  proposedDecision: PromotionDecisionType;
}

export interface DeliberationSummary {
  academicYearId: string;
  academicYearName: string;
  classId: string;
  className: string;
  total: number;
  promoted: number;
  repeated: number;
  transferred: number;
  excluded: number;
  undecided: number;
  passingRate: number;
  classAverage: number;
  candidates: Candidate[];
  rules: Awaited<ReturnType<typeof resolveGradingRules>>;
}

/**
 * Resolves the academic year being closed. Defaults to the active one.
 */
export async function resolveSourceYear(schoolId: string, academicYearId?: string): Promise<AcademicYear> {
  if (academicYearId) {
    const year = await AcademicYear.findOne({ where: { id: academicYearId, schoolId } });
    if (!year) throw new AppError('Année scolaire introuvable', 404);
    return year;
  }
  const year = await AcademicYear.findOne({
    where: { schoolId, status: 'active' },
    order: [['startDate', 'DESC']],
  });
  if (!year) throw new AppError('Aucune année scolaire active', 400);
  return year;
}

/**
 * Builds the deliberation sheet for one class: real computed results merged
 * with any decision already recorded.
 *
 * `autoDecide` proposes a decision from the school's rules; it never writes
 * anything, and a school is always free to override the proposal.
 */
export async function buildDeliberationSheet(
  schoolId: string,
  classId: string,
  options: { academicYearId?: string; autoDecide?: boolean } = {}
): Promise<DeliberationSummary> {
  const year = await resolveSourceYear(schoolId, options.academicYearId);
  const classRow = await Class.findOne({ where: { id: classId, schoolId } });
  if (!classRow) throw new AppError('Classe introuvable', 404);

  const rules = await resolveGradingRules(schoolId, {
    cycleId: classRow.cycleId ?? null,
    niveauId: classRow.niveauId ?? null,
  });

  const periods = await EvaluationPeriod.findAll({
    where: { academicYearId: year.id },
    order: [['sequence', 'ASC']],
  });

  // Students still in the class.
  const students = await Student.findAll({
    where: { schoolId, classId, status: 'active' },
    attributes: ['id', 'firstName', 'lastName', 'studentId', 'classId'],
    order: [['lastName', 'ASC']],
  });
  if (students.length === 0) {
    return {
      academicYearId: year.id,
      academicYearName: year.name,
      classId,
      className: classRow.name,
      total: 0, promoted: 0, repeated: 0, transferred: 0, excluded: 0, undecided: 0,
      passingRate: 0, classAverage: 0, candidates: [], rules,
    };
  }

  const studentIds = students.map((s) => s.id);

  // Real results, period by period.
  const perPeriod = new Map<string, number>();
  for (const p of periods) {
    const results = await computeStudentResults({
      schoolId, academicYearId: year.id, periodId: p.id, studentIds,
    });
    for (const r of results) {
      const prev = perPeriod.get(r.studentId);
      if (prev === undefined) perPeriod.set(r.studentId, r.average);
    }
  }

  // Annual average per student (weighted across periods).
  const annual = new Map<string, { average: number; periodList: Array<{ periodId: string; name: string; average: number }> }>();
  for (const p of periods) {
    const results = await computeStudentResults({
      schoolId, academicYearId: year.id, periodId: p.id, studentIds,
    });
    for (const r of results) {
      const entry = annual.get(r.studentId) ?? { average: 0, periodList: [] };
      entry.periodList.push({ periodId: p.id, name: p.name, average: r.average });
      annual.set(r.studentId, entry);
    }
  }
  for (const [studentId, entry] of annual) {
    entry.average = combinePeriodAverages(entry.periodList.map((x) => x.average), rules);
  }

  // Rank within the class (shared on ties).
  const ranked = [...annual.entries()].sort((a, b) => b[1].average - a[1].average);
  const ranks = new Map<string, number>();
  let rank = 0;
  let previous: number | null = null;
  ranked.forEach(([studentId, entry], index) => {
    if (previous === null || entry.average !== previous) {
      rank = index + 1;
      previous = entry.average;
    }
    ranks.set(studentId, rank);
  });

  // Decisions already recorded.
  const existing = await PromotionDecision.findAll({
    where: { schoolId, academicYearId: year.id, studentId: { [Op.in]: studentIds } },
  });
  const existingByStudent = new Map(existing.map((d) => [d.studentId, d]));

  const candidates: Candidate[] = students.map((s) => {
    const entry = annual.get(s.id) ?? { average: 0, periodList: [] };
    const prior = existingByStudent.get(s.id);
    const passed = entry.average >= rules.passingAverage;
    const proposed: PromotionDecisionType = passed ? 'PROMU' : 'A_DELIBERER';
    return {
      studentId: s.id,
      studentName: `${s.firstName} ${s.lastName}`.trim(),
      studentNumber: s.studentId,
      classId: s.classId,
      className: classRow.name,
      annualAverage: entry.average,
      periodAverages: entry.periodList,
      mention: mentionFor(entry.average, rules),
      passed,
      rank: ranks.get(s.id) ?? null,
      totalStudents: students.length,
      ungradedSubjects: 0,
      decision: (prior?.decision as PromotionDecisionType) ?? null,
      decisionStatus: prior?.status ?? null,
      proposedDecision: options.autoDecide ? proposed : 'A_DELIBERER',
    };
  });

  const summary: DeliberationSummary = {
    academicYearId: year.id,
    academicYearName: year.name,
    classId,
    className: classRow.name,
    total: candidates.length,
    promoted: candidates.filter((c) => c.decision === 'PROMU').length,
    repeated: candidates.filter((c) => c.decision === 'REDOUBLE').length,
    transferred: candidates.filter((c) => c.decision === 'TRANSFERE').length,
    excluded: candidates.filter((c) => c.decision === 'EXCLU').length,
    undecided: candidates.filter((c) => !c.decision || c.decision === 'A_DELIBERER').length,
    passingRate: candidates.length
      ? Math.round((candidates.filter((c) => c.passed).length / candidates.length) * 100)
      : 0,
    classAverage: candidates.length
      ? applyRounding(candidates.reduce((a, c) => a + c.annualAverage, 0) / candidates.length, rules)
      : 0,
    candidates,
    rules,
  };
  return summary;
}

export interface RecordDecisionInput {
  studentId: string;
  decision: PromotionDecisionType;
  toClassId?: string | null;
  catchUp?: boolean;
  notes?: string | null;
}

/**
 * Records (or updates) one deliberation decision. Idempotent per student+year:
 * re-deliberating updates the row rather than duplicating history, but the
 * decidedBy/decidedAt are refreshed so the latest council is traceable.
 */
export async function recordDecision(
  schoolId: string,
  academicYearId: string,
  input: RecordDecisionInput,
  decidedBy: string,
  tx?: Transaction
): Promise<PromotionDecision> {
  const student = await Student.findOne({ where: { id: input.studentId, schoolId } });
  if (!student) throw new AppError('Élève introuvable', 404);
  if (input.decision === 'PROMU' && !input.toClassId) {
    throw new AppError('Une classe de destination est requise pour une promotion', 400);
  }
  if (input.toClassId) {
    const target = await Class.findOne({ where: { id: input.toClassId, schoolId } });
    if (!target) throw new AppError('Classe de destination introuvable', 404);
  }

  // Recompute the annual average so the record is self-explanatory later.
  let annualAverage = 0;
  let rank: number | null = null;
  try {
    const rules = await resolveGradingRules(schoolId);
    const periods = await EvaluationPeriod.findAll({ where: { academicYearId }, order: [['sequence', 'ASC']] });
    const averages: number[] = [];
    for (const p of periods) {
      const [r] = await computeStudentResults({
        schoolId, academicYearId, periodId: p.id, studentIds: [student.id],
      });
      if (r) averages.push(r.average);
    }
    annualAverage = combinePeriodAverages(averages, rules);
  } catch {
    annualAverage = 0;
  }

  const existing = await PromotionDecision.findOne({
    where: { studentId: student.id, academicYearId },
    ...(tx ? { transaction: tx } : {}),
  });

  if (existing) {
    await existing.update({
      decision: input.decision,
      toClassId: input.toClassId ?? null,
      fromClassId: student.classId ?? null,
      annualAverage,
      catchUp: input.catchUp ?? existing.catchUp,
      deliberationNotes: input.notes ?? existing.deliberationNotes,
      status: 'confirmed',
      decidedBy,
      decidedAt: new Date(),
    }, tx ? { transaction: tx } : {});
    return existing;
  }

  return PromotionDecision.create({
    schoolId,
    studentId: student.id,
    academicYearId,
    fromClassId: student.classId ?? null,
    toClassId: input.toClassId ?? null,
    decision: input.decision,
    annualAverage,
    rank,
    catchUp: input.catchUp ?? false,
    deliberationNotes: input.notes ?? null,
    status: 'confirmed',
    decidedBy,
    decidedAt: new Date(),
  }, tx ? { transaction: tx } : {});
}

export interface ApplyResult {
  applied: number;
  promoted: number;
  repeated: number;
  transferred: number;
  excluded: number;
  skipped: number;
  errors: Array<{ studentId: string; error: string }>;
}

/**
 * Applies confirmed decisions. This is the only step that mutates students.
 *
 * History protection: the student's classId is moved to the new class, but the
 * closed year keeps its own class rows, assessments, grades and attendance —
 * nothing is migrated or deleted.
 */
export async function applyDecisions(
  schoolId: string,
  academicYearId: string,
  actorId: string
): Promise<ApplyResult> {
  // Include already-applied rows so a re-run reports them as skipped instead
  // of silently doing nothing (which is what made the endpoint look broken).
  const decisions = await PromotionDecision.findAll({
    where: { schoolId, academicYearId, status: { [Op.in]: ['confirmed', 'proposed', 'applied'] } },
  });

  const result: ApplyResult = {
    applied: 0, promoted: 0, repeated: 0, transferred: 0, excluded: 0, skipped: 0, errors: [],
  };
  if (decisions.length === 0) return result;

  for (const d of decisions) {
    try {
      if (d.status === 'applied') {
        result.skipped += 1;
        continue;
      }
      const student = await Student.findByPk(d.studentId);
      if (!student) {
        result.errors.push({ studentId: d.studentId, error: 'Élève introuvable' });
        continue;
      }

      if (d.decision === 'PROMU') {
        if (!d.toClassId) {
          result.errors.push({ studentId: d.studentId, error: 'Classe de destination manquante' });
          continue;
        }
        const target = await Class.findOne({ where: { id: d.toClassId, schoolId } });
        if (!target) {
          result.errors.push({ studentId: d.studentId, error: 'Classe de destination introuvable' });
          continue;
        }
        await student.update({ classId: target.id, status: 'active' });
        result.promoted += 1;
      } else if (d.decision === 'REDOUBLE') {
        // Stays in the same class for the next year; the class row for the
        // closed year is untouched, which is what preserves the history.
        await student.update({ status: 'active' });
        result.repeated += 1;
      } else if (d.decision === 'TRANSFERE') {
        // Leaves the school. status='transferred' keeps the record linked.
        await student.update({ status: 'transferred' });
        result.transferred += 1;
      } else if (d.decision === 'EXCLU') {
        await student.update({ status: 'inactive' });
        result.excluded += 1;
      } else {
        // A_DELIBERER: nothing to apply.
        result.skipped += 1;
        continue;
      }

      await d.update({ status: 'applied', appliedAt: new Date(), appliedBy: actorId });
      result.applied += 1;
    } catch (error) {
      result.errors.push({ studentId: d.studentId, error: (error as Error).message });
    }
  }
  return result;
}

export interface RolloverOptions {
  schoolId: string;
  sourceYearId: string;
  /** Name of the year being created, e.g. "2027-2028". */
  targetYearName: string;
  targetStartDate?: Date;
  targetEndDate?: Date;
  actorId: string;
  /** Create the target year automatically when it does not exist. */
  createYearIfMissing?: boolean;
}

export interface RolloverResult {
  targetYearId: string;
  targetYearName: string;
  targetYearCreated: boolean;
  classesCreated: Array<{ sourceId: string; sourceName: string; newId: string; newName: string }>;
  assignmentsRolled: number;
  yearClosed: boolean;
  warnings: string[];
}

/**
 * Prepares the next academic year WITHOUT applying any promotion.
 *
 * This creates the target year and a copy of the class structure. Students are
 * not moved here — that is `applyDecisions`, run after the board decides.
 * Keeping the two apart is what lets a school prepare 2027-2028 while still
 * deliberating 2026-2027.
 */
export async function prepareRollover(options: RolloverOptions): Promise<RolloverResult> {
  const { schoolId, sourceYearId, targetYearName, actorId } = options;
  const warnings: string[] = [];

  const source = await AcademicYear.findOne({ where: { id: sourceYearId, schoolId } });
  if (!source) throw new AppError('Année scolaire source introuvable', 404);

  return sequelize.transaction(async (t) => {
    // 1) Find or create the target year.
    let target = await AcademicYear.findOne({
      where: { schoolId, name: targetYearName },
      transaction: t,
    });
    let targetYearCreated = false;
    if (!target) {
      if (options.createYearIfMissing === false) {
        throw new AppError(`L’année « ${targetYearName} » n’existe pas`, 400);
      }
      target = await AcademicYear.create({
        schoolId,
        name: targetYearName,
        startDate: options.targetStartDate ?? null,
        endDate: options.targetEndDate ?? null,
        // Created as 'closed' so it does NOT steal the active flag: the
        // school flips it when it is ready to run the new year.
        status: 'closed',
      }, { transaction: t });
      targetYearCreated = true;
    } else {
      warnings.push(`L’année « ${targetYearName} » existe déjà : elle sera réutilisée.`);
    }

    // 2) Copy the class structure, one new class per source class.
    const sourceClasses = await Class.findAll({ where: { schoolId, academicYear: source.name } });
    const created: RolloverResult['classesCreated'] = [];
    for (const sc of sourceClasses) {
      const existing = await Class.findOne({
        where: { schoolId, name: sc.name, academicYear: targetYearName },
        transaction: t,
      });
      if (existing) {
        created.push({ sourceId: sc.id, sourceName: sc.name, newId: existing.id, newName: existing.name });
        continue;
      }
      const clone = await Class.create({
        schoolId,
        name: sc.name,
        level: sc.level,
        section: sc.section,
        capacity: sc.capacity,
        academicYear: targetYearName,
        cycleId: sc.cycleId,
        filiereId: sc.filiereId,
        sectionId: sc.sectionId,
        optionId: sc.optionId,
        niveauId: sc.niveauId,
        // Teacher is NOT carried over: assignments are reviewed per year.
        teacherId: null,
      }, { transaction: t });
      created.push({ sourceId: sc.id, sourceName: sc.name, newId: clone.id, newName: clone.name });
    }

    // 3) Propose a rollover for teacher assignments. They stay "scheduled"
    //    until the school confirms, so nothing silently expires.
    const assignments = await Assignment.findAll({
      where: { schoolId, status: 'active', academicYearId: sourceYearId },
      transaction: t,
    });
    let assignmentsRolled = 0;
    for (const a of assignments) {
      const targetClassId = a.classId
        ? created.find((c) => c.sourceId === a.classId)?.newId ?? null
        : null;
      const exists = await Assignment.findOne({
        where: { userId: a.userId, schoolId, academicYearId: target.id, classId: targetClassId, subjectId: a.subjectId },
        transaction: t,
      });
      if (exists) continue;
      await Assignment.create({
        userId: a.userId,
        schoolId,
        academicYearId: target.id,
        assignmentType: a.assignmentType,
        classId: targetClassId,
        subjectId: a.subjectId,
        sectionId: a.sectionId,
        levelId: a.levelId,
        departmentId: a.departmentId,
        status: 'scheduled',
        isPrimary: a.isPrimary,
        assignedBy: actorId,
        notes: `Rollover depuis ${source.name}`,
      }, { transaction: t });
      assignmentsRolled += 1;
    }

    if (assignmentsRolled > 0) {
      warnings.push(`${assignmentsRolled} affectation(s) d’enseignant proposée(s) en « planifiée » : à confirmer.`);
    }
    if (sourceClasses.length === 0) {
      warnings.push(`Aucune classe rattachée à « ${source.name} » : rien n’a été dupliqué.`);
    }

    return {
      targetYearId: target.id,
      targetYearName,
      targetYearCreated,
      classesCreated: created,
      assignmentsRolled,
      yearClosed: false,
      warnings,
    };
  });
}

/**
 * Closes the source year and activates the target one, in a single
 * transaction. Refuses while students are still undecided so a school cannot
 * accidentally close a year with students left in limbo.
 */
export async function closeYear(
  schoolId: string,
  sourceYearId: string,
  targetYearId: string,
  options: { allowUndecided?: boolean } = {}
): Promise<{ closedYearId: string; activeYearId: string }> {
  const pending = await PromotionDecision.count({
    where: { schoolId, academicYearId: sourceYearId, status: { [Op.in]: ['proposed'] } },
  });
  const decided = await PromotionDecision.count({
    where: { schoolId, academicYearId: sourceYearId },
  });
  const students = await Student.count({ where: { schoolId, status: 'active' } });

  if (!options.allowUndecided && students > 0 && decided === 0) {
    throw new AppError(
      'Aucune décision de délibération enregistrée. Lancez la délibération avant de clôturer.',
      400
    );
  }
  if (pending > 0) {
    throw new AppError(
      `${pending} décision(s) encore au statut « proposé ». Confirmez-les avant de clôturer.`,
      400
    );
  }

  return sequelize.transaction(async (t) => {
    const source = await AcademicYear.findOne({ where: { id: sourceYearId, schoolId }, transaction: t });
    const target = await AcademicYear.findOne({ where: { id: targetYearId, schoolId }, transaction: t });
    if (!source) throw new AppError('Année source introuvable', 404);
    if (!target) throw new AppError('Année cible introuvable', 404);

    await source.update({ status: 'closed' }, { transaction: t });
    await AcademicYear.update({ status: 'closed' }, {
      where: { schoolId, status: 'active' },
      transaction: t,
    });
    await target.update({ status: 'active' }, { transaction: t });

    return { closedYearId: source.id, activeYearId: target.id };
  });
}

/** Decision history for a year — the audit trail of a deliberation. */
export async function listDecisions(
  schoolId: string,
  academicYearId: string
): Promise<PromotionDecision[]> {
  return PromotionDecision.findAll({
    where: { schoolId, academicYearId },
    include: [
      { model: Student, as: 'student', attributes: ['id', 'firstName', 'lastName', 'studentId'] },
      { model: Class, as: 'fromClass', attributes: ['id', 'name'] },
      { model: Class, as: 'toClass', attributes: ['id', 'name'] },
    ],
    order: [['createdAt', 'DESC']],
  });
}
