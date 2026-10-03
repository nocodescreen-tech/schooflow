import { Router, Request, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { Op } from 'sequelize';
import { authenticateToken } from '../middleware/auth.js';
import { requireRole, requirePermission } from '../middleware/rbac.js';
import { AppError } from '../middleware/errorHandler.js';
import { EvaluationPeriod, AcademicYear } from '../models/index.js';
import { logAudit } from '../middleware/auditLog.js';

const router = Router();
router.use(authenticateToken);

const READ_ROLES = ['super_admin', 'admin', 'director', 'teacher', 'accountant', 'receptionist'] as const;
const WRITE_ROLES = ['super_admin', 'admin', 'director'] as const;

function rejectInvalid(req: Request, res: Response): boolean {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ success: false, error: errors.array()[0].msg });
    return true;
  }
  return false;
}

async function resolveYear(schoolId: string, yearId?: string) {
  if (yearId) {
    const explicit = await AcademicYear.findOne({ where: { id: yearId, schoolId } });
    if (explicit) return explicit;
  }
  return AcademicYear.findOne({
    where: { schoolId, status: 'active' },
    order: [['startDate', 'DESC']],
  });
}

// ─────────────────────────── Read ───────────────────────────

/**
 * GET /evaluation-periods — list periods for a school/year.
 */
