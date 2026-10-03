import { Request } from 'express';
import { AuditLog } from '../models/index.js';

interface AuditEntry {
  action: string;
  entity: string;
  entityId?: string;
  details?: Record<string, unknown>;
}

/**
 * Log an action to the audit_logs table.
 * Fire-and-forget: never blocks the request or throws.
 */
export async function logAudit(req: Request, entry: AuditEntry): Promise<void> {
  try {
    await AuditLog.create({
      schoolId: req.user?.schoolId,
      userId: req.user?.id,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId,
      details: entry.details || {},
      ipAddress: req.ip || req.socket?.remoteAddress || null,
      userAgent: req.get('user-agent') || null,
    });
  } catch {
    // Audit logging must never break the request
  }
}
