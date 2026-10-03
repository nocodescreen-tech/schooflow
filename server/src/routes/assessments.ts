import { Router, Request, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { Op } from 'sequelize';
import { authenticateToken } from '../middleware/auth.js';
import { requireRole, requirePermission } from '../middleware/rbac.js';
import { AppError } from '../middleware/errorHandler.js';
import { Assessment, EvaluationPeriod, Subject, Class, Grade, User, Student } from '../models/index.js';
import { logAudit } from '../middleware/auditLog.js';

const router = Router();
router.use(authenticateToken);

const TEACHER_ROLES = ['super_admin', 'admin', 'director', 'teacher'] as const;
const MANAGE_ROLES = ['super_admin', 'admin', 'director'] as const;

function rejectInvalid(req: Request, res: Response): boolean {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ success: false, error: errors.array()[0].msg });
    return true;
  }
  return false;
}

function canManageAssessment(user: any, assessment: any): boolean {
  if (['super_admin', 'admin', 'director'].includes(user.role)) return true;
  if (user.role === 'teacher' && assessment.teacherId === user.id) return true;
  return false;
}

async function getTeacherScope(userId: string, schoolId: string) {
  const assessments = await Assessment.findAll({
    where: { teacherId: userId, schoolId },
    attributes: ['classId', 'subjectId'],
  });
  const classIds = [...new Set(assessments.map(a => a.classId))];
  const subjectIds = [...new Set(assessments.map(a => a.subjectId))];
  return { classIds, subjectIds };
}

// ─────────────────────────── Read ───────────────────────────

/**
 * GET /assessments — list assessments with filters.
 */
