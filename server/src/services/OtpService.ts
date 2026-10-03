import crypto from 'crypto';
import { Op } from 'sequelize';
import { OtpChallenge, User, School, OTP_PURPOSES, type OtpPurpose, type OtpStatus } from '../models/index.js';
import { AppError } from '../middleware/errorHandler.js';
import { logAudit } from '../middleware/auditLog.js';
import { sendEmail } from './EmailService.js';
import { otpEmail } from '../templates/emails/otp.js';

export { OTP_PURPOSES };
export type { OtpPurpose, OtpStatus };

/**
 * OtpService — the ONE centralized verification service (§1, §39).
 *
 * Every workflow that needs identity verification — registration, activation,
 * password reset, email change, step-up auth, invitation acceptance — calls
 * this service. No page implements OTP logic of its own.
 *
 * Security rules enforced here, never by the caller (§38):
 *  - codes are generated with a CSPRNG, never `Math.random()` (§3);
 *  - only a SHA-256 hash is stored, never the raw code (§4);
 *  - every purpose has its own expiration, none indefinite (§5);
 *  - a code is single-use: success burns it immediately (§6);
 *  - a wrong guess increments `attempts`; the limit locks the challenge (§7);
 *  - resend has a per-challenge cooldown and a rolling rate limit (§8, §9);
 *  - every event is audited, and the raw code is never logged (§29);
 *  - `schoolId` is carried on the challenge so a code cannot be replayed
 *    against another establishment (§38).
 */

export interface OtpPolicy {
  /** Minutes the code stays valid. */
  ttlMinutes: number;
  /** Wrong guesses allowed before the challenge locks. */
  maxAttempts: number;
  /** Seconds the user must wait before a resend. */
  resendCooldownSeconds: number;
  /** Resends allowed inside the rate-limit window. */
  maxResends: number;
  /** Window for the resend rate limit, in minutes. */
  resendWindowMinutes: number;
  /** Codes that may be issued per user+purpose inside the rate window. */
  maxPerHour: number;
}

/**
 * Per-purpose defaults (§5). A step-up check is short because the user is
 * already authenticated and waiting; an activation can be longer because the
 * person may need to find the email.
 */
const DEFAULT_POLICIES_ENTRIES: [OtpPurpose, OtpPolicy][] = [
  ['EMAIL_VERIFICATION',   { ttlMinutes: 10, maxAttempts: 5, resendCooldownSeconds: 60, maxResends: 5, resendWindowMinutes: 15, maxPerHour: 3 }],
  ['ACCOUNT_ACTIVATION',  { ttlMinutes: 15, maxAttempts: 5, resendCooldownSeconds: 60, maxResends: 5, resendWindowMinutes: 15, maxPerHour: 3 }],
  ['PASSWORD_RESET',      { ttlMinutes: 10, maxAttempts: 5, resendCooldownSeconds: 60, maxResends: 5, resendWindowMinutes: 15, maxPerHour: 3 }],
  ['EMAIL_CHANGE',        { ttlMinutes: 10, maxAttempts: 5, resendCooldownSeconds: 60, maxResends: 5, resendWindowMinutes: 15, maxPerHour: 3 }],
  ['ACCOUNT_RECOVERY',    { ttlMinutes: 10, maxAttempts: 5, resendCooldownSeconds: 60, maxResends: 5, resendWindowMinutes: 15, maxPerHour: 3 }],
  ['STEP_UP_AUTH',        { ttlMinutes: 5,  maxAttempts: 3, resendCooldownSeconds: 60, maxResends: 3, resendWindowMinutes: 15, maxPerHour: 3 }],
  ['INVITATION_ACCEPTANCE', { ttlMinutes: 15, maxAttempts: 5, resendCooldownSeconds: 60, maxResends: 5, resendWindowMinutes: 15, maxPerHour: 3 }],
  ['SECURITY_CONFIRMATION', { ttlMinutes: 5, maxAttempts: 3, resendCooldownSeconds: 60, maxResends: 3, resendWindowMinutes: 15, maxPerHour: 3 }],
  ['LOGIN',               { ttlMinutes: 10, maxAttempts: 3, resendCooldownSeconds: 60, maxResends: 3, resendWindowMinutes: 15, maxPerHour: 3 }],
];

export const DEFAULT_POLICIES: Record<OtpPurpose, OtpPolicy> = Object.fromEntries(DEFAULT_POLICIES_ENTRIES) as Record<OtpPurpose, OtpPolicy>;

