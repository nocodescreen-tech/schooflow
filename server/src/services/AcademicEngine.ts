import { Op, fn, col, literal } from 'sequelize';
import sequelize from '../config/database.js';
import { Assessment, Grade, EvaluationPeriod, Subject, Student, Class, School, GradingConfig as GradingConfigModel, AcademicYear } from '../models/index.js';
import { AppError } from '../middleware/errorHandler.js';

/**
 * AcademicEngine — core academic calculations.
 *
 * This service centralises all grade aggregations so that:
 * - Every average uses the same formula
 * - Rounding, weighting, missing grades are handled consistently
 * - Reports, bulletins, APIs all share the same logic
 *
 * No component should re-implement averages; they all call here.
 */

export interface GradeAverageOptions {
  /** How to weight: 'coefficient' (default) or 'equal' */
  weighting?: 'coefficient' | 'equal';
  /** Rounding mode for final average */
  rounding?: 'standard' | 'floor' | 'ceil';
  /** Decimal places for averages */
  precision?: number;
  /** Minimum number of grades required for a valid average */
  minGrades?: number;
  /** How to handle missing grades: 'zero' | 'ignore' | 'fail' */
  missingPolicy?: 'zero' | 'ignore' | 'fail';
}

/**
 * Default grading rules — overridable per school.
 * All options can be configured per school via GradingConfig model.
 */
export interface GradingConfig {
  /** Minimum average to pass (e.g., 10 / 20) */
  passingAverage: number;
  /** Thresholds for mentions */
  mentionThresholds: {
    tres_bien: number;   // >= 16
    bien: number;        // >= 14
    assez_bien: number;  // >= 12
    passable: number;    // >= 10
    insuffisant: number; // < 10
  };
  /** Rounding mode: 'standard' | 'floor' | 'ceil' */
  rounding: 'standard' | 'floor' | 'ceil';
  /** Decimal places for averages */
  precision: number;
  /** Weighting method: 'coefficient' (weighted by coefficient) or 'equal' (equal weight) */
  weighting: 'coefficient' | 'equal';
  /** How to handle missing grades: 'zero' (count as 0), 'ignore' (exclude), 'fail' (error) */
  missingPolicy: 'zero' | 'ignore' | 'fail';
  /** Minimum number of grades required for a valid average */
  minGrades: number;
  /** Enable repêchage (oral makeup exam) for averages below passing */
  repEnabled: boolean;
  /** Minimum average to be eligible for repêchage */
  repMinAverage: number;
  /** Maximum average after repêchage (capped) */
  repMaxAverage: number;
  /** Whether to use coefficient as weight */
  useCoefficientWeight: boolean;
  /** Normalize scores to /20 scale before averaging */
  normalizeTo20: boolean;
  /** Minimum valid grade (0-20) */
  minValidGrade: number;
  /** Maximum valid grade (0-20) */
  maxValidGrade: number;
  /** Whether to include absent grades in average calculation */
  includeAbsentInAverage: boolean;
  /** Custom grade scales (e.g., { A: {min:16, max:20}, B: {min:14, max:15.99} }) */
  customGradeScales: Record<string, { min: number; max: number }> | null;
}

/**
 * Result of computing a student's average for a subject in a period.
 */
export interface SubjectAverageResult {
  subjectId: string;
  subjectName: string;
  average: number;
  weightedAverage: number;
  totalCoefficient: number;
  gradeCount: number;
  missingGrades: number;
  mention: string;
  passed: boolean;
}

/**
 * Result of computing a student's general average for a period.
 */
export interface PeriodAverageResult {
  studentId: string;
  periodId: string;
  generalAverage: number;
  weightedAverage: number;
  totalCoefficient: number;
  subjectAverages: SubjectAverageResult[];
  rank: number | null;
  totalStudents: number;
  mention: string;
  passed: boolean;
  rankChange?: number;
}

/**
 * Result for class-wide statistics in a period.
 */