router.get(
  '/',
  requirePermission('assessments', 'view'),
  query('evaluationPeriodId').optional().isUUID(),
  query('subjectId').optional().isUUID(),
  query('classId').optional().isUUID(),
  query('type').optional().isIn(['interrogation', 'examen', 'tp', 'devoir', 'projet', 'oral', 'autre']),
  query('isPublished').optional().isBoolean(),
  async (req: Request, res: Response) => {
    try {
      const schoolId = req.user!.schoolId!;
      const { evaluationPeriodId, subjectId, classId, type, isPublished } = req.query;

      const where: Record<string, unknown> = { schoolId };
      if (evaluationPeriodId) where.evaluationPeriodId = evaluationPeriodId;
      if (subjectId) where.subjectId = subjectId;
      if (classId) where.classId = classId;
      if (type) where.type = type;
      if (isPublished !== undefined) where.isPublished = isPublished === 'true';

      // Teachers only see their own assessments unless admin/director
      if (!['super_admin', 'admin', 'director'].includes(req.user!.role)) {
        where.teacherId = req.user!.id;
      }

      const assessments = await Assessment.findAll({
        where,
        include: [
          { model: EvaluationPeriod, as: 'period', attributes: ['id', 'name'] },
          { model: Subject, as: 'subject', attributes: ['id', 'name'] },
          { model: Class, as: 'class', attributes: ['id', 'name'] },
          { model: User, as: 'teacher', attributes: ['id', 'name'] },
        ],
        order: [['date', 'DESC']],
      });
      return res.json({ success: true, data: assessments });
    } catch (error) {
      if (error instanceof AppError) return res.status(error.statusCode).json({ success: false, error: error.message });
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

/**
 * GET /assessments/:id — get one assessment.
 */
router.get(
  '/:id',
  requirePermission('assessments', 'view'),
  param('id').isUUID().withMessage('Identifiant invalide'),
  async (req: Request, res: Response) => {
    try {
      const schoolId = req.user!.schoolId!;
      const assessment = await Assessment.findOne({
        where: { id: req.params.id, schoolId },
        include: [
          { model: EvaluationPeriod, as: 'period', attributes: ['id', 'name', 'startDate', 'endDate'] },
          { model: Subject, as: 'subject', attributes: ['id', 'name'] },
          { model: Class, as: 'class', attributes: ['id', 'name'] },
          { model: User, as: 'teacher', attributes: ['id', 'name'] },
        ],
      });
      if (!assessment) return res.status(404).json({ success: false, error: 'Évaluation introuvable' });
      if (!canManageAssessment(req.user!, assessment)) {
        return res.status(403).json({ success: false, error: 'Accès refusé' });
      }
      return res.json({ success: true, data: assessment });
    } catch (error) {
      if (error instanceof AppError) return res.status(error.statusCode).json({ success: false, error: error.message });
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

/**
 * POST /assessments — create an assessment.
 */
router.post(
  '/',
  requirePermission('assessments', 'create'),
  body('name').trim().notEmpty().withMessage('Nom requis'),
  body('type').optional().isIn(['interrogation', 'examen', 'tp', 'devoir', 'projet', 'oral', 'autre']),
  body('maxScore').optional().isNumeric().withMessage('Note maximale invalide'),
  body('coefficient').optional().isNumeric().withMessage('Coefficient invalide'),
  body('date').isISO8601().withMessage('Date invalide'),
  body('description').optional().isString(),
  async (req: Request, res: Response) => {
    try {
      const schoolId = req.user!.schoolId!;
      const { name, type, maxScore, coefficient, date, description, evaluationPeriodId, subjectId, classId } = req.body;

      if (!canManageAssessment(req.user!, null)) {
        const { classIds, subjectIds } = await getTeacherScope(req.user!.id, schoolId);
        if ((classId && !classIds.includes(classId)) || (subjectId && !subjectIds.includes(subjectId))) {
          return res.status(403).json({ success: false, error: 'Accès refusé' });
        }
      }

      const assessment = await Assessment.create({
        schoolId,
        name,
        type: type || 'autre',
        maxScore: maxScore ? Number(maxScore) : 20,
        coefficient: coefficient ? Number(coefficient) : 1,
        date: new Date(date),
        description: description || null,
        evaluationPeriodId,
        subjectId,
        classId,
        teacherId: req.user!.id,
        isPublished: false,
      });
      await logAudit(req, { action: 'assessment_created', entity: 'assessment', entityId: assessment.id });
      return res.status(201).json({ success: true, data: assessment });
    } catch (error) {
      if (error instanceof AppError) return res.status(error.statusCode).json({ success: false, error: error.message });
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

/**
 * PUT /assessments/:id — update an assessment.
 */
router.put(
  '/:id',
  requirePermission('assessments', 'update'),
  param('id').isUUID().withMessage('Identifiant invalide'),
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ success: false, error: errors.array()[0].msg });

      const schoolId = req.user!.schoolId!;
      const assessment = await Assessment.findOne({
        where: { id: req.params.id, schoolId },
      });
      if (!assessment) throw new AppError('Évaluation introuvable', 404);

      if (!canManageAssessment(req.user!, assessment)) {
        return res.status(403).json({ success: false, error: 'Accès refusé' });
      }

      const body = req.body as Record<string, unknown>;
      const allowed = ['name', 'type', 'maxScore', 'coefficient', 'date', 'isPublished', 'description'];
      for (const key of allowed) {
        if (body[key] !== undefined) {
          if (key === 'maxScore' || key === 'coefficient') {
            (assessment as any)[key] = Number(body[key]);
          } else {
            (assessment as any)[key] = body[key];
          }
        }
      }
      await assessment.update();

      await logAudit(req, { action: 'assessment_updated', entity: 'assessment', entityId: assessment.id });
      return res.json({ success: true, data: { assessment } });
    } catch (error) {
      if (error instanceof AppError) return res.status(error.statusCode).json({ success: false, error: error.message });
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

/**
 * DELETE /assessments/:id — delete an assessment (and its grades).
 */
router.delete(
  '/:id',
  requirePermission('assessments', 'delete'),
  param('id').isUUID().withMessage('Identifiant invalide'),
  async (req: Request, res: Response) => {
    try {
      const assessment = await Assessment.findOne({
        where: { id: req.params.id, schoolId: req.user!.schoolId! },
      });
      if (!assessment) throw new AppError('Évaluation introuvable', 404);
      if (!canManageAssessment(req.user!, assessment)) {
        return res.status(403).json({ success: false, error: 'Accès refusé' });
      }
      await assessment.destroy();
      await logAudit(req, { action: 'assessment_deleted', entity: 'assessment', entityId: req.params.id });
      return res.json({ success: true, data: { message: 'Évaluation supprimée' } });
    } catch (error) {
      if (error instanceof AppError) return res.status(error.statusCode).json({ success: false, error: error.message });
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

// ─────────────────────────── Grades ───────────────────────────

/**
 * POST /assessments/:id/grades — enter grades for an assessment.
 * Body: { grades: [{ studentId, score, comment }] }
 */
router.post(
  '/:id/grades',
  requirePermission('grades', 'create'),
  param('id').isUUID().withMessage('Identifiant invalide'),
  body('grades').isArray({ min: 1 }).withMessage('Au moins une note requise'),
  body('grades.*.studentId').isUUID().withMessage('studentId requis'),
  body('grades.*.score').isNumeric().withMessage('Note invalide'),
  body('grades.*.comment').optional().isString(),
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ success: false, error: errors.array()[0].msg });

      const assessment = await Assessment.findOne({
        where: { id: req.params.id, schoolId: req.user!.schoolId! },
      });
      if (!assessment) throw new AppError('Évaluation introuvable', 404);

      if (!canManageAssessment(req.user!, assessment)) {
        return res.status(403).json({ success: false, error: 'Accès refusé' });
      }

      const { grades } = req.body;
      const created: Grade[] = [];
      for (const g of grades) {
        const grade = await Grade.create({
          assessmentId: assessment.id,
          studentId: g.studentId,
          score: Number(g.score),
          comment: g.comment || null,
        });
        created.push(grade);
      }
      await logAudit(req, { action: 'grades_created', entity: 'grades', entityId: assessment.id });
      return res.status(201).json({ success: true, data: created });
    } catch (error) {
      if (error instanceof AppError) return res.status(error.statusCode).json({ success: false, error: error.message });
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

/**
 * PUT /assessments/:id/grades — update or delete specific grades.
 * Body: { grades: [{ studentId, score, comment }] } and/or { studentIds: [] }
 */
router.put(
  '/:id/grades',
  requirePermission('grades', 'update'),
  param('id').isUUID().withMessage('Identifiant invalide'),
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ success: false, error: errors.array()[0].msg });

      const assessment = await Assessment.findOne({
        where: { id: req.params.id, schoolId: req.user!.schoolId! },
      });
      if (!assessment) throw new AppError('Évaluation introuvable', 404);

      if (!canManageAssessment(req.user!, assessment)) {
        return res.status(403).json({ success: false, error: 'Accès refusé' });
      }

      const { grades, studentIds } = req.body as { grades?: Array<{ studentId: string; score: string; comment: string }>; studentIds?: string[] };

      if (grades) {
        for (const g of grades) {
          await Grade.update(
            { score: Number(g.score), comment: g.comment || null },
            { where: { assessmentId: assessment.id, studentId: g.studentId } }
          );
        }
      }

      if (studentIds) {
        await Grade.destroy({ where: { assessmentId: assessment.id, studentId: { [Op.in]: studentIds } } });
      }

      await logAudit(req, { action: 'grades_updated', entity: 'grades', entityId: assessment.id });
      return res.json({ success: true, data: { message: 'Notes mises à jour' } });
    } catch (error) {
      if (error instanceof AppError) return res.status(error.statusCode).json({ success: false, error: error.message });
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

/**
 * GET /assessments/:id/grades — get grades for an assessment.
 */
router.get(
  '/:id/grades',
  requirePermission('grades', 'view'),
  param('id').isUUID().withMessage('Identifiant invalide'),
  async (req: Request, res: Response) => {
    try {
      const assessment = await Assessment.findOne({
        where: { id: req.params.id, schoolId: req.user!.schoolId! },
      });
      if (!assessment) throw new AppError('Évaluation introuvable', 404);

      if (!canManageAssessment(req.user!, assessment)) {
        return res.status(403).json({ success: false, error: 'Accès refusé' });
      }

      const grades = await Grade.findAll({
        where: { assessmentId: assessment.id },
        include: [{ model: Student, as: 'studentProfile', attributes: ['id', 'firstName', 'lastName'] }],
      });
      return res.json({ success: true, data: grades });
    } catch (error) {
      if (error instanceof AppError) return res.status(error.statusCode).json({ success: false, error: error.message });
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

export default router;
