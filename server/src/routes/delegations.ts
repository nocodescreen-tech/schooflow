import { Router, Request, Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import { Op } from 'sequelize';
import { authenticateToken } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { requireModule } from '../utils/modules.js';
import { AppError } from '../middleware/errorHandler.js';
import { logAudit } from '../middleware/auditLog.js';
import { Delegation, User } from '../models/index.js';
import {
  createDelegation,
  revokeDelegation,
  listDelegations,
  activeDelegationsFor,
  explainDelegations,
} from '../services/DelegationService.js';
import { computeEffectivePermissions } from '../services/AuthorizationService.js';
import { ALL_PERMISSIONS } from '../utils/permissions.js';

/**
 * Delegation API (§19).
 *
 * Two invariants hold on every endpoint:
 *  - `schoolId` is NEVER read from the client, it always comes from the
 *    authenticated account, so a user can neither delegate to nor inspect
 *    anybody outside their own establishment;
 *  - the granted permission set is intersected with what the delegator really
 *    holds, so a delegation transfers authority but never creates it.
 */
const router = Router();
router.use(authenticateToken);
router.use(requireModule('roles'));

/** A plain `delegations.manage` holder may only hand over their own authority. */
const DELEGATE_OTHERS = 'delegations.delegate_others';

async function permissionsOf(userId: string, schoolId: string): Promise<Set<string>> {
  const row = await User.findOne({ where: { id: userId, schoolId }, attributes: ['id', 'role', 'schoolId'] });
  if (!row) throw new AppError('Utilisateur introuvable', 404);
  const effective = await computeEffectivePermissions(row);
  return new Set(effective.permissions);
}

function fail(error: unknown): { status: number; body: { success: false; error: string } } {
  return {
    status: error instanceof AppError ? error.statusCode : 500,
    body: { success: false, error: (error as Error).message },
  };
}

/** Throws a 400 AppError on the first express-validator failure. */
function assertValid(req: Request): void {
  const errors = validationResult(req);
  if (errors.isEmpty()) return;
  throw new AppError(String(errors.array()[0].msg), 400);
}

// ─── Read ─────────────────────────────────────────────────────────────────────

/** GET /delegations — every delegation of the school, annotated with liveness. */
router.get('/', requirePermission('delegations', 'view'), async (req: Request, res: Response) => {
  try {
    const filter: { toUserId?: string; fromUserId?: string } = {};
    if (req.query.toUserId) filter.toUserId = String(req.query.toUserId);
    if (req.query.fromUserId) filter.fromUserId = String(req.query.fromUserId);
    const items = await listDelegations(req.user!.schoolId!, filter);
    return res.json({ success: true, data: { items, total: items.length } });
  } catch (error) {
    const { status, body } = fail(error);
    return res.status(status).json(body);
  }
});

/**
 * GET /delegations/me — what the signed-in user receives and what they gave.
 * No extra permission: a user must always be able to see who acts on their
 * behalf, and who they have authorised.
 */
router.get('/me', async (req: Request, res: Response) => {
  try {
    const { schoolId, id: userId } = req.user!;
    const [trace, received] = await Promise.all([
      explainDelegations(schoolId!, userId),
      activeDelegationsFor(schoolId!, userId),
    ]);
    return res.json({
      success: true,
      data: { ...trace, activeReceivedCount: received.length },
    });
  } catch (error) {
    const { status, body } = fail(error);
    return res.status(status).json(body);
  }
});

/**
 * GET /delegations/delegatable — the permissions the caller actually holds and
 * could therefore hand over. Derived from the authorization engine, never a
 * hardcoded list, so the UI can only offer what is legitimately transferable.
 *
 * A holder of the `*` wildcard covers the whole catalogue: for them the
 * delegatable set is the catalogue itself, which is exactly what
 * `createDelegation` will then accept.
 */
router.get('/delegatable', async (req: Request, res: Response) => {
  try {
    const row = await User.findByPk(req.user!.id, { attributes: ['id', 'role', 'schoolId'] });
    if (!row) throw new AppError('Compte introuvable', 404);
    const effective = await computeEffectivePermissions(row);
    const held = effective.permissions.filter((p) => p !== '*');
    const permissions = effective.isSuperuser
      ? [...ALL_PERMISSIONS].sort((a, b) => a.localeCompare(b))
      : held.sort((a, b) => a.localeCompare(b));
    return res.json({
      success: true,
      data: { permissions, isSuperuser: effective.isSuperuser },
    });
  } catch (error) {
    const { status, body } = fail(error);
    return res.status(status).json(body);
  }
});

/**
 * GET /delegations/recipients — active accounts of the school, reduced to what
 * a delegation form needs. Deliberately NOT the full `/users` listing: the
 * delegation manager needs names, not password hashes or lifecycle detail.
 */
router.get('/recipients', requirePermission('delegations', 'manage'), async (req: Request, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!;
    const search = String(req.query.search ?? '').trim();
    const where: Record<string | symbol, unknown> = {
      schoolId,
      isActive: true,
      status: 'active',
      id: { [Op.ne]: req.user!.id },
    };
    if (search) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } },
      ];
    }
    const rows = await User.findAll({
      where,
      attributes: ['id', 'name', 'email', 'role', 'status'],
      order: [['name', 'ASC']],
      limit: 200,
    });
    return res.json({ success: true, data: { items: rows.map((u) => u.get()) } });
  } catch (error) {
    const { status, body } = fail(error);
    return res.status(status).json(body);
  }
});

/**
 * GET /delegations/users/:userId — delegation trace for the "why can this user
 * see X?" screen (§51).
 */