export interface ClassPeriodStats {
  periodId: string;
  classId: string;
  className: string;
  totalStudents: number;
  classAverage: number;
  successRate: number;
  subjectStats: {
    subjectId: string;
    subjectName: string;
    average: number;
    successRate: number;
    gradeCount: number;
  }[];
}

export interface StudentResult {
  studentId: string;
  studentName: string;
  className: string;
  generalAverage: number;
  /** Alias for generalAverage — historical callers read `average`. */
  average: number;
  weightedAverage: number;
  totalCoefficient: number;
  subjectAverages: SubjectAverageResult[];
  rank: number | null;
  totalStudents: number;
  mention: string;
  passed: boolean;
  rankChange?: number;
}

/**
 * Default grading rules.
 */
export const DEFAULT_RULES: GradingConfig = {
  passingAverage: 10,
  mentionThresholds: { tres_bien: 16, bien: 14, assez_bien: 12, passable: 10, insuffisant: 0 },
  rounding: 'standard',
  precision: 2,
  weighting: 'coefficient',
  missingPolicy: 'ignore',
  minGrades: 1,
  repEnabled: false,
  repMinAverage: 8,
  repMaxAverage: 10,
  useCoefficientWeight: true,
  normalizeTo20: true,
  minValidGrade: 0,
  maxValidGrade: 20,
  includeAbsentInAverage: false,
  customGradeScales: null,
};

/**
 * Resolve grading configuration for a school (fallback to defaults).
 */
export async function resolveGradingConfig(schoolId: string): Promise<GradingConfig> {
  const cfg = await GradingConfigModel.findOne({ where: { schoolId } });
  if (cfg) {
    return {
      passingAverage: cfg.passingAverage ?? 10,
      mentionThresholds: (cfg.mentionThresholds ?? {
        tres_bien: 16,
        bien: 14,
        assez_bien: 12,
        passable: 10,
        insuffisant: 0,
      }) as GradingConfig['mentionThresholds'],
      rounding: cfg.rounding ?? 'standard',
      precision: cfg.precision ?? 2,
      weighting: cfg.weighting ?? 'coefficient',
      missingPolicy: cfg.missingPolicy ?? 'ignore',
      minGrades: cfg.minGrades ?? 1,
      repEnabled: cfg.repEnabled ?? false,
      repMinAverage: cfg.repMinAverage ?? 8,
      repMaxAverage: cfg.repMaxAverage ?? 10,
      useCoefficientWeight: cfg.useCoefficientWeight ?? true,
      normalizeTo20: cfg.normalizeTo20 ?? true,
      minValidGrade: cfg.minValidGrade ?? 0,
      maxValidGrade: cfg.maxValidGrade ?? 20,
      includeAbsentInAverage: cfg.includeAbsentInAverage ?? false,
      customGradeScales: cfg.customGradeScales ?? null,
    };
  }
  return { ...DEFAULT_RULES };
}

/**
 * Round a number according to the configured mode.
 */
export function applyRounding(value: number, mode: 'standard' | 'floor' | 'ceil', precision: number): number {
  const factor = Math.pow(10, precision);
  switch (mode) {
    case 'floor': return Math.floor(value * factor) / factor;
    case 'ceil': return Math.ceil(value * factor) / factor;
    default: return Math.round(value * factor) / factor;
  }
}

/**
 * Convert numeric average to mention text.
 */
export function mentionFor(avg: number, cfg: GradingConfig): string {
  const { mentionThresholds } = cfg;
  if (avg >= mentionThresholds.tres_bien) return 'Très bien';
  if (avg >= mentionThresholds.bien) return 'Bien';
  if (avg >= mentionThresholds.assez_bien) return 'Assez bien';
  if (avg >= mentionThresholds.passable) return 'Passable';
  return 'Insuffisant';
}

/**
 * Core: compute weighted average for ONE student in ONE subject for ONE period.
 *
 * This is the atomic unit — every higher-level average builds on this.
 */
