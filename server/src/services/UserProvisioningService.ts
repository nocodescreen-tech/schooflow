import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { Op } from 'sequelize';
import type { Transaction } from 'sequelize';
import sequelize from '../config/database.js';
import {
  User,
  Student,
  Parent,
  UserRole,
  Role,
  RefreshToken,
  PasswordResetToken,
  Delegation,
  UserPermissionOverride,
  Assignment,
} from '../models/index.js';
import { AppError } from '../middleware/errorHandler.js';

/**
 * UserProvisioningService owns the full account lifecycle:
 *   create → invite → first login → (reset) → suspend → disable → archive
 *
 * Hard rules enforced here:
 *  - passwords are never stored or returned in clear text
 *  - an admin can never read a user's current password
 *  - revoking / resetting invalidates every existing session
 *  - historical data (grades, attendance, assignments) is never deleted
 */

export type AccountStatus =
  | 'invited'
  | 'pending_activation'
  | 'active'
  | 'suspended'
  | 'disabled'
  | 'archived';

export interface CreateStaffAccountInput {
  schoolId: string;
  name: string;
  email: string;
  role: string;
  phone?: string | null;
  photo?: string | null;
  username?: string;
  roleIds?: string[];
  temporaryPassword?: string;
  mustChangePassword?: boolean;
  assignments?: Array<{
    classId?: string | null;
    subjectId?: string | null;
    sectionId?: string | null;
    levelId?: string | null;
    departmentId?: string | null;
    assignmentType?: string;
  }>;
  createdBy: string;
  tx?: Transaction;
}

export interface ProvisionResult {
  user: User;
  /** Plaintext temporary password. Returned ONCE, at creation time only. */
  temporaryPassword?: string;
}

/** Accounts in these states are refused at login. */
const LOGIN_BLOCKING_STATUSES: AccountStatus[] = ['suspended', 'disabled', 'archived'];

export function isLoginAllowed(user: User): { allowed: boolean; reason?: string } {
  if (!user.isActive) {
    return { allowed: false, reason: 'Ce compte a été désactivé' };
  }
  if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
    return { allowed: false, reason: 'Compte temporairement verrouillé' };
  }
  const status = (user.status || 'active') as AccountStatus;
  if (LOGIN_BLOCKING_STATUSES.includes(status)) {
    return { allowed: false, reason: `Compte ${status === 'suspended' ? 'suspendu' : status === 'archived' ? 'archivé' : 'désactivé'}` };
  }
  return { allowed: true };
}

/** Exported: password reset and account recovery need the same hashing. */
export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, 10);
}

/** Generates a readable but random temporary password. Never persisted in clear. */
export function generateTemporaryPassword(length = 12): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const symbols = '@#$%&*';
  const all = upper + lower + digits + symbols;
  const pick = (set: string) => set[crypto.randomInt(set.length)];
  const chars = [pick(upper), pick(lower), pick(digits), pick(symbols)];
  while (chars.length < length) chars.push(pick(all));
  // shuffle
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function generateSecureToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}

/** Ensures the account email is unique across the whole platform. */
export async function assertEmailAvailable(email: string, excludeUserId?: string): Promise<void> {
  const where: Record<string, unknown> = { email: email.toLowerCase() };
  if (excludeUserId) where.id = { [Op.ne]: excludeUserId };
  const existing = await User.findOne({ where });
  if (existing) {
    throw new AppError('Cette adresse email est déjà utilisée', 409);
  }
}

/** Ensures the identifiant is unique across the whole platform. */
export async function assertUsernameAvailable(username: string, excludeUserId?: string): Promise<void> {
  const where: Record<string, unknown> = { username: username.toLowerCase() };
  if (excludeUserId) where.id = { [Op.ne]: excludeUserId };
  const existing = await User.findOne({ where });
  if (existing) {
    throw new AppError('Cet identifiant est déjà utilisé', 409);
  }
}

/** Strips accents and punctuation so identifiers stay ASCII-safe. */
function slugifyPart(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '')
    .toLowerCase();
}

/**
 * Builds a readable identifiant from the person's name: "Jean Kabeya" →
 * "j.kabeya". Falls back to the email local part, then to a random suffix.
 */