/** Human-readable purpose, used in emails and audit records. */
export const PURPOSE_LABEL: Record<OtpPurpose, string> = {
  EMAIL_VERIFICATION: "Vérification de l'adresse e-mail",
  ACCOUNT_ACTIVATION: "Activation de compte",
  PASSWORD_RESET: "Réinitialisation du mot de passe",
  EMAIL_CHANGE: "Changement d'adresse e-mail",
  ACCOUNT_RECOVERY: "Récupération de compte",
  STEP_UP_AUTH: "Vérification de sécurité",
  INVITATION_ACCEPTANCE: "Acceptation d'invitation",
  SECURITY_CONFIRMATION: "Confirmation de sécurité",
  LOGIN: "Connexion",
};

/** Cryptographically uniform 6-digit code. `randomInt` has no modulo bias. */
export function generateCode(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}

/** SHA-256 of the code. The raw value is never stored or logged. */
export function hashCode(code: string): string {
  return crypto.createHash('sha256').update(code, 'utf8').digest('hex');
}

/** Constant-time comparison so a wrong guess cannot be timed. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(String(a), 'utf8');
  const bufB = Buffer.from(String(b), 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export interface IssueOptions {
  userId?: string | null;
  schoolId?: string | null;
  email: string;
  purpose: OtpPurpose;
  /** Overrides the per-purpose defaults (§5: configurable per workflow). */
  policy?: Partial<OtpPolicy>;
  /** Arbitrary non-secret context for the audit trail. */
  metadata?: Record<string, unknown>;
}

export interface IssueResult {
  challengeId: string;
  expiresAt: Date;
  ttlMinutes: number;
  resendCooldownSeconds: number;
  /** False when the email could not be delivered. The challenge is still
   *  recorded, so the caller can offer a resend instead of a false success. */
  delivered: boolean;
  /**
   * The raw code, ONLY when the dev provider is active and
   * `EMAIL_DEV_EXPOSE_CODE=true`. Never set by a real provider (§33).
   */
  devCode?: string;
}

/**
 * Issues a code and emails it.
 *
 * Rate limiting is applied before anything is generated, and previous pending
 * challenges for the same user+purpose are cancelled so a user never has two
 * live codes for the same job.
 */
export async function issueOtp(
  req: { ip?: string; userAgent?: string },
  options: IssueOptions
): Promise<IssueResult> {
  const policy: OtpPolicy = { ...DEFAULT_POLICIES[options.purpose], ...options.policy };
  const email = options.email.toLowerCase().trim();

  // Per-user+purpose flood protection (§27). When there is no account yet
  // (registration, email verification before signup), the email is the only
  // stable identifier, so the limit keys on it instead — otherwise every
  // anonymous request would share one bucket and a single user could lock out
  // the whole endpoint.
  const windowStart = new Date(Date.now() - policy.maxPerHour * 60 * 60 * 1000);
  const recent = await OtpChallenge.count({
    where: options.userId
      ? { userId: options.userId, purpose: options.purpose, createdAt: { [Op.gte]: windowStart } }
      : { email, purpose: options.purpose, createdAt: { [Op.gte]: windowStart } },
  });
  if (recent >= policy.maxPerHour) {
    throw new AppError('Trop de demandes. Réessayez plus tard.', 429);
  }

  // One live challenge per user+purpose: cancel the previous one.
  await OtpChallenge.update(
    { status: 'CANCELLED' },
    { where: { userId: options.userId ?? null, purpose: options.purpose, status: 'PENDING' } }
  );

  const code = generateCode();
  const expiresAt = new Date(Date.now() + policy.ttlMinutes * 60 * 1000);

  const challenge = await OtpChallenge.create({
    userId: options.userId ?? null,
    schoolId: options.schoolId ?? null,
    email,
    purpose: options.purpose,
    codeHash: hashCode(code),
    status: 'PENDING',
    expiresAt,
    maxAttempts: policy.maxAttempts,
    lastSentAt: new Date(),
    metadata: options.metadata ?? {},
  });

  const branding = await schoolBranding(options.schoolId);
  const emailResult = await sendEmail({
    to: email,
    subject: `Votre code de vérification — ${branding.name}`,
    html: otpEmail({
      code,
      school: branding,
      purpose: options.purpose,
      expiresInMinutes: policy.ttlMinutes,
    }),
  });

  await audit(req, {
    action: emailResult.success ? 'OTP_SENT' : 'OTP_SEND_FAILED',
    entity: 'otp_challenge',
    entityId: challenge.id,
    details: { purpose: options.purpose, email, delivered: emailResult.success },
  });

  return {
    challengeId: challenge.id,
    expiresAt,
    ttlMinutes: policy.ttlMinutes,
    resendCooldownSeconds: policy.resendCooldownSeconds,
    delivered: emailResult.success,
    ...(emailResult.devCode ? { devCode: emailResult.devCode } : {}),
  };
}