router.get(
  '/users/:userId',
  requirePermission('delegations', 'view'),
  param('userId').isUUID('4').withMessage('Identifiant invalide'),
  async (req: Request, res: Response) => {
    try {
      assertValid(req);

      const schoolId = req.user!.schoolId!;
      const target = await User.findOne({
        where: { id: req.params.userId, schoolId },
        attributes: ['id', 'name', 'email', 'role'],
      });
      if (!target) throw new AppError('Utilisateur introuvable', 404);

      const [trace, effective] = await Promise.all([
        explainDelegations(schoolId, target.id),
        computeEffectivePermissions(target),
      ]);
      return res.json({
        success: true,
        data: {
          user: { id: target.id, name: target.name, email: target.email, role: target.role },
          ...trace,
          effectivePermissions: effective.permissions,
          isSuperuser: effective.isSuperuser,
        },
      });
    } catch (error) {
      const { status, body } = fail(error);
      return res.status(status).json(body);
    }
  }
);

// ─── Write ────────────────────────────────────────────────────────────────────

/**
 * POST /delegations — create a delegation.
 *
 * Default `fromUserId` is the caller. Passing another user (a director on
 * leave) requires the explicit `delegations.delegate_others` permission.
 */
router.post(
  '/',
  requirePermission('delegations', 'manage'),
  body('toUserId').isUUID('4').withMessage('Bénéficiaire invalide'),
  body('permissions').isArray().withMessage('Sélectionnez au moins une permission'),
  body('permissions.*').isString().withMessage('Permission invalide'),
  body('startAt').isISO8601().withMessage('Date de début invalide'),
  body('endAt').isISO8601().withMessage('Date de fin invalide'),
  body('scopeType').optional({ nullable: true }).isString().withMessage('Type de portée invalide'),
  body('fromUserId').optional({ nullable: true }).isUUID('4').withMessage('Délégataire invalide'),
  body('reason').optional({ nullable: true }).isString().withMessage('Motif invalide'),
  async (req: Request, res: Response) => {
    try {
      assertValid(req);

      const schoolId = req.user!.schoolId!;
      const actorId = req.user!.id;
      const fromUserId = (req.body.fromUserId as string | null) ?? actorId;

      if (fromUserId !== actorId) {
        const held = await permissionsOf(actorId, schoolId);
        if (!held.has('*') && !held.has(DELEGATE_OTHERS)) {
          throw new AppError('Vous ne pouvez déléguer que vos propres permissions', 403);
        }
        await permissionsOf(fromUserId, schoolId); // 404 if not in this school
      }

      const requested = (req.body.permissions as string[]).filter(
        (p) => typeof p === 'string' && p.length > 0
      );

      const row = await createDelegation({
        schoolId,
        fromUserId,
        toUserId: req.body.toUserId as string,
        permissions: requested,
        scopeType: (req.body.scopeType as string | null) ?? null,
        scopeId: (req.body.scopeId as string | null) ?? null,
        startAt: new Date(req.body.startAt as string),
        endAt: new Date(req.body.endAt as string),
        reason: (req.body.reason as string | null) ?? null,
        authorizedBy: actorId,
      });

      const granted = Array.isArray(row.permissions) ? row.permissions : [];
      const rejected = requested.filter((p) => !granted.includes(p));

      await logAudit(req, {
        action: 'delegation_created',
        entity: 'delegation',
        entityId: row.id,
        details: {
          fromUserId,
          toUserId: row.toUserId,
          permissions: granted,
          rejected,
          scopeType: row.scopeType,
          startAt: row.startAt,
          endAt: row.endAt,
          reason: row.reason,
        },
      });

      return res.status(201).json({ success: true, data: { delegation: row, granted, rejected } });
    } catch (error) {
      const { status, body } = fail(error);
      return res.status(status).json(body);
    }
  }
);

/**
 * POST /delegations/:id/revoke — cut a delegation immediately, even before its
 * window opens.
 */
router.post(
  '/:id/revoke',
  requirePermission('delegations', 'manage'),
  param('id').isUUID('4').withMessage('Délégation invalide'),
  async (req: Request, res: Response) => {
    try {
      assertValid(req);

      const row = await revokeDelegation(req.user!.schoolId!, req.params.id, req.user!.id);
      await logAudit(req, {
        action: 'delegation_revoked',
        entity: 'delegation',
        entityId: row.id,
        details: {
          fromUserId: row.fromUserId,
          toUserId: row.toUserId,
          permissions: row.permissions,
          revokedAt: row.revokedAt,
        },
      });
      return res.json({ success: true, data: { delegation: row } });
    } catch (error) {
      const { status, body } = fail(error);
      return res.status(status).json(body);
    }
  }
);

/**
 * POST /delegations/expire — housekeeping. Flips past-window delegations to
 * `expired` so reports stay accurate. The authorization engine already ignores
 * out-of-window rows, so this only affects presentation, never access.
 */
router.post('/expire', requirePermission('delegations', 'manage'), async (req: Request, res: Response) => {
  try {
    const [count] = await Delegation.update(
      { status: 'expired' },
      {
        where: {
          schoolId: req.user!.schoolId,
          status: 'active',
          endAt: { [Op.lt]: new Date() },
        },
      }
    );
    await logAudit(req, {
      action: 'delegations_expired',
      entity: 'school',
      entityId: req.user!.schoolId ?? null,
      details: { count },
    });
    return res.json({ success: true, data: { expired: count } });
  } catch (error) {
    const { status, body } = fail(error);
    return res.status(status).json(body);
  }
});

export default router;