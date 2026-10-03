import { Op } from 'sequelize';
import { AuditLog, Class, Grade, Incident, School, Student, Subject } from '../models/index.js';

export interface RdcAcademicPeriod {
  id: string;
  term?: number;
  semester?: number;
}

export const DEFAULT_ACADEMIC_PERIODS: RdcAcademicPeriod[] = [
  { id: 'P1', term: 1 },
  { id: 'P2', term: 2 },
  { id: 'EX1', semester: 1 },
  { id: 'P3', term: 3 },
  { id: 'P4', term: 4 },
  { id: 'EX2', semester: 2 },
];

export interface RdcMaxima {
  period: number;
  exam: number;
}

export const DEFAULT_MAXIMA: RdcMaxima = { period: 20, exam: 20 };
export const DEFAULT_PASS_MARK = 10;

export function getAcademicPeriods(settings: unknown): RdcAcademicPeriod[] {
  if (settings && typeof settings === 'object') {
    const raw = (settings as Record<string, unknown>)['academicPeriods'];
    if (Array.isArray(raw) && raw.length > 0) {
      const parsed = raw
        .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object')
        .map((p) => ({
          id: String(p['id'] || ''),
          ...(Number.isFinite(Number(p['term'])) ? { term: Number(p['term']) } : {}),
          ...(Number.isFinite(Number(p['semester'])) ? { semester: Number(p['semester']) } : {}),
        }))
        .filter((p) => p.id.length > 0);
      if (parsed.length > 0) return parsed;
    }
  }
  return DEFAULT_ACADEMIC_PERIODS;
}

export function getGradingMaxima(settings: unknown): RdcMaxima {
  let period = DEFAULT_MAXIMA.period;
  let exam = DEFAULT_MAXIMA.exam;
  if (settings && typeof settings === 'object') {
    const grading = (settings as Record<string, unknown>)['grading'] as Record<string, unknown> | undefined;
    if (grading && typeof grading === 'object') {
      const maxima = grading['maxima'] as Record<string, unknown> | undefined;
      if (maxima && typeof maxima === 'object') {
        const p = Number(maxima['period']);
        const e = Number(maxima['exam']);
        if (Number.isFinite(p) && p > 0) period = p;
        if (Number.isFinite(e) && e > 0) exam = e;
      }
    }
  }
  return { period, exam };
}

export function getPassMark(settings: unknown): number {
  if (settings && typeof settings === 'object') {
    const grading = (settings as Record<string, unknown>)['grading'] as Record<string, unknown> | undefined;
    const passMark = Number(grading?.['passMark']);
    if (Number.isFinite(passMark)) return passMark;
  }
  return DEFAULT_PASS_MARK;
}

export interface RdcSubjectLine {
  name: string;
  /** Domain grouping key = Subject.department (fallback 'Autres'). */
  domain: string;
  coef: number;
  P1: number | null;
  P2: number | null;
  EX1: number | null;
  totalS1: number | null;
  maxS1: number;
  P3: number | null;
  P4: number | null;
  EX2: number | null;
  totalS2: number | null;
  maxS2: number;
  annualTotal: number | null;
  annualMax: number;
  appreciation: string;
}

export interface RdcTotals {
  totalS1: number | null;
  maxS1: number;
  totalS2: number | null;
  maxS2: number;
  annualTotal: number | null;
  annualMax: number;
}

/** Per-column maxima sums for one domain group (coefficient-weighted, present scores only). */
export interface RdcDomainMaxima {
  maxP1: number;
  maxP2: number;
  maxEX1: number;
  maxS1: number;
  maxP3: number;
  maxP4: number;
  maxEX2: number;
  maxS2: number;
  maxAnnual: number;
}

export interface RdcDomainGroup {
  name: string;
  subjects: RdcSubjectLine[];
  /** Coefficient-weighted subtotal (same convention as the general totals). */
  subtotal: RdcTotals;
  maxima: RdcDomainMaxima;
}

