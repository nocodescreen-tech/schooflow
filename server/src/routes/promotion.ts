import { Router, Request, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { authenticateToken } from '../middleware/auth.js';
import { requireRole, requirePermission } from '../middleware/rbac.js';
import { AppError } from '../middleware/errorHandler.js';
import { logAudit } from '../middleware/auditLog.js';
import { Class, AcademicYear, Student, PromotionDecision, School } from '../models/index.js';
import {
  buildDeliberationSheet, recordDecision, applyDecisions, prepareRollover,
  closeYear, listDecisions, resolveSourceYear, DECISION_LABELS,
} from '../services/PromotionService.js';
import { requireModule } from '../utils/modules.js';

const router = Router();
router.use(authenticateToken);
router.use(requireModule('promotion'));

const MANAGE_ROLES = ['super_admin', 'admin', 'director'] as const;
const uuid = (n: string) => param(n).isUUID().withMessage('Identifiant invalide');

function rejectInvalid(req: Request, res: Response): boolean {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ success: false, error: errors.array()[0].msg });
    return true;
  }
  return false;
}

// ─────────────────────────── Délibération ───────────────────────────

/**
 * GET /sheet — the deliberation board for a class.
 * Real computed results (averages, ranks, mentions) + any decision already
 * recorded. Nothing is written by this call.
 */
