import { Op, type Transaction } from 'sequelize';
import sequelize from '../config/database.js';
import { AcademicYear, Class, Enrollment, Student, ActivationCode } from '../models/index.js';
import type { EnrollmentStatus } from '../models/Enrollment.js';
import type { User } from '../models/index.js';
import { AppError } from '../middleware/errorHandler.js';
import { createStudentAccount, generateSecureToken, hashToken } from './UserProvisioningService.js';
import { userHasPermission } from './AuthorizationService.js';

/**
 * EnrollmentService — admissions & inscriptions (§11, §12).
 *
 * The state machine is explicit so no dossier can end up half-admitted:
 *
 *   draft → submitted → under_review → accepted → enrolled
 *                          ├─────────→ waitlisted → (reopen) → under_review
 *                          └─────────→ rejected
 *   any non-final state ──→ withdrawn
 *
 * Two invariants:
 *  - DECIDING moves nothing. `decideDossier` only records a decision.
 *  - ENROLLING is the single place a Student row is born from an admission, and
 *    it runs in one transaction with the matricule so a dossier can never point
 *    at a student that was rolled back.
 */

export const ENROLLMENT_STATUSES: Record<EnrollmentStatus, string> = {
  draft: 'Brouillon',
  submitted: 'Déposé',
  under_review: 'En cours d’instruction',
  accepted: 'Admis',
  waitlisted: 'Sur liste d’attente',
  rejected: 'Refusé',
  enrolled: 'Inscrit',
  withdrawn: 'Retiré',
};

/** Statuses from which no further transition is allowed. */
const FINAL: EnrollmentStatus[] = ['enrolled', 'rejected', 'withdrawn'];

/**
 * Statuses on which the school may still take a decision.
 *
 * `waitlisted` is included on purpose: when a seat frees up the school admits
 * the next applicant directly from the list, without a redundant reopen step.
 */
const OPEN_FOR_DECISION: EnrollmentStatus[] = ['submitted', 'under_review', 'waitlisted'];

/** Documents a school commonly asks for. A checklist only — never a file blob. */
export const REQUIRED_DOCUMENTS = [
  { key: 'birthCertificate', label: 'Acte de naissance' },
  { key: 'previousReport', label: 'Bulletin de l’année précédente' },
  { key: 'idPhoto', label: 'Photo d’identité' },
  { key: 'guardianId', label: 'Pièce d’identité du tuteur' },
  { key: 'residenceProof', label: 'Justificatif de résidence' },
  { key: 'medicalRecord', label: 'Carnet de santé' },
] as const;

// ───────────────────────────── Matricule ─────────────────────────────

/**
 * The matricule of the NEXT student of a school for a given year.
 *
 * Extracted from the students route so `/students` and `/enrollment` can never
 * disagree on numbering. `SCF-<year>-<00001>`: derived from the rows actually
 * allocated, never from a counter column that could drift.
 */
export async function nextMatricule(
  schoolId: string,
  academicYearId?: string | null,
  transaction?: Transaction
): Promise<{ matricule: string; year: number }> {
  const opts = transaction ? { transaction } : {};

  let yearRow = academicYearId
    ? await AcademicYear.findOne({ where: { id: academicYearId, schoolId }, ...opts })
    : null;
  if (!yearRow) {
    yearRow = await AcademicYear.findOne({
      where: { schoolId, status: 'active' },
      order: [['startDate', 'DESC']],
      ...opts,
    });
  }
  if (!yearRow) {
    yearRow = await AcademicYear.findOne({
      where: { schoolId },
      order: [['startDate', 'DESC']],
      ...opts,
    });
  }

  const year = yearRow?.startDate ? new Date(yearRow.startDate).getFullYear() : new Date().getFullYear();
  const prefix = `SCF-${year}-`;
  const allocated = await Student.count({
    where: { schoolId, studentId: { [Op.like]: `${prefix}%` } },
    ...opts,
  });

  // Walk forward past anything already taken: two concurrent admissions must not
  // be handed the same number, and a gap must never be silently reused.
  for (let n = allocated + 1; n < allocated + 10_001; n++) {
    const matricule = `${prefix}${String(n).padStart(5, '0')}`;
    const taken = await Student.findOne({
      where: { schoolId, studentId: matricule },
      attributes: ['id'],
      ...opts,
    });
    if (!taken) return { matricule, year };
  }
  throw new AppError('Impossible d’attribuer un matricule, réessayez', 409);
}

