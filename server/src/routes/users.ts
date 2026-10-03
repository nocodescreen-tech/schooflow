import { Router, Request, Response } from 'express';
import { body, query, validationResult } from 'express-validator';
import { Op } from 'sequelize';
import sequelize from '../config/database.js';
import { authenticateToken } from '../middleware/auth.js';
import { requirePermission, requireRole } from '../middleware/rbac.js';
import { AppError } from '../middleware/errorHandler.js';
import { logAudit } from '../middleware/auditLog.js';
import {
  User, Role, UserRole, UserPermissionOverride, Delegation, Assignment,
  Student, Parent, RefreshToken, Role as RoleModel, Permission, RolePermission,
} from '../models/index.js';
import {
  createStaffAccount, createStudentAccount, createParentAccount, resetAccountPassword,
  changeAccountStatus, revokeAllSessions, revokeUserRoles, expireStaleDelegations,
} from '../services/UserProvisioningService.js';
import type { LifecycleAction, CreateStaffAccountInput } from '../services/UserProvisioningService.js';
import { buildAuthorizationSnapshot } from '../services/AssignmentService.js';
import { computeEffectivePermissions, userHasPermission } from '../services/AuthorizationService.js';
import { resolveScopeForUser } from '../services/ScopeService.js';

const router = Router();
router.use(authenticateToken);

const ADMIN_ROLES = ['super_admin', 'admin', 'director'] as const;

// ─── List accounts ────────────────────────────────────────────────────────────

router.get('/', requirePermission('users', 'view'), async (req: Request, res: Response) => {
  try {
    const schoolId = req.user!.schoolId;
    await expireStaleDelegations(schoolId);

    const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '25'), 10) || 25));
    const search = (req.query.search as string) || '';
    const status = (req.query.status as string) || '';
    const role = (req.query.role as string) || '';
    const roleId = (req.query.roleId as string) || '';

    const where: Record<string | symbol, unknown> = { schoolId };
    if (search) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } },
        { phone: { [Op.iLike]: `%${search}%` } },
      ];
    }
    if (status) where.status = status;
    if (role) where.role = role;

    let idsWithRole: string[] | null = null;
    if (roleId) {
      const urs = await UserRole.findAll({ where: { roleId, status: 'active' } });
      idsWithRole = urs.map((u) => u.userId);
      if (idsWithRole.length === 0) idsWithRole = ['__none__'];
    }

    const { rows, count } = await User.findAndCountAll({
      where,
      attributes: [
        'id', 'name', 'email', 'role', 'phone', 'photo', 'avatar', 'isActive',
        'status', 'mustChangePassword', 'lastLoginAt', 'createdAt', 'username',
      ],
      order: [['createdAt', 'DESC']],
      limit,
      offset: (page - 1) * limit,
    });

    const userIds = rows.map((u) => u.id);
    const roleLinks = userIds.length
      ? await UserRole.findAll({ where: { userId: { [Op.in]: userIds }, status: 'active' } })
      : [];
    const linkedRoleIds = [...new Set(roleLinks.map((r) => r.roleId))];
    const roles = linkedRoleIds.length ? await RoleModel.findAll({ where: { id: { [Op.in]: linkedRoleIds } } }) : [];
    const roleMap = new Map(roles.map((r) => [r.id, r.name]));

    const items = rows.map((u) => ({
      ...u.get(),
      roles: roleLinks.filter((r) => r.userId === u.id).map((r) => ({ id: r.roleId, name: roleMap.get(r.roleId) })),
    }));

    if (idsWithRole) {
      const filtered = items.filter((i) => idsWithRole!.includes(i.id));
      return res.json({ success: true, data: { items: filtered, total: count, page, pages: Math.ceil(count / limit) } });
    }
    return res.json({ success: true, data: { items, total: count, page, pages: Math.ceil(count / limit) } });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// ─── Effective permissions matrix (why can this user see X?) ──────────────────