export function suggestUsernameFromName(name: string, fallbackEmail?: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const initial = slugifyPart(parts[0]).charAt(0);
    const last = slugifyPart(parts[parts.length - 1]);
    if (initial && last) return `${initial}.${last}`;
  }
  const single = slugifyPart(parts[0] ?? '');
  if (single) return single;
  if (fallbackEmail) {
    const local = slugifyPart(fallbackEmail.split('@')[0] ?? '');
    if (local) return local;
  }
  return `u${crypto.randomInt(100000, 999999)}`;
}

/**
 * Returns a username guaranteed unique: the suggested one, suffixed with a
 * number when already taken (j.kabeya, j.kabeya2, j.kabeya3, ...).
 */
export async function generateUniqueUsername(name: string, fallbackEmail?: string): Promise<string> {
  const base = suggestUsernameFromName(name, fallbackEmail);
  if (!(await User.findOne({ where: { username: base } }))) return base;
  for (let i = 2; i < 100; i += 1) {
    const candidate = `${base}${i}`;
    if (!(await User.findOne({ where: { username: candidate } }))) return candidate;
  }
  return `${base}${crypto.randomInt(1000, 9999)}`;
}

/** Identifiant for a student: the matricule without separators, lowercase. */
export function usernameFromMatricule(matricule: string): string {
  return matricule.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
}

/**
 * Create a staff account. Returns the plaintext temporary password exactly
 * once so the administrator can hand it over; it is never stored.
 */
export async function createStaffAccount(input: CreateStaffAccountInput): Promise<ProvisionResult> {
  const run = async (tx: Transaction): Promise<ProvisionResult> => {
    await assertEmailAvailable(input.email);
    const temporaryPassword = input.temporaryPassword || generateTemporaryPassword();

    // Identifiant: admin-provided, or derived from the name, always unique.
    let username = (input.username || '').trim().toLowerCase();
    if (username) {
      await assertUsernameAvailable(username);
    } else {
      username = await generateUniqueUsername(input.name, input.email);
    }

    const user = await User.create(
      {
        schoolId: input.schoolId,
        email: input.email.toLowerCase(),
        passwordHash: hashPassword(temporaryPassword),
        name: input.name,
        role: input.role,
        username,
        phone: input.phone ?? null,
        photo: input.photo ?? null,
        isActive: true,
        status: 'active',
        mustChangePassword: input.mustChangePassword !== false,
        provisionedBy: input.createdBy,
        passwordChangedAt: null,
      },
      { transaction: tx }
    );

    // Attach custom roles
    if (input.roleIds?.length) {
      for (const roleId of input.roleIds) {
        const role = await Role.findOne({ where: { id: roleId, schoolId: input.schoolId } });
        if (!role) continue;
        await UserRole.create(
          { userId: user.id, roleId: role.id, schoolId: input.schoolId, status: 'active', assignedBy: input.createdBy },
          { transaction: tx }
        );
      }
    }

    // Create assignments
    for (const a of input.assignments ?? []) {
      await Assignment.create(
        {
          userId: user.id,
          schoolId: input.schoolId,
          assignmentType: a.assignmentType ?? 'class_assignment',
          classId: a.classId ?? null,
          subjectId: a.subjectId ?? null,
          sectionId: a.sectionId ?? null,
          levelId: a.levelId ?? null,
          departmentId: a.departmentId ?? null,
          status: 'active',
          assignedBy: input.createdBy,
        },
        { transaction: tx }
      );
    }

    return { user, temporaryPassword };
  };

  return sequelize.transaction(run);
}

/**
 * Create a student account linked to the student record.
 */
export async function createStudentAccount(
  studentId: string,
  createdBy: string,
  options: { temporaryPassword?: string; email?: string } = {}
): Promise<ProvisionResult> {
  const student = await Student.findOne({ where: { id: studentId } });
  if (!student) throw new AppError('Élève introuvable', 404);
  if (student.userId) throw new AppError('Cet élève possède déjà un compte', 409);

  const email = (options.email || student.email || '').toLowerCase();
  if (!email) throw new AppError('Aucun email disponible pour cet élève', 400);

  return sequelize.transaction(async (tx) => {
    await assertEmailAvailable(email);
    const temporaryPassword = options.temporaryPassword || generateTemporaryPassword();
    // Identifiant: the matricule without separators (SCF-2026-001245 → scf2026001245),
    // kept unique with a numeric suffix in the rare collision case.
    let username = usernameFromMatricule(student.studentId || '');
    if (username && (await User.findOne({ where: { username } }))) {
      username = `${username}${crypto.randomInt(10, 99)}`;
    }
    const user = await User.create(
      {
        schoolId: student.schoolId,
        email,
        passwordHash: hashPassword(temporaryPassword),
        name: `${student.firstName} ${student.lastName}`.trim(),
        role: 'student',
        username: username || null,
        isActive: true,
        status: 'active',
        mustChangePassword: true,
        provisionedBy: createdBy,
      },
      { transaction: tx }
    );
    await student.update({ userId: user.id }, { transaction: tx });
    return { user, temporaryPassword };
  });
}

