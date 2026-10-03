import { Op } from 'sequelize';
import { Assignment, UserScope, Student, StudentParent, Parent, Timetable, Subject, Class } from '../models/index.js';
import type { User } from '../models/index.js';

/**
 * ScopeService resolves WHICH DATA a user may touch.
 *
 * Scopes are derived from (in priority order):
 *  1. explicit UserScope rows (class / subject / department / section / level)
 *  2. active Assignment rows (class_assignment / subject_assignment / ...)
 *  3. legacy teacher derivation (class.teacherId, subject.teacherId, timetable)
 *  4. parent linkage (students linked through StudentParent)
 *  5. self identity (a student account maps to its own Student row)
 *
 * A scope object always answers the same questions so route handlers stay
 * uniform: which classes, which subjects, which students, which sections,
 * which departments.
 */

export type ScopeKind =
  | 'GLOBAL'
  | 'SCHOOL'
  | 'SECTION'
  | 'DEPARTMENT'
  | 'LEVEL'
  | 'CLASS'
  | 'SUBJECT'
  | 'STUDENT'
  | 'ASSIGNED_CLASSES'
  | 'ASSIGNED_SUBJECTS'
  | 'LINKED_CHILDREN'
  | 'SELF';

export interface ResolvedScope {
  kind: ScopeKind;
  /** true when the scope covers the entire school (no row-level restriction) */
  isGlobal: boolean;
  classIds: string[];
  subjectIds: string[];
  studentIds: string[];
  sectionIds: string[];
  departmentIds: string[];
  levelIds: string[];
}

function emptyScope(kind: ScopeKind, isGlobal = false): ResolvedScope {
  return { kind, isGlobal, classIds: [], subjectIds: [], studentIds: [], sectionIds: [], departmentIds: [], levelIds: [] };
}

/**
 * Resolve the student's scope for a parent account.
 * A parent may only ever see children explicitly linked to them.
 */
export async function resolveParentScope(userId: string, schoolId: string): Promise<ResolvedScope> {
  const scope = emptyScope('LINKED_CHILDREN');
  // Legacy: Student.parentId points at the parent user id.
  const legacyChildren = await Student.findAll({ where: { parentId: userId, schoolId }, attributes: ['id'] });
  for (const s of legacyChildren) scope.studentIds.push(s.id);

  // Normalised: StudentParent junction (parent record → student).
  const parentRecords = await Parent.findAll({ where: { userId, schoolId }, attributes: ['id'] });
  if (parentRecords.length > 0) {
    const links = await StudentParent.findAll({
      where: { parentId: { [Op.in]: parentRecords.map((p) => p.id) } },
      attributes: ['studentId'],
    });
    for (const l of links) scope.studentIds.push(l.studentId);
  }
  scope.studentIds = [...new Set(scope.studentIds)];
  return scope;
}

/**
 * Resolve the scope of a student account: strictly SELF.
 * The link is explicit (Student.userId) — never inferred from an email, which
 * would otherwise expose every student record sharing that address.
 */
export async function resolveSelfScope(userId: string, schoolId: string): Promise<ResolvedScope> {
  const scope = emptyScope('SELF');
  const linked = await Student.findOne({ where: { userId, schoolId }, attributes: ['id', 'classId'] });
  if (linked) {
    scope.studentIds.push(linked.id);
    if (linked.classId) scope.classIds.push(linked.classId);
  }
  return scope;
}

/**
 * Resolve the teaching scope of a staff member from assignments + legacy columns.
 */
