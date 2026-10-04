import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

// ─── Error Codes Enum ────────────────────────────────────────────────────────

export enum ErrorCode {
  // General
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  CONFLICT = 'CONFLICT',
  RATE_LIMITED = 'RATE_LIMITED',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',

  // Auth
  INVALID_TOKEN = 'INVALID_TOKEN',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  ACCOUNT_LOCKED = 'ACCOUNT_LOCKED',

  // Payments
  PAYMENT_NOT_FOUND = 'PAYMENT_NOT_FOUND',
  PAYMENT_ALREADY_CANCELLED = 'PAYMENT_ALREADY_CANCELLED',
  INSUFFICIENT_FUNDS = 'INSUFFICIENT_FUNDS',
  DUPLICATE_PAYMENT = 'DUPLICATE_PAYMENT',
  IDEMPOTENCY_KEY_REUSED = 'IDEMPOTENCY_KEY_REUSED',

  // Resources
  STUDENT_NOT_FOUND = 'STUDENT_NOT_FOUND',
  FEE_NOT_FOUND = 'FEE_NOT_FOUND',
  CLASS_NOT_FOUND = 'CLASS_NOT_FOUND',
  USER_NOT_FOUND = 'USER_NOT_FOUND',

  // Business rules
  AMOUNT_EXCEEDS_BALANCE = 'AMOUNT_EXCEEDS_BALANCE',
  REFERENCE_ALREADY_EXISTS = 'REFERENCE_ALREADY_EXISTS',
  MISSING_RATE = 'MISSING_RATE',
  LIVE_RATE_CONFIRMATION_REQUIRED = 'LIVE_RATE_CONFIRMATION_REQUIRED',
}

// ─── AppError Class ──────────────────────────────────────────────────────────

export class AppError extends Error {
  statusCode: number;
  code: ErrorCode;
  details?: unknown;

  constructor(
    message: string,
    statusCode: number = 500,
    code: ErrorCode = ErrorCode.INTERNAL_ERROR,
    details?: unknown
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    // Ensure proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

// ─── Request ID Middleware ───────────────────────────────────────────────────

/**
 * Attaches a unique request ID to every incoming request for tracing.
 * Uses the X-Request-ID header if present (e.g. from a load balancer),
 * otherwise generates a fresh UUID.
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers['x-request-id'];
  const requestId = typeof incoming === 'string' && incoming.length > 0
    ? incoming.slice(0, 64)
    : randomUUID();
  req.requestId = requestId;
  res.setHeader('X-Request-ID', requestId);
  next();
}

// ─── Not Found Handler ───────────────────────────────────────────────────────

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    error: 'Resource not found',
    code: ErrorCode.NOT_FOUND,
    requestId: req.requestId,
  });
}

// ─── Error Handler ───────────────────────────────────────────────────────────

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
  const isProduction = process.env.NODE_ENV === 'production';

  let statusCode = 500;
  let message = 'Internal server error';
  let code = ErrorCode.INTERNAL_ERROR;
  let details: unknown;

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
    code = err.code;
    details = err.details;
  } else if (err.name === 'SequelizeUniqueConstraintError') {
    statusCode = 409;
    code = ErrorCode.CONFLICT;
    message = 'A record with this value already exists';
  } else if (err.name === 'SequelizeValidationError') {
    statusCode = 400;
    code = ErrorCode.VALIDATION_ERROR;
    message = 'Validation failed';
  } else if (err.name === 'SequelizeForeignKeyConstraintError') {
    statusCode = 400;
    code = ErrorCode.VALIDATION_ERROR;
    message = 'Referenced record does not exist';
  }

  // Log server errors with full context
  if (statusCode >= 500) {
    console.error(`[error] ${req.method} ${req.originalUrl} [${req.requestId}]:`, {
      message: err.message,
      stack: err.stack,
      code,
    });
  }

  // Build response — never expose stack traces in production
  const response: Record<string, unknown> = {
    success: false,
    error: message,
    code,
    requestId: req.requestId,
  };

  if (details !== undefined) {
    response.details = details;
  }

  // Include stack trace only in non-production environments
  if (!isProduction && err.stack) {
    response.stack = err.stack;
  }

  res.status(statusCode).json(response);
}