/**
 * Create a parent account linked to the parent record.
 */
export async function createParentAccount(
  parentId: string,
  createdBy: string,
  options: { temporaryPassword?: string; email?: string } = {}
): Promise<ProvisionResult> {
  const parent = await Parent.findOne({ where: { id: parentId } });
  if (!parent) throw new AppError('Parent introuvable', 404);
  if (parent.userId) throw new AppError('Ce parent possède déjà un compte', 409);

  const email = (options.email || parent.email || '').toLowerCase();
  if (!email) throw new AppError('Aucun email disponible pour ce parent', 400);

  return sequelize.transaction(async (tx) => {
    await assertEmailAvailable(email);
    const temporaryPassword = options.temporaryPassword || generateTemporaryPassword();
    const username = await generateUniqueUsername(`${parent.firstName} ${parent.lastName}`.trim() || parent.email, email);
    const user = await User.create(
      {
        schoolId: parent.schoolId,
        email,
        passwordHash: hashPassword(temporaryPassword),
        name: `${parent.firstName} ${parent.lastName}`.trim(),
        role: 'parent',
        username,
        isActive: true,
        status: 'active',
        mustChangePassword: true,
        provisionedBy: createdBy,
      },
      { transaction: tx }
    );
    await parent.update({ userId: user.id }, { transaction: tx });
    return { user, temporaryPassword };
  });
}

/** Invalidate every existing session for a user. */
export async function revokeAllSessions(userId: string, tx?: Transaction): Promise<number> {
  const [count] = await RefreshToken.update(
    { revoked: true },
    { where: { userId, revoked: false }, ...(tx ? { transaction: tx } : {}) }
  );
  // Bump tokenVersion so already-issued JWTs stop validating immediately.
  await User.increment('tokenVersion', {
    where: { id: userId },
    ...(tx ? { transaction: tx } : {}),
  });
  return count;
}

/**
 * Reset a password. Old sessions die, the new password is temporary, and the
 * user MUST change it at next login.
 */
export async function resetAccountPassword(
  userId: string,
  adminId: string,
  options: { revokeSessions?: boolean; newPassword?: string } = {}
): Promise<{ temporaryPassword: string }> {
  const user = await User.findByPk(userId);
  if (!user) throw new AppError('Utilisateur introuvable', 404);

  const temporaryPassword = options.newPassword || generateTemporaryPassword();
  await user.update({
    passwordHash: hashPassword(temporaryPassword),
    mustChangePassword: true,
    passwordChangedAt: new Date(),
    failedLoginAttempts: 0,
    lockedUntil: null,
  });
  if (options.revokeSessions !== false) {
    await revokeAllSessions(userId);
  }
  void adminId; // auditing is performed by the route layer
  return { temporaryPassword };
}

/** Issue a single-use, expiring reset token (the "send me a link" flow). */
export async function issuePasswordResetToken(
  userId: string,
  schoolId: string | null,
  createdBy: string | null,
  purpose: 'reset_password' | 'force_change' = 'reset_password',
  ttlHours = 24
): Promise<string> {
  // Invalidate any previous token of the same purpose: only one is ever valid.
  await PasswordResetToken.update(
    { usedAt: new Date() },
    { where: { userId, purpose, usedAt: null } }
  );
  const raw = generateSecureToken();
  await PasswordResetToken.create({
    schoolId,
    userId,
    tokenHash: hashToken(raw),
    purpose,
    expiresAt: new Date(Date.now() + ttlHours * 3600 * 1000),
    createdBy,
  });
  return raw;
}

