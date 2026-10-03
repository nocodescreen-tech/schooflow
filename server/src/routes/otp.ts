import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { Op } from 'sequelize';
import { OtpChallenge, User } from '../models/index.js';
import { authenticateToken } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';
import { logAudit } from '../middleware/auditLog.js';
import {
  issueOtp,
  verifyOtp,
  resendOtp,
  cancelOtp,
  mintPasswordResetToken,
  consumePasswordResetToken,
  OTP_PURPOSES,
  type OtpPurpose,
} from '../services/OtpService.js';
import { isEmailConfigured } from '../services/EmailService.js';

/**
 * OTP API — every verification workflow goes through `OtpService` (§39).
 *
 * The routes here are thin: they authenticate, validate input, and delegate.
 * No OTP logic (generation, hashing, attempt counting, cooldown) lives in a
 * route or a page.
 *
 * `schoolId` always comes from the authenticated account, never from the
 * request body, so a code can never be issued for or replayed against another
 * establishment (§38).
 */
const router = Router();

const PURPOSE_VALUES: string[] = [...OTP_PURPOSES];

function fail(error: unknown): { status: number; body: { success: false; error: string } } {
  return {
    status: error instanceof AppError ? error.statusCode : 500,
    body: { success: false, error: (error as Error).message },
  };
}

function assertValid(req: Request): void {
  const errors = validationResult(req);
  if (errors.isEmpty()) return;
  throw new AppError(String(errors.array()[0].msg), 400);
}

/** Neutral message that never reveals whether an email exists (§28). */
const NEUTRAL_SENT = 'Si un compte correspond à cette adresse, un code a été envoyé.';

// ─── Issue ─────────────────────────────────────────────────────────────────

/**
 * POST /otp/send — request a code.
 *
 * Always answers the same way whether or not the email exists, so the endpoint
 * cannot be used to enumerate accounts.
 */
router.post(
  '/send',
  body('email').isEmail().withMessage('Adresse e-mail invalide').normalizeEmail(),
  body('purpose').isIn(PURPOSE_VALUES).withMessage('Type de vérification invalide'),
  async (req: Request, res: Response) => {
    try {
      assertValid(req);
      const { email, purpose } = req.body as { email: string; purpose: OtpPurpose };

      // Link to an account when one exists, but do not require it: a
      // registration flow verifies an email before the account is created.
      const user = await User.findOne({ where: { email } });

      const result = await issueOtp(
        { ip: req.ip, userAgent: req.get('user-agent') },
        {
          userId: user?.id ?? null,
          schoolId: user?.schoolId ?? null,
          email,
          purpose,
        }
      );

      // Same response either way (§28). `delivered` is exposed so the UI can
      // offer a resend when the provider failed, without revealing anything.
      // `devCode` is only ever present in development (§33).
      return res.status(201).json({
        success: true,
        data: {
          message: NEUTRAL_SENT,
          expiresInMinutes: result.ttlMinutes,
          resendCooldownSeconds: result.resendCooldownSeconds,
          delivered: result.delivered,
          ...(result.devCode ? { devCode: result.devCode } : {}),
        },
      });
    } catch (error) {
      const { status, body } = fail(error);
      return res.status(status).json(body);
    }
  }
);

// ─── Verify ─────────────────────────────────────────────────────────────────

/**
 * POST /otp/verify — validate a code.
 *
 * On success the challenge is consumed. For PASSWORD_RESET the caller receives
 * a single-use reset token (§19) rather than being told "verified" and left to
 * ask what to do next.
 */
router.post(
  '/verify',
  body('email').isEmail().withMessage('Adresse e-mail invalide').normalizeEmail(),
  body('code').isLength({ min: 6, max: 6 }).isNumeric().withMessage('Le code comporte 6 chiffres'),
  body('purpose').isIn(PURPOSE_VALUES).withMessage('Type de vérification invalide'),
  async (req: Request, res: Response) => {
    try {
      assertValid(req);
      const { email, code, purpose } = req.body as { email: string; code: string; purpose: OtpPurpose };
      const user = await User.findOne({ where: { email } });

      const result = await verifyOtp(
        { ip: req.ip, userAgent: req.get('user-agent') },
        { userId: user?.id ?? null, schoolId: user?.schoolId ?? null, email, purpose, code }
      );

      if (!result.ok) {
        // Human-readable, never technical (§30).
        const messages: Record<string, string> = {
          NOT_FOUND: 'Aucun code actif. Demandez-en un nouveau.',
          EXPIRED: 'Le code a expiré.',
          LOCKED: 'Vous avez dépassé le nombre de tentatives.',
          CONSUMED: 'Ce code a déjà été utilisé.',
          WRONG: 'Le code est incorrect.',
        };
        const status = result.reason === 'LOCKED' ? 429 : result.reason === 'EXPIRED' ? 410 : 400;
        return res.status(status).json({
          success: false,
          error: messages[result.reason ?? 'WRONG'],
          ...(result.attemptsLeft !== undefined ? { attemptsLeft: result.attemptsLeft } : {}),
        });
      }

      // Password reset: mint the short-lived authorization (§19).
      if (purpose === 'PASSWORD_RESET' && result.challenge) {
        const reset = await mintPasswordResetToken(result.challenge.id);
        return res.json({
          success: true,
          data: {
            message: 'Code vérifié',
            resetToken: reset.token,
            expiresAt: reset.expiresAt,
          },
        });
      }

      return res.json({ success: true, data: { message: 'Code vérifié' } });
    } catch (error) {
      const { status, body } = fail(error);
      return res.status(status).json(body);
    }
  }
);