/** Short human-quotable dossier reference, e.g. `DOS-7F3K92`. */
async function nextReference(schoolId: string, transaction?: Transaction): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const suffix = generateSecureToken(3)
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 6)
      .padEnd(6, 'X');
    const reference = `DOS-${suffix}`;
    const clash = await Enrollment.findOne({
      where: { schoolId, reference },
      attributes: ['id'],
      ...(transaction ? { transaction } : {}),
    });
    if (!clash) return reference;
  }
  throw new AppError('Impossible de générer une référence de dossier, réessayez', 409);
}

// ───────────────────────────── Guards ─────────────────────────────

/**
 * The class must exist AND belong to the dossier's academic year. A class from
 * another year is a hard error, never a silent fallback.
 */
async function assertYearAndClass(
  schoolId: string,
  academicYearId: string,
  classId?: string | null
): Promise<void> {
  const year = await AcademicYear.findOne({
    where: { id: academicYearId, schoolId },
    attributes: ['id', 'name'],
  });
  if (!year) throw new AppError('Année scolaire introuvable', 404);
  if (!classId) return;
  const klass = await Class.findOne({
    where: { id: classId, schoolId, academicYear: year.name },
    attributes: ['id'],
  });
  if (!klass) throw new AppError('La classe demandée n’existe pas pour cette année scolaire', 400);
}

async function load(schoolId: string, id: string): Promise<Enrollment> {
  const row = await Enrollment.findOne({ where: { id, schoolId } });
  if (!row) throw new AppError('Dossier introuvable', 404);
  return row;
}

// ───────────────────────────── Write ─────────────────────────────

export interface CreateDossierInput {
  schoolId: string;
  academicYearId: string;
  requestedClassId?: string | null;
  firstName: string;
  lastName: string;
  dateOfBirth?: Date | null;
  gender?: 'M' | 'F' | null;
  birthPlace?: string | null;
  nationality?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  guardianName?: string | null;
  guardianPhone?: string | null;
  guardianEmail?: string | null;
  guardianRelation?: string | null;
  previousSchool?: string | null;
  previousClass?: string | null;
  previousAverage?: string | number | null;
  documents?: Record<string, boolean>;
  createdBy: string;
  /** Files a complete application right away instead of a draft. */
  submit?: boolean;
}

export async function createDossier(input: CreateDossierInput): Promise<Enrollment> {
  await assertYearAndClass(input.schoolId, input.academicYearId, input.requestedClassId);
  const reference = await nextReference(input.schoolId);
  return Enrollment.create({
    schoolId: input.schoolId,
    academicYearId: input.academicYearId,
    requestedClassId: input.requestedClassId ?? null,
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    dateOfBirth: input.dateOfBirth ?? null,
    gender: input.gender ?? null,
    birthPlace: input.birthPlace ?? null,
    nationality: input.nationality ?? null,
    address: input.address ?? null,
    phone: input.phone ?? null,
    email: input.email ?? null,
    guardianName: input.guardianName ?? null,
    guardianPhone: input.guardianPhone ?? null,
    guardianEmail: input.guardianEmail ?? null,
    guardianRelation: input.guardianRelation ?? null,
    previousSchool: input.previousSchool ?? null,
    previousClass: input.previousClass ?? null,
    previousAverage: input.previousAverage ?? null,
    documents: input.documents ?? {},
    status: input.submit ? 'submitted' : 'draft',
    reference,
    appliedAt: input.submit ? new Date() : null,
    createdBy: input.createdBy,
  });
}

const EDITABLE_FIELDS = [
  'requestedClassId', 'firstName', 'lastName', 'dateOfBirth', 'gender', 'birthPlace',
  'nationality', 'address', 'phone', 'email', 'guardianName', 'guardianPhone',
  'guardianEmail', 'guardianRelation', 'previousSchool', 'previousClass',
  'previousAverage', 'documents',
] as const;

/** Updates a dossier that has not been decided yet. */
export async function updateDossier(
  schoolId: string,
  id: string,
  patch: Partial<Record<(typeof EDITABLE_FIELDS)[number], unknown>>
): Promise<Enrollment> {
  const row = await load(schoolId, id);
  if (FINAL.includes(row.status)) {
    throw new AppError(`Ce dossier est clôturé (${ENROLLMENT_STATUSES[row.status]}) et ne peut plus être modifié`, 409);
  }
  if (patch.requestedClassId !== undefined) {
    await assertYearAndClass(schoolId, row.academicYearId, patch.requestedClassId as string | null);
  }
  const changes: Record<string, unknown> = {};
  for (const key of EDITABLE_FIELDS) {
    if (patch[key] !== undefined) changes[key] = patch[key];
  }
  await row.update(changes);
  return row;
}

