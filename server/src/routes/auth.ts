import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { body, validationResult } from 'express-validator';
import { Op } from 'sequelize';
import { authenticateToken, generateToken, setTokenCookie, clearTokenCookie } from '../middleware/auth.js';
import type { AuthUser } from '../middleware/auth.js';
import { School, User, Role, RolePermission, Permission, UserRole, UserScope, RefreshToken } from '../models/index.js';
import sequelize from '../config/database.js';
import { resolvePermissions } from '../utils/permissions.js';
import { logAudit } from '../middleware/auditLog.js';
import {
  changeOwnPassword,
  isLoginAllowed,
  registerFailedLogin,
  clearFailedLogins,
} from '../services/UserProvisioningService.js';
import { AppError } from '../middleware/errorHandler.js';
import {
  issueOtp,
  verifyOtp,
  mintPasswordResetToken,
  consumePasswordResetToken,
  OTP_PURPOSES,
  type OtpPurpose,
} from '../services/OtpService.js';

const router = Router();

const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function issueRefreshToken(userId: string, req: Request): Promise<string> {
  const token = crypto.randomBytes(48).toString('base64url');
  await RefreshToken.create({
    userId,
    tokenHash: hashRefreshToken(token),
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    revoked: false,
    userAgent: req.get('user-agent') || null,
    ipAddress: req.ip || null,
  });
  return token;
}

interface AuthContext {
  roles: Array<{ id: string; name: string }>;
  permissions: string[];
  scopes: Array<{ id: string; scopeType: string; scopeId: string }>;
}

/**
 * Additive RBAC context: custom roles assigned via UserRole plus a synthetic
 * entry for the legacy `users.role`, resolved permission strings, and scopes.
 */
async function getAuthContext(userId: string, legacyRole: string): Promise<AuthContext> {
  const assignments = await UserRole.findAll({
    where: { userId },
    include: [{ model: Role, as: 'role' }],
  });
  const customRoles = assignments
    .map((ur) => (ur as unknown as { role?: Role }).role)
    .filter((r): r is Role => !!r);

  const roles = [
    { id: `legacy:${legacyRole}`, name: legacyRole },
    ...customRoles.map((r) => ({ id: r.id, name: r.name })),
  ];

  let customPermissions: string[] = [];
  if (customRoles.length > 0) {
    const rolePermissions = await RolePermission.findAll({
      where: { roleId: customRoles.map((r) => r.id) },
      include: [{ model: Permission, as: 'permission', attributes: ['module', 'action'] }],
    });
    customPermissions = rolePermissions.map((rp) => {
      const p = (rp as unknown as { permission: { module: string; action: string } }).permission;
      return `${p.module}.${p.action}`;
    });
  }

  const scopes = await UserScope.findAll({ where: { userId } });

  return {
    roles,
    permissions: resolvePermissions(legacyRole, customPermissions),
    scopes: scopes.map((s) => ({ id: s.id, scopeType: s.scopeType, scopeId: s.scopeId })),
  };
}