router.get('/permissions-matrix', requirePermission('users', 'view'), async (req: Request, res: Response) => {
  try {
    const schoolId = req.user!.schoolId;
    const users = await User.findAll({ where: { schoolId }, attributes: ['id', 'name', 'email', 'role', 'status', 'schoolId'] });
    const out = [];
    for (const u of users) {
      const effective = await computeEffectivePermissions(u);
      const scope = await resolveScopeForUser(u);
      out.push({
        id: u.id, name: u.name, email: u.email, role: u.role, status: u.status,
        permissions: effective.permissions, isSuperuser: effective.isSuperuser,
        scope: { kind: scope.kind, isGlobal: scope.isGlobal, classIds: scope.classIds, subjectIds: scope.subjectIds, studentIds: scope.studentIds },
      });
    }
    return res.json({ success: true, data: { items: out } });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.get('/:id/authorization', requirePermission('users', 'view'), async (req: Request, res: Response) => {
  try {
    const user = await User.findOne({ where: { id: req.params.id, schoolId: req.user!.schoolId } });
    if (!user) throw new AppError('Utilisateur introuvable', 404);
    const snapshot = await buildAuthorizationSnapshot(user);
    return res.json({ success: true, data: snapshot });
  } catch (error) {
    if (error instanceof AppError) return res.status(error.statusCode).json({ success: false, error: error.message });
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// ─── Create staff account ─────────────────────────────────────────────────────

router.post('/',
  requirePermission('users', 'create_staff'),
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('role').trim().notEmpty().withMessage('Role is required'),
  body('phone').optional().trim(),
  body('username').optional().trim(),
  body('roleIds').optional().isArray(),
  body('temporaryPassword').optional().isLength({ min: 8 }),
  body('mustChangePassword').optional().isBoolean(),
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ success: false, error: errors.array()[0].msg });
      const {
        name, email, role, phone, username, roleIds, temporaryPassword, mustChangePassword, assignments,
      } = req.body as {
        name: string; email: string; role: string; phone?: string | null;
        username?: string; roleIds?: string[]; temporaryPassword?: string; mustChangePassword?: boolean;
        assignments?: CreateStaffAccountInput['assignments'];
      };
      // Granular "who can create what": teacher accounts need their own grant.
      if (role === 'teacher' && !(await userHasPermission(req.user!, 'users.create_teacher'))) {
        throw new AppError('Insufficient permissions', 403);
      }
      const result = await createStaffAccount({
        schoolId: req.user!.schoolId, name, email, role, phone, username, roleIds,
        temporaryPassword, mustChangePassword, assignments, createdBy: req.user!.id,
      });
      await logAudit(req, { action: 'account_created', entity: 'user', entityId: result.user.id, details: { role } });
      return res.status(201).json({ success: true, data: { user: result.user, temporaryPassword: result.temporaryPassword } });
    } catch (error) {
      if (error instanceof AppError) return res.status(error.statusCode).json({ success: false, error: error.message });
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

// ─── Create student / parent accounts ─────────────────────────────────────────

router.post('/student/:studentId', requirePermission('users', 'create_student'), async (req: Request, res: Response) => {
  try {
    const student = await Student.findOne({ where: { id: req.params.studentId, schoolId: req.user!.schoolId } });
    if (!student) throw new AppError('Élève introuvable', 404);
    const result = await createStudentAccount(student.id, req.user!.id, {
      temporaryPassword: (req.body as { temporaryPassword?: string }).temporaryPassword,
      email: (req.body as { email?: string }).email,
    });
    await logAudit(req, { action: 'account_created', entity: 'student_account', entityId: result.user.id, details: { studentId: student.id } });
    return res.status(201).json({ success: true, data: { user: result.user, temporaryPassword: result.temporaryPassword } });
  } catch (error) {
    if (error instanceof AppError) return res.status(error.statusCode).json({ success: false, error: error.message });
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.post('/parent/:parentId', requirePermission('users', 'create_parent'), async (req: Request, res: Response) => {
  try {
    const parent = await Parent.findOne({ where: { id: req.params.parentId, schoolId: req.user!.schoolId } });
    if (!parent) throw new AppError('Parent introuvable', 404);
    const result = await createParentAccount(parent.id, req.user!.id, {
      temporaryPassword: (req.body as { temporaryPassword?: string }).temporaryPassword,
      email: (req.body as { email?: string }).email,
    });
    await logAudit(req, { action: 'account_created', entity: 'parent_account', entityId: result.user.id, details: { parentId: parent.id } });
    return res.status(201).json({ success: true, data: { user: result.user, temporaryPassword: result.temporaryPassword } });
  } catch (error) {
    if (error instanceof AppError) return res.status(error.statusCode).json({ success: false, error: error.message });
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// ─── Update profile fields ─────────────────────────────────────────────────────

router.put('/:id', requirePermission('users', 'update'),
  body('name').optional().trim().notEmpty(),
  body('phone').optional().trim(),
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ success: false, error: errors.array()[0].msg });
      const user = await User.findOne({ where: { id: req.params.id, schoolId: req.user!.schoolId } });
      if (!user) throw new AppError('Utilisateur introuvable', 404);
      const { name, phone, photo } = req.body as { name?: string; phone?: string; photo?: string };
      if (name !== undefined) user.name = name;
      if (phone !== undefined) user.phone = phone;
      if (photo !== undefined) user.photo = photo;
      await user.save();
      await logAudit(req, { action: 'account_updated', entity: 'user', entityId: user.id });
      return res.json({ success: true, data: { user } });
    } catch (error) {
      if (error instanceof AppError) return res.status(error.statusCode).json({ success: false, error: error.message });
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

// ─── Roles ────────────────────────────────────────────────────────────────────

router.put('/:id/roles', requirePermission('roles', 'manage'),
  body('roleIds').isArray().withMessage('roleIds must be an array'),
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ success: false, error: errors.array()[0].msg });
      const schoolId = req.user!.schoolId;
      const user = await User.findOne({ where: { id: req.params.id, schoolId } });
      if (!user) throw new AppError('Utilisateur introuvable', 404);
      const { roleIds } = req.body as { roleIds: string[] };

      await sequelize.transaction(async () => {
        await revokeUserRoles(user.id, schoolId);
        for (const roleId of roleIds) {
          const role = await RoleModel.findOne({ where: { id: roleId, schoolId } });
          if (!role) continue;
          await UserRole.create({ userId: user.id, roleId: role.id, schoolId, status: 'active', assignedBy: req.user!.id });
        }
      });
      await logAudit(req, { action: 'roles_changed', entity: 'user', entityId: user.id, details: { roleIds } });
      return res.json({ success: true, data: { user, roleIds } });
    } catch (error) {
      if (error instanceof AppError) return res.status(error.statusCode).json({ success: false, error: error.message });
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

// ─── Direct permission overrides ─────────────────────────────────────────────

router.post('/:id/permission-overrides',
  requirePermission('roles', 'manage'),
  body('permission').trim().notEmpty(),
  body('effect').isIn(['grant', 'revoke']),
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ success: false, error: errors.array()[0].msg });
      const schoolId = req.user!.schoolId;
      const user = await User.findOne({ where: { id: req.params.id, schoolId } });
      if (!user) throw new AppError('Utilisateur introuvable', 404);
      const { permission, effect, scopeType, scopeId, startAt, endAt, reason } = req.body as {
        permission: string; effect: 'grant' | 'revoke'; scopeType?: string; scopeId?: string;
        startAt?: string; endAt?: string; reason?: string;
      };
      const row = await UserPermissionOverride.create({
        schoolId, userId: user.id, permission, effect, scopeType: scopeType ?? null, scopeId: scopeId ?? null,
        startAt: startAt ? new Date(startAt) : null, endAt: endAt ? new Date(endAt) : null,
        reason: reason ?? null, authorizedBy: req.user!.id, status: 'active',
      });
      await logAudit(req, { action: 'permission_override', entity: 'user', entityId: user.id, details: { permission, effect } });
      return res.status(201).json({ success: true, data: { override: row } });
    } catch (error) {
      if (error instanceof AppError) return res.status(error.statusCode).json({ success: false, error: error.message });
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

router.delete('/:id/permission-overrides/:overrideId', requirePermission('roles', 'manage'), async (req: Request, res: Response) => {
  try {
    const [count] = await UserPermissionOverride.update({ status: 'revoked' }, {
      where: { id: req.params.overrideId, userId: req.params.id, schoolId: req.user!.schoolId },
    });
    if (!count) throw new AppError('Override introuvable', 404);
    await logAudit(req, { action: 'permission_override_revoked', entity: 'user', entityId: req.params.id });
    return res.json({ success: true });
  } catch (error) {
    if (error instanceof AppError) return res.status(error.statusCode).json({ success: false, error: error.message });
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// ─── Lifecycle: suspend / disable / activate / archive ────────────────────────

router.post('/:id/status',
  requirePermission('users', 'disable'),
  body('action').isIn(['suspend', 'disable', 'activate', 'archive', 'reactivate']),
  body('reason').optional().trim(),
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ success: false, error: errors.array()[0].msg });
      const { action, reason } = req.body as { action: LifecycleAction; reason?: string };
      const user = await User.findOne({ where: { id: req.params.id, schoolId: req.user!.schoolId } });
      if (!user) throw new AppError('Utilisateur introuvable', 404);
      const updated = await changeAccountStatus(user.id, action, req.user!.id, reason);
      await logAudit(req, { action: `account_${action}`, entity: 'user', entityId: user.id, details: { reason } });
      return res.json({ success: true, data: { user: updated } });
    } catch (error) {
      if (error instanceof AppError) return res.status(error.statusCode).json({ success: false, error: error.message });
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

// ─── Password reset (never returns the current password) ─────────────────────

router.post('/:id/reset-password',
  requirePermission('users', 'update'),
  async (req: Request, res: Response) => {
    try {
      const user = await User.findOne({ where: { id: req.params.id, schoolId: req.user!.schoolId } });
      if (!user) throw new AppError('Utilisateur introuvable', 404);
      const { revokeSessions, newPassword } = req.body as { revokeSessions?: boolean; newPassword?: string };
      const result = await resetAccountPassword(user.id, req.user!.id, { revokeSessions, newPassword });
      await logAudit(req, { action: 'password_reset', entity: 'user', entityId: user.id });
      return res.json({ success: true, data: { temporaryPassword: result.temporaryPassword } });
    } catch (error) {
      if (error instanceof AppError) return res.status(error.statusCode).json({ success: false, error: error.message });
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

router.post('/:id/revoke-sessions', requirePermission('users', 'update'), async (req: Request, res: Response) => {
  try {
    const user = await User.findOne({ where: { id: req.params.id, schoolId: req.user!.schoolId } });
    if (!user) throw new AppError('Utilisateur introuvable', 404);
    const revoked = await revokeAllSessions(user.id);
    await logAudit(req, { action: 'sessions_revoked', entity: 'user', entityId: user.id, details: { revoked } });
    return res.json({ success: true, data: { revoked } });
  } catch (error) {
    if (error instanceof AppError) return res.status(error.statusCode).json({ success: false, error: error.message });
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// ─── Active sessions list ─────────────────────────────────────────────────────

router.get('/:id/sessions', requirePermission('users', 'view'), async (req: Request, res: Response) => {
  try {
    const sessions = await RefreshToken.findAll({
      where: { userId: req.params.id, revoked: false, expiresAt: { [Op.gt]: new Date() } },
      attributes: ['id', 'userAgent', 'ipAddress', 'createdAt', 'expiresAt'],
      order: [['createdAt', 'DESC']],
    });
    return res.json({ success: true, data: { items: sessions } });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// ─── Assignments ──────────────────────────────────────────────────────────────

router.get('/:id/assignments', requirePermission('users', 'view'), async (req: Request, res: Response) => {
  try {
    const assignments = await Assignment.findAll({
      where: { userId: req.params.id, schoolId: req.user!.schoolId },
      order: [['createdAt', 'DESC']],
    });
    return res.json({ success: true, data: { items: assignments } });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

async function assertUserInSchool(schoolId: string, userId: string): Promise<void> {
  const user = await User.findOne({ where: { id: userId, schoolId } });
  if (!user) throw new AppError('Utilisateur introuvable', 404);
}

export default router;
