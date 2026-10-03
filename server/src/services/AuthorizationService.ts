import { Op } from 'sequelize';
import type { Transaction } from 'sequelize';
import {
  Role,
  RolePermission,
  UserRole,
  UserPermissionOverride,
  Delegation,
  Permission,
} from '../models/index.js';
import type { User } from '../models/index.js';
import { LEGACY_ROLE_PERMISSIONS, PERMISSION_IMPLICATIONS } from '../utils/permissions.js';

/**
 * Centralised effective-permission engine.
 *
 * Effective permissions of a user:
 *   permissions from active roles
 *   + direct grants (UserPermissionOverride effect='grant')
 *   − direct revocations (UserPermissionOverride effect='revoke')
 *   + permissions carried by currently valid delegations
 *
 * A legacy `users.role` value is still honoured as a baseline so existing
 * installs keep working; it is merged (not replaced) with custom roles.
 *
 * Everything here is read-only. Invalidating caches / recalculating navigation
 * is a concern of the caller, which is why the result is also exposed with a
 * human-readable breakdown for the "why can this user see this?" screen.
 */

export interface PermissionBreakdownEntry {
  permission: string;
  sources: string[];
  effect: 'granted' | 'revoked';
  scopeType?: string | null;
  scopeId?: string | null;
}

export interface EffectivePermissions {
  permissions: string[];
  /** true when the user holds the `*` wildcard (super admin) */
  isSuperuser: boolean;
  breakdown: PermissionBreakdownEntry[];
  computedAt: string;
}

function now(): Date {
  return new Date();
}

/** Overrides/delegations are only valid inside their [startAt, endAt] window. */
function isWindowActive(startAt: Date | null, endAt: Date | null, at: Date): boolean {
  if (startAt && at < new Date(startAt)) return false;
  if (endAt && at > new Date(endAt)) return false;
  return true;
}

async function activeUserRoleIds(
  userId: string,
  schoolId: string | undefined,
  at: Date
): Promise<string[]> {
  const where: Record<string | symbol, unknown> = {
    userId,
    status: 'active',
  };
  const userRoles = await UserRole.findAll({ where });
  return userRoles
    .filter((ur) => isWindowActive(ur.startAt, ur.endAt, at))
    .map((ur) => ur.roleId);
}

async function rolePermissionNames(roleIds: string[], schoolId?: string): Promise<string[]> {
  if (roleIds.length === 0) return [];
  const roleWhere: Record<string | symbol, unknown> = { id: { [Op.in]: roleIds } };
  if (schoolId) {
    roleWhere[Op.or] = [{ schoolId }, { schoolId: null }];
  }
  const roles = await Role.findAll({ where: roleWhere });
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
 * Compute the full effective permission set for a user, with an audit-friendly
 * breakdown of why each permission is present.
 */
export async function computeEffectivePermissions(
  user: Pick<User, 'id' | 'role' | 'schoolId'>,
  options: { transaction?: Transaction; at?: Date } = {}
): Promise<EffectivePermissions> {
  const at = options.at ?? now();
  const breakdown = new Map<string, PermissionBreakdownEntry>();

  const add = (
    permission: string,
    source: string,
    effect: 'granted' | 'revoked',
    scopeType?: string | null,
    scopeId?: string | null
  ) => {
    const existing = breakdown.get(permission);
    if (existing) {
      if (!existing.sources.includes(source)) existing.sources.push(source);
      // a direct revoke always wins over a grant
      if (effect === 'revoked') {
        existing.effect = 'revoked';
        existing.scopeType = scopeType ?? existing.scopeType;
        existing.scopeId = scopeId ?? existing.scopeId;
      }
      return;
    }
    breakdown.set(permission, { permission, sources: [source], effect, scopeType, scopeId });
  };

  // 1) baseline from the legacy role enum
  const legacy = LEGACY_ROLE_PERMISSIONS[user.role] || [];
  for (const p of legacy) add(p, `legacy_role:${user.role}`, 'granted');

  // 2) permissions from active custom roles
  const roleIds = await activeUserRoleIds(user.id, user.schoolId, at);
  if (roleIds.length > 0) {
    const fromRoles = await rolePermissionNames(roleIds, user.schoolId);
    for (const p of fromRoles) add(p, `role:${roleIds.join(',')}`, 'granted');
  }

  // 3) direct grants / revocations
  const overrides = await UserPermissionOverride.findAll({
    where: { userId: user.id, status: 'active' },
    ...(options.transaction ? { transaction: options.transaction } : {}),
  });
  for (const ov of overrides) {
    if (!isWindowActive(ov.startAt, ov.endAt, at)) continue;
    add(
      ov.permission,
      ov.effect === 'grant' ? 'direct_grant' : 'direct_revoke',
      ov.effect === 'grant' ? 'granted' : 'revoked',
      ov.scopeType,
      ov.scopeId
    );
  }

  // 4) delegations received and currently valid
  const delegations = await Delegation.findAll({
    where: { toUserId: user.id, status: 'active' },
    ...(options.transaction ? { transaction: options.transaction } : {}),
  });
  for (const d of delegations) {
    if (!isWindowActive(d.startAt, d.endAt, at)) continue;
    const perms = Array.isArray(d.permissions) ? d.permissions : [];
    for (const p of perms) add(p, `delegation_from:${d.fromUserId}`, 'granted', d.scopeType, d.scopeId);
  }

  const entries = [...breakdown.values()];
  const granted = entries.filter((e) => e.effect === 'granted').map((e) => e.permission);
  const revoked = new Set(entries.filter((e) => e.effect === 'revoked').map((e) => e.permission));

  // revoke always removes, even if another source granted the same permission
  const permissions = [...new Set(granted.filter((p) => !revoked.has(p)))];

  return {
    permissions,
    isSuperuser: permissions.includes('*'),
    breakdown: entries,
    computedAt: at.toISOString(),
  };
}

/** Lightweight boolean check without materialising the whole breakdown. */
export async function userHasPermission(
  user: Pick<User, 'id' | 'role' | 'schoolId'>,
  permission: string
): Promise<boolean> {
  const result = await computeEffectivePermissions(user);
  if (result.isSuperuser) return true;
  if (permission === '*') return false;
  if (result.permissions.includes(permission)) return true;
  // Coarse permission implies its granular children (users.create → users.create_teacher)
  for (const held of result.permissions) {
    if (PERMISSION_IMPLICATIONS[held]?.includes(permission)) return true;
  }
  return false;
}

/**
 * Revoke (soft-delete) all direct grants/overrides for a permission set on a
 * user, used when a role is removed and effective permissions must be
 * recalculated cleanly.
 */
export async function expireOverridesForUser(
  userId: string,
  schoolId: string,
  transaction?: Transaction
): Promise<number> {
  const [count] = await UserPermissionOverride.update(
    { status: 'expired' },
    {
      where: { userId, schoolId, status: 'active' },
      ...(transaction ? { transaction } : {}),
    }
  );
  return count;
}
