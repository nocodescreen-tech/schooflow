import { Router, Request, Response } from 'express';
import { param, query, validationResult } from 'express-validator';
import { Op } from 'sequelize';
import { authenticateToken } from '../middleware/auth.js';
import { requireRole, requirePermission } from '../middleware/rbac.js';
import { AppError } from '../middleware/errorHandler.js';
import { Student, Class, Subject, AcademicYear, School } from '../models/index.js';
import { computePeriodAverage, computeClassStats, computeClassRanking, resolvePeriod } from '../services/AcademicEngine.js';
import { logAudit } from '../middleware/auditLog.js';

const router = Router();
router.use(authenticateToken);

const READ_ROLES = ['super_admin', 'admin', 'director', 'teacher', 'accountant', 'receptionist'] as const;
const MANAGE_ROLES = ['super_admin', 'admin', 'director'] as const;

function rejectInvalid(req: Request, res: Response): boolean {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ success: false, error: errors.array()[0].msg });
    return true;
  }
  return false;
}


/**
 * GET /academic/averages/student/:studentId — student's averages for a period.
 */
router.get(
  '/averages/student/:studentId',
  requirePermission('grades', 'view'),
  param('studentId').isUUID().withMessage('Identifiant élève invalide'),
  query('periodId').optional().isUUID(),
  query('subjectId').optional().isUUID(),
  async (req: Request, res: Response) => {
    try {
      if (rejectInvalid(req, res)) return;
            const { Student, EvaluationPeriod } = await import('../models/index.js');

      const student = await (await import('../models/index.js')).Student.findOne({
        where: { id: req.params.studentId, schoolId: req.user!.schoolId! },
      });
      if (!student) throw new (await import('../middleware/errorHandler.js')).AppError('Élève introuvable', 404);

      // Teachers can only see their own students unless admin/director
      if (!['super_admin', 'admin', 'director'].includes(req.user!.role)) {
        // Teacher scope: check if teacher is assigned to the student's class
        const { Class } = await import('../models/index.js');
        const teacherClasses = await Class.findAll({
          where: { teacherId: req.user!.id, schoolId: req.user!.schoolId! },
          attributes: ['id'],
        });
        const teacherClassIds = teacherClasses.map(c => c.id);
        if (!student.classId || !teacherClassIds.includes(student.classId)) {
          return res.status(403).json({ success: false, error: 'Accès refusé' });
        }
      }

      const period = await resolvePeriod(req.user!.schoolId!, req.query.periodId as string | undefined);
      if (!period) throw new (await import('../middleware/errorHandler.js')).AppError('Aucune période active', 400);

      const result = await computePeriodAverage(student.id, period.id, req.user!.schoolId!);
      return res.json({ success: true, data: { ...result, period: { id: period.id, name: period.name } } });
    } catch (error) {
      if (error instanceof AppError) return res.status(error.statusCode).json({ success: false, error: error.message });
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

/**
 * GET /academic/averages/class/:classId — class averages for a period.
 */
router.get(
  '/averages/class/:classId',
  requirePermission('grades', 'view'),
  param('classId').isUUID().withMessage('Identifiant classe invalide'),
  query('periodId').optional().isUUID(),
  async (req: Request, res: Response) => {
    try {
      if (rejectInvalid(req, res)) return;
      
      const cls = await (await import('../models/index.js')).Class.findOne({
        where: { id: req.params.classId, schoolId: req.user!.schoolId! },
      });
      if (!cls) throw new (await import('../middleware/errorHandler.js')).AppError('Classe introuvable', 404);

      const period = await resolvePeriod(req.user!.schoolId!, req.query.periodId as string | undefined);
      if (!period) throw new (await import('../middleware/errorHandler.js')).AppError('Aucune période active', 400);

      const stats = await computeClassStats(period.id, cls.id, req.user!.schoolId!);
      return res.json({ success: true, data: { ...stats, period: { id: period.id, name: period.name } } });
    } catch (error) {
      if (error instanceof AppError) return res.status(error.statusCode).json({ success: false, error: error.message });
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

/**
 * GET /academic/ranking/class/:classId — class ranking for a period.
 */
router.get(
  '/ranking/class/:classId',
  requirePermission('grades', 'view'),
  param('classId').isUUID().withMessage('Identifiant classe invalide'),
  query('periodId').optional().isUUID(),
  async (req: Request, res: Response) => {
    try {
      if (rejectInvalid(req, res)) return;
      
      const cls = await (await import('../models/index.js')).Class.findOne({
        where: { id: req.params.classId, schoolId: req.user!.schoolId! },
      });
      if (!cls) throw new (await import('../middleware/errorHandler.js')).AppError('Classe introuvable', 404);

      const period = await resolvePeriod(req.user!.schoolId!, req.query.periodId as string | undefined);
      if (!period) throw new (await import('../middleware/errorHandler.js')).AppError('Aucune période active', 400);

      const ranking = await computeClassRanking(period.id, cls.id, req.user!.schoolId!);
      return res.json({ success: true, data: { ranking, period: { id: period.id, name: period.name } } });
    } catch (error) {
      if (error instanceof AppError) return res.status(error.statusCode).json({ success: false, error: error.message });
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

/**
 * GET /academic/ranking/subject/:subjectId — subject ranking for a class/period.
 */
router.get(
  '/ranking/subject/:subjectId',
  requirePermission('grades', 'view'),
  param('subjectId').isUUID().withMessage('Identifiant matière invalide'),
  query('classId').isUUID().withMessage('Classe requise'),
  query('periodId').optional().isUUID(),
  async (req: Request, res: Response) => {
    try {
      if (rejectInvalid(req, res)) return;
      
      const subj = await (await import('../models/index.js')).Subject.findOne({
        where: { id: req.params.subjectId, schoolId: req.user!.schoolId! },
      });
      if (!subj) throw new (await import('../middleware/errorHandler.js')).AppError('Matière introuvable', 404);

      const period = await resolvePeriod(req.user!.schoolId!, req.query.periodId as string | undefined);
      if (!period) throw new (await import('../middleware/errorHandler.js')).AppError('Aucune période active', 400);

      const cls = await (await import('../models/index.js')).Class.findOne({
        where: { id: req.query.classId, schoolId: req.user!.schoolId! },
      });
      if (!cls) throw new (await import('../middleware/errorHandler.js')).AppError('Classe introuvable', 404);

      const subjectResults = await (await import('../services/AcademicEngine.js')).computeSubjectAverage(
        '', // studentId - we'll get all students in class
        subj.id,
        period.id,
        req.user!.schoolId!,
        { missingPolicy: 'ignore' }
      );

      // Actually, we need to compute for each student in the class
      const { Student } = await import('../models/index.js');
      const students = await (await import('../models/index.js')).Student.findAll({
        where: { classId: req.query.classId, schoolId: req.user!.schoolId!, status: 'active' },
        attributes: ['id', 'firstName', 'lastName', 'studentId'],
      });

      const results = [];
      for (const s of students) {
        const avg = await (await import('../services/AcademicEngine.js')).computeSubjectAverage(s.id, req.params.subjectId, period.id, req.user!.schoolId!, { missingPolicy: 'ignore' });
        results.push({ studentId: s.id, studentName: `${s.firstName} ${s.lastName}`, studentNumber: s.studentId, ...avg });
      }

      results.sort((a, b) => b.weightedAverage - a.weightedAverage);
      let rank = 1;
      for (let i = 0; i < results.length; i++) {
        if (i > 0 && results[i].weightedAverage !== results[i - 1].weightedAverage) rank = i + 1;
        results[i] = { ...results[i], rank };
      }

      return res.json({ success: true, data: { ranking: results, subject: { id: subj.id, name: subj.name }, period: { id: period.id, name: period.name } } });
    } catch (error) {
      if (error instanceof AppError) return res.status(error.statusCode).json({ success: false, error: error.message });
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

/**
 * GET /academic/class-stats/:classId — class statistics for a period.
 */
router.get(
  '/class-stats/:classId',
  requirePermission('grades', 'view'),
  param('classId').isUUID().withMessage('Identifiant classe invalide'),
  query('periodId').optional().isUUID(),
  async (req: Request, res: Response) => {
    try {
      if (rejectInvalid(req, res)) return;
      
      const cls = await (await import('../models/index.js')).Class.findOne({
        where: { id: req.params.classId, schoolId: req.user!.schoolId! },
      });
      if (!cls) throw new (await import('../middleware/errorHandler.js')).AppError('Classe introuvable', 404);

      const period = await resolvePeriod(req.user!.schoolId!, req.query.periodId as string | undefined);
      if (!period) throw new (await import('../middleware/errorHandler.js')).AppError('Aucune période active', 400);

      const stats = await computeClassStats(period.id, cls.id, req.user!.schoolId!);
      return res.json({ success: true, data: { ...stats, period: { id: period.id, name: period.name } } });
    } catch (error) {
      if (error instanceof AppError) return res.status(error.statusCode).json({ success: false, error: error.message });
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

/**
 * GET /academic/overview/:periodId — year-wide promotion/grade statistics.
 */
router.get(
  '/overview/:periodId',
  requirePermission('grades', 'view'),
  param('periodId').isUUID().withMessage('Identifiant période invalide'),
  async (req: Request, res: Response) => {
    try {
      const schoolId = req.user!.schoolId!;
      const period = await (await import('../models/index.js')).EvaluationPeriod.findOne({
        where: { id: req.params.periodId, schoolId },
      });
      if (!period) throw new (await import('../middleware/errorHandler.js')).AppError('Période introuvable', 404);

            const stats = await computeClassStats(req.params.periodId, '', schoolId); // placeholder

      // Simplified overview - could be enhanced
      const { Student, Class } = await import('../models/index.js');
      const activeStudents = await Student.count({ where: { schoolId, status: 'active' } });
      const activeClasses = await Class.count({ where: { schoolId, academicYear: period.name } });

      return res.json({
        success: true,
        data: {
          period: { id: period.id, name: period.name },
          activeStudents,
          activeClasses,
          // Add more overview stats as needed
        },
      });
    } catch (error) {
      if (error instanceof AppError) return res.status(error.statusCode).json({ success: false, error: error.message });
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

export { AppError } from '../middleware/errorHandler.js';
export default router;