export interface VerifyResult {
  ok: boolean;
  reason?: 'NOT_FOUND' | 'EXPIRED' | 'LOCKED' | 'CONSUMED' | 'WRONG';
  attemptsLeft?: number;
  challenge?: OtpChallenge;
}

/**
 * Validates a code against the newest live challenge for that user+purpose.
 *
 * Deliberately does not reveal which email exists: an unknown email and an
 * unknown user both return NOT_FOUND (§28).
 */
export async function verifyOtp(
  req: { ip?: string; userAgent?: string },
  options: { userId?: string | null; schoolId?: string | null; email: string; purpose: OtpPurpose; code: string }
): Promise<VerifyResult> {
  const email = options.email.toLowerCase().trim();
  const challenge = await OtpChallenge.findOne({
    where: {
      userId: options.userId ?? null,
      purpose: options.purpose,
      email,
      status: 'PENDING',
    },
    order: [['createdAt', 'DESC']],
  });

  if (!challenge) {
    await audit(req, { action: 'OTP_FAILED', entity: 'otp_challenge', details: { purpose: options.purpose, email, reason: 'not_found' } });
    return { ok: false, reason: 'NOT_FOUND' };
  }

  // School isolation: a code issued by one school is worthless at another.
  if (options.schoolId && challenge.schoolId && challenge.schoolId !== options.schoolId) {
    await audit(req, { action: 'OTP_FAILED', entity: 'otp_challenge', entityId: challenge.id, details: { purpose: options.purpose, reason: 'school_mismatch' } });
    return { ok: false, reason: 'NOT_FOUND' };
  }

  if (new Date() > new Date(challenge.expiresAt)) {
    await challenge.update({ status: 'EXPIRED' });
    await audit(req, { action: 'OTP_EXPIRED', entity: 'otp_challenge', entityId: challenge.id, details: { purpose: options.purpose } });
    return { ok: false, reason: 'EXPIRED' };
  }

  if (challenge.attempts >= challenge.maxAttempts) {
    await challenge.update({ status: 'LOCKED' });
    await audit(req, { action: 'OTP_LOCKED', entity: 'otp_challenge', entityId: challenge.id, details: { purpose: options.purpose } });
    return { ok: false, reason: 'LOCKED' };
  }

  if (!safeEqual(challenge.codeHash, hashCode(options.code))) {
    const attempts = challenge.attempts + 1;
    const locked = attempts >= challenge.maxAttempts;
    await challenge.update({ attempts, status: locked ? 'LOCKED' : 'PENDING' });
    await audit(req, {
      action: locked ? 'OTP_LOCKED' : 'OTP_FAILED',
      entity: 'otp_challenge',
      entityId: challenge.id,
      details: { purpose: options.purpose, attempts, maxAttempts: challenge.maxAttempts },
    });
    return { ok: false, reason: locked ? 'LOCKED' : 'WRONG', attemptsLeft: challenge.maxAttempts - attempts };
  }

  // Correct: burn it immediately so it can never be replayed (§6).
  await challenge.update({ status: 'CONSUMED', verifiedAt: new Date(), consumedAt: new Date() });
  await audit(req, { action: 'OTP_VERIFIED', entity: 'otp_challenge', entityId: challenge.id, details: { purpose: options.purpose } });
  return { ok: true, challenge };
}

export interface ResendResult extends IssueResult {
  /** False when the cooldown has not elapsed; `retryAfterSeconds` says how long. */
  cooldownOk: boolean;
  retryAfterSeconds?: number;
}

/**
 * Resends a code, enforcing both the per-challenge cooldown (§8) and the rolling
 * resend rate limit (§9).
 */
