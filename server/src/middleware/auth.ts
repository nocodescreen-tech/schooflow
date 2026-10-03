import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
  schoolId: string;
  /** Set when the account still owes a password change. */
  mustChangePassword?: boolean;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export const TOKEN_COOKIE_NAME = 'sf_token';
export const TOKEN_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Routes a user may still reach while owing a password change.
 * Anything else returns 428 so the client can redirect to the change screen.
 */
export const PASSWORD_CHANGE_ALLOWLIST: RegExp[] = [
  /^\/auth\/change-password\/?$/,
  /^\/auth\/me\/?$/,
  /^\/auth\/logout\/?$/,
  /^\/auth\/refresh\/?$/,
  /^\/auth\/sessions\/?$/,
  /^\/auth\/sessions\/[^/]+\/?$/,
  /^\/users\/me\/preferences\/?$/,
  /^\/notifications\/?$/,
  /^\/notifications\/read\/?$/,
  /^\/modules\/?$/,
];

export function getTokenCookieOptions(): {
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'strict' | 'lax' | 'none';
  maxAge: number;
  path: string;
} {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: TOKEN_MAX_AGE,
    path: '/',
  };
}

export function setTokenCookie(res: Response, token: string): void {
  res.cookie(TOKEN_COOKIE_NAME, token, getTokenCookieOptions());
}

export function clearTokenCookie(res: Response): void {
  res.clearCookie(TOKEN_COOKIE_NAME, { ...getTokenCookieOptions(), maxAge: undefined });
}

export function generateToken(user: AuthUser): string {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name, role: user.role, schoolId: user.schoolId, mcp: user.mustChangePassword ? 1 : 0 },
    process.env.JWT_SECRET || 'schoolflow-dev-secret-key-change-in-production',
    { expiresIn: '7d' }
  );
}

/**
 * Routes that must work without a valid session (login, public verification,
 * password recovery). Used to skip the account-status check.
 */
export function isPublicAuthPath(path: string): boolean {
  return (
    path.startsWith('/auth/login') ||
    path.startsWith('/auth/register') ||
    path.startsWith('/auth/forgot') ||
    path.startsWith('/auth/reset') ||
    path.startsWith('/auth/activate') ||
    path.startsWith('/verify/') ||
    path.startsWith('/activation/')
  );
}

/**
 * Lazily loads User so we can enforce account status and the forced password
 * change without importing models at module load (avoids a require cycle).
 */
async function loadUserModel(): Promise<typeof import('../models/index.js').User | null> {
  try {
    const models = await import('../models/index.js');
    return models.User;
  } catch {
    return null;
  }
}

export async function authenticateToken(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers['authorization'];
  const headerToken = authHeader && authHeader.split(' ')[1];
  const cookieToken = req.cookies?.[TOKEN_COOKIE_NAME] as string | undefined;
  const token = headerToken || cookieToken;

  if (!token) {
    res.status(401).json({ success: false, error: 'Access token is required' });
    return;
  }

  let decoded: AuthUser;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET || 'schoolflow-dev-secret-key-change-in-production') as AuthUser;
  } catch {
    res.status(403).json({ success: false, error: 'Invalid or expired token' });
    return;
  }

  const User = await loadUserModel();
  if (User) {
    try {
      const user = await User.findByPk(decoded.id, { attributes: ['id', 'isActive', 'status', 'tokenVersion', 'mustChangePassword', 'lockedUntil'] });
      if (!user) {
        res.status(403).json({ success: false, error: 'Compte introuvable' });
        return;
      }
      // A disabled / suspended / archived account must not keep using a token
      // that was issued while it was still active.
      if (!user.isActive) {
        res.status(403).json({ success: false, error: 'Compte désactivé' });
        return;
      }
      const status = (user as { status?: string }).status || 'active';
      if (['suspended', 'disabled', 'archived'].includes(status)) {
        res.status(403).json({ success: false, error: `Compte ${status}` });
        return;
      }
      if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
        res.status(423).json({ success: false, error: 'Compte temporairement verrouillé' });
        return;
      }
      const mustChange = Boolean(user.mustChangePassword);
      req.user = { ...decoded, mustChangePassword: mustChange };

      if (mustChange) {
        const fullPath = req.originalUrl.split('?')[0];
        const apiPath = fullPath.replace(/^\/api\/v1/, '');
        const allowed = PASSWORD_CHANGE_ALLOWLIST.some((re) => re.test(apiPath));
        if (!allowed) {
          res.status(428).json({
            success: false,
            error: 'Changement de mot de passe obligatoire',
            code: 'PASSWORD_CHANGE_REQUIRED',
          });
          return;
        }
      }
    } catch {
      res.status(500).json({ success: false, error: 'Authentication check failed' });
      return;
    }
  } else {
    req.user = decoded;
  }

  next();
}