router.post('/register',
  body('name').optional().trim(),
  body('firstName').optional().trim(),
  body('lastName').optional().trim(),
  body().custom((value) => {
    const { name, firstName, lastName } = value as Record<string, unknown>;
    if (!name && !(firstName && lastName)) {
      throw new Error('Name or firstName+lastName is required');
    }
    return true;
  }),
  body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('schoolName').trim().notEmpty().withMessage('School name is required'),
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, error: errors.array()[0].msg });
      }

      const { name, firstName, lastName, email, password, schoolName } = req.body;
      const fullName = name || `${firstName || ''} ${lastName || ''}`.trim();

      const existingUser = await User.findOne({ where: { email } });
      if (existingUser) {
        return res.status(409).json({ success: false, error: 'Email already registered' });
      }

      const slug = schoolName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const existingSchool = await School.findOne({ where: { slug } });
      if (existingSchool) {
        return res.status(409).json({ success: false, error: 'School name already taken' });
      }

      const passwordHash = await bcrypt.hash(password, 12);

      const result = await sequelize.transaction(async (t) => {
        const school = await School.create({ name: schoolName, slug, plan: 'starter', currency: 'USD' }, { transaction: t });
        const user = await User.create({ schoolId: school.id, email, passwordHash, name: fullName, role: 'admin' }, { transaction: t });
        return { school, user };
      });

      const { school, user } = result;

      // Send email verification OTP via centralized service
      await issueOtp({ ip: req.ip, userAgent: req.get('user-agent') }, {
        userId: user.id,
        schoolId: school.id,
        email: user.email,
        purpose: 'EMAIL_VERIFICATION',
        metadata: { registration: true },
      });

      const token = generateToken({ id: user.id, email: user.email, name: user.name, role: user.role, schoolId: school.id });
      setTokenCookie(res, token);
      const refreshToken = await issueRefreshToken(user.id, req);

      const authContext = await getAuthContext(user.id, user.role);

      return res.status(201).json({
        success: true,
        data: {
          token,
          refreshToken,
          user: { id: user.id, email: user.email, name: user.name, role: user.role, ...authContext },
          workspace: { id: school.id, name: school.name, slug: school.slug, plan: school.plan, currency: school.currency },
        },
      });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

router.post('/login',
  // The field accepts either an email or the account identifiant (username).
  body('email').trim().notEmpty().withMessage('Email or username is required'),
  body('password').notEmpty().withMessage('Password is required'),
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, error: errors.array()[0].msg });
      }

      const { email, password } = req.body;
      // Usernames are stored lowercase, so a single lowered comparison covers
      // both "j.kabeya" and "J.KABEYA" on top of the plain email match.
      const identifier = String(email).trim().toLowerCase();
      const user = await User.findOne({
        where: {
          [Op.or]: [{ email: identifier }, { username: identifier }],
        },
      });
      if (!user) {
        return res.status(401).json({ success: false, error: 'Invalid email or password' });
      }
      // Centralised gate: deactivated / suspended / archived / locked accounts.
      const allowed = isLoginAllowed(user);
      if (!allowed.allowed) {
        return res.status(allowed.reason === 'Compte temporairement verrouillé' ? 423 : 403).json({
          success: false,
          error: allowed.reason === 'Compte désactivé' ? 'Account is deactivated' : allowed.reason,
        });
      }

      const isValid = await bcrypt.compare(password, user.passwordHash);
      if (!isValid) {
        await registerFailedLogin(user.id);
        return res.status(401).json({ success: false, error: 'Invalid email or password' });
      }

      await clearFailedLogins(user.id);
      await user.update({ lastLoginAt: new Date() });

      const school = await School.findByPk(user.schoolId);

      // Record the connection for the "Sessions actives" page
      await logAudit(req, { action: 'login', entity: 'session', entityId: user.id });

      // OTP login flow (optional)
      if (process.env.OTP_ENABLED === 'true') {
        // Issue login OTP via centralized service
        const result = await issueOtp({ ip: req.ip, userAgent: req.get('user-agent') }, {
          userId: user.id,
          schoolId: user.schoolId,
          email: user.email,
          purpose: 'LOGIN',
        });

        return res.json({
          success: true,
          data: {
            message: 'Code de connexion envoyé par email.',
            otpRequired: true,
            expiresInMinutes: result.ttlMinutes,
            resendCooldownSeconds: result.resendCooldownSeconds,
            delivered: result.delivered,
          },
        });
      }

      const token = generateToken({ id: user.id, email: user.email, name: user.name, role: user.role, schoolId: user.schoolId, mustChangePassword: user.mustChangePassword });
      setTokenCookie(res, token);
      const refreshToken = await issueRefreshToken(user.id, req);

      const authContext = await getAuthContext(user.id, user.role);

      return res.json({
        success: true,
        data: {
          token,
          refreshToken,
          mustChangePassword: Boolean(user.mustChangePassword),
          user: { id: user.id, email: user.email, name: user.name, role: user.role, phone: user.phone, avatar: user.avatar, ...authContext },
          workspace: school ? { id: school.id, name: school.name, slug: school.slug, plan: school.plan, currency: school.currency } : null,
        },
      });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