/** Consume a reset token exactly once. */
export async function consumePasswordResetToken(raw: string, newPassword: string): Promise<User> {
  const token = await PasswordResetToken.findOne({ where: { tokenHash: hashToken(raw) } });
  if (!token) throw new AppError('Jeton invalide', 400);
  if (token.usedAt) throw new AppError('Ce lien a déjà été utilisé', 400);
  if (new Date(token.expiresAt) < new Date()) throw new AppError('Ce lien a expiré', 400);

  const user = await User.findByPk(token.userId);
  if (!user) throw new AppError('Utilisateur introuvable', 404);

  await sequelize.transaction(async (tx) => {
    await token.update({ usedAt: new Date() }, { transaction: tx });
    await user.update(
      {
        passwordHash: hashPassword(newPassword),
        mustChangePassword: false,
        passwordChangedAt: new Date(),
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
      { transaction: tx }
    );
    await revokeAllSessions(user.id, tx);
  });
  return user;
}

/** Change one's own password (authenticated). Clears the mustChange flag. */
export async function changeOwnPassword(
  userId: string,
  currentPassword: string,
  newPassword: string
): Promise<void> {
  const user = await User.findByPk(userId);
  if (!user) throw new AppError('Utilisateur introuvable', 404);
  const matches = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!matches) throw new AppError('Mot de passe actuel incorrect', 400);
  await user.update({
    passwordHash: hashPassword(newPassword),
    mustChangePassword: false,
    passwordChangedAt: new Date(),
  });
  // A password change invalidates other sessions by design.
  await revokeAllSessions(userId);
}

export type LifecycleAction = 'suspend' | 'disable' | 'activate' | 'archive' | 'reactivate';

/**
 * Change an account status. Data is never deleted: suspending or disabling
 * only blocks login and revokes sessions, keeping every historical record.
 */
export async function changeAccountStatus(
  userId: string,
  action: LifecycleAction,
  actorId: string,
  reason?: string
): Promise<User> {
  const user = await User.findByPk(userId);
  if (!user) throw new AppError('Utilisateur introuvable', 404);
  if (user.id === actorId && (action === 'suspend' || action === 'disable' || action === 'archive')) {
    throw new AppError('Vous ne pouvez pas désactiver votre propre compte', 400);
  }

  switch (action) {
    case 'suspend':
      await user.update({ status: 'suspended', isActive: false, disabledAt: new Date(), disabledReason: reason ?? null });
      await revokeAllSessions(userId);
      break;
    case 'disable':
      await user.update({ status: 'disabled', isActive: false, disabledAt: new Date(), disabledReason: reason ?? null });
      await revokeAllSessions(userId);
      break;
    case 'archive':
      await user.update({ status: 'archived', isActive: false, disabledAt: new Date(), disabledReason: reason ?? null });
      await revokeAllSessions(userId);
      break;
    case 'activate':
    case 'reactivate':
      await user.update({ status: 'active', isActive: true, disabledAt: null, disabledReason: null, failedLoginAttempts: 0, lockedUntil: null });
      break;
  }
  return user;
}

/** Record a failed login and lock the account after repeated failures. */
export async function registerFailedLogin(userId: string, maxAttempts = 5, lockMinutes = 15): Promise<void> {
  const user = await User.findByPk(userId);
  if (!user) return;
  const attempts = (user.failedLoginAttempts ?? 0) + 1;
  const patch: Partial<User> = { failedLoginAttempts: attempts };
  if (attempts >= maxAttempts) {
    patch.lockedUntil = new Date(Date.now() + lockMinutes * 60 * 1000);
    patch.failedLoginAttempts = 0;
  }
  await user.update(patch);
}

export async function clearFailedLogins(userId: string): Promise<void> {
  await User.update(
    { failedLoginAttempts: 0, lockedUntil: null },
    { where: { id: userId } }
  );
}

/**
 * Revoke a user's roles. Any direct permission overrides are expired so the
 * effective permission set is recalculated from the remaining roles.
 */
export async function revokeUserRoles(userId: string, schoolId: string, tx?: Transaction): Promise<number> {
  const [count] = await UserRole.update(
    { status: 'inactive' },
    { where: { userId, schoolId, status: 'active' }, ...(tx ? { transaction: tx } : {}) }
  );
  await UserPermissionOverride.update(
    { status: 'expired' },
    { where: { userId, schoolId, status: 'active' }, ...(tx ? { transaction: tx } : {}) }
  );
  return count;
}

/** Expire delegations that have passed their end date. Safe to call on read. */
export async function expireStaleDelegations(schoolId: string): Promise<number> {
  const [count] = await Delegation.update(
    { status: 'expired' },
    { where: { schoolId, status: 'active', endAt: { [Op.lt]: new Date() } } }
  );
  return count;
}