export async function computeSubjectAverage(
  studentId: string,
  subjectId: string,
  periodId: string,
  schoolId: string,
  options: Partial<GradeAverageOptions> = {}
): Promise<SubjectAverageResult> {
  const cfg = await resolveGradingConfig(schoolId);
  
  // Merge options with school config (options override school config)
  const effectiveWeighting = options.weighting ?? cfg.weighting;
  const effectiveMissingPolicy = options.missingPolicy ?? cfg.missingPolicy;
  const effectiveRounding = options.rounding ?? cfg.rounding;
  const effectivePrecision = options.precision ?? cfg.precision;
  const effectiveMinGrades = options.minGrades ?? cfg.minGrades;

  const assessments = await Assessment.findAll({
    where: { subjectId, evaluationPeriodId: periodId, isPublished: true },
    attributes: ['id', 'maxScore', 'coefficient'],
    include: [{
      model: Grade,
      as: 'grades',
      where: { studentId },
      required: false,
      attributes: ['score', 'isPublished'],
    }],
  });

  if (assessments.length === 0) {
    return {
      subjectId,
      subjectName: '',
      average: 0,
      weightedAverage: 0,
      totalCoefficient: 0,
      gradeCount: 0,
      missingGrades: 0,
      mention: 'Non évalué',
      passed: false,
    };
  }

  let totalWeighted = 0;
  let totalWeight = 0;
  let validGrades = 0;
  let missingGrades = 0;

  for (const a of assessments) {
    const grade = (a as any).grades?.[0];
    const hasGrade = grade && grade.isPublished;
    const assessmentWeight = effectiveWeighting === 'coefficient' ? Number(a.coefficient) : 1;

    if (!hasGrade) {
      missingGrades++;
      if (effectiveMissingPolicy === 'zero') {
        totalWeighted += 0 * assessmentWeight;
        totalWeight += assessmentWeight;
      } else if (effectiveMissingPolicy === 'fail') {
        throw new Error(`Note manquante pour l'évaluation ${a.id}`);
      }
      continue;
    }

    validGrades++;
    const score = Number(grade.score);
    const maxScore = Number(a.maxScore);
    
    // Validate grade bounds
    if (score < cfg.minValidGrade || score > cfg.maxValidGrade) {
      missingGrades++;
      if (effectiveMissingPolicy === 'zero') {
        totalWeighted += 0 * assessmentWeight;
        totalWeight += assessmentWeight;
      } else if (effectiveMissingPolicy === 'fail') {
        throw new Error(`Note invalide pour l'évaluation ${a.id}: ${score} hors bornes [${cfg.minValidGrade}, ${cfg.maxValidGrade}]`);
      }
      continue;
    }

    const normalized = cfg.normalizeTo20 && maxScore > 0 ? (score / maxScore) * 20 : score;
    const weight = cfg.useCoefficientWeight ? assessmentWeight : 1;
    totalWeighted += normalized * weight;
    totalWeight += assessmentWeight;
  }

  // Check minimum grades requirement
  if (validGrades < effectiveMinGrades && effectiveMissingPolicy !== 'zero') {
    return {
      subjectId,
      subjectName: '',
      average: 0,
      weightedAverage: 0,
      totalCoefficient: 0,
      gradeCount: validGrades,
      missingGrades,
      mention: 'Notes insuffisantes',
      passed: false,
    };
  }

  if (validGrades === 0 && effectiveMissingPolicy !== 'zero') {
    return {
      subjectId,
      subjectName: '',
      average: 0,
      weightedAverage: 0,
      totalCoefficient: 0,
      gradeCount: 0,
      missingGrades,
      mention: 'Non évalué',
      passed: false,
    };
  }

  const rawAverage = totalWeight > 0 ? totalWeighted / totalWeight : 0;
  const rounded = applyRounding(rawAverage, effectiveRounding, effectivePrecision);

  // Handle repêchage if enabled
  let finalAverage = rounded;
  let passed = rounded >= cfg.passingAverage;
  
  if (cfg.repEnabled && !passed && rounded >= cfg.repMinAverage && rounded < cfg.passingAverage) {
    // Eligible for repêchage - cap at repMaxAverage
    finalAverage = Math.min(rounded, cfg.repMaxAverage);
    passed = finalAverage >= cfg.passingAverage;
  }

  return {
    subjectId,
    subjectName: '',
    average: finalAverage,
    weightedAverage: finalAverage,
    totalCoefficient: totalWeight,
    gradeCount: validGrades,
    missingGrades,
    mention: mentionFor(finalAverage, cfg),
    passed,
  };
}

