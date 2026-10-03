import { Op } from 'sequelize';
import { Delegation, User } from '../models/index.js';
import { computeEffectivePermissions } from './AuthorizationService.js';
import { AppError } from '../middleware/errorHandler.js';

/**
 * DelegationService — temporary transfer of responsibility (spec §19).
 *
 * A delegation lets an authorized user hand a bounded subset of their own
 * permissions to another user for a bounded period:
 *
 *   Directeur absent → délègue à l'adjoint
 *
 * Two rules keep this safe:
 *
 * 1. A delegation can NEVER grant more than the delegator actually holds.
 *    The grant is intersected with the delegator's effective permissions, so
 *    an administrator cannot borrow powers they do not have themselves.
 * 2. It only applies inside [startAt, endAt] and while `active`. An expired
 *    delegation grants nothing — verified by the acceptance test #16.
 */

export interface CreateDelegationInput {
  schoolId: string;
  fromUserId: string;
  toUserId: string;
  permissions: string[];
  scopeType?: string | null;
  scopeId?: string | null;
  startAt: Date;
  endAt: Date;
  reason?: string | null;
  authorizedBy: string;
}

export interface DelegationView {
  id: string;
  fromUserId: string;
  toUserId: string;
  fromUserName: string;
  toUserName: string;
  permissions: string[];
  scopeType: string | null;
  scopeId: string | null;
  startAt: Date;
  endAt: Date;
  reason: string | null;
  status: 'pending' | 'active' | 'revoked' | 'expired';
  /** computed, not stored */
  effective: boolean;
  revokedAt: Date | null;
  createdAt: Date;
}

function isWithinWindow(d: { startAt: Date; endAt: Date }, at: Date): boolean {
  return at >= new Date(d.startAt) && at <= new Date(d.endAt);
}

/**
 * Validates and records a delegation.
 *
 * The permission list is intersected with what the delegator really holds:
 * a delegation can only pass on authority, never create it.
 */
export async function createDelegation(input: CreateDelegationInput): Promise<Delegation> {
  if (input.fromUserId === input.toUserId) {
    throw new AppError('Impossible de déléguer à soi-même', 400);
  }
  if (new Date(input.endAt) <= new Date(input.startAt)) {
    throw new AppError('La date de fin doit être postérieure à la date de début', 400);
  }
  if (new Date(input.endAt) <= new Date()) {
    throw new AppError('Une délégation doit se terminer dans le futur', 400);
  }
  if (!input.permissions.length) {
    throw new AppError('Sélectionnez au moins une permission à déléguer', 400);
  }

  const schoolId = input.schoolId;

  const [from, to] = await Promise.all([
    User.findOne({ where: { id: input.fromUserId, schoolId } }),
    User.findOne({ where: { id: input.toUserId, schoolId } }),
  ]);
  if (!from) throw new AppError('Utilisateur délégataire introuvable', 404);
  if (!to) throw new AppError('Utilisateur bénéficiaire introuvable', 404);
  if (!from.isActive) throw new AppError('Le compte délégataire est inactif', 400);
  if (!to.isActive) throw new AppError('Le compte bénéficiaire est inactif', 400);

  // The delegator cannot hand out permissions they do not hold.
  const delegator = await computeEffectivePermissions(from);
  const held = new Set(delegator.permissions);
  const requested = input.permissions.filter((p) => p !== '*');
  const granted = delegator.isSuperuser
    ? input.permissions
    : requested.filter((p) => held.has(p));

  const rejected = requested.filter((p) => !granted.includes(p));
  if (!granted.length) {
    throw new AppError(
      'Aucune des permissions demandées n’est détenue par le délégataire de départ',
      400
    );
  }

  return Delegation.create({
    schoolId,
    fromUserId: input.fromUserId,
    toUserId: input.toUserId,
    permissions: granted,
    scopeType: input.scopeType ?? null,
    scopeId: input.scopeId ?? null,
    startAt: input.startAt,
    endAt: input.endAt,
    reason: input.reason ?? null,
    authorizedBy: input.authorizedBy,
    status: 'active',
  });
}

