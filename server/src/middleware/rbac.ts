import { Request, Response, NextFunction } from 'express';
import { Op } from 'sequelize';
import { AppError } from './errorHandler.js';
import { Role, RolePermission, Permission, UserRole, UserScope, Class, Timetable, Subject, Student, User, Assignment } from '../models/index.js';
import { computeEffectivePermissions, userHasPermission } from '../services/AuthorizationService.js';
import { resolveScopeForUser } from '../services/ScopeService.js';
import type { ResolvedScope } from '../services/ScopeService.js';
import { isLoginAllowed } from '../services/UserProvisioningService.js';

type RoleName = 'super_admin' | 'admin' | 'director' | 'teacher' | 'accountant' | 'parent' | 'student' | 'receptionist' | 'prefect';

/**
 * Legacy hard role check. Kept because several routes still gate on the
 * `users.role` enum; new code should prefer requirePermission.
 */
export function requireRole(...roles: RoleName[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Authentication required' });
      return;
    }
    if (!roles.includes(req.user.role as RoleName)) {
      res.status(403).json({ success: false, error: 'Insufficient permissions' });
      return;
    }
    next();
  };
}

export async function getCustomRolePermissions(userId: string, schoolId?: string): Promise<string[]> {
  const userRoles = await UserRole.findAll({ where: { userId } });
  if (userRoles.length === 0) return [];
  const roleIds = userRoles.map((ur) => ur.roleId);
  const where: Record<string | symbol, unknown> = { id: { [Op.in]: roleIds } };
  if (schoolId) {
    where[Op.or] = [{ schoolId }, { schoolId: null }];
  }
  const roles = await Role.findAll({ where });
  const scopedRoleIds = roles.map((r) => r.id);
  if (scopedRoleIds.length === 0) return [];
  const rolePermissions = await RolePermission.findAll({
    where: { roleId: { [Op.in]: scopedRoleIds } },
    include: [{ model: Permission, as: 'permission', attributes: ['module', 'action'] }],
  });
  return rolePermissions.map((rp) => {
    const p = (rp as unknown as { permission: { module: string; action: string } }).permission;
    return `${p.module}.${p.action}`;
  });
}

/**
 * Authorisation gate driven by the centralised engine:
 * legacy role baseline + custom roles + direct grants − revocations + valid
 * delegations. Also re-checks that the account is still allowed to act.
 */
export function requirePermission(module: string, action: string) {
  const needed = `${module}.${action}`;
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }
      const user = await User.findByPk(req.user.id, { attributes: ['id', 'role', 'schoolId', 'isActive', 'status'] });
      if (!user) {
        res.status(403).json({ success: false, error: 'Compte introuvable' });
        return;
      }
      const allowed = isLoginAllowed(user);
      if (!allowed.allowed) {
        res.status(403).json({ success: false, error: allowed.reason || 'Compte non autorisé' });
        return;
      }
      const has = await userHasPermission(user, needed);
      if (has) {
        next();
        return;
      }
      res.status(403).json({ success: false, error: 'Insufficient permissions', required: needed });
    } catch {
      res.status(500).json({ success: false, error: 'Permission check failed' });
    }
  };
}

export interface TeacherScope {
  classIds: string[];
  subjectIds: string[];
}

/**
 * Backwards-compatible teaching scope (class + subject ids) derived from the
 * centralised ScopeService so a single source of truth backs both the legacy
 * helper and the new guard.
 */
export async function getTeacherScope(userId: string, schoolId: string): Promise<TeacherScope> {
  const scope = await resolveScopeForUser({ id: userId, role: 'teacher', schoolId });
  return { classIds: scope.classIds, subjectIds: scope.subjectIds };
}

/**
 * Assert a teacher may act on a given class / subject / student. Now applies
 * to ANY scoped role (teacher, titulaire, department head), not just
 * `role === 'teacher'`, and is driven by assignments + explicit scopes.
 */
export async function assertTeacherScope(
  req: Request,
  classId?: string,
  subjectId?: string,
  studentId?: string
): Promise<void> {
  if (!req.user) return;
  // Global roles (admin, director, ...) bypass row-level checks.
  if (['super_admin', 'admin', 'director'].includes(req.user.role)) return;

  const scope = await resolveScopeForUser({ id: req.user!.id, role: req.user!.role, schoolId: req.user!.schoolId });
  if (scope.isGlobal) return;

  // Migration-safe fail-open: a user with no configured scope (no assignments,
  // timetable entries, subjects or explicit scopes) keeps legacy access so
  // existing flows keep working. Once any scope exists, checks are strict.
  const hasScope =
    scope.classIds.length > 0 ||
    scope.subjectIds.length > 0 ||
    scope.studentIds.length > 0 ||
    scope.sectionIds.length > 0 ||
    scope.departmentIds.length > 0;
  if (!hasScope) return;

  if (classId && !scope.classIds.includes(classId)) {
    throw new AppError('Access denied: class outside your scope', 403);
  }
  if (subjectId && !scope.subjectIds.includes(subjectId)) {
    throw new AppError('Access denied: subject outside your scope', 403);
  }
  if (studentId) {
    const student = await Student.findOne({ where: { id: studentId, schoolId: req.user.schoolId } });
    if (!student) throw new AppError('Student not found', 404);
    // SELF scope: a student may only touch their own record.
    if (scope.kind === 'SELF' && !scope.studentIds.includes(studentId)) {
      throw new AppError('Access denied: not your own record', 403);
    }
    const studentClassId = (student as unknown as { classId?: string }).classId;
    if (studentClassId && scope.kind !== 'SELF' && !scope.classIds.includes(studentClassId) && !scope.studentIds.includes(studentId)) {
      throw new AppError('Access denied: student outside your scope', 403);
    }
  }
}

/**
 * Multi-tenant guard: the request body/query may never target another school.
 * Use on any route accepting a schoolId from the client.
 */
export function assertSameSchool(req: Request, schoolIdFromClient?: string | null): void {
  if (!req.user) throw new AppError('Authentication required', 401);
  if (schoolIdFromClient && schoolIdFromClient !== req.user.schoolId) {
    throw new AppError('Access denied: cross-school request', 403);
  }
}

export { resolveScopeForUser, computeEffectivePermissions, ResolvedScope, Assignment };