/**
 * Compute a student's full period average across ALL subjects.
 */
export async function computePeriodAverage(
  studentId: string,
  periodId: string,
  schoolId: string,
  options: Partial<GradeAverageOptions> = {}
): Promise<PeriodAverageResult> {
  const cfg = await resolveGradingConfig(schoolId);
  const { Subject } = await import('../models/index.js');

  const subjects = await Subject.findAll({
    where: { schoolId },
    attributes: ['id', 'name'],
  });

  const subjectResults: SubjectAverageResult[] = [];
  for (const s of subjects) {
    const avg = await computeSubjectAverage(studentId, s.id, periodId, schoolId, options);
    subjectResults.push({ ...avg, subjectName: s.name, subjectId: s.id });
  }

  const validSubjects = subjectResults.filter(r => r.gradeCount > 0 || r.missingGrades === 0);
  const totalCoeff = validSubjects.reduce((sum, r) => sum + r.totalCoefficient, 0);
  const weightedSum = validSubjects.reduce((sum, r) => sum + r.weightedAverage * r.totalCoefficient, 0);
  const generalAvg = totalCoeff > 0 ? weightedSum / totalCoeff : 0;

  const rounded = applyRounding(generalAvg, cfg.rounding, cfg.precision);
  const mention = mentionFor(rounded, cfg);

  // Handle repêchage at period level
  let finalAverage = rounded;
  let passed = rounded >= cfg.passingAverage;
  
  if (cfg.repEnabled && !passed && rounded >= cfg.repMinAverage && rounded < cfg.passingAverage) {
    finalAverage = Math.min(rounded, cfg.repMaxAverage);
    passed = finalAverage >= cfg.passingAverage;
  }

  return {
    studentId,
    periodId,
    generalAverage: finalAverage,
    weightedAverage: finalAverage,
    totalCoefficient: totalCoeff,
    subjectAverages: subjectResults,
    rank: null,
    totalStudents: 0,
    mention: mentionFor(finalAverage, cfg),
    passed,
  };
}

/**
 * Compute class rankings for a period.
 */
export async function computeClassRanking(
  periodId: string,
  classId: string,
  schoolId: string
): Promise<PeriodAverageResult[]> {
  const { Student } = await import('../models/index.js');

  const students = await Student.findAll({
    where: { classId, schoolId, status: 'active' },
    attributes: ['id'],
  });

  const results: PeriodAverageResult[] = [];
  for (const s of students) {
    const avg = await computePeriodAverage(s.id, periodId, schoolId);
    results.push({ ...avg, studentId: s.id });
  }

  // Sort by weighted average desc
  results.sort((a, b) => b.weightedAverage - a.weightedAverage);

  // Assign ranks (handle ties)
  let rank = 1;
  for (let i = 0; i < results.length; i++) {
    if (i > 0 && results[i].weightedAverage !== results[i - 1].weightedAverage) {
      rank = i + 1;
    }
    results[i].rank = rank;
    results[i].totalStudents = results.length;
  }

  return results;
}

/**
 * Class-wide statistics for a period.
 */