router.get('/sheet', requirePermission('promotion', 'view'),
  query('classId').isUUID().withMessage('classId requis'),
  query('academicYearId').optional().isUUID(),
  query('autoDecide').optional().isIn(['true', 'false']),
  async (req: Request, res: Response) => {
    try {
      if (rejectInvalid(req, res)) return;
      const sheet = await buildDeliberationSheet(req.user!.schoolId!, req.query.classId as string, {
        academicYearId: req.query.academicYearId as string | undefined,
        autoDecide: req.query.autoDecide === 'true',
      });
      return res.json({ success: true, data: sheet });
    } catch (error) {
      if (error instanceof AppError) return res.status(error.statusCode).json({ success: false, error: error.message });
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

/** GET /classes — classes that can be deliberated for the given year. */
router.get('/classes', requirePermission('promotion', 'view'),
  query('academicYearId').optional().isUUID(),
  async (req: Request, res: Response) => {
    try {
      const schoolId = req.user!.schoolId!;
      // A school with no year yet is a normal state: return an empty list so
      // the page can prompt for setup instead of erroring.
      let year: AcademicYear | null = null;
      try {
        year = await resolveSourceYear(schoolId, req.query.academicYearId as string | undefined);
      } catch (e) {
        if (!(e instanceof AppError)) throw e;
        return res.json({ success: true, data: { items: [], academicYear: null, needsSetup: true } });
      }

      const classes = await Class.findAll({
        where: { schoolId, academicYear: year.name },
        attributes: ['id', 'name', 'level', 'section'],
        order: [['name', 'ASC']],
      });
      // Attach the live headcount so the school knows which classes matter.
      const items = await Promise.all(
        classes.map(async (c) => {
          const total = await Student.count({ where: { schoolId, classId: c.id, status: 'active' } });
          return { ...c.get(), studentCount: total };
        })
      );
      return res.json({ success: true, data: { items, academicYear: { id: year.id, name: year.name, status: year.status }, needsSetup: false } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

/** GET /decisions — the decision history for a year. */
router.get('/decisions', requirePermission('promotion', 'view'),
  query('academicYearId').optional().isUUID(),
  async (req: Request, res: Response) => {
    try {
      const schoolId = req.user!.schoolId!;
      let year: AcademicYear | null = null;
      try {
        year = await resolveSourceYear(schoolId, req.query.academicYearId as string | undefined);
      } catch (e) {
        if (!(e instanceof AppError)) throw e;
        return res.json({ success: true, data: { items: [], academicYear: null, needsSetup: true } });
      }
      const decisions = await listDecisions(schoolId, year.id);
      return res.json({ success: true, data: { items: decisions, academicYear: { id: year.id, name: year.name }, needsSetup: false } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

/** POST /decisions — record one decision. Audited. */
router.post('/decisions', requireRole(...MANAGE_ROLES), requirePermission('promotion', 'manage'),
  body('studentId').isUUID().withMessage('Élève invalide'),
  body('decision').isIn(Object.keys(DECISION_LABELS)).withMessage('Décision invalide'),
  body('toClassId').optional().isUUID(),
  body('catchUp').optional().isBoolean(),
  body('notes').optional().trim(),
  body('academicYearId').optional().isUUID(),
  async (req: Request, res: Response) => {
    try {
      if (rejectInvalid(req, res)) return;
      const schoolId = req.user!.schoolId!;
      const bodyIn = req.body as {
        studentId: string; decision: keyof typeof DECISION_LABELS;
        toClassId?: string; catchUp?: boolean; notes?: string; academicYearId?: string;
      };
      const year = await resolveSourceYear(schoolId, bodyIn.academicYearId);
      const decision = await recordDecision(schoolId, year.id, {
        studentId: bodyIn.studentId,
        decision: bodyIn.decision,
        toClassId: bodyIn.toClassId ?? null,
        catchUp: bodyIn.catchUp,
        notes: bodyIn.notes ?? null,
      }, req.user!.id);
      await logAudit(req, { action: 'promotion_decision', entity: 'promotion_decision', entityId: decision.id, details: { decision: bodyIn.decision, studentId: bodyIn.studentId } });
      return res.status(201).json({ success: true, data: { decision } });
    } catch (error) {
      if (error instanceof AppError) return res.status(error.statusCode).json({ success: false, error: error.message });
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

/** POST /decisions/bulk — record several decisions in one call. */
router.post('/decisions/bulk', requireRole(...MANAGE_ROLES), requirePermission('promotion', 'manage'),
  body('items').isArray().withMessage('items doit être un tableau'),
  async (req: Request, res: Response) => {
    try {
      if (rejectInvalid(req, res)) return;
      const schoolId = req.user!.schoolId!;
      const year = await resolveSourceYear(schoolId);
      const items = (req.body as { items: Array<{ studentId: string; decision: string; toClassId?: string; catchUp?: boolean; notes?: string }> }).items;
      const results: Array<{ studentId: string; ok: boolean; error?: string }> = [];
      for (const item of items) {
        try {
          if (!(item.decision in DECISION_LABELS)) throw new Error('Décision invalide');
          await recordDecision(schoolId, year.id, {
            studentId: item.studentId,
            decision: item.decision as keyof typeof DECISION_LABELS,
            toClassId: item.toClassId ?? null,
            catchUp: item.catchUp,
            notes: item.notes ?? null,
          }, req.user!.id);
          results.push({ studentId: item.studentId, ok: true });
        } catch (err) {
          results.push({ studentId: item.studentId, ok: false, error: (err as Error).message });
        }
      }
      await logAudit(req, { action: 'promotion_decisions_bulk', entity: 'academic_year', entityId: year.id, details: { count: items.length } });
      const ok = results.filter((r) => r.ok).length;
      return res.json({ success: true, data: { results, saved: ok, failed: results.length - ok } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

/** POST /apply — apply the confirmed decisions. This mutates students. */
router.post('/apply', requireRole(...MANAGE_ROLES), requirePermission('promotion', 'manage'),
  body('academicYearId').optional().isUUID(),
  async (req: Request, res: Response) => {
    try {
      if (rejectInvalid(req, res)) return;
      const schoolId = req.user!.schoolId!;
      const year = await resolveSourceYear(schoolId, (req.body as { academicYearId?: string }).academicYearId);
      const result = await applyDecisions(schoolId, year.id, req.user!.id);
      await logAudit(req, { action: 'promotions_applied', entity: 'academic_year', entityId: year.id, details: { ...result } });
      return res.json({ success: true, data: result });
    } catch (error) {
      if (error instanceof AppError) return res.status(error.statusCode).json({ success: false, error: error.message });
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

// ─────────────────────────── Préparation de l'année suivante ───────────────────────────

/** POST /rollover/prepare — create the next year + copy the class structure. */
router.post('/rollover/prepare', requireRole(...MANAGE_ROLES), requirePermission('promotion', 'manage'),
  body('targetYearName').trim().notEmpty().withMessage('Nom de l’année cible requis'),
  body('sourceYearId').optional().isUUID(),
  body('targetStartDate').optional().isISO8601(),
  body('targetEndDate').optional().isISO8601(),
  async (req: Request, res: Response) => {
    try {
      if (rejectInvalid(req, res)) return;
      const schoolId = req.user!.schoolId!;
      const bodyIn = req.body as Record<string, string | undefined>;
      const source = await resolveSourceYear(schoolId, bodyIn.sourceYearId);
      const result = await prepareRollover({
        schoolId,
        sourceYearId: source.id,
        targetYearName: bodyIn.targetYearName!,
        targetStartDate: bodyIn.targetStartDate ? new Date(bodyIn.targetStartDate) : undefined,
        targetEndDate: bodyIn.targetEndDate ? new Date(bodyIn.targetEndDate) : undefined,
        actorId: req.user!.id,
        createYearIfMissing: true,
      });
      await logAudit(req, { action: 'rollover_prepared', entity: 'academic_year', entityId: result.targetYearId, details: { from: source.name, to: result.targetYearName } });
      return res.json({ success: true, data: result });
    } catch (error) {
      if (error instanceof AppError) return res.status(error.statusCode).json({ success: false, error: error.message });
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

/** POST /rollover/close — close the year and activate the next one. */
router.post('/rollover/close', requireRole(...MANAGE_ROLES), requirePermission('promotion', 'manage'),
  body('sourceYearId').isUUID().withMessage('sourceYearId requis'),
  body('targetYearId').isUUID().withMessage('targetYearId requis'),
  body('allowUndecided').optional().isBoolean(),
  async (req: Request, res: Response) => {
    try {
      if (rejectInvalid(req, res)) return;
      const schoolId = req.user!.schoolId!;
      const bodyIn = req.body as { sourceYearId: string; targetYearId: string; allowUndecided?: boolean };
      const result = await closeYear(schoolId, bodyIn.sourceYearId, bodyIn.targetYearId, { allowUndecided: bodyIn.allowUndecided });
      await logAudit(req, { action: 'year_closed', entity: 'academic_year', entityId: bodyIn.sourceYearId, details: { activated: bodyIn.targetYearId } });
      return res.json({ success: true, data: result });
    } catch (error) {
      if (error instanceof AppError) return res.status(error.statusCode).json({ success: false, error: error.message });
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

// ─────────────────────────── Vue d'ensemble ───────────────────────────

/** GET /overview — year-wide promotion statistics. */
router.get('/overview', requirePermission('promotion', 'view'),
  query('academicYearId').optional().isUUID(),
  async (req: Request, res: Response) => {
    try {
      const schoolId = req.user!.schoolId!;
      const school = await School.findByPk(schoolId, { attributes: ['name'] });
      let year: AcademicYear | null = null;
      try {
        year = await resolveSourceYear(schoolId, req.query.academicYearId as string | undefined);
      } catch (e) {
        // No academic year yet is a normal state for a fresh school, not an
        // error: return an empty overview the UI can render.
        if (!(e instanceof AppError)) throw e;
        const activeStudents = await Student.count({ where: { schoolId, status: 'active' } });
        return res.json({
          success: true,
          data: {
            school: { name: school?.name ?? null },
            academicYear: null,
            needsSetup: true,
            total: 0, promoted: 0, repeated: 0, transferred: 0, excluded: 0, pending: 0,
            activeStudents,
            decisionsRatio: 0,
          },
        });
      }

      const [total, promoted, repeated, transferred, excluded, pending] = await Promise.all([
        PromotionDecision.count({ where: { schoolId, academicYearId: year.id } }),
        PromotionDecision.count({ where: { schoolId, academicYearId: year.id, decision: 'PROMU' } }),
        PromotionDecision.count({ where: { schoolId, academicYearId: year.id, decision: 'REDOUBLE' } }),
        PromotionDecision.count({ where: { schoolId, academicYearId: year.id, decision: 'TRANSFERE' } }),
        PromotionDecision.count({ where: { schoolId, academicYearId: year.id, decision: 'EXCLU' } }),
        PromotionDecision.count({ where: { schoolId, academicYearId: year.id, decision: 'A_DELIBERER' } }),
      ]);
      const activeStudents = await Student.count({ where: { schoolId, status: 'active' } });
      return res.json({
        success: true,
        data: {
          school: { name: school?.name ?? null },
          academicYear: { id: year.id, name: year.name, status: year.status },
          needsSetup: false,
          total, promoted, repeated, transferred, excluded, pending,
          activeStudents,
          decisionsRatio: activeStudents > 0 ? Math.round((total / activeStudents) * 100) : 0,
        },
      });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

export default router;
