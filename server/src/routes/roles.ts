import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { Op } from 'sequelize';
import { authenticateToken } from '../middleware/auth.js';
import { requireRole, requirePermission } from '../middleware/rbac.js';
import { Role, Permission, RolePermission, UserRole, UserScope, User } from '../models/index.js';
import { logAudit } from '../middleware/auditLog.js';
import { seedPermissions, seedSystemRoles } from '../utils/seedRoles.js';

const router = Router();
router.use(authenticateToken);

const READ_ROLES = ['super_admin', 'admin', 'director'] as const;

// GET /roles — list school roles + system roles
router.get('/', requireRole(...READ_ROLES), requirePermission('roles', 'view'), async (req: Request, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!;
    const roles = await Role.findAll({
      where: { [Op.or]: [{ schoolId }, { schoolId: null }] },
      include: [
        {
          model: RolePermission,
          as: 'rolePermissions',
          include: [{ model: Permission, as: 'permission' }],
        },
      ],
      order: [['name', 'ASC']],
    });
    return res.json({ success: true, data: { roles } });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// GET /roles/permissions — permission catalog from DB (creates missing rows)
router.get('/permissions', requireRole(...READ_ROLES), requirePermission('roles', 'view'), async (_req: Request, res: Response) => {
  try {
    await seedPermissions();
    const permissions = await Permission.findAll({ order: [['module', 'ASC'], ['action', 'ASC']] });
    return res.json({ success: true, data: { permissions } });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// POST /roles/seed-system — seed global permissions + system roles
router.post('/seed-system', requireRole('super_admin', 'admin'), requirePermission('roles', 'manage'), async (req: Request, res: Response) => {
  try {
    const createdPermissions = await seedPermissions();
    const createdRoles = await seedSystemRoles(req.user!.schoolId!);
    await logAudit(req, {
      action: 'seed',
      entity: 'role',
      details: { createdPermissions, createdRoles },
    });
    return res.json({ success: true, data: { createdPermissions, createdRoles } });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// POST /roles — create a school-scoped custom role
router.post(
  '/',
  requireRole('super_admin', 'admin'),
  requirePermission('roles', 'manage'),
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('description').optional().isString(),
  body('permissionIds').optional().isArray(),
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ success: false, error: errors.array()[0].msg });

      const schoolId = req.user!.schoolId!;
      const { name, description, permissionIds } = req.body as {
        name: string;
        description?: string;
        permissionIds?: string[];
      };

      const existing = await Role.findOne({ where: { schoolId, name } });
      if (existing) return res.status(409).json({ success: false, error: 'Role name already exists' });

      const role = await Role.create({ schoolId, name, description, isSystem: false });

      if (Array.isArray(permissionIds) && permissionIds.length > 0) {
        const permissions = await Permission.findAll({ where: { id: { [Op.in]: permissionIds } } });
        if (permissions.length !== permissionIds.length) {
          await role.destroy();
          return res.status(400).json({ success: false, error: 'One or more permissionIds are invalid' });
        }
        await RolePermission.bulkCreate(
          permissions.map((p) => ({ roleId: role.id, permissionId: p.id }))
        );
      }

      await logAudit(req, { action: 'create', entity: 'role', entityId: role.id, details: { name } });

      const created = await Role.findByPk(role.id, {
        include: [
          {
            model: RolePermission,
            as: 'rolePermissions',
            include: [{ model: Permission, as: 'permission' }],
          },
        ],
      });
      return res.status(201).json({ success: true, data: { role: created } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

// PATCH /roles/:id — update a custom role (never system roles)
router.patch(
  '/:id',
  requireRole('super_admin', 'admin'),
  requirePermission('roles', 'manage'),
  body('name').optional().trim().notEmpty(),
  body('description').optional().isString(),
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ success: false, error: errors.array()[0].msg });

      const role = await Role.findOne({
        where: { id: req.params.id, schoolId: req.user!.schoolId! },
      });
      if (!role) return res.status(404).json({ success: false, error: 'Role not found' });
      if (role.isSystem) return res.status(403).json({ success: false, error: 'System roles cannot be modified' });

      const { name, description } = req.body as { name?: string; description?: string };
      if (name && name !== role.name) {
        const existing = await Role.findOne({ where: { schoolId: req.user!.schoolId!, name } });
        if (existing) return res.status(409).json({ success: false, error: 'Role name already exists' });
      }

      const updates: Record<string, unknown> = {};
      if (name !== undefined) updates.name = name;
      if (description !== undefined) updates.description = description;
      await role.update(updates);

      await logAudit(req, { action: 'update', entity: 'role', entityId: role.id, details: updates });

      return res.json({ success: true, data: { role } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

// DELETE /roles/:id — delete a custom role (never system, only if unassigned)
router.delete('/:id', requireRole('super_admin', 'admin'), requirePermission('roles', 'manage'), async (req: Request, res: Response) => {
  try {
    const role = await Role.findOne({
      where: { id: req.params.id, schoolId: req.user!.schoolId! },
    });
    if (!role) return res.status(404).json({ success: false, error: 'Role not found' });
    if (role.isSystem) return res.status(403).json({ success: false, error: 'System roles cannot be deleted' });

    const assigned = await UserRole.count({ where: { roleId: role.id } });
    if (assigned > 0) {
      return res.status(409).json({ success: false, error: 'Role is assigned to users and cannot be deleted' });
    }

    await RolePermission.destroy({ where: { roleId: role.id } });
    await role.destroy();

    await logAudit(req, { action: 'delete', entity: 'role', entityId: req.params.id });

    return res.json({ success: true, data: { message: 'Role deleted' } });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// POST /roles/:id/permissions — replace the permission set of a custom role
router.post(
  '/:id/permissions',
  requireRole('super_admin', 'admin'),
  requirePermission('roles', 'manage'),
  body('permissionIds').isArray().withMessage('permissionIds must be an array'),
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ success: false, error: errors.array()[0].msg });

      const role = await Role.findOne({
        where: { id: req.params.id, schoolId: req.user!.schoolId! },
      });
      if (!role) return res.status(404).json({ success: false, error: 'Role not found' });
      if (role.isSystem) return res.status(403).json({ success: false, error: 'System roles cannot be modified' });

      const { permissionIds } = req.body as { permissionIds: string[] };
      const permissions = await Permission.findAll({ where: { id: { [Op.in]: permissionIds } } });
      if (permissions.length !== permissionIds.length) {
        return res.status(400).json({ success: false, error: 'One or more permissionIds are invalid' });
      }

      await RolePermission.destroy({ where: { roleId: role.id } });
      if (permissions.length > 0) {
        await RolePermission.bulkCreate(permissions.map((p) => ({ roleId: role.id, permissionId: p.id })));
      }

      await logAudit(req, {
        action: 'update',
        entity: 'role_permissions',
        entityId: role.id,
        details: { permissionIds },
      });

      const updated = await Role.findByPk(role.id, {
        include: [
          {
            model: RolePermission,
            as: 'rolePermissions',
            include: [{ model: Permission, as: 'permission' }],
          },
        ],
      });
      return res.json({ success: true, data: { role: updated } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

async function findSchoolUser(userId: string, schoolId: string) {
  return User.findOne({ where: { id: userId, schoolId } });
}

// GET /roles/users/:userId/roles
router.get('/users/:userId/roles', requireRole(...READ_ROLES), requirePermission('roles', 'view'), async (req: Request, res: Response) => {
  try {
    const user = await findSchoolUser(req.params.userId, req.user!.schoolId!);
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    const userRoles = await UserRole.findAll({
      where: { userId: user.id },
      include: [{ model: Role, as: 'role' }],
    });
    return res.json({ success: true, data: { roles: userRoles.map((ur) => (ur as unknown as { role: Role }).role) } });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// POST /roles/users/:userId/roles — replace custom role assignments
router.post(
  '/users/:userId/roles',
  requireRole('super_admin', 'admin'),
  requirePermission('roles', 'manage'),
  body('roleIds').isArray().withMessage('roleIds must be an array'),
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ success: false, error: errors.array()[0].msg });

      const schoolId = req.user!.schoolId!;
      const user = await findSchoolUser(req.params.userId, schoolId);
      if (!user) return res.status(404).json({ success: false, error: 'User not found' });

      const { roleIds } = req.body as { roleIds: string[] };
      if (roleIds.length > 0) {
        const roles = await Role.findAll({
          where: { id: { [Op.in]: roleIds }, [Op.or]: [{ schoolId }, { schoolId: null }] },
        });
        if (roles.length !== roleIds.length) {
          return res.status(400).json({ success: false, error: 'One or more roleIds are invalid' });
        }
      }

      const oldAssignments = await UserRole.findAll({ where: { userId: user.id } });
      const oldRoleIds = oldAssignments.map((ur) => ur.roleId);

      await UserRole.destroy({ where: { userId: user.id } });
      if (roleIds.length > 0) {
        await UserRole.bulkCreate(roleIds.map((roleId) => ({ userId: user.id, roleId })));
      }

      await logAudit(req, {
        action: 'update',
        entity: 'user_roles',
        entityId: user.id,
        details: { oldRoleIds, newRoleIds: roleIds },
      });

      return res.json({ success: true, data: { userId: user.id, roleIds } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

// GET /roles/users/:userId/scopes
router.get('/users/:userId/scopes', requireRole(...READ_ROLES), requirePermission('roles', 'view'), async (req: Request, res: Response) => {
  try {
    const user = await findSchoolUser(req.params.userId, req.user!.schoolId!);
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    const scopes = await UserScope.findAll({ where: { userId: user.id } });
    return res.json({ success: true, data: { scopes } });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// POST /roles/users/:userId/scopes — replace scope assignments
router.post(
  '/users/:userId/scopes',
  requireRole('super_admin', 'admin'),
  requirePermission('roles', 'manage'),
  body('scopes').isArray().withMessage('scopes must be an array'),
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ success: false, error: errors.array()[0].msg });

      const user = await findSchoolUser(req.params.userId, req.user!.schoolId!);
      if (!user) return res.status(404).json({ success: false, error: 'User not found' });

      const { scopes } = req.body as { scopes: Array<{ scopeType: string; scopeId: string }> };
      const validTypes = ['class', 'subject', 'department', 'section'];
      for (const s of scopes) {
        if (!validTypes.includes(s.scopeType) || !s.scopeId) {
          return res.status(400).json({ success: false, error: 'Each scope needs a valid scopeType and scopeId' });
        }
      }

      await UserScope.destroy({ where: { userId: user.id } });
      const created = scopes.length > 0
        ? await UserScope.bulkCreate(scopes.map((s) => ({ userId: user.id, scopeType: s.scopeType, scopeId: s.scopeId })))
        : [];

      await logAudit(req, {
        action: 'update',
        entity: 'user_scopes',
        entityId: user.id,
        details: { scopes },
      });

      return res.json({ success: true, data: { scopes: created } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

export default router;