export async function computeClassStats(
  periodId: string,
  classId: string,
  schoolId: string
): Promise<ClassPeriodStats> {
  const { Subject } = await import('../models/index.js');

  const students = await Student.findAll({
    where: { classId, schoolId, status: 'active' },
    attributes: ['id'],
  });

  const subjectStats: ClassPeriodStats['subjectStats'] = [];
  const subjects = await Subject.findAll({ where: { schoolId }, attributes: ['id', 'name'] });

  let totalGrades = 0;
  let totalScore = 0;
  let passedCount = 0;

  for (const s of subjects) {
    let subjGrades = 0;
    let subjScore = 0;
    let subjPassed = 0;

    for (const sId of students.map(s => s.id)) {
      const avg = await computeSubjectAverage(sId, s.id, periodId, schoolId, { missingPolicy: 'ignore' });
      if (avg.gradeCount > 0) {
        subjGrades += avg.gradeCount;
        subjScore += avg.average * avg.gradeCount;
        if (avg.passed) subjPassed++;
      }
    }

    const avg = subjGrades > 0 ? subjScore / subjGrades : 0;
    const successRate = subjGrades > 0 ? (subjPassed / students.length) * 100 : 0;

    subjectStats.push({
      subjectId: s.id,
      subjectName: s.name,
      average: applyRounding(avg, 'standard', 2),
      successRate: applyRounding(successRate, 'standard', 1),
      gradeCount: subjGrades,
    });

    totalGrades += subjGrades;
    totalScore += subjScore;
    passedCount += subjPassed;
  }

  const classAvg = totalGrades > 0 ? totalScore / totalGrades : 0;
  const successRate = students.length > 0 ? (passedCount / students.length) * 100 : 0;

  return {
    periodId,
    classId,
    className: '',
    totalStudents: students.length,
    classAverage: applyRounding(classAvg, 'standard', 2),
    successRate: applyRounding(successRate, 'standard', 1),
    subjectStats,
  };
}

/**
 * Compute student results for a period (bulk).
 *
 * Accepts either a single studentId (legacy positional call) or an
 * options object with schoolId + academicYearId + periodId and an
 * optional classId / studentIds filter. Returns one StudentResult per
 * matching student, so callers can map/filter/reduce over the array.
 */
export async function computeStudentResults(
  studentIdOrOptions: string | {
    schoolId: string;
    academicYearId?: string | null;
    periodId?: string | null;
    classId?: string | null;
    studentIds?: string[];
  },
  periodId?: string,
  schoolId?: string,
  options: Partial<GradeAverageOptions> = {}
): Promise<StudentResult[]> {
  // Legacy positional call: (studentId, periodId, schoolId, options)
  if (typeof studentIdOrOptions === 'string') {
    const single = await computeSingleStudentResult(studentIdOrOptions, periodId!, schoolId!, options);
    return [single];
  }

  // Bulk call
  const { schoolId: sid, academicYearId, periodId: pid, classId, studentIds } = studentIdOrOptions;

  // Resolve the period to use
  let resolvedPeriodId = pid ?? null;
  if (!resolvedPeriodId) {
    const period = await resolvePeriod(sid);
    resolvedPeriodId = period?.id ?? null;
  }

  // Determine the set of students to compute
  let studentList: Array<{ id: string; firstName: string; lastName: string; classId: string | null }> = [];
  if (studentIds && studentIds.length > 0) {
    studentList = await Student.findAll({
      where: { id: { [Op.in]: studentIds }, schoolId: sid },
      attributes: ['id', 'firstName', 'lastName', 'classId'],
    }) as unknown as Array<{ id: string; firstName: string; lastName: string; classId: string | null }>;
  } else if (classId) {
    studentList = await Student.findAll({
      where: { classId, schoolId: sid, status: 'active' },
      attributes: ['id', 'firstName', 'lastName', 'classId'],
      order: [['lastName', 'ASC']],
    }) as unknown as Array<{ id: string; firstName: string; lastName: string; classId: string | null }>;
  } else {
    // All active students in the school
    studentList = await Student.findAll({
      where: { schoolId: sid, status: 'active' },
      attributes: ['id', 'firstName', 'lastName', 'classId'],
      order: [['lastName', 'ASC']],
    }) as unknown as Array<{ id: string; firstName: string; lastName: string; classId: string | null }>;
  }

  const results: StudentResult[] = [];
  for (const s of studentList) {
    if (!resolvedPeriodId) {
      // No period — return a zeroed result so the caller still gets a row
      results.push({
        studentId: s.id,
        studentName: `${s.lastName} ${s.firstName}`,
        className: '',
        generalAverage: 0,
        average: 0,
        weightedAverage: 0,
        totalCoefficient: 0,
        subjectAverages: [],
        rank: null,
        totalStudents: studentList.length,
        mention: 'Non évalué',
        passed: false,
      });
      continue;
    }
    const single = await computeSingleStudentResult(s.id, resolvedPeriodId, sid, options);
    results.push(single);
  }

  // Assign ranks within the result set
  const sorted = [...results].sort((a, b) => b.generalAverage - a.generalAverage);
  let rank = 1;
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i].generalAverage !== sorted[i - 1].generalAverage) {
      rank = i + 1;
    }
    const target = results.find((r) => r.studentId === sorted[i].studentId);
    if (target) {
      target.rank = rank;
      target.totalStudents = results.length;
    }
  }

  return results;
}