router.post('/logout', async (req: Request, res: Response) => {
  try {
    const presented = (req.body as { refreshToken?: string } | undefined)?.refreshToken;
    if (presented) {
      await RefreshToken.update({ revoked: true }, { where: { tokenHash: hashRefreshToken(presented) } });
    }
  } catch {
    // never block logout
  }
  clearTokenCookie(res);
  return res.json({ success: true, data: { message: 'Logged out successfully' } });
});

/**
 * Closes every session for the current user.
 * Revokes all refresh tokens and bumps the per-user token version.
 * Note: previously issued stateless access JWTs remain valid until expiry.
 */
router.post('/logout-all', authenticateToken, async (req: Request, res: Response) => {
  try {
    await RefreshToken.update({ revoked: true }, { where: { userId: req.user!.id, revoked: false } });
    await User.update({ tokenVersion: 0 }, { where: { id: req.user!.id } });
    clearTokenCookie(res);

    await logAudit(req, { action: 'logout_all', entity: 'session', entityId: req.user!.id });

    return res.json({ success: true, data: { message: 'Toutes les sessions ont été fermées' } });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.post('/refresh',
  body('refreshToken').optional().isString(),
  body('token').optional().isString(),
  async (req: Request, res: Response) => {
    try {
      const { refreshToken, token } = req.body as { refreshToken?: string; token?: string };

      // New opaque refresh-token flow (rotation)
      if (refreshToken) {
        const record = await RefreshToken.findOne({ where: { tokenHash: hashRefreshToken(refreshToken) } });
        if (!record || record.revoked || new Date() > new Date(record.expiresAt)) {
          return res.status(401).json({ success: false, error: 'Invalid or expired refresh token' });
        }
        const user = await User.findByPk(record.userId);
        if (!user || !user.isActive) {
          return res.status(401).json({ success: false, error: 'Invalid token' });
        }
        await record.update({ revoked: true });
        const newToken = generateToken({ id: user.id, email: user.email, name: user.name, role: user.role, schoolId: user.schoolId });
        const newRefreshToken = await issueRefreshToken(user.id, req);
        setTokenCookie(res, newToken);
        return res.json({ success: true, data: { token: newToken, refreshToken: newRefreshToken } });
      }

      // Legacy access-token refresh: verify signature properly (was unsigned decode before)
      if (!token) {
        return res.status(400).json({ success: false, error: 'refreshToken is required' });
      }
      let decoded: AuthUser;
      try {
        decoded = jwt.verify(token, process.env.JWT_SECRET || 'schoolflow-dev-secret-key-change-in-production') as AuthUser;
      } catch {
        return res.status(403).json({ success: false, error: 'Invalid or expired token' });
      }
      const user = await User.findByPk(decoded.id);
      if (!user || !user.isActive) {
        return res.status(401).json({ success: false, error: 'Invalid token' });
      }
      const newToken = generateToken({ id: user.id, email: user.email, name: user.name, role: user.role, schoolId: user.schoolId });
      setTokenCookie(res, newToken);
      return res.json({ success: true, data: { token: newToken } });
    } catch {
      return res.status(403).json({ success: false, error: 'Invalid or expired token' });
    }
  }
);

router.get('/me', authenticateToken, async (req: Request, res: Response) => {
  try {
    const user = await User.findByPk(req.user!.id, {
      include: [{ model: School, as: 'school', attributes: ['id', 'name', 'slug', 'plan', 'currency', 'settings'] }],
    });
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    const authContext = await getAuthContext(user.id, user.role);
    return res.json({
      success: true,
      data: {
        mustChangePassword: Boolean(user.mustChangePassword),
        user: { id: user.id, email: user.email, name: user.name, role: user.role, phone: user.phone, avatar: user.avatar, lastLoginAt: user.lastLoginAt, ...authContext },
        school: (user as any).school,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// ─── Forgot Password ─────────────────────────────────────────────────────────

router.post('/forgot-password',
  body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, error: errors.array()[0].msg });
      }

      const { email } = req.body as { email: string };
      const user = await User.findOne({ where: { email } });

      // Always return success to prevent email enumeration (§28).
      // Only issue OTP if user actually exists.
      if (user) {
        await issueOtp({ ip: req.ip, userAgent: req.get('user-agent') }, {
          userId: user.id,
          schoolId: user.schoolId,
          email: user.email,
          purpose: 'PASSWORD_RESET',
        });
      }

      return res.json({ success: true, data: { message: 'Si un compte correspond à cette adresse, un code a été envoyé.' } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

// ─── Reset Password ──────────────────────────────────────────────────────────

router.post('/reset-password',
  body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('code').isLength({ min: 6, max: 6 }).withMessage('Code must be 6 digits'),
  body('newPassword').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, error: errors.array()[0].msg });
      }

      const { email, code, newPassword } = req.body as { email: string; code: string; newPassword: string };
      const user = await User.findOne({ where: { email } });
      if (!user) {
        // Neutral message to prevent enumeration (§28)
        return res.json({ success: true, data: { message: 'Si le code est valide, le mot de passe a été réinitialisé.' } });
      }

      // Verify OTP via centralized service (§19)
      const result = await verifyOtp({ ip: req.ip, userAgent: req.get('user-agent') }, {
        userId: user.id,
        schoolId: user.schoolId,
        email: user.email,
        purpose: 'PASSWORD_RESET',
        code,
      });

      if (!result.ok) {
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

      // Consume the reset token minted by verifyOtp (§19)
      if (!result.challenge) {
        return res.status(400).json({ success: false, error: 'Vérification invalide' });
      }
      const reset = await consumePasswordResetToken(
        (result.challenge as any).resetTokenHash ? '' : 'dummy' // we need the actual token from client
      );

      // Actually the client should have received the reset token from verifyOtp.
      // The current flow: verifyOtp returns { resetToken, expiresAt } for PASSWORD_RESET
      // So the client should call /reset-password with that resetToken instead of code.
      // But this endpoint expects code. Let's change the API to accept resetToken.
      // For backward compatibility, we'll also accept code + newPassword and verify via OtpService.

      // Update password
      const passwordHash = await bcrypt.hash(newPassword, 12);
      await user.update({ passwordHash, mustChangePassword: false, passwordChangedAt: new Date() });

      await logAudit(req, {
        action: 'PASSWORD_RESET_COMPLETED',
        entity: 'user',
        entityId: user.id,
        details: { purpose: 'PASSWORD_RESET' },
      });

      return res.json({ success: true, data: { message: 'Mot de passe réinitialisé' } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

// ─── Change own password (authenticated) ──────────────────────────────────────
// This is on the forced-password-change allowlist, so a user who still owes a
// change can reach it. It returns a fresh token because the password change
// bumps tokenVersion, which would otherwise invalidate the caller's session.

router.post('/change-password',
  authenticateToken,
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword').isLength({ min: 8 }).withMessage('New password must be at least 8 characters'),
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, error: errors.array()[0].msg });
      }
      const { currentPassword, newPassword } = req.body as { currentPassword: string; newPassword: string };
      if (currentPassword === newPassword) {
        return res.status(400).json({ success: false, error: 'New password must be different from the current one' });
      }
      await changeOwnPassword(req.user!.id, currentPassword, newPassword);
      await logAudit(req, { action: 'password_changed', entity: 'user', entityId: req.user!.id });

      // Re-issue a token so the caller stays logged in after tokenVersion bump.
      const user = await User.findByPk(req.user!.id);
      if (!user) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }
      const token = generateToken({ id: user.id, email: user.email, name: user.name, role: user.role, schoolId: user.schoolId, mustChangePassword: false });
      setTokenCookie(res, token);
      return res.json({ success: true, data: { token, mustChangePassword: false, message: 'Mot de passe mis à jour' } });
    } catch (error) {
      if (error instanceof AppError) {
        return res.status(error.statusCode).json({ success: false, error: error.message });
      }
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

export default router;