/** Revokes a delegation immediately. */
export async function revokeDelegation(
  schoolId: string,
  id: string,
  revokedBy: string
): Promise<Delegation> {
  const row = await Delegation.findOne({ where: { id, schoolId } });
  if (!row) throw new AppError('Délégation introuvable', 404);
  if (row.status === 'revoked') throw new AppError('Délégation déjà révoquée', 400);
  await row.update({ status: 'revoked', revokedAt: new Date(), revokedBy });
  return row;
}

/**
 * Lists the delegations of a school, annotated with whether each is
 * currently effective. Expired ones are flipped to `expired` on read so the
 * UI never shows a stale "active" badge.
 */
export async function listDelegations(
  schoolId: string,
  filter: { toUserId?: string; fromUserId?: string } = {}
): Promise<DelegationView[]> {
  const where: Record<string, unknown> = { schoolId, ...filter };
  const rows = await Delegation.findAll({
    where,
    include: [
      { model: User, as: 'delegationSource', attributes: ['id', 'name'] },
      { model: User, as: 'delegationTarget', attributes: ['id', 'name'] },
    ],
    order: [['createdAt', 'DESC']],
  });

  const now = new Date();
  const out: DelegationView[] = [];
  for (const row of rows) {
    // Flip to expired on read: no cron, no stale state.
    if (row.status === 'active' && new Date(row.endAt) < now) {
      await row.update({ status: 'expired' });
    }
    const source = (row as unknown as { delegationSource?: { name: string } }).delegationSource;
    const target = (row as unknown as { delegationTarget?: { name: string } }).delegationTarget;
    out.push({
      id: row.id,
      fromUserId: row.fromUserId,
      toUserId: row.toUserId,
      fromUserName: source?.name ?? '',
      toUserName: target?.name ?? '',
      permissions: row.permissions ?? [],
      scopeType: row.scopeType,
      scopeId: row.scopeId,
      startAt: row.startAt,
      endAt: row.endAt,
      reason: row.reason,
      status: row.status,
      effective: row.status === 'active' && isWithinWindow(row, now),
      revokedAt: row.revokedAt,
      createdAt: row.createdAt,
    });
  }
  return out;
}

/** Delegations a user currently receives, used by the authorization engine. */
export async function activeDelegationsFor(
  schoolId: string,
  toUserId: string,
  at: Date = new Date()
): Promise<Delegation[]> {
  const rows = await Delegation.findAll({
    where: {
      schoolId,
      toUserId,
      status: 'active',
      startAt: { [Op.lte]: at },
      endAt: { [Op.gte]: at },
    },
  });
  return rows;
}

/**
 * Why can this user do this? (§51) — includes the delegations in play, so an
 * administrator can see that a permission comes from a delegation rather than
 * from a role.
 */
export interface DelegationTrace {
  id: string;
  /** the other party: the delegator for `received`, the delegate for `given` */
  counterpartyId: string;
  counterpartyName: string;
  permissions: string[];
  scopeType: string | null;
  startAt: Date;
  endAt: Date;
  effective: boolean;
}

export async function explainDelegations(
  schoolId: string,
  userId: string,
  at: Date = new Date()
): Promise<{ received: DelegationTrace[]; given: DelegationTrace[] }> {
  const [received, given] = await Promise.all([
    Delegation.findAll({
      where: { schoolId, toUserId: userId, status: 'active' },
      include: [{ model: User, as: 'delegationSource', attributes: ['id', 'name'] }],
    }),
    Delegation.findAll({
      where: { schoolId, fromUserId: userId, status: 'active' },
      include: [{ model: User, as: 'delegationTarget', attributes: ['id', 'name'] }],
    }),
  ]);

  const map = (
    rows: Delegation[],
    alias: 'delegationSource' | 'delegationTarget',
    idField: 'fromUserId' | 'toUserId'
  ): DelegationTrace[] =>
    rows.map((r) => {
      const u = (r as unknown as Record<string, { id: string; name: string } | undefined>)[alias];
      return {
        id: r.id,
        counterpartyId: u?.id ?? r[idField],
        counterpartyName: u?.name ?? '',
        permissions: Array.isArray(r.permissions) ? r.permissions : [],
        scopeType: r.scopeType,
        startAt: r.startAt,
        endAt: r.endAt,
        effective: isWithinWindow(r, at),
      };
    });

  return {
    received: map(received, 'delegationSource', 'fromUserId'),
    given: map(given, 'delegationTarget', 'toUserId'),
  };
}