export interface RdcBulletinData {
  student: {
    id: string;
    fullName: string;
    firstName: string;
    lastName: string;
    birthPlace: string;
    birthDate: string;
    nationality: string;
    className: string;
    permanentNumber: string;
  };
  school: {
    name: string;
    province: string;
    city: string;
    territory: string;
    code: string;
    emblem: string;
  };
  academicYear: string;
  periods: RdcAcademicPeriod[];
  maxima: RdcMaxima;
  passMark: number;
  subjects: RdcSubjectLine[];
  /** Domains grouped by Subject.department, ordered alphabetically (French locale). */
  domains: RdcDomainGroup[];
  /** Semester appreciation labels derived from semester percentages via thresholds. */
  appS1: string;
  appS2: string;
  totals: RdcTotals;
  percentage: number | null;
  rank: number | null;
  classSize: number;
  conduct: string;
  decision: string | null;
  observation: string;
  report: { title: string };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function appreciationFor(avg20: number | null, passMark: number): string {
  if (avg20 === null || !Number.isFinite(avg20)) return '';
  if (avg20 >= 16) return 'Très Bien';
  if (avg20 >= 14) return 'Bien';
  if (avg20 >= 12) return 'Assez Bien';
  if (avg20 >= passMark) return 'Passable';
  if (avg20 >= passMark - 2) return 'Insuffisant';
  return 'Faible';
}

/**
 * Weighted average of matching grades (weights = per-grade coefficients).
 * Returns null when there is no grade — a missing score is NEVER 0,
 * only an explicitly recorded 0 counts as 0.
 */
function periodScore(grades: Grade[], predicate: (g: Grade) => boolean): number | null {
  const list = grades.filter(predicate);
  if (list.length === 0) return null;
  const totalCoef = list.reduce((s, g) => s + Number(g.coefficient || 0), 0);
  if (totalCoef === 0) return null;
  return round2(list.reduce((s, g) => s + Number(g.score) * Number(g.coefficient || 0), 0) / totalCoef);
}

function isExam(g: Grade): boolean {
  return String(g.examType || '').toLowerCase() === 'exam';
}

function sumPresent(values: Array<number | null>): number | null {
  const present = values.filter((v): v is number => v !== null && v !== undefined && Number.isFinite(v));
  if (present.length === 0) return null;
  return round2(present.reduce((s, v) => s + v, 0));
}

function maxFor(values: Array<number | null>, maxima: number[]): number {
  let max = 0;
  for (let i = 0; i < values.length; i++) {
    if (values[i] !== null && values[i] !== undefined) max += maxima[i] || 0;
  }
  return round2(max);
}

function buildSubjectLine(
  name: string,
  domain: string,
  coef: number,
  grades: Grade[],
  maxima: RdcMaxima,
  passMark: number
): RdcSubjectLine {
  // NOTE: Grade.term carries the period number (P1..P4 map to term 1..4).
  // Rows with examType='exam' are semester exams: term<=2 -> S1 exam (EX1),
  // term>2 -> S2 exam (EX2).
  const P1 = periodScore(grades, (g) => !isExam(g) && Number(g.term) === 1);
  const P2 = periodScore(grades, (g) => !isExam(g) && Number(g.term) === 2);
  const P3 = periodScore(grades, (g) => !isExam(g) && Number(g.term) === 3);
  const P4 = periodScore(grades, (g) => !isExam(g) && Number(g.term) === 4);
  const EX1 = periodScore(grades, (g) => isExam(g) && Number(g.term) <= 2);
  const EX2 = periodScore(grades, (g) => isExam(g) && Number(g.term) > 2);

  const totalS1 = sumPresent([P1, P2, EX1]);
  const maxS1 = maxFor([P1, P2, EX1], [maxima.period, maxima.period, maxima.exam]);
  const totalS2 = sumPresent([P3, P4, EX2]);
  const maxS2 = maxFor([P3, P4, EX2], [maxima.period, maxima.period, maxima.exam]);
  const annualTotal = sumPresent([totalS1, totalS2]);
  const annualMax = round2(maxS1 + maxS2);
  const avg20 = annualTotal !== null && annualMax > 0 ? round2((annualTotal / annualMax) * 20) : null;

  return {
    name,
    domain,
    coef,
    P1,
    P2,
    EX1,
    totalS1,
    maxS1,
    P3,
    P4,
    EX2,
    totalS2,
    maxS2,
    annualTotal,
    annualMax,
    appreciation: appreciationFor(avg20, passMark),
  };
}

function conductForIncidentCount(count: number): string {
  if (count <= 0) return 'Très bien';
  if (count <= 2) return 'Bien';
  if (count <= 4) return 'Passable';
  return 'Insuffisant';
}

interface ClassInfo {
  level?: string;
  section?: string;
  name?: string;
}

export function buildReportTitle(cls: ClassInfo | null): string {
  if (cls && cls.level && cls.section) return `BULLETIN DE LA ${cls.level} ${cls.section}`;
  if (cls && cls.name) return `BULLETIN — ${cls.name}`;
  return 'BULLETIN';
}

/**
 * Annual percentage (0-100, 1 decimal) for one student on the RDC metric.
 * Shared by the bulletin and the rank recomputation so both use the same metric.
 */
async function computeAnnualPercentage(
  schoolId: string,
  studentId: string,
  academicYear: string | undefined,
  classSubjects: Subject[],
  maxima: RdcMaxima
): Promise<number | null> {
  const where: Record<string, unknown> = {
    schoolId,
    studentId,
    [Op.or]: [{ status: 'PUBLISHED' }, { status: null }],
  };
  if (academicYear) where['academicYear'] = academicYear;
  const grades = await Grade.findAll({ where });

  let total = 0;
  let max = 0;
  let hasAny = false;
  for (const subject of classSubjects) {
    const coef = Number(subject.coefficient || 1);
    const subjectGrades = grades.filter((g) => g.subjectId === subject.id);
    if (subjectGrades.length === 0) continue;
    const P1 = periodScore(subjectGrades, (g) => !isExam(g) && Number(g.term) === 1);
    const P2 = periodScore(subjectGrades, (g) => !isExam(g) && Number(g.term) === 2);
    const P3 = periodScore(subjectGrades, (g) => !isExam(g) && Number(g.term) === 3);
    const P4 = periodScore(subjectGrades, (g) => !isExam(g) && Number(g.term) === 4);
    const EX1 = periodScore(subjectGrades, (g) => isExam(g) && Number(g.term) <= 2);
    const EX2 = periodScore(subjectGrades, (g) => isExam(g) && Number(g.term) > 2);
    const tS1 = sumPresent([P1, P2, EX1]);
    const mS1 = maxFor([P1, P2, EX1], [maxima.period, maxima.period, maxima.exam]);
    const tS2 = sumPresent([P3, P4, EX2]);
    const mS2 = maxFor([P3, P4, EX2], [maxima.period, maxima.period, maxima.exam]);
    const annual = sumPresent([tS1, tS2]);
    const annualMax = round2(mS1 + mS2);
    if (annual === null || annualMax <= 0) continue;
    hasAny = true;
    total = round2(total + annual * coef);
    max = round2(max + annualMax * coef);
  }
  if (!hasAny || max <= 0) return null;
  return round1((total / max) * 100);
}

/**
 * Faithful RDC school-bulletin computation for one student and academic year.
 * Uses PUBLISHED grades only (NULL status counts as published).
 * Missing scores stay null — never 0 unless an explicit 0 was recorded.
 */
export async function buildRdcBulletinData(
  studentId: string,
  academicYear?: string,
  opts: { observation?: string } = {}
): Promise<RdcBulletinData | null> {
  const student = await Student.findByPk(studentId);
  if (!student) return null;
  const schoolId = student.schoolId;

  const school = await School.findByPk(schoolId);
  const settings = (school?.settings || {}) as Record<string, unknown>;
  const periods = getAcademicPeriods(settings);
  const maxima = getGradingMaxima(settings);
  const passMark = getPassMark(settings);

  const classId = (student as unknown as { classId?: string }).classId || '';
  const cls = classId ? await Class.findByPk(classId) : null;
  const classRec = cls as unknown as { name?: string; level?: string; section?: string } | null;

  const classSubjects = classId
    ? await Subject.findAll({ where: { schoolId, classId }, order: [['name', 'ASC']] })
    : [];

  const gradeWhere: Record<string, unknown> = {
    schoolId,
    studentId,
    [Op.or]: [{ status: 'PUBLISHED' }, { status: null }],
  };
  if (academicYear) gradeWhere['academicYear'] = academicYear;
  const studentGrades = await Grade.findAll({ where: gradeWhere });

  const subjects: RdcSubjectLine[] = [];
  for (const subject of classSubjects) {
    const subjectGrades = studentGrades.filter((g) => g.subjectId === subject.id);
    if (subjectGrades.length === 0) continue;
    const dept = String(
      (subject as unknown as { department?: unknown }).department || ''
    ).trim();
    subjects.push(
      buildSubjectLine(subject.name, dept || 'Autres', Number(subject.coefficient || 1), subjectGrades, maxima, passMark)
    );
  }
  // Order groups alphabetically (French locale), subjects by name within group.
  subjects.sort((a, b) => {
    const d = a.domain.localeCompare(b.domain, 'fr');
    if (d !== 0) return d;
    return a.name.localeCompare(b.name, 'fr');
  });

  // Domain groups with coefficient-weighted subtotals + per-column maxima sums.
  // Column maxima count only present scores (missing is never 0), so that
  // subtotal maxima stay consistent with the prorated general totals below.
  const domains: RdcDomainGroup[] = Array.from(new Set(subjects.map((s) => s.domain)))
    .sort((a, b) => a.localeCompare(b, 'fr'))
    .map((name) => {
      const lines = subjects.filter((s) => s.domain === name);
      let totalS1 = 0;
      let totalS2 = 0;
      let hasS1 = false;
      let hasS2 = false;
      const gmax: RdcDomainMaxima = {
        maxP1: 0, maxP2: 0, maxEX1: 0, maxS1: 0,
        maxP3: 0, maxP4: 0, maxEX2: 0, maxS2: 0, maxAnnual: 0,
      };
      for (const line of lines) {
        const c = line.coef;
        if (line.P1 !== null) gmax.maxP1 = round2(gmax.maxP1 + maxima.period * c);
        if (line.P2 !== null) gmax.maxP2 = round2(gmax.maxP2 + maxima.period * c);
        if (line.EX1 !== null) gmax.maxEX1 = round2(gmax.maxEX1 + maxima.exam * c);
        if (line.P3 !== null) gmax.maxP3 = round2(gmax.maxP3 + maxima.period * c);
        if (line.P4 !== null) gmax.maxP4 = round2(gmax.maxP4 + maxima.period * c);
        if (line.EX2 !== null) gmax.maxEX2 = round2(gmax.maxEX2 + maxima.exam * c);
        if (line.totalS1 !== null && line.maxS1 > 0) {
          hasS1 = true;
          totalS1 = round2(totalS1 + line.totalS1 * c);
        }
        if (line.totalS2 !== null && line.maxS2 > 0) {
          hasS2 = true;
          totalS2 = round2(totalS2 + line.totalS2 * c);
        }
      }
      gmax.maxS1 = round2(gmax.maxP1 + gmax.maxP2 + gmax.maxEX1);
      gmax.maxS2 = round2(gmax.maxP3 + gmax.maxP4 + gmax.maxEX2);
      gmax.maxAnnual = round2(gmax.maxS1 + gmax.maxS2);
      const subtotal: RdcTotals = {
        totalS1: hasS1 ? round2(totalS1) : null,
        maxS1: gmax.maxS1,
        totalS2: hasS2 ? round2(totalS2) : null,
        maxS2: gmax.maxS2,
        annualTotal: hasS1 || hasS2 ? round2((hasS1 ? totalS1 : 0) + (hasS2 ? totalS2 : 0)) : null,
        annualMax: gmax.maxAnnual,
      };
      return { name, subjects: lines, subtotal, maxima: gmax };
    });

  // Semester / general totals (coefficient-weighted), maxima prorated to present scores.
  let totalS1 = 0;
  let maxS1 = 0;
  let totalS2 = 0;
  let maxS2 = 0;
  let hasS1 = false;
  let hasS2 = false;
  for (const line of subjects) {
    if (line.totalS1 !== null && line.maxS1 > 0) {
      hasS1 = true;
      totalS1 = round2(totalS1 + line.totalS1 * line.coef);
      maxS1 = round2(maxS1 + line.maxS1 * line.coef);
    }
    if (line.totalS2 !== null && line.maxS2 > 0) {
      hasS2 = true;
      totalS2 = round2(totalS2 + line.totalS2 * line.coef);
      maxS2 = round2(maxS2 + line.maxS2 * line.coef);
    }
  }
  const totals: RdcTotals = {
    totalS1: hasS1 ? round2(totalS1) : null,
    maxS1: round2(maxS1),
    totalS2: hasS2 ? round2(totalS2) : null,
    maxS2: round2(maxS2),
    annualTotal: hasS1 || hasS2 ? round2((hasS1 ? totalS1 : 0) + (hasS2 ? totalS2 : 0)) : null,
    annualMax: round2(maxS1 + maxS2),
  };
  const percentage =
    totals.annualTotal !== null && totals.annualMax > 0
      ? round1((totals.annualTotal / totals.annualMax) * 100)
      : null;
  const pctS1 =
    totals.totalS1 !== null && totals.maxS1 > 0
      ? round1((totals.totalS1 / totals.maxS1) * 100)
      : null;
  const pctS2 =
    totals.totalS2 !== null && totals.maxS2 > 0
      ? round1((totals.totalS2 / totals.maxS2) * 100)
      : null;
  const appS1 = appreciationFor(pctS1 === null ? null : round2((pctS1 / 100) * 20), passMark);
  const appS2 = appreciationFor(pctS2 === null ? null : round2((pctS2 / 100) * 20), passMark);

  // Rank recomputed on the same metric (annual percentage) for active classmates.
  let rank: number | null = null;
  let classSize = 0;
  if (classId) {
    const classmates = await Student.findAll({
      where: { schoolId, classId, status: 'active' },
      attributes: ['id'],
    });
    classSize = classmates.length;
    if (percentage !== null) {
      const scores: Array<{ id: string; pct: number }> = [];
      for (const mate of classmates) {
        if (mate.id === studentId) {
          scores.push({ id: mate.id, pct: percentage });
          continue;
        }
        const pct = await computeAnnualPercentage(schoolId, mate.id, academicYear, classSubjects, maxima);
        scores.push({ id: mate.id, pct: pct ?? 0 });
      }
      scores.sort((a, b) => b.pct - a.pct);
      const idx = scores.findIndex((s) => s.id === studentId);
      rank = idx >= 0 ? idx + 1 : null;
    }
  }

  // Conduct from incident count.
  let conduct = '—';
  try {
    const incidentCount = await Incident.count({ where: { schoolId, studentId } });
    conduct = conductForIncidentCount(incidentCount);
  } catch {
    conduct = '—';
  }

  // Decision from the latest promotion record for this student.
  let decision: string | null = null;
  try {
    const promo = await AuditLog.findOne({
      where: { schoolId, entity: 'student', action: 'promote', entityId: studentId },
      order: [['createdAt', 'DESC']],
    });
    const details = (promo?.details || {}) as Record<string, unknown>;
    decision = typeof details['decision'] === 'string' ? (details['decision'] as string) : null;
  } catch {
    decision = null;
  }

  const firstName = student.firstName || '';
  const lastName = student.lastName || '';
  const dobRaw = (student as unknown as { dateOfBirth?: Date | string | null }).dateOfBirth;

  return {
    student: {
      id: student.id,
      fullName: `${firstName} ${lastName}`.trim(),
      firstName,
      lastName,
      birthPlace: (student as unknown as { birthPlace?: string }).birthPlace || '',
      birthDate: dobRaw ? new Date(dobRaw).toLocaleDateString('fr-FR') : '',
      nationality: (student as unknown as { nationality?: string }).nationality || '',
      className: classRec?.name || '',
      permanentNumber: student.studentId || '',
    },
    school: {
      name: school?.name || '',
      province: (school as unknown as { province?: string })?.province || '',
      city: (school as unknown as { city?: string })?.city || '',
      territory: (school as unknown as { territory?: string })?.territory || '',
      code: (school as unknown as { code?: string })?.code || '',
      emblem: (school as unknown as { emblem?: string })?.emblem || '',
    },
    academicYear: academicYear || '',
    periods,
    maxima,
    passMark,
    subjects,
    domains,
    appS1,
    appS2,
    totals,
    percentage,
    rank,
    classSize,
    conduct,
    decision,
    observation: opts.observation || '',
    report: {
      title: buildReportTitle(
        classRec ? { level: classRec.level, section: classRec.section, name: classRec.name } : null
      ),
    },
  };
}