export async function resendOtp(
  req: { ip?: string; userAgent?: string },
  options: IssueOptions
): Promise<ResendResult> {
  const policy: OtpPolicy = { ...DEFAULT_POLICIES[options.purpose], ...options.policy };
  const email = options.email.toLowerCase().trim();

  const challenge = await OtpChallenge.findOne({
    where: { userId: options.userId ?? null, purpose: options.purpose, email },
    order: [['createdAt', 'DESC']],
  });

  if (challenge) {
    // Cooldown: how long since the last send?
    if (challenge.lastSentAt) {
      const elapsed = (Date.now() - new Date(challenge.lastSentAt).getTime()) / 1000;
      if (elapsed < policy.resendCooldownSeconds) {
        return {
          challengeId: challenge.id,
          expiresAt: challenge.expiresAt,
          ttlMinutes: policy.ttlMinutes,
          resendCooldownSeconds: policy.resendCooldownSeconds,
          cooldownOk: false,
          retryAfterSeconds: Math.ceil(policy.resendCooldownSeconds - elapsed),
          delivered: false,
        };
      }
    }

    // Rolling resend rate limit.
    if (challenge.resendCount >= policy.maxResends) {
      const windowStart = new Date(Date.now() - policy.resendWindowMinutes * 60 * 1000);
      if (new Date(challenge.createdAt) > windowStart) {
        throw new AppError('Trop de renvois. Réessayez plus tard.', 429);
      }
    }
  }

  const result = await issueOtp(req, options);
  if (challenge) {
    await challenge.update({ status: 'CANCELLED' });
  }
  await audit(req, { action: 'OTP_RESENT', entity: 'otp_challenge', entityId: result.challengeId, details: { purpose: options.purpose, email } });
  return { ...result, cooldownOk: true };
}

/**
 * Issues the short-lived reset authorization described in §19.
 *
 * A successful PASSWORD_RESET OTP is not itself permission to change the
 * password: it mints a single-use, expiring token that the reset endpoint
 * accepts. That bounds what a stolen code can do.
 */
export async function mintPasswordResetToken(
  challengeId: string,
  ttlMinutes = 10
): Promise<{ token: string; expiresAt: Date }> {
  const challenge = await OtpChallenge.findByPk(challengeId);
  if (!challenge || challenge.status !== 'CONSUMED' || challenge.purpose !== 'PASSWORD_RESET') {
    throw new AppError('Aucune vérification valide pour cette réinitialisation', 400);
  }
  const token = crypto.randomBytes(24).toString('hex');
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);
  await challenge.update({ resetTokenHash: hashCode(token), expiresAt });
  return { token, expiresAt };
}

/** Consumes a reset token. Single use, then it is dead. */
export async function consumePasswordResetToken(token: string): Promise<OtpChallenge> {
  const challenge = await OtpChallenge.findOne({
    where: { purpose: 'PASSWORD_RESET', status: 'CONSUMED' },
    order: [['createdAt', 'DESC']],
  });
  if (!challenge?.resetTokenHash || !safeEqual(challenge.resetTokenHash, hashCode(token))) {
    throw new AppError('Lien de réinitialisation invalide ou expiré', 400);
  }
  if (new Date() > new Date(challenge.expiresAt)) {
    throw new AppError('Lien de réinitialisation expiré', 410);
  }
  await challenge.update({ resetTokenHash: null });
  return challenge;
}

/** Cancels every live challenge for a user+purpose (e.g. user gave up). */
export async function cancelOtp(userId: string, purpose: OtpPurpose): Promise<number> {
  const [count] = await OtpChallenge.update(
    { status: 'CANCELLED' },
    { where: { userId, purpose, status: 'PENDING' } }
  );
  return count;
}

/** School branding for transactional email (§12). Never another school's. */
async function schoolBranding(schoolId?: string | null) {
  const school = schoolId ? await School.findByPk(schoolId) : null;
  return {
    name: school?.name || 'SchoolFlow',
    logo: school?.logo || undefined,
    address: school?.address || undefined,
    phone: school?.phone || undefined,
    primaryColor: (school?.settings as Record<string, unknown> | null)?.primaryColor as string | undefined,
  };
}

/** Audit helper. The raw code is never included — only the purpose and result. */
async function audit(
  req: { ip?: string; userAgent?: string },
  entry: { action: string; entity: string; entityId?: string; details?: Record<string, unknown> }
): Promise<void> {
  try {
    const { AuditLog } = await import('../models/index.js');
    await AuditLog.create({
      schoolId: (entry.details?.schoolId as string) ?? null,
      userId: (entry.details?.userId as string) ?? null,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId ?? null,
      details: { ...entry.details, ip: req.ip ?? null, userAgent: req.userAgent ?? null },
    });
  } catch {
    // Auditing must never break the request.
  }
}

export { User };