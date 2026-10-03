import rateLimit from 'express-rate-limit';

const windowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10);

/**
 * Rate limits.
 *
 * Note on `authLimiter`: in a school, many staff log in from behind the same
 * public IP, so an aggressive per-IP limit would lock out legitimate users
 * during a morning rush. Brute-force protection is enforced per-account
 * instead (see UserProvisioningService.registerFailedLogin: 5 failures → 15 min
 * lock). The per-IP limit here is a coarse abuse guard, not the real defence.
 */
export const globalLimiter = rateLimit({
  windowMs,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '300', 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests, please try again later' },
});

export const authLimiter = rateLimit({
  windowMs,
  max: parseInt(process.env.AUTH_RATE_LIMIT_MAX || '60', 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many authentication attempts, please try again later' },
});

export const apiLimiter = rateLimit({
  windowMs,
  max: parseInt(process.env.API_RATE_LIMIT_MAX || '600', 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'API rate limit exceeded, please try again later' },
});