router.get(
  '/',
  requireRole(...READ_ROLES),
  requirePermission('evaluation_periods', 'view'),
  query('academicYearId').optional().isUUID(),
  async (req: Request, res: Response) => {
    try {
      if (rejectInvalid(req, res)) return;
      const schoolId = req.user!.schoolId!;
      const year = await resolveYear(schoolId, req.query.academicYearId as string | undefined);

      if (!year) {
        return res.json({ success: true, data: { items: [], academicYear: null, needsSetup: true } });
      }

      const periods = await (await import('../models/index.js')).EvaluationPeriod.findAll({
        where: { schoolId, academicYearId: year.id },
        order: [['position', 'ASC'], ['startDate', 'ASC']],
      });

      return res.json({
        success: true,
        data: { items: periods, academicYear: { id: year.id, name: year.name, status: year.status } },
      });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

/**
 * GET /evaluation-periods/:id — single period.
 */
router.get(
  '/:id',
  requireRole(...READ_ROLES),
  requirePermission('evaluation_periods', 'view'),
  param('id').isUUID().withMessage('Identifiant invalide'),
  async (req: Request, res: Response) => {
    try {
      if (rejectInvalid(req, res)) return;
      const period = await (await import('../models/index.js')).EvaluationPeriod.findOne({
        where: { id: req.params.id, schoolId: req.user!.schoolId! },
      });
      if (!period) throw new (await import('../middleware/errorHandler.js')).AppError('Période introuvable', 404);
      return res.json({ success: true, data: { period } });
    } catch (error) {
      if (error instanceof (await import('../middleware/errorHandler.js')).AppError) {
        return res.status(error.statusCode).json({ success: false, error: error.message });
      }
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

// ─────────────────────────── Write ───────────────────────────

/**
 * POST /evaluation-periods — create a new period.
 */
router.post(
  '/',
  requireRole(...WRITE_ROLES),
  requirePermission('evaluation_periods', 'manage'),
  body('name').trim().notEmpty().withMessage('Nom requis'),
  body('code').trim().notEmpty().withMessage('Code requis'),
  body('startDate').isISO8601().withMessage('Date de début invalide'),
  body('endDate').isISO8601().withMessage('Date de fin invalide'),
  body('academicYearId').optional().isUUID(),
  body('position').optional().isInt({ min: 0 }),
  async (req: Request, res: Response) => {
    try {
      if (rejectInvalid(req, res)) return;
      const schoolId = req.user!.schoolId!;
      const body = req.body as Record<string, unknown>;

      const year = await resolveYear(schoolId, body.academicYearId as string | undefined);
      if (!year) throw new (await import('../middleware/errorHandler.js')).AppError('Aucune année scolaire active', 400);

      const period = await (await import('../models/index.js')).EvaluationPeriod.create({
        schoolId,
        academicYearId: year.id,
        name: body.name as string,
        code: body.code as string,
        startAt: new Date(body.startDate as string),
        endAt: new Date(body.endDate as string),
        position: (body.position as number) ?? 0,
      });

      await logAudit(req, { action: 'period_created', entity: 'evaluation_period', entityId: period.id, details: { name: period.name } });
      return res.status(201).json({ success: true, data: { period } });
    } catch (error) {
      if (error instanceof (await import('../middleware/errorHandler.js')).AppError) {
        return res.status(error.statusCode).json({ success: false, error: error.message });
      }
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

/**
 * PUT /evaluation-periods/:id — update a period.
 */
router.put(
  '/:id',
  requireRole(...WRITE_ROLES),
  requirePermission('evaluation_periods', 'manage'),
  param('id').isUUID().withMessage('Identifiant invalide'),
  body('name').optional().trim().notEmpty().withMessage('Nom requis'),
  body('code').optional().trim().notEmpty().withMessage('Code requis'),
  body('startDate').optional().isISO8601(),
  body('endDate').optional().isISO8601(),
  body('position').optional().isInt({ min: 0 }),
  async (req: Request, res: Response) => {
    try {
      if (rejectInvalid(req, res)) return;
      const period = await (await import('../models/index.js')).EvaluationPeriod.findOne({
        where: { id: req.params.id, schoolId: req.user!.schoolId! },
      });
      if (!period) throw new (await import('../middleware/errorHandler.js')).AppError('Période introuvable', 404);
      if (period.status === 'archived') throw new (await import('../middleware/errorHandler.js')).AppError('Impossible de modifier une période archivée', 409);

      const body = req.body as Record<string, unknown>;
      await period.update({
        name: body.name as string ?? period.name,
        code: body.code as string ?? period.code,
        startAt: body.startDate ? new Date(body.startDate as string) : period.startAt,
        endAt: body.endDate ? new Date(body.endDate as string) : period.endAt,
        position: body.position !== undefined ? (body.position as number) : period.position,
      });

      await logAudit(req, { action: 'period_updated', entity: 'evaluation_period', entityId: period.id, details: { name: period.name } });
      return res.json({ success: true, data: { period } });
    } catch (error) {
      if (error instanceof (await import('../middleware/errorHandler.js')).AppError) return res.status(error.statusCode).json({ success: false, error: error.message });
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

/**
 * POST /evaluation-periods/:id/close — close a period (no more grade changes).
 */
router.post(
  '/:id/close',
  requireRole(...WRITE_ROLES),
  requirePermission('evaluation_periods', 'manage'),
  param('id').isUUID().withMessage('Identifiant invalide'),
  async (req: Request, res: Response) => {
    try {
      if (rejectInvalid(req, res)) return;
      const period = await (await import('../models/index.js')).EvaluationPeriod.findOne({
        where: { id: req.params.id, schoolId: req.user!.schoolId! },
      });
      if (!period) throw new (await import('../middleware/errorHandler.js')).AppError('Période introuvable', 404);
      if (period.status === 'closed') throw new (await import('../middleware/errorHandler.js')).AppError('Période déjà clôturée', 400);
      if (period.status === 'archived') throw new (await import('../middleware/errorHandler.js')).AppError('Période archivée', 409);

      await period.update({ status: 'closed', closedAt: new Date(), closedBy: req.user!.id });
      await logAudit(req, { action: 'period_closed', entity: 'evaluation_period', entityId: period.id, details: { name: period.name } });
      return res.json({ success: true, data: { period } });
    } catch (error) {
      if (error instanceof (await import('../middleware/errorHandler.js')).AppError) return res.status(error.statusCode).json({ success: false, error: error.message });
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

/**
 * POST /evaluation-periods/:id/reopen — reopen a closed period.
 */
router.post(
  '/:id/reopen',
  requireRole(...WRITE_ROLES),
  requirePermission('evaluation_periods', 'manage'),
  param('id').isUUID().withMessage('Identifiant invalide'),
  async (req: Request, res: Response) => {
    try {
      if (rejectInvalid(req, res)) return;
      const period = await (await import('../models/index.js')).EvaluationPeriod.findOne({
        where: { id: req.params.id, schoolId: req.user!.schoolId! },
      });
      if (!period) throw new (await import('../middleware/errorHandler.js')).AppError('Période introuvable', 404);
      if (period.status === 'open') throw new (await import('../middleware/errorHandler.js')).AppError('Période déjà ouverte', 400);

      await period.update({ status: 'open', closedAt: null, closedBy: null });
      await logAudit(req, { action: 'period_reopened', entity: 'evaluation_period', entityId: period.id });
      return res.json({ success: true, data: { period } });
    } catch (error) {
      if (error instanceof (await import('../middleware/errorHandler.js')).AppError) return res.status(error.statusCode).json({ success: false, error: error.message });
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

/**
 * DELETE /evaluation-periods/:id — soft-delete (archive) a period.
 */
router.delete(
  '/:id',
  requireRole(...WRITE_ROLES),
  requirePermission('evaluation_periods', 'manage'),
  param('id').isUUID().withMessage('Identifiant invalide'),
  async (req: Request, res: Response) => {
    try {
      if (rejectInvalid(req, res)) return;
      const period = await (await import('../models/index.js')).EvaluationPeriod.findOne({
        where: { id: req.params.id, schoolId: req.user!.schoolId! },
      });
      if (!period) throw new (await import('../middleware/errorHandler.js')).AppError('Période introuvable', 404);
      if (period.status !== 'archived') {
        await period.update({ status: 'archived' });
      }
      await logAudit(req, { action: 'period_archived', entity: 'evaluation_period', entityId: period.id, details: { name: period.name } });
      return res.json({ success: true, data: { period } });
    } catch (error) {
      if (error instanceof (await import('../middleware/errorHandler.js')).AppError) return res.status(error.statusCode).json({ success: false, error: error.message });
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

export default router;