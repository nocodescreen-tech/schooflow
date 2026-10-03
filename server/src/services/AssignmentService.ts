import { Assignment, User, Class, Subject } from '../models/index.js';
import { Op } from 'sequelize';
import { resolveScopeForUser } from './ScopeService.js';
import type { ResolvedScope } from './ScopeService.js';
import { computeEffectivePermissions } from './AuthorizationService.js';

/**
 * AssignmentService owns the lifecycle of Assignment rows:
 * creating, expiring and reporting the academic resources bound to a user.
 */

export type AssignmentType =
  | 'class_assignment'
  | 'subject_assignment'
  | 'department_assignment'
  | 'section_assignment'
  | 'level_assignment'
  | 'responsibility';

export interface AssignmentInput {
  userId: string;
  schoolId: string;
  academicYearId?: string | null;
  assignmentType?: AssignmentType;
  classId?: string | null;
  subjectId?: string | null;
  sectionId?: string | null;
  levelId?: string | null;
  departmentId?: string | null;
  startDate?: Date | null;
  endDate?: Date | null;
  status?: 'active' | 'inactive' | 'scheduled' | 'expired';
  isPrimary?: boolean;
  notes?: string | null;
}

export async function createAssignment(input: AssignmentInput, assignedBy: string): Promise<Assignment> {
  return Assignment.create({
    userId: input.userId,
    schoolId: input.schoolId,
    academicYearId: input.academicYearId ?? null,
    assignmentType: input.assignmentType ?? 'class_assignment',
    classId: input.classId ?? null,
    subjectId: input.subjectId ?? null,
    sectionId: input.sectionId ?? null,
    levelId: input.levelId ?? null,
    departmentId: input.departmentId ?? null,
    startDate: input.startDate ?? null,
    endDate: input.endDate ?? null,
    status: input.status ?? 'active',
    isPrimary: input.isPrimary ?? false,
    assignedBy,
    notes: input.notes ?? null,
  });
}

/** Soft-expire an assignment. Never hard-deleted: history must survive. */
export async function expireAssignment(id: string, schoolId: string): Promise<boolean> {
  const row = await Assignment.findOne({ where: { id, schoolId } });
  if (!row) return false;
  await row.update({ status: 'expired' });
  return true;
}

export async function listAssignmentsForUser(
  userId: string,
  schoolId: string,
  includeExpired = false
): Promise<Assignment[]> {
  return Assignment.findAll({
    where: {
      userId,
      schoolId,
      ...(includeExpired ? {} : { status: { [Op.in]: ['active', 'scheduled'] } }),
    },
    include: [
      { model: Class, as: 'class', attributes: ['id', 'name'] },
      { model: Subject, as: 'subject', attributes: ['id', 'name'] },
    ],
    order: [['createdAt', 'DESC']],
  });
}

/**
 * Transition a user between academic years: close the assignments of the
 * current year and return a report the caller can show / audit.
 */
export async function rolloverAssignments(
  userId: string,
  schoolId: string,
  newAcademicYearId: string
): Promise<{ expired: number; created: number }> {
  const current = await Assignment.findAll({ where: { userId, schoolId, status: 'active' } });
  for (const a of current) {
    await a.update({ status: 'expired', endDate: new Date() });
  }
  let created = 0;
  for (const a of current) {
    await createAssignment(
      {
        userId,
        schoolId,
        academicYearId: newAcademicYearId,
        assignmentType: (a.assignmentType as AssignmentType) ?? 'class_assignment',
        classId: a.classId,
        subjectId: a.subjectId,
        sectionId: a.sectionId,
        levelId: a.levelId,
        departmentId: a.departmentId,
        status: 'active',
        isPrimary: a.isPrimary,
        notes: 'Rollover automatique',
      },
      a.assignedBy ?? userId
    );
    created += 1;
  }
  return { expired: current.length, created };
}

/**
 * Full authorization snapshot for a user: effective permissions + resolved
 * data scope + a human-readable explanation. Backs the "why can this user
 * see this?" administration screen.
 */
export interface AuthorizationSnapshot {
  user: { id: string; name: string; role: string; schoolId: string };
  roles: string[];
  permissions: string[];
  isSuperuser: boolean;
  scope: ResolvedScope;
  assignments: Assignment[];
  breakdown: Awaited<ReturnType<typeof computeEffectivePermissions>>['breakdown'];
  explanation: string[];
}

export async function buildAuthorizationSnapshot(user: User): Promise<AuthorizationSnapshot> {
  const effective = await computeEffectivePermissions(user);
  const scope = await resolveScopeForUser(user);
  const assignments = await listAssignmentsForUser(user.id, user.schoolId);
  const { UserRole, Role } = await import('../models/index.js');
  const userRoles = await UserRole.findAll({ where: { userId: user.id, status: 'active' } });
  const roleRows = userRoles.length
    ? await Role.findAll({ where: { id: { [Op.in]: userRoles.map((r) => r.roleId) } } })
    : [];
  const roleNames = roleRows.map((r) => r.name);

  const explanation: string[] = [];
  explanation.push(`Rôle legacy : ${user.role}`);
  if (roleNames.length) explanation.push(`Rôles personnalisés : ${roleNames.join(', ')}`);
  explanation.push(`Classes accessibles : ${scope.isGlobal ? 'toutes' : scope.classIds.length}`);
  explanation.push(`Matières accessibles : ${scope.isGlobal ? 'toutes' : scope.subjectIds.length}`);
  if (scope.kind === 'SELF') explanation.push('Portée : lui-même uniquement');
  if (scope.kind === 'LINKED_CHILDREN') explanation.push('Portée : enfants liés uniquement');

  return {
    user: { id: user.id, name: user.name, role: user.role, schoolId: user.schoolId },
    roles: roleNames,
    permissions: effective.permissions,
    isSuperuser: effective.isSuperuser,
    scope,
    assignments,
    breakdown: effective.breakdown,
    explanation,
  };
}

/** Helper used by the students page to know whether a staff member can see a class. */
export async function canAccessClass(user: User, classId: string): Promise<boolean> {
  const scope = await resolveScopeForUser(user);
  if (scope.isGlobal) return true;
  return scope.classIds.includes(classId);
}
