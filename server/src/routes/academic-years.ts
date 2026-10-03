import { Router, Request, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { Op } from 'sequelize';
import { authenticateToken } from '../middleware/auth.js';
import { requireRole, requirePermission } from '../middleware/rbac.js';
import { AcademicYear, EvaluationPeriod, Student, Class } from '../models/index.js';
import { logAudit } from '../middleware/auditLog.js';
import { getPagination, getSort, pages } from '../utils/listQuery.js';
import { AppError } from '../middleware/errorHandler.js';

const router = Router();
router.use(authenticateToken);

const VIEW_ROLES = ['super_admin', 'admin', 'director', 'teacher', 'accountant', 'receptionist'] as const;
const MANAGE_ROLES = ['super_admin', 'admin', 'director'] as const;

function rejectInvalid(req: Request, res: Response): boolean {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ success: false, error: errors.array()[0].msg });
    return true;
  }
  return false;
}

const SORTABLE = { name: 'name', startDate: 'startDate', endDate: 'endDate', status: 'status', createdAt: 'createdAt' };

// ─── List academic years ───
router.get(
  '/',
  requireRole(...['super_admin', 'admin', 'director', 'teacher', 'accountant', 'receptionist']),
  requirePermission('academic-years', 'view'),
  query('status').optional().isIn(['draft', 'active', 'closed']),
  async (req: Request, res: Response) => {
    try {
      const schoolId = req.user!.schoolId!;
      const { status } = req.query;

      const where: Record<string, unknown> = { schoolId };
      if (status) where.status = status;

      const { page, limit, offset } = getPagination(req.query);
      const sort = getSort(req.query, SORTABLE, 'startDate', 'DESC');
      if (!sort) return res.status(400).json({ success: false, error: 'Invalid sortBy or sortOrder' });

      const { count, rows: years } = await AcademicYear.findAndCountAll({
        where,
        order: [[sort.column, sort.order]],
        limit,
        offset,
      });

      // Add computed stats
      const items = await Promise.all(
        years.map(async (year) => {
          const studentsCount = await Student.count({ where: { schoolId: req.user!.schoolId!, academicYear: year.name, status: 'active' } });
          const periodsCount = await (await import('../models/index.js')).EvaluationPeriod.count({ where: { academicYearId: year.id } });
          return { ...year.toJSON(), studentsCount, periodsCount };
        })
      );

      return res.json({ success: true, data: { items, total: count, page, pages: pages(count, limit) } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

// ─── Get active academic year ───
router.get(
  '/active',
  requireRole('super_admin', 'admin', 'director', 'teacher', 'accountant', 'receptionist'),
  requirePermission('academic-years', 'view'),
  async (req: Request, res: Response) => {
    try {
      const schoolId = req.user!.schoolId!;
      const year = await AcademicYear.findOne({
        where: { schoolId, status: 'active' },
        order: [['startDate', 'DESC']],
      });
      if (!year) {
        return res.status(404).json({ success: false, error: 'Aucune année scolaire active' });
      }
      return res.json({ success: true, data: { academicYear: year } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

// ─── Get single academic year ───
router.get(
  '/:id',
  param('id').isUUID().withMessage('Identifiant invalide'),
  requireRole('super_admin', 'admin', 'director', 'teacher', 'accountant', 'receptionist'),
  requirePermission('academic-years', 'view'),
  async (req: Request, res: Response) => {
    if (rejectInvalid(req, res)) return;
    try {
      const year = await AcademicYear.findOne({
        where: { id: req.params.id, schoolId: req.user!.schoolId! },
      });
      if (!year) return res.status(404).json({ success: false, error: 'Année scolaire introuvable' });
      return res.json({ success: true, data: { academicYear: year } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

// ─── Create academic year ───
router.post(
  '/',
  requireRole(...['super_admin', 'admin', 'director']),
  requirePermission('academic-years', 'manage'),
  body('name').trim().notEmpty().withMessage('Le nom est requis'),
  body('startDate').isISO8601().withMessage('Date de début invalide'),
  body('endDate').isISO8601().withMessage('Date de fin invalide'),
  body('description').optional().trim(),
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ success: false, error: errors.array()[0].msg });

      const { name, startDate, endDate, description } = req.body;
      const schoolId = req.user!.schoolId!;

      const start = new Date(startDate);
      const end = new Date(endDate);
      if (end <= start) {
        return res.status(400).json({ success: false, error: 'La date de fin doit être après la date de début' });
      }

      // Check for overlapping years
      const overlapping = await AcademicYear.findOne({
        where: {
          schoolId,
          [Op.or]: [
            { startDate: { [Op.between]: [start, end] } },
            { endDate: { [Op.between]: [start, end] } },
            { [Op.and]: [{ startDate: { [Op.lte]: start } }, { endDate: { [Op.gte]: end } }] },
          ],
        },
      });
      if (overlapping) {
        return res.status(409).json({ success: false, error: 'Une année scolaire chevauche déjà ces dates' });
      }

      const year = await AcademicYear.create({
        schoolId,
        name,
        startDate,
        endDate,
        description: description || '',
        status: 'draft',
      });

      await logAudit(req, { action: 'create', entity: 'academic_year', entityId: year.id, details: { name: year.name } });

      return res.status(201).json({ success: true, data: { academicYear: year } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

// ─── Update academic year ───
router.patch(
  '/:id',
  param('id').isUUID().withMessage('Identifiant invalide'),
  requireRole('super_admin', 'admin', 'director'),
  requirePermission('academic-years', 'manage'),
  body('name').optional().trim().notEmpty(),
  body('startDate').optional().isISO8601(),
  body('endDate').optional().isISO8601(),
  body('description').optional().trim(),
  body('status').optional().isIn(['draft', 'active', 'closed']),
  async (req: Request, res: Response) => {
    if (rejectInvalid(req, res)) return;
    try {
      const year = await AcademicYear.findOne({
        where: { id: req.params.id, schoolId: req.user!.schoolId! },
      });
      if (!year) return res.status(404).json({ success: false, error: 'Année scolaire introuvable' });

      if (year.status === 'closed' && req.body.status !== 'closed') {
        return res.status(400).json({ success: false, error: 'Une année close ne peut être rouverte que par archivage/désarchivage' });
      }

      const allowed = ['name', 'startDate', 'endDate', 'description', 'status'];
      const updates: Record<string, unknown> = {};
      for (const field of allowed) {
        if (req.body[field] !== undefined) updates[field] = req.body[field];
      }

      if (updates.startDate || updates.endDate) {
        const start = updates.startDate ? new Date(updates.startDate as string) : new Date(year.startDate);
        const end = updates.endDate ? new Date(updates.endDate as string) : new Date(year.endDate);
        if (end <= start) {
          return res.status(400).json({ success: false, error: 'La date de fin doit être après la date de début' });
        }
      }

      await year.update(updates);

      await logAudit(req, { action: 'update', entity: 'academic_year', entityId: year.id, details: updates });

      return res.json({ success: true, data: { academicYear: year } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

// ─── Close academic year ───
router.post(
  '/:id/close',
  requireRole('super_admin', 'admin', 'director'),
  requirePermission('academic-years', 'manage'),
  param('id').isUUID().withMessage('Identifiant invalide'),
  async (req: Request, res: Response) => {
    if (rejectInvalid(req, res)) return;
    try {
      const year = await AcademicYear.findOne({ where: { id: req.params.id, schoolId: req.user!.schoolId! } });
      if (!year) return res.status(404).json({ success: false, error: 'Année scolaire introuvable' });
      if (year.status === 'closed') {
        return res.status(400).json({ success: false, error: 'Année déjà close' });
      }
      if (year.status === 'draft') {
        return res.status(400).json({ success: false, error: 'Une année en brouillon ne peut être close directement' });
      }

      await year.update({ status: 'closed' });

      await logAudit(req, { action: 'close', entity: 'academic_year', entityId: year.id });

      return res.json({ success: true, data: { academicYear: year } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

// ─── Activate academic year (only one active at a time) ───
router.post(
  '/:id/activate',
  requireRole('super_admin', 'admin', 'director'),
  requirePermission('academic-years', 'manage'),
  param('id').isUUID().withMessage('Identifiant invalide'),
  async (req: Request, res: Response) => {
    if (rejectInvalid(req, res)) return;
    try {
      const schoolId = req.user!.schoolId!;
      const year = await AcademicYear.findOne({ where: { id: req.params.id, schoolId } });
      if (!year) return res.status(404).json({ success: false, error: 'Année scolaire introuvable' });
      if (year.status === 'closed') {
        return res.status(400).json({ success: false, error: 'Une année close ne peut être activée' });
      }

      // Close any other active year
      await AcademicYear.update({ status: 'closed' }, { where: { schoolId, status: 'active' } });

      await year.update({ status: 'active' });

      await logAudit(req, { action: 'activate', entity: 'academic_year', entityId: year.id });

      return res.json({ success: true, data: { academicYear: year } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

// ─── Archive/Unarchive ───
router.post(
  '/:id/archive',
  requireRole('super_admin', 'admin', 'director'),
  requirePermission('academic-years', 'manage'),
  param('id').isUUID().withMessage('Identifiant invalide'),
  async (req: Request, res: Response) => {
    if (rejectInvalid(req, res)) return;
    try {
      const year = await AcademicYear.findOne({ where: { id: req.params.id, schoolId: req.user!.schoolId! } });
      if (!year) return res.status(404).json({ success: false, error: 'Année scolaire introuvable' });
      if (year.status === 'active') {
        return res.status(400).json({ success: false, error: 'Une année active ne peut être archivée' });
      }
      await year.update({ status: 'archived' });
      await logAudit(req, { action: 'archive', entity: 'academic_year', entityId: year.id });
      return res.json({ success: true, data: { academicYear: year } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

router.post(
  '/:id/unarchive',
  requireRole('super_admin', 'admin', 'director'),
  requirePermission('academic-years', 'manage'),
  param('id').isUUID().withMessage('Identifiant invalide'),
  async (req: Request, res: Response) => {
    if (rejectInvalid(req, res)) return;
    try {
      const year = await AcademicYear.findOne({ where: { id: req.params.id, schoolId: req.user!.schoolId! } });
      if (!year) return res.status(404).json({ success: false, error: 'Année scolaire introuvable' });
      if (year.status !== 'archived') {
        return res.status(400).json({ success: false, error: 'Seules les années archivées peuvent être désarchivées' });
      }
      await year.update({ status: 'draft' });
      await logAudit(req, { action: 'unarchive', entity: 'academic_year', entityId: year.id });
      return res.json({ success: true, data: { academicYear: year } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

// ─── Rollover: Prepare next year ───
router.post(
  '/rollover/prepare',
  requireRole('super_admin', 'admin', 'director'),
  requirePermission('academic-years', 'manage'),
  body('targetName').trim().notEmpty().withMessage('Nom de l\'année cible requis'),
  body('sourceYearId').optional().isUUID(),
  body('targetStartDate').optional().isISO8601(),
  body('targetEndDate').optional().isISO8601(),
  body('copyStructure').optional().isBoolean(),
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ success: false, error: errors.array()[0].msg });

      const { targetName, sourceYearId: bodySourceYearId, targetStartDate, targetEndDate, copyStructure } = req.body;
      const schoolId = req.user!.schoolId!;

      const sourceYearId = bodySourceYearId || (await (await import('../models/index.js')).AcademicYear.findOne({
        where: { schoolId, status: 'active' },
        order: [['startDate', 'DESC']],
      }))?.id;

      if (!sourceYearId) {
        return res.status(400).json({ success: false, error: 'Aucune année source trouvée' });
      }

      const sourceYear = await (await import('../models/index.js')).AcademicYear.findByPk(sourceYearId);
      if (!sourceYear) return res.status(404).json({ success: false, error: 'Année source introuvable' });

      const targetStart = targetStartDate ? new Date(targetStartDate) : new Date(new Date().getFullYear() + 1, 8, 1); // Sept 1st next year
      const targetEnd = targetEndDate ? new Date(targetEndDate) : new Date(targetStart.getFullYear() + 1, 7, 31); // July 31st

      if (targetEnd <= targetStart) {
        return res.status(400).json({ success: false, error: 'La date de fin doit être après la date de début' });
      }

      // Check for overlapping
      const overlapping = await (await import('../models/index.js')).AcademicYear.findOne({
        where: {
          schoolId,
          [Op.or]: [
            { startDate: { [Op.between]: [targetStart, targetEnd] } },
            { endDate: { [Op.between]: [targetStart, targetEnd] } },
          ],
        },
      });
      if (overlapping) {
        return res.status(409).json({ success: false, error: 'Une année scolaire chevauche déjà ces dates' });
      }

      const targetYear = await (await import('../models/index.js')).AcademicYear.create({
        schoolId,
        name: targetName,
        startDate: targetStart,
        endDate: targetEnd,
        status: 'draft',
        description: `Rollover de ${sourceYear.name}`,
      });

      // Optionally copy structure (classes, evaluation periods, etc.)
      if (copyStructure) {
        // Copy evaluation periods
        const sourcePeriods = await (await import('../models/index.js')).EvaluationPeriod.findAll({ where: { academicYearId: sourceYear.id } });
        for (const period of sourcePeriods) {
          await (await import('../models/index.js')).EvaluationPeriod.create({
            academicYearId: (await import('../models/index.js')).AcademicYear.findOne({ where: { schoolId, name: targetName } })?.id,
            name: period.name,
            code: period.code,
            startDate: new Date(targetStart.getFullYear(), period.startDate.getMonth(), period.startDate.getDate()),
            endDate: new Date(targetStart.getFullYear(), period.endDate.getMonth(), period.endDate.getDate()),
            position: period.position,
          });
        }
      }

      await logAudit(req, { action: 'rollover_prepare', entity: 'academic_year', entityId: (await import('../models/index.js')).AcademicYear.findOne({ where: { schoolId, name: targetName } })?.id, details: { sourceYear: sourceYear.name, targetName } });

      return res.json({ success: true, data: { message: 'Année cible préparée', targetYearName: targetName } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

// ─── Close academic year (finalize) ───
router.post(
  '/:id/finalize',
  requireRole('super_admin', 'admin', 'director'),
  requirePermission('academic-years', 'manage'),
  param('id').isUUID().withMessage('Identifiant invalide'),
  async (req: Request, res: Response) => {
    if (rejectInvalid(req, res)) return;
    try {
      const year = await (await import('../models/index.js')).AcademicYear.findOne({ where: { id: req.params.id, schoolId: req.user!.schoolId! } });
      if (!year) return res.status(404).json({ success: false, error: 'Année scolaire introuvable' });
      if (year.status !== 'active') {
        return res.status(400).json({ success: false, error: 'Seule une année active peut être finalisée' });
      }

      // Check if all evaluation periods are closed
      const openPeriods = await (await import('../models/index.js')).EvaluationPeriod.count({
        where: { academicYearId: req.params.id, status: 'open' },
      });
      if (openPeriods > 0) {
        return res.status(400).json({ success: false, error: 'Toutes les périodes d\'évaluation doivent être closes avant de finaliser' });
      }

      await (await import('../models/index.js')).AcademicYear.update({ status: 'closed' }, { where: { id: req.params.id } });

      await logAudit(req, { action: 'finalize', entity: 'academic_year', entityId: req.params.id });

      return res.json({ success: true, data: { message: 'Année scolaire finalisée', academicYearId: req.params.id } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

// ─── Delete (soft delete - archive) ───
router.delete(
  '/:id',
  requireRole('super_admin', 'admin', 'director'),
  requirePermission('academic-years', 'manage'),
  param('id').isUUID().withMessage('Identifiant invalide'),
  async (req: Request, res: Response) => {
    if (rejectInvalid(req, res)) return;
    try {
      const year = await AcademicYear.findOne({ where: { id: req.params.id, schoolId: req.user!.schoolId! } });
      if (!year) return res.status(404).json({ success: false, error: 'Année scolaire introuvable' });
      if (year.status === 'active') {
        return res.status(400).json({ success: false, error: 'Une année active ne peut être supprimée' });
      }

      await year.update({ status: 'archived' });

      await logAudit(req, { action: 'delete', entity: 'academic_year', entityId: req.params.id });

      return res.json({ success: true, data: { message: 'Année scolaire archivée' } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

// ─── Stats for dashboard ───
router.get(
  '/stats/summary',
  requireRole('super_admin', 'admin', 'director', 'teacher', 'accountant', 'receptionist'),
  requirePermission('academic-years', 'view'),
  async (req: Request, res: Response) => {
    try {
      const schoolId = req.user!.schoolId!;
      const [total, active, draft, closed, archived] = await Promise.all([
        (await import('../models/index.js')).AcademicYear.count({ where: { schoolId } }),
        (await import('../models/index.js')).AcademicYear.count({ where: { schoolId, status: 'active' } }),
        (await import('../models/index.js')).AcademicYear.count({ where: { schoolId, status: 'draft' } }),
        (await import('../models/index.js')).AcademicYear.count({ where: { schoolId, status: 'closed' } }),
        (await import('../models/index.js')).AcademicYear.count({ where: { schoolId, status: 'archived' } }),
      ]);
      return res.json({
        success: true,
        data: { total, active: active, draft, closed, archived },
      });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

export default router;