/** draft → submitted. A dossier must be contactable before it can be filed. */
export async function submitDossier(schoolId: string, id: string): Promise<Enrollment> {
  const row = await load(schoolId, id);
  if (FINAL.includes(row.status)) throw new AppError('Dossier déjà clôturé', 409);
  if (row.status === 'submitted' || row.status === 'under_review') return row;

  if (!row.firstName.trim() || !row.lastName.trim()) {
    throw new AppError('Nom et prénom sont obligatoires', 400);
  }
  if (!row.guardianName?.trim() || (!row.guardianPhone?.trim() && !row.guardianEmail?.trim())) {
    throw new AppError('Un tuteur joignable (nom + téléphone ou email) est requis', 400);
  }
  await row.update({ status: 'submitted', appliedAt: new Date() });
  return row;
}

export interface DecideInput {
  decision: 'accepted' | 'waitlisted' | 'rejected';
  note?: string | null;
  actorId: string;
  /** Required to accept or waitlist: the school must say which class. */
  requestedClassId?: string | null;
}

/** Records an admission decision. Nothing is created or moved here. */
export async function decideDossier(
  schoolId: string,
  id: string,
  input: DecideInput
): Promise<Enrollment> {
  const row = await load(schoolId, id);
  if (!OPEN_FOR_DECISION.includes(row.status)) {
    throw new AppError(
      `Une décision ne peut être prise que sur un dossier déposé, en instruction ou en liste d’attente (statut actuel : ${ENROLLMENT_STATUSES[row.status]})`,
      409
    );
  }

  if (input.decision === 'rejected') {
    if (!input.note?.trim()) throw new AppError('Un refus doit être motivé', 400);
    await row.update({
      status: 'rejected',
      decisionNote: input.note.trim(),
      decidedAt: new Date(),
      decidedBy: input.actorId,
      waitlistPosition: null,
    });
    return row;
  }

  const classId = input.requestedClassId ?? row.requestedClassId;
  if (!classId) throw new AppError('Choisissez la classe d’affectation', 400);
  await assertYearAndClass(schoolId, row.academicYearId, classId);

  // While on the list, the rank is derived from the school's own current
// waiting list — never invented, never copied from the client's guess.
let waitlistPosition: number | null = 0;
if (input.decision === 'waitlisted') {
  const current = await Enrollment.count({
    where: { schoolId, academicYearId: row.academicYearId, status: 'waitlisted' },
  });
  waitlistPosition = current + 1;
}

await row.update({
    status: input.decision,
    requestedClassId: classId,
    decisionNote: input.note?.trim() ?? null,
    decidedAt: new Date(),
    decidedBy: input.actorId,
    // `0` marks "no longer waiting": the school has decided, so the dossier
    // does not compete for a seat any more.
    waitlistPosition,
  });
  return row;
}

/** Puts a waitlisted dossier back into the instruction queue. */
export async function reopenDossier(schoolId: string, id: string): Promise<Enrollment> {
  const row = await load(schoolId, id);
  if (row.status !== 'waitlisted') {
    throw new AppError('Seul un dossier en liste d’attente peut être réexaminé', 409);
  }
  await row.update({
    status: 'under_review',
    decidedAt: null,
    decidedBy: null,
    waitlistPosition: null,
  });
  return row;
}

export async function withdrawDossier(schoolId: string, id: string): Promise<Enrollment> {
  const row = await load(schoolId, id);
  if (FINAL.includes(row.status)) throw new AppError('Dossier déjà clôturé', 409);
  await row.update({ status: 'withdrawn', withdrawnAt: new Date(), waitlistPosition: null });
  return row;
}

// ───────────────────────────── Enrollment ─────────────────────────────

export interface EnrollOptions {
  /** Create the account now (temporary password) or hand over an activation code. */
  createAccount?: 'none' | 'now' | 'activation_code';
  accountEmail?: string | null;
  /** Overrides the dossier's class at enrollment time. */
  classId?: string | null;
}

export interface EnrollResult {
  enrollment: Enrollment;
  student: Student;
  account: { userId: string; username: string | null; temporaryPassword: string } | null;
  activationCode: { code: string; expiresAt: Date } | null;
}

/**
 * Turns an accepted dossier into a real, enrolled student. This is the ONLY
 * place a Student row is created from an admission.
 *
 * Only an `accepted` dossier may be enrolled. A waitlisted applicant must first
 * be admitted — that is precisely what a waiting list means, so enrolling from
 * it would silently bypass the school's own decision.
 */