// ─── Resend ──────────────────────────────────────────────────────────────────

/**
 * POST /otp/resend — request a new code, with cooldown and rate limit enforced
 * by the service (§8, §9).
 */
router.post(
  '/resend',
  body('email').isEmail().withMessage('Adresse e-mail invalide').normalizeEmail(),
  body('purpose').isIn(PURPOSE_VALUES).withMessage('Type de vérification invalide'),
  async (req: Request, res: Response) => {
    try {
      assertValid(req);
      const { email, purpose } = req.body as { email: string; purpose: OtpPurpose };
      const user = await User.findOne({ where: { email } });

      const result = await resendOtp(
        { ip: req.ip, userAgent: req.get('user-agent') },
        { userId: user?.id ?? null, schoolId: user?.schoolId ?? null, email, purpose }
      );

      if (!result.cooldownOk) {
        return res.status(429).json({
          success: false,
          error: `Vous pouvez demander un nouveau code dans ${result.retryAfterSeconds} secondes.`,
          retryAfterSeconds: result.retryAfterSeconds,
        });
      }

      return res.status(201).json({
        success: true,
        data: {
          message: NEUTRAL_SENT,
          expiresInMinutes: result.ttlMinutes,
          resendCooldownSeconds: result.resendCooldownSeconds,
          delivered: result.delivered,
        },
      });
    } catch (error) {
      const { status, body } = fail(error);
      return res.status(status).json(body);
    }
  }
);

// ─── Cancel ──────────────────────────────────────────────────────────────────

/** POST /otp/cancel — give up on a challenge so it stops being live. */
router.post(
  '/cancel',
  authenticateToken,
  body('purpose').isIn(PURPOSE_VALUES).withMessage('Type de vérification invalide'),
  async (req: Request, res: Response) => {
    try {
      assertValid(req);
      const purpose = req.body.purpose as OtpPurpose;
      const count = await cancelOtp(req.user!.id, purpose);
      return res.json({ success: true, data: { cancelled: count } });
    } catch (error) {
      const { status, body } = fail(error);
      return res.status(status).json(body);
    }
  }
);

// ─── Password reset (§19) ────────────────────────────────────────────────────

/**
 * POST /otp/password-reset — consume a reset token and set a new password.
 *
 * The token is single-use and short-lived; consuming it clears it immediately.
 */
router.post(
  '/password-reset',
  body('token').isString().withMessage('Lien de réinitialisation requis'),
  body('newPassword').isLength({ min: 6 }).withMessage('Le mot de passe doit contenir au moins 6 caractères'),
  async (req: Request, res: Response) => {
    try {
      assertValid(req);
      const { token, newPassword } = req.body as { token: string; newPassword: string };

      const challenge = await consumePasswordResetToken(token);
      const user = challenge.userId ? await User.findByPk(challenge.userId) : null;
      if (!user) throw new AppError('Compte introuvable', 404);

      const { hashPassword } = await import('../services/UserProvisioningService.js');
      await user.update({
        passwordHash: await hashPassword(newPassword),
        mustChangePassword: false,
      });

      await logAudit(req, {
        action: 'PASSWORD_RESET_COMPLETED',
        entity: 'user',
        entityId: user.id,
        details: { purpose: 'PASSWORD_RESET' },
      });

      return res.json({ success: true, data: { message: 'Mot de passe réinitialisé' } });
    } catch (error) {
      const { status, body } = fail(error);
      return res.status(status).json(body);
    }
  }
);

// ─── Admin: configuration state (§34) ─────────────────────────────────────────

/** GET /otp/config — which provider is active and whether delivery is real. */
router.get('/config', authenticateToken, async (_req: Request, res: Response) => {
  try {
    return res.json({
      success: true,
      data: {
        provider: isEmailConfigured() ? 'smtp' : 'dev',
        deliveryPossible: isEmailConfigured(),
        purposes: OTP_PURPOSES,
      },
    });
  } catch (error) {
    const { status, body } = fail(error);
    return res.status(status).json(body);
  }
});

// ─── Admin: recent challenges (audit view) ───────────────────────────────────

/**
 * GET /otp/challenges — recent challenges for the school, without any code.
 *
 * The raw code is never stored, so there is nothing sensitive to leak here;
 * this exists so an administrator can see that a verification happened.
 */
router.get('/challenges', authenticateToken, async (req: Request, res: Response) => {
  try {
    const rows = await OtpChallenge.findAll({
      where: { schoolId: req.user!.schoolId },
      attributes: ['id', 'email', 'purpose', 'status', 'attempts', 'maxAttempts', 'resendCount', 'expiresAt', 'createdAt'],
      order: [['createdAt', 'DESC']],
      limit: 50,
    });
    return res.json({ success: true, data: { items: rows } });
  } catch (error) {
    const { status, body } = fail(error);
    return res.status(status).json(body);
  }
});

void Op;
export default router;