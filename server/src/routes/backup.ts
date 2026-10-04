import { Router, Request, Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import { authenticateToken } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { logAudit } from '../middleware/auditLog.js';
import {
  createBackup,
  listBackups,
  getBackup,
  restoreBackup,
  deleteBackup,
  cleanupOldBackups,
  getBackupDir,
  validateBackup,
  BackupType,
} from '../services/BackupService.js';

const router = Router();

// All backup routes require authentication and super_admin role
router.use(authenticateToken);
router.use(requireRole('super_admin'));

// ─── Create Backup ──────────────────────────────────────────────────────────

router.post(
  '/api/v1/backup/create',
  body('type')
    .optional()
    .isIn(['full', 'incremental'])
    .withMessage('Type must be "full" or "incremental"'),
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, error: errors.array()[0].msg });
      }

      const type: BackupType = req.body.type || 'full';
      const backup = await createBackup(type, req.user!.id);

      await logAudit(req, {
        action: 'create',
        entity: 'backup',
        entityId: backup.id,
        details: { type: backup.type, size: backup.size, tables: backup.tables.length },
      });

      return res.status(201).json({
        success: true,
        data: {
          id: backup.id,
          type: backup.type,
          status: backup.status,
          size: backup.size,
          createdAt: backup.createdAt,
          completedAt: backup.completedAt,
          tables: backup.tables,
          rowCounts: backup.rowCounts,
        },
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  }
);

// ─── List Backups ───────────────────────────────────────────────────────────

router.get('/api/v1/backup/list', async (req: Request, res: Response) => {
  try {
    const backups = listBackups();
    return res.json({
      success: true,
      data: {
        backups: backups.map((b) => ({
          id: b.id,
          type: b.type,
          status: b.status,
          size: b.size,
          createdAt: b.createdAt,
          completedAt: b.completedAt,
          tables: b.tables.length,
          rowCounts: b.rowCounts,
          createdBy: b.createdBy,
        })),
        total: backups.length,
        backupDir: getBackupDir(),
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

// ─── Get Single Backup ──────────────────────────────────────────────────────

router.get(
  '/api/v1/backup/:id',
  param('id').isString().notEmpty().withMessage('Backup ID is required'),
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, error: errors.array()[0].msg });
      }

      const backup = getBackup(req.params.id);
      if (!backup) {
        return res.status(404).json({ success: false, error: 'Backup not found' });
      }

      const validation = validateBackup(req.params.id);

      return res.json({
        success: true,
        data: {
          id: backup.id,
          type: backup.type,
          status: backup.status,
          size: backup.size,
          createdAt: backup.createdAt,
          completedAt: backup.completedAt,
          tables: backup.tables,
          rowCounts: backup.rowCounts,
          createdBy: backup.createdBy,
          error: backup.error,
          valid: validation.valid,
          missingFiles: validation.missing,
        },
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  }
);

// ─── Restore Backup ─────────────────────────────────────────────────────────

router.post(
  '/api/v1/backup/restore/:id',
  param('id').isString().notEmpty().withMessage('Backup ID is required'),
  body('confirm')
    .isBoolean()
    .withMessage('Confirmation is required')
    .custom((value) => value === true)
    .withMessage('You must confirm the restore operation'),
  body('tables')
    .optional()
    .isArray()
    .withMessage('Tables must be an array of strings'),
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, error: errors.array()[0].msg });
      }

      const backup = getBackup(req.params.id);
      if (!backup) {
        return res.status(404).json({ success: false, error: 'Backup not found' });
      }

      const result = await restoreBackup(req.params.id, {
        confirm: req.body.confirm,
        tables: req.body.tables,
      });

      await logAudit(req, {
        action: 'restore',
        entity: 'backup',
        entityId: req.params.id,
        details: {
          restored: result.restored,
          errors: result.errors,
        },
      });

      return res.json({
        success: true,
        data: {
          restored: result.restored,
          errors: result.errors,
          restoredCount: result.restored.length,
          errorCount: result.errors.length,
        },
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  }
);

// ─── Delete Backup ──────────────────────────────────────────────────────────

router.delete(
  '/api/v1/backup/:id',
  param('id').isString().notEmpty().withMessage('Backup ID is required'),
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, error: errors.array()[0].msg });
      }

      const backup = getBackup(req.params.id);
      if (!backup) {
        return res.status(404).json({ success: false, error: 'Backup not found' });
      }

      const deleted = deleteBackup(req.params.id);
      if (!deleted) {
        return res.status(500).json({ success: false, error: 'Failed to delete backup' });
      }

      await logAudit(req, {
        action: 'delete',
        entity: 'backup',
        entityId: req.params.id,
        details: { type: backup.type, size: backup.size },
      });

      return res.json({
        success: true,
        data: { id: req.params.id, deleted: true },
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  }
);

// ─── Cleanup Old Backups ────────────────────────────────────────────────────

router.post(
  '/api/v1/backup/cleanup',
  body('maxAgeDays')
    .optional()
    .isInt({ min: 1 })
    .withMessage('maxAgeDays must be a positive integer'),
  body('maxBackups')
    .optional()
    .isInt({ min: 1 })
    .withMessage('maxBackups must be a positive integer'),
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, error: errors.array()[0].msg });
      }

      const result = cleanupOldBackups({
        maxAgeDays: req.body.maxAgeDays,
        maxBackups: req.body.maxBackups,
      });

      await logAudit(req, {
        action: 'cleanup',
        entity: 'backup',
        details: {
          deleted: result.deleted.length,
          kept: result.kept.length,
        },
      });

      return res.json({
        success: true,
        data: {
          deleted: result.deleted,
          kept: result.kept,
          deletedCount: result.deleted.length,
          keptCount: result.kept.length,
        },
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  }
);

export default router;