/**
 * Compute a single student's result for one period.
 * (Internal helper used by the bulk computeStudentResults.)
 */
async function computeSingleStudentResult(
  studentId: string,
  periodId: string,
  schoolId: string,
  options: Partial<GradeAverageOptions> = {}
): Promise<StudentResult> {
  const periodAvg = await computePeriodAverage(studentId, periodId, schoolId, options);

  const student = await Student.findByPk(studentId, {
    include: [{ model: Class, as: 'class', attributes: ['name'] }],
  });

  return {
    studentId,
    studentName: student ? `${student.lastName} ${student.firstName}` : '',
    className: (student as { class?: { name?: string } }).class?.name || '',
    generalAverage: periodAvg.generalAverage,
    average: periodAvg.generalAverage,
    weightedAverage: periodAvg.weightedAverage,
    totalCoefficient: periodAvg.totalCoefficient,
    subjectAverages: periodAvg.subjectAverages,
    rank: periodAvg.rank,
    totalStudents: periodAvg.totalStudents,
    mention: periodAvg.mention,
    passed: periodAvg.passed,
  };
}

/**
 * Get active academic year for a school.
 */
export async function getActiveYear(schoolId: string): Promise<AcademicYear | null> {
  return AcademicYear.findOne({
    where: { schoolId, isActive: true },
    order: [['startDate', 'DESC']],
  });
}

/**
 * Ensure grading config exists for a school.
 * Returns the model instance (with id).
 */
export async function ensureGradingConfig(schoolId: string): Promise<GradingConfigModel> {
  const existing = await GradingConfigModel.findOne({ where: { schoolId } });
  if (existing) return existing;

  const created = await GradingConfigModel.create({
    schoolId,
    passingAverage: 10,
    mentionThresholds: { tres_bien: 16, bien: 14, assez_bien: 12, passable: 10, insuffisant: 0 },
    rounding: 'standard',
    precision: 2,
  });

  return created;
}

/**
 * Resolve grading rules for a school (alias for resolveGradingConfig).
 * Accepts an optional scope ({ cycleId, niveauId }) for callers that
 * configure rules per cycle/niveau. The scope is currently advisory —
 * resolveGradingConfig reads the school-wide config — but the signature
 * keeps historical callers working.
 */
export async function resolveGradingRules(
  schoolId: string,
  _scope?: { cycleId?: string | null; niveauId?: string | null }
): Promise<GradingConfig> {
  return resolveGradingConfig(schoolId);
}

/**
 * Combine period averages into an annual average.
 */
export function combinePeriodAverages(averages: number[], cfg: GradingConfig): number {
  if (averages.length === 0) return 0;
  const sum = averages.reduce((a, b) => a + b, 0);
  return applyRounding(sum / averages.length, cfg.rounding, cfg.precision);
}

/**
 * Resolve the active evaluation period for a school.
 * If periodId is provided, returns that specific period (if it belongs to the school).
 * Otherwise returns the currently open period, or the most recent one.
 */
export async function resolvePeriod(
  schoolId: string,
  periodId?: string
): Promise<EvaluationPeriod | null> {
  if (periodId) {
    const explicit = await EvaluationPeriod.findOne({ where: { id: periodId, schoolId } });
    if (explicit) return explicit;
  }
  return EvaluationPeriod.findOne({
    where: { schoolId, status: 'open' },
    order: [['startDate', 'DESC']],
  });
}