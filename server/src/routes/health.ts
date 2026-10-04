import { Router, Request, Response } from 'express';
import sequelize from '../config/database.js';
import { activeEmailProvider, isEmailConfigured } from '../services/EmailService.js';
import { isImageKitConfigured } from '../services/imagekit.js';

const router = Router();

// ─── Helpers ─────────────────────────────────────────────────────────────────

interface HealthCheckResult {
  status: 'ok' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
  environment: string;
  checks: {
    database: ServiceCheck;
    email: ServiceCheck;
    storage: ServiceCheck;
  };
}

interface ServiceCheck {
  status: 'ok' | 'degraded' | 'unhealthy';
  latencyMs: number;
  details: string;
}

async function checkDatabase(): Promise<ServiceCheck> {
  const start = Date.now();
  try {
    await sequelize.authenticate();
    return {
      status: 'ok',
      latencyMs: Date.now() - start,
      details: 'Connected',
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      latencyMs: Date.now() - start,
      details: error instanceof Error ? error.message : 'Connection failed',
    };
  }
}

async function checkEmail(): Promise<ServiceCheck> {
  const start = Date.now();
  try {
    const provider = activeEmailProvider();
    const configured = isEmailConfigured();
    return {
      status: configured ? 'ok' : 'degraded',
      latencyMs: Date.now() - start,
      details: configured ? `Provider: ${provider}` : 'No provider configured (dev mode)',
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      latencyMs: Date.now() - start,
      details: error instanceof Error ? error.message : 'Email check failed',
    };
  }
}

async function checkStorage(): Promise<ServiceCheck> {
  const start = Date.now();
  try {
    const configured = isImageKitConfigured();
    return {
      status: configured ? 'ok' : 'degraded',
      latencyMs: Date.now() - start,
      details: configured ? 'ImageKit configured' : 'Local storage fallback',
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      latencyMs: Date.now() - start,
      details: error instanceof Error ? error.message : 'Storage check failed',
    };
  }
}

function overallStatus(checks: HealthCheckResult['checks']): HealthCheckResult['status'] {
  const statuses = [checks.database.status, checks.email.status, checks.storage.status];
  if (statuses.every((s) => s === 'ok')) return 'ok';
  if (statuses.some((s) => s === 'unhealthy')) return 'unhealthy';
  return 'degraded';
}

// ─── Routes ──────────────────────────────────────────────────────────────────

/**
 * Basic liveness probe — lightweight, no external checks.
 * Used by container orchestrators to verify the process is running.
 */
router.get('/health', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    },
  });
});

/**
 * Detailed health check — verifies all critical dependencies.
 * Never exposes secrets, credentials, or connection strings.
 */
router.get('/health/detailed', async (_req: Request, res: Response) => {
  const [database, email, storage] = await Promise.all([
    checkDatabase(),
    checkEmail(),
    checkStorage(),
  ]);

  const checks = { database, email, storage };
  const status = overallStatus(checks);

  const result: HealthCheckResult = {
    status,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || 'unknown',
    environment: process.env.NODE_ENV || 'development',
    checks,
  };

  const statusCode = status === 'ok' ? 200 : status === 'degraded' ? 200 : 503;
  res.status(statusCode).json({ success: status !== 'unhealthy', data: result });
});

/**
 * Readiness probe — indicates whether the server is ready to accept traffic.
 * Returns 503 if critical dependencies are unavailable.
 */
router.get('/health/ready', async (_req: Request, res: Response) => {
  const database = await checkDatabase();

  if (database.status === 'unhealthy') {
    return res.status(503).json({
      success: false,
      error: 'Service not ready',
      code: 'SERVICE_UNAVAILABLE',
      data: {
        status: 'not_ready',
        timestamp: new Date().toISOString(),
        checks: { database },
      },
    });
  }

  return res.json({
    success: true,
    data: {
      status: 'ready',
      timestamp: new Date().toISOString(),
      checks: { database },
    },
  });
});

export default router;