export async function resolveStaffScope(userId: string, schoolId: string): Promise<ResolvedScope> {
  const scope = emptyScope('ASSIGNED_CLASSES');
  const at = new Date();

  // 1) Explicit assignment rows (new architecture)
  const assignments = await Assignment.findAll({ where: { userId, schoolId, status: 'active' } });
  for (const a of assignments) {
    if (a.startDate && new Date(a.startDate) > at) continue;
    if (a.endDate && new Date(a.endDate) < at) continue;
    if (a.classId) scope.classIds.push(a.classId);
    if (a.subjectId) scope.subjectIds.push(a.subjectId);
    if (a.sectionId) scope.sectionIds.push(a.sectionId);
    if (a.levelId) scope.levelIds.push(a.levelId);
    if (a.departmentId) scope.departmentIds.push(a.departmentId);
  }

  // 2) Explicit UserScope rows
  const scopes = await UserScope.findAll({ where: { userId } });
  for (const s of scopes) {
    if (s.scopeType === 'class') scope.classIds.push(s.scopeId);
    if (s.scopeType === 'subject') scope.subjectIds.push(s.scopeId);
    if (s.scopeType === 'section') scope.sectionIds.push(s.scopeId);
    if (s.scopeType === 'level') scope.levelIds.push(s.scopeId);
    if (s.scopeType === 'department') scope.departmentIds.push(s.scopeId);
  }

  // 3) Legacy teacher derivation keeps existing installs working
  const [classes, subjects, timetables] = await Promise.all([
    Class.findAll({ where: { teacherId: userId, schoolId }, attributes: ['id'] }),
    Subject.findAll({ where: { teacherId: userId, schoolId }, attributes: ['id', 'classId'] }),
    Timetable.findAll({ where: { teacherId: userId, schoolId }, attributes: ['classId', 'subjectId'] }),
  ]);
  for (const c of classes) scope.classIds.push(c.id);
  for (const s of subjects) {
    scope.subjectIds.push(s.id);
    if (s.classId) scope.classIds.push(s.classId);
  }
  for (const t of timetables) {
    if (t.classId) scope.classIds.push(t.classId);
    if (t.subjectId) scope.subjectIds.push(t.subjectId);
  }

  scope.classIds = [...new Set(scope.classIds)];
  scope.subjectIds = [...new Set(scope.subjectIds)];
  scope.sectionIds = [...new Set(scope.sectionIds)];
  scope.levelIds = [...new Set(scope.levelIds)];
  scope.departmentIds = [...new Set(scope.departmentIds)];

  // 4) Students reachable through the resolved classes (used for student-scoped reads)
  if (scope.classIds.length > 0) {
    const students = await Student.findAll({ where: { classId: { [Op.in]: scope.classIds }, schoolId }, attributes: ['id'] });
    scope.studentIds = students.map((s) => s.id);
  }

  return scope;
}

/** Resolve the scope appropriate to a user's role family. */
export async function resolveScopeForUser(user: Pick<User, 'id' | 'role' | 'schoolId'>): Promise<ResolvedScope> {
  const role = user.role;
  const schoolId = user.schoolId;
  if (role === 'super_admin' || role === 'admin' || role === 'director') {
    return emptyScope('SCHOOL', true);
  }
  // A scoped role without a school context can never be resolved: deny by
  // returning an empty (non-global) scope rather than querying with undefined.
  if (!schoolId) {
    return emptyScope('SCHOOL');
  }
  if (role === 'parent') {
    return resolveParentScope(user.id, schoolId);
  }
  if (role === 'student') {
    return resolveSelfScope(user.id, schoolId);
  }
  return resolveStaffScope(user.id, schoolId);
}

/** Build a Sequelize `where` clause restricting a query to a user's classes. */
export function classWhereFromScope(scope: ResolvedScope, column = 'classId'): Record<string, unknown> {
  if (scope.isGlobal) return {};
  if (scope.classIds.length === 0) return { [column]: { [Op.in]: [] } };
  return { [column]: { [Op.in]: scope.classIds } };
}

/** Build a Sequelize `where` clause restricting a query to a user's students. */
export function studentWhereFromScope(scope: ResolvedScope, column = 'id'): Record<string, unknown> {
  if (scope.isGlobal) return {};
  if (scope.studentIds.length === 0) return { [column]: { [Op.in]: [] } };
  return { [column]: { [Op.in]: scope.studentIds } };
}