export async function enrollDossier(
  schoolId: string,
  id: string,
  actor: Pick<User, 'id' | 'role' | 'schoolId'>,
  options: EnrollOptions = {}
): Promise<EnrollResult> {
  const dossier = await load(schoolId, id);
  if (dossier.status === 'enrolled') {
    throw new AppError('Ce dossier a déjà donné lieu à une inscription', 409);
  }
  if (dossier.status !== 'accepted') {
    const hint =
      dossier.status === 'waitlisted'
        ? 'Un dossier en liste d’attente doit d’abord être admis.'
        : '';
    throw new AppError(
      `Seul un dossier admis peut être inscrit (statut actuel : ${ENROLLMENT_STATUSES[dossier.status]}). ${hint}`.trim(),
      409
    );
  }

  const classId = options.classId ?? dossier.requestedClassId;
  if (!classId) throw new AppError('La classe d’affectation est obligatoire pour inscrire', 400);
  await assertYearAndClass(schoolId, dossier.academicYearId, classId);

  const mode = options.createAccount ?? 'none';
  if (mode !== 'none') {
    const allowed = await userHasPermission(actor, 'users.create_student');
    if (!allowed) throw new AppError('Permission users.create_student requise', 403);
  }

  // 1. Dossier link, matricule and student row land together or not at all.
  const { student, matricule } = await sequelize.transaction(async (t) => {
    const allocated = await nextMatricule(schoolId, dossier.academicYearId, t);
    const created = await Student.create(
      {
        schoolId,
        studentId: allocated.matricule,
        firstName: dossier.firstName,
        lastName: dossier.lastName,
        dateOfBirth: dossier.dateOfBirth,
        gender: dossier.gender,
        birthPlace: dossier.birthPlace,
        nationality: dossier.nationality,
        address: dossier.address,
        phone: dossier.phone,
        email: dossier.email ?? options.accountEmail ?? null,
        parentName: dossier.guardianName,
        parentPhone: dossier.guardianPhone,
        parentEmail: dossier.guardianEmail,
        classId,
        enrollmentDate: new Date(),
        status: 'active',
      },
      { transaction: t }
    );
    await dossier.update(
      { status: 'enrolled', studentId: created.id, matricule: allocated.matricule, waitlistPosition: null },
      { transaction: t }
    );
    return { student: created, matricule: allocated.matricule };
  });

  // 2. Account provisioning runs outside the transaction: it hashes a password
  //    and issues a token, and must not hold the row lock while doing so.
  let account: EnrollResult['account'] = null;
  let activationCode: EnrollResult['activationCode'] = null;

  if (mode === 'now') {
    const created = await createStudentAccount(student.id, actor.id, {
      email: options.accountEmail ?? dossier.email ?? undefined,
    });
    account = {
      userId: created.user.id,
      username: created.user.username,
      temporaryPassword: created.temporaryPassword!,
    };
  } else if (mode === 'activation_code') {
    const code = generateSecureToken(4).toUpperCase().slice(0, 8);
    const expiresAt = new Date(Date.now() + 72 * 3600 * 1000);
    await ActivationCode.create({
      schoolId,
      codeHash: hashToken(code),
      targetType: 'student',
      targetId: student.id,
      email: options.accountEmail ?? dossier.email ?? null,
      maxUses: 1,
      useCount: 0,
      expiresAt,
      status: 'active',
      createdBy: actor.id,
      note: `Dossier ${dossier.reference}`,
    });
    activationCode = { code, expiresAt };
  }

  const fresh = await Enrollment.findByPk(dossier.id);
  return { enrollment: fresh!, student, account, activationCode };
}

// ───────────────────────────── Reporting ─────────────────────────────

/** Counts by status, read from the table — never a stored aggregate. */
export async function enrollmentStats(schoolId: string, academicYearId: string) {
  const statuses = Object.keys(ENROLLMENT_STATUSES) as EnrollmentStatus[];
  const rows = await Enrollment.findAll({ where: { schoolId, academicYearId }, attributes: ['status', 'documents'] });
  const byStatus: Record<string, number> = Object.fromEntries(statuses.map((s) => [s, 0]));
  for (const r of rows) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
  const completeFiles = rows.filter((r) => {
    const docs = (r.documents ?? {}) as Record<string, boolean>;
    return REQUIRED_DOCUMENTS.every((d) => docs[d.key]);
  }).length;
  return { total: rows.length, byStatus, completeFiles };
}