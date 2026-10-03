import { Router, Request, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { Op } from 'sequelize';
import sequelize from '../config/database.js';
import { authenticateToken } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { assertTeacherScope } from '../middleware/rbac.js';
import { AppError } from '../middleware/errorHandler.js';
import { logAudit } from '../middleware/auditLog.js';
import {
  EvaluationPeriod, Assessment, Grade, GradingConfig, AcademicYear, Subject, Class, Student, Cycle, Niveau,
} from '../models/index.js';
import {
  combinePeriodAverages, mentionFor, applyRounding, DEFAULT_RULES, type StudentResult,
  computeStudentResults, resolveGradingRules, ensureGradingConfig, getActiveYear,
} from '../services/AcademicEngine.js';
import { requireModule } from '../utils/modules.js';

const router = Router();
router.use(authenticateToken);
router.use(requireModule('academic-core'));

const uuid = (name: string) => param(name).isUUID().withMessage('Identifiant invalide');

function rejectInvalid(req: Request, res: Response): boolean {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ success: false, error: errors.array()[0].msg });
    return true;
  }
  return false;
}

// ─── Périodes d'évaluation ───

router.get('/periods', requirePermission('grades', 'view'), async (req: Request, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!;
    const yearId = (req.query.academicYearId as string) || undefined;
    const items = await EvaluationPeriod.findAll({
      where: { schoolId, ...(yearId ? { academicYearId: yearId } : {}) },
      order: [['academicYearId', 'ASC'], ['sequence', 'ASC']],
    });
    return res.json({ success: true, data: { items } });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.post('/periods', requirePermission('grades', 'create'),
  body('academicYearId').isUUID().withMessage('academicYearId requis'),
  body('name').trim().notEmpty().withMessage('Nom requis'),
  body('periodType').optional().isIn(['trimester', 'semester', 'session', 'custom']),
  body('sequence').optional().isInt({ min: 1 }),
  async (req: Request, res: Response) => {
    try {
      if (rejectInvalid(req, res)) return;
      const schoolId = req.user!.schoolId!;
      const { academicYearId, name, periodType, sequence, startDate, endDate } = req.body as Record<string, unknown>;
      const year = await AcademicYear.findOne({ where: { id: academicYearId, schoolId } });
      if (!year) return res.status(404).json({ success: false, error: 'Année scolaire introuvable' });
      const count = await EvaluationPeriod.count({ where: { academicYearId } });
      const row = await EvaluationPeriod.create({
        schoolId, academicYearId, name, periodType: periodType ?? 'trimester',
        sequence: sequence ?? count + 1,
        startDate: startDate ? new Date(String(startDate)) : null,
        endDate: endDate ? new Date(String(endDate)) : null,
      });
      await logAudit(req, { action: 'period_created', entity: 'evaluation_period', entityId: row.id, details: { name } });
      return res.status(201).json({ success: true, data: { period: row } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

router.post('/periods/:id/close', requirePermission('grades', 'validate'),
  uuid('id'),
  async (req: Request, res: Response) => {
    try {
      if (rejectInvalid(req, res)) return;
      const period = await EvaluationPeriod.findOne({ where: { id: req.params.id, schoolId: req.user!.schoolId } });
      if (!period) return res.status(404).json({ success: false, error: 'Période introuvable' });
      if (period.status !== 'open') return res.status(400).json({ success: false, error: 'Période déjà clôturée' });
      await period.update({ status: 'closed', closedAt: new Date(), closedBy: req.user!.id });
      await logAudit(req, { action: 'period_closed', entity: 'evaluation_period', entityId: period.id, details: { name: period.name } });
      return res.json({ success: true, data: { period } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

router.post('/periods/:id/reopen', requirePermission('grades', 'validate'),
  uuid('id'),
  async (req: Request, res: Response) => {
    try {
      if (rejectInvalid(req, res)) return;
      const period = await EvaluationPeriod.findOne({ where: { id: req.params.id, schoolId: req.user!.schoolId } });
      if (!period) return res.status(404).json({ success: false, error: 'Période introuvable' });
      await period.update({ status: 'open', closedAt: null, closedBy: null });
      await logAudit(req, { action: 'period_reopened', entity: 'evaluation_period', entityId: period.id });
      return res.json({ success: true, data: { period } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

// ─── Évaluations ───

router.get('/assessments', requirePermission('grades', 'view'), async (req: Request, res: Response) => {
  try {
    const where: Record<string | symbol, unknown> = { schoolId: req.user!.schoolId! };
    if (req.query.subjectId) where.subjectId = req.query.subjectId;
    if (req.query.classId) where.classId = req.query.classId;
    if (req.query.periodId) where.periodId = req.query.periodId;
    if (req.query.academicYearId) where.academicYearId = req.query.academicYearId;
    const items = await Assessment.findAll({
      where,
      include: [
        { model: Subject, as: 'subject', attributes: ['id', 'name'] },
        { model: Class, as: 'class', attributes: ['id', 'name'] },
        { model: EvaluationPeriod, as: 'period', attributes: ['id', 'name'] },
      ],
      order: [['date', 'DESC']],
    });
    return res.json({ success: true, data: { items } });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.post('/assessments', requirePermission('grades', 'create'),
  body('subjectId').isUUID().withMessage('subjectId requis'),
  body('name').trim().notEmpty().withMessage('Nom requis'),
  body('maxScore').isFloat({ gt: 0 }).withMessage('Bareme invalide'),
  body('coefficient').optional().isFloat({ gt: 0 }),
  body('classId').optional().isUUID(),
  body('periodId').optional().isUUID(),
  body('assessmentType').optional().isIn(['interrogation', 'exam', 'tp', 'assignment', 'oral', 'catch_up']),
  async (req: Request, res: Response) => {
    try {
      if (rejectInvalid(req, res)) return;
      const { subjectId, classId, name, assessmentType, maxScore, coefficient, periodId, date } = req.body as Record<string, unknown>;
      const subject = await Subject.findOne({ where: { id: subjectId, schoolId: req.user!.schoolId! } });
      if (!subject) return res.status(404).json({ success: false, error: 'Matière introuvable' });
      if (classId) await assertTeacherScope(req, classId as string, subjectId as string);
      let yearId = (req.body as { academicYearId?: string }).academicYearId;
      if (!yearId) {
        if (periodId) {
          const period = await EvaluationPeriod.findOne({ where: { id: periodId, schoolId: req.user!.schoolId! } });
          if (period) yearId = period.academicYearId;
        }
        if (!yearId) {
          const year = await getActiveYear(req.user!.schoolId!);
          if (year) yearId = year.id;
        }
      }
      if (!yearId) return res.status(400).json({ success: false, error: 'Aucune année scolaire active' });
      const row = await Assessment.create({
        schoolId: req.user!.schoolId!, subjectId, classId: classId ?? null,
        name, maxScore, coefficient: coefficient ?? 1, assessmentType, periodId, date: date ? new Date(String(date)) : new Date(),
        academicYearId: yearId, status: 'DRAFT',
      });
      await logAudit(req, { action: 'assessment_created', entity: 'assessment', entityId: row.id, details: { name, maxScore } });
      return res.status(201).json({ success: true, data: { assessment: row } });
    } catch (error) {
      if (error instanceof AppError) return res.status(error.statusCode).json({ success: false, error: error.message });
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

router.post('/assessments/:id/publish', requirePermission('grades', 'publish'),
  uuid('id'),
  async (req: Request, res: Response) => {
    try {
      if (rejectInvalid(req, res)) return;
      const row = await Assessment.findOne({ where: { id: req.params.id, schoolId: req.user!.schoolId! } });
      if (!row) return res.status(404).json({ success: false, error: 'Évaluation introuvable' });
      await row.update({ status: 'published' });
      await Grade.update({ status: 'PUBLISHED' }, { where: { assessmentId: row.id, status: 'VALIDATED' } });
      await logAudit(req, { action: 'assessment_published', entity: 'assessment', entityId: row.id, details: { name: row.name } });
      return res.json({ success: true, data: { assessment: row } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

router.post('/assessments/:id/grades', requirePermission('grades', 'create'),
  uuid('id'),
  body('entries').isArray().withMessage('entries doit être un tableau'),
  async (req: Request, res: Response) => {
    try {
      if (rejectInvalid(req, res)) return;
      const schoolId = req.user!.schoolId!;
      const assessment = await Assessment.findOne({ where: { id: req.params.id, schoolId } });
      if (!assessment) return res.status(404).json({ success: false, error: 'Évaluation introuvable' });
      if (assessment.classId) await assertTeacherScope(req, assessment.classId, assessment.subjectId);

      const period = assessment.periodId
        ? await EvaluationPeriod.findOne({ where: { id: assessment.periodId } })
        : null;
      if (period && period.status !== 'open') {
        return res.status(400).json({ success: false, error: `La période « ${period.name} » est clôturée` });
      }

      const entries = (req.body as { entries: Array<{ studentId: string; score?: number | null; absence?: boolean; remark?: string }> }).entries;
      const max = Number(assessment.maxScore);

      for (const e of entries) {
        if (e.absence) continue;
        if (e.score === undefined || e.score === null) continue;
        if (typeof e.score !== 'number' || Number.isNaN(e.score)) {
          return res.status(400).json({ success: false, error: `Note invalide pour l'élève ${e.studentId}` });
        }
        if (e.score < 0 || e.score > max) {
          return res.status(400).json({ success: false, error: `La note ${e.score} dépasse le barème (/${max})` });
        }
      }

      // Students must belong to the same school.
      const studentIds = entries.map((e) => e.studentId);
      const validStudents = await Student.findAll({ where: { id: { [Op.in]: studentIds }, schoolId }, attributes: ['id'] });
      const validIds = new Set(validStudents.map((s) => s.id));
      const rejected = studentIds.filter((id) => !validIds.has(id));
      if (rejected.length) {
        return res.status(400).json({ success: false, error: 'Élève introuvable dans cet établissement' });
      }

      const saved = await sequelize.transaction(async (t) => {
        let count = 0;
        for (const e of entries) {
          const payload = {
            schoolId,
            studentId: e.studentId,
            subjectId: assessment.subjectId,
            examType: assessment.assessmentType,
            examName: assessment.name,
            score: e.absence ? 0 : e.score ?? 0,
            coefficient: Number(assessment.coefficient),
            term: 1,
            status: 'DRAFT',
            academicYearId: assessment.academicYearId,
            assessmentId: assessment.id,
            periodId: assessment.periodId,
            max,
            absence: e.absence ?? false,
            remark: e.remark ?? null,
            date: assessment.date ?? new Date(),
          };
          const existing = await Grade.findOne({
            where: { assessmentId: assessment.id, studentId: e.studentId },
            transaction: t,
          });
          if (existing) {
            await existing.update(payload, { transaction: t });
          } else {
            await Grade.create(payload, { transaction: t });
          }
          count += 1;
        }
        return count;
      });

      await logAudit(req, { action: 'grades_saved', entity: 'assessment', entityId: assessment.id, details: { saved } });
      return res.json({ success: true, data: { saved, assessmentId: assessment.id } });
    } catch (error) {
      if (error instanceof AppError) return res.status(error.statusCode).json({ success: false, error: error.message });
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

router.get('/assessments/:id/grades', requirePermission('grades', 'view'), uuid('id'), async (req: Request, res: Response) => {
  try {
    if (rejectInvalid(req, res)) return;
    const assessment = await Assessment.findOne({ where: { id: req.params.id, schoolId: req.user!.schoolId } });
    if (!assessment) return res.status(404).json({ success: false, error: 'Évaluation introuvable' });
    const items = await Grade.findAll({
      where: { assessmentId: assessment.id },
      include: [{ model: Student, as: 'student', attributes: ['id', 'firstName', 'lastName', 'studentId'] }],
    });
    return res.json({ success: true, data: { items, maxScore: assessment.maxScore } });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// ─── Résultats élèves ───

router.get('/results', requirePermission('grades', 'view'),
  query('classId').optional().isUUID(),
  query('periodId').optional().isUUID(),
  query('academicYearId').optional().isUUID(),
  async (req: Request, res: Response) => {
    try {
      if (rejectInvalid(req, res)) return;
      const schoolId = req.user!.schoolId!;
      const { classId, periodId, academicYearId } = req.query as Record<string, string | undefined>;

      const yearId = academicYearId ?? (await getActiveYear(schoolId))?.id;
      if (!yearId) return res.status(400).json({ success: false, error: 'Aucune année scolaire active' });

      const results = await computeStudentResults({ schoolId, academicYearId: yearId, periodId: periodId ?? null, classId: classId ?? null });

      const rules = await resolveGradingRules(schoolId);
      return res.json({
        success: true,
        data: {
          results,
          total: results.length,
          rules,
          periodId: periodId ?? null,
          academicYearId: yearId,
        },
      });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

/** Statistics for a class: best/worst average, pass rate, class average. */
router.get('/results/stats', requirePermission('grades', 'view'),
  query('classId').isUUID().withMessage('classId requis'),
  query('periodId').optional().isUUID(),
  query('academicYearId').optional().isUUID(),
  async (req: Request, res: Response) => {
    try {
      if (rejectInvalid(req, res)) return;
      const schoolId = req.user!.schoolId!;
      const { classId, periodId, academicYearId } = req.query as Record<string, string>;
      const yearId = academicYearId ?? (await getActiveYear(schoolId))?.id;
      if (!yearId) return res.status(400).json({ success: false, error: 'Aucune année scolaire active' });

      const results = await computeStudentResults({ schoolId, academicYearId: yearId, periodId: periodId ?? null, classId });
      const rules = await resolveGradingRules(schoolId);
      if (results.length === 0) {
        return res.json({ success: true, data: { total: 0, classAverage: 0, passRate: 0, best: null, worst: null, rules } });
      }
      const averages = results.map((r) => r.average);
      const passed = results.filter((r) => r.passed).length;
      return res.json({
        success: true,
        data: {
          total: results.length,
          classAverage: applyRounding(averages.reduce((a, b) => a + b, 0) / averages.length, rules),
          passRate: Math.round((passed / results.length) * 100),
          best: results.reduce((a, b) => (b.average > a.average ? b : a)),
          worst: results.reduce((a, b) => (b.average < a.average ? b : a)),
          rules,
        },
      });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

/** Annual result of one student, combining the period averages. */
router.get('/results/student/:studentId', requirePermission('grades', 'view'), uuid('studentId'), async (req: Request, res: Response) => {
  try {
    if (rejectInvalid(req, res)) return;
    const schoolId = req.user!.schoolId!;
    const studentId = req.params.studentId;
    const yearId = (req.query.academicYearId as string) ?? (await getActiveYear(schoolId))?.id;
    if (!yearId) return res.status(400).json({ success: false, error: 'Aucune année scolaire active' });

    const periods = await EvaluationPeriod.findAll({ where: { academicYearId: yearId }, order: [['sequence', 'ASC']] });
    const perPeriod: Array<{ periodId: string; name: string; sequence: number; average: number; mention: string; passed: boolean }> = [];
    for (const p of periods) {
      const [r] = await computeStudentResults({ schoolId, academicYearId: yearId, periodId: p.id, studentIds: [studentId] });
      if (!r) continue;
      perPeriod.push({ periodId: p.id, name: p.name, sequence: p.sequence, average: r.average, mention: r.mention, passed: r.passed });
    }
    const rules = await resolveGradingRules(schoolId);
    const annual = combinePeriodAverages(perPeriod.map((p) => p.average), rules);
    return res.json({
      success: true,
      data: {
        studentId,
        periods: perPeriod,
        annualAverage: annual,
        annualMention: mentionFor(annual, rules),
        passed: annual >= rules.passingAverage,
        rules,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// ─── Configuration de notation ───

router.get('/config', requirePermission('grades', 'view'), async (req: Request, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!;
    const configs = await GradingConfig.findAll({ where: { schoolId } });
    const effective = await resolveGradingRules(schoolId);
    return res.json({
      success: true,
      data: { effective, overrides: configs, defaults: DEFAULT_RULES, cycles: await Cycle.findAll({ where: { schoolId }, attributes: ['id', 'name'] }), niveaux: await Niveau.findAll({ where: { schoolId }, attributes: ['id', 'name'] }) },
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/** Every school configures its own rules — this writes them. */
router.put('/config', requirePermission('grades', 'validate'),
  body('baseMax').optional().isFloat({ gt: 0 }),
  body('averageMode').optional().isIn(['weighted', 'simple']),
  body('roundingMode').optional().isIn(['none', 'half_up', 'half_even', 'ceiling', 'floor']),
  body('roundingDecimals').optional().isInt({ min: 0, max: 4 }),
  body('passingGrade').optional().isFloat({ min: 0 }),
  body('cycleId').optional({ nullable: true }).isUUID(),
  body('niveauId').optional({ nullable: true }).isUUID(),
  async (req: Request, res: Response) => {
    try {
      if (rejectInvalid(req, res)) return;
      const schoolId = req.user!.schoolId!;
      const body = req.body as Record<string, unknown>;
      const cycleId = (body.cycleId as string) ?? null;
      const niveauId = (body.niveauId as string) ?? null;

      const row = await sequelize.transaction(async (t) => {
        const [existing] = await GradingConfig.findOrCreate({
          where: { schoolId, cycleId, niveauId },
          defaults: { schoolId, cycleId, niveauId },
          transaction: t,
        });
        const patch: Record<string, unknown> = {};
        for (const key of ['baseMax', 'averageMode', 'roundingMode', 'roundingDecimals', 'passingGrade', 'excellentGrade', 'veryGoodGrade', 'goodGrade', 'satisfactoryGrade', 'periodWeights', 'excludeUngradedSubjects']) {
          if (body[key] !== undefined) patch[key] = body[key];
        }
        await existing.update(patch, { transaction: t });
        return existing;
      });

      await logAudit(req, { action: 'grading_config_updated', entity: 'grading_config', entityId: row.id, details: { cycleId, niveauId, keys: Object.keys(body) } });
      return res.json({ success: true, data: { config: row, effective: await resolveGradingRules(schoolId, { cycleId, niveauId }) } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

router.post('/config/reset', requirePermission('grades', 'validate'), async (req: Request, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!;
    const row = await ensureGradingConfig(schoolId);
    await logAudit(req, { action: 'grading_config_reset', entity: 'grading_config', entityId: row.id });
    return res.json({ success: true, data: { effective: await resolveGradingRules(schoolId) } });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// ─── GradingConfig CRUD ───

/**
 * GET /config/list — list all grading configs for the school
 */
router.get('/config/list', requirePermission('grades', 'view'), async (req: Request, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!;
    const configs = await GradingConfig.findAll({
      where: { schoolId },
      include: [
        { model: Cycle, as: 'cycle', attributes: ['id', 'name'] },
        { model: Niveau, as: 'niveau', attributes: ['id', 'name'] },
      ],
      order: [['createdAt', 'DESC']],
    });
    return res.json({ success: true, data: { items: configs } });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * GET /config/:id — get a single grading config by ID
 */
router.get('/config/:id', requirePermission('grades', 'view'), uuid('id'), async (req: Request, res: Response) => {
  try {
    if (rejectInvalid(req, res)) return;
    const config = await GradingConfig.findOne({
      where: { id: req.params.id, schoolId: req.user!.schoolId! },
      include: [
        { model: Cycle, as: 'cycle', attributes: ['id', 'name'] },
        { model: Niveau, as: 'niveau', attributes: ['id', 'name'] },
      ],
    });
    if (!config) return res.status(404).json({ success: false, error: 'Configuration introuvable' });
    return res.json({ success: true, data: { config } });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * POST /config — create a new grading config
 */
router.post('/config',
  requirePermission('grades', 'validate'),
  body('cycleId').optional({ nullable: true }).isUUID().withMessage('cycleId invalide'),
  body('niveauId').optional({ nullable: true }).isUUID().withMessage('niveauId invalide'),
  body('passingAverage').optional().isFloat({ min: 0, max: 20 }).withMessage('passingAverage doit être entre 0 et 20'),
  body('mentionThresholds').optional().isObject().withMessage('mentionThresholds doit être un objet'),
  body('rounding').optional().isIn(['standard', 'floor', 'ceil']).withMessage('rounding invalide'),
  body('precision').optional().isInt({ min: 0, max: 4 }).withMessage('precision invalide'),
  body('weighting').optional().isIn(['coefficient', 'equal']).withMessage('weighting invalide'),
  body('missingPolicy').optional().isIn(['zero', 'ignore', 'fail']).withMessage('missingPolicy invalide'),
  body('minGrades').optional().isInt({ min: 1, max: 50 }).withMessage('minGrades invalide'),
  body('repEnabled').optional().isBoolean().withMessage('repEnabled doit être un booléen'),
  body('repMinAverage').optional().isFloat({ min: 0, max: 20 }).withMessage('repMinAverage invalide'),
  body('repMaxAverage').optional().isFloat({ min: 0, max: 20 }).withMessage('repMaxAverage invalide'),
  body('weighting').optional().isIn(['coefficient', 'equal']).withMessage('weighting invalide'),
  body('missingPolicy').optional().isIn(['zero', 'ignore', 'fail']).withMessage('missingPolicy invalide'),
  body('minGrades').optional().isInt({ min: 1, max: 50 }).withMessage('minGrades invalide'),
  body('repEnabled').optional().isBoolean().withMessage('repEnabled doit être un booléen'),
  body('repMinAverage').optional().isFloat({ min: 0, max: 20 }).withMessage('repMinAverage invalide'),
  body('repMaxAverage').optional().isFloat({ min: 0, max: 20 }).withMessage('repMaxAverage invalide'),
  body('useCoefficientWeight').optional().isBoolean().withMessage('useCoefficientWeight invalide'),
  body('normalizeTo20').optional().isBoolean().withMessage('normalizeTo20 invalide'),
  body('minValidGrade').optional().isFloat({ min: 0, max: 20 }).withMessage('minValidGrade invalide'),
  body('maxValidGrade').optional().isFloat({ min: 0, max: 20 }).withMessage('maxValidGrade invalide'),
  body('includeAbsentInAverage').optional().isBoolean().withMessage('includeAbsentInAverage invalide'),
  body('customGradeScales').optional().isObject().withMessage('customGradeScales invalide'),
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, error: errors.array()[0].msg });
      }

      const schoolId = req.user!.schoolId!;
      const body = req.body as Record<string, unknown>;

      const row = await sequelize.transaction(async (t) => {
        const config = await GradingConfig.create({
          schoolId,
          cycleId: body.cycleId ?? null,
          niveauId: body.niveauId ?? null,
          passingAverage: body.passingAverage ?? 10,
          mentionThresholds: body.mentionThresholds ?? { tres_bien: 16, bien: 14, assez_bien: 12, passable: 10, insuffisant: 0 },
          rounding: body.rounding ?? 'standard',
          precision: body.precision ?? 2,
          weighting: body.weighting ?? 'coefficient',
          missingPolicy: body.missingPolicy ?? 'ignore',
          minGrades: body.minGrades ?? 1,
          repEnabled: body.repEnabled ?? false,
          repMinAverage: body.repMinAverage ?? 8,
          repMaxAverage: body.repMaxAverage ?? 10,
          useCoefficientWeight: body.useCoefficientWeight ?? true,
          normalizeTo20: body.normalizeTo20 ?? true,
          minValidGrade: body.minValidGrade ?? 0,
          maxValidGrade: body.maxValidGrade ?? 20,
          includeAbsentInAverage: body.includeAbsentInAverage ?? false,
          customGradeScales: body.customGradeScales ?? null,
        }, { transaction: t });

        return config;
      });

      await logAudit(req, { action: 'grading_config_created', entity: 'grading_config', entityId: config.id, details: { cycleId: config.cycleId, niveauId: config.niveauId } });
      return res.status(201).json({ success: true, data: { config } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

/**
 * PUT /config/:id — update a grading config
 */
router.put('/config/:id',
  requirePermission('grades', 'validate'),
  uuid('id'),
  body('passingAverage').optional().isFloat({ min: 0, max: 20 }).withMessage('passingAverage doit être entre 0 et 20'),
  body('mentionThresholds').optional().isObject().withMessage('mentionThresholds doit être un objet'),
  body('rounding').optional().isIn(['standard', 'floor', 'ceil']).withMessage('rounding invalide'),
  body('precision').optional().isInt({ min: 0, max: 4 }).withMessage('precision invalide'),
  body('weighting').optional().isIn(['coefficient', 'equal']).withMessage('weighting invalide'),
  body('missingPolicy').optional().isIn(['zero', 'ignore', 'fail']).withMessage('missingPolicy invalide'),
  body('minGrades').optional().isInt({ min: 1, max: 50 }).withMessage('minGrades invalide'),
  body('repEnabled').optional().isBoolean().withMessage('repEnabled doit être un booléen'),
  body('repMinAverage').optional().isFloat({ min: 0, max: 20 }).withMessage('repMinAverage invalide'),
  body('repMaxAverage').optional().isFloat({ min: 0, max: 20 }).withMessage('repMaxAverage invalide'),
  body('useCoefficientWeight').optional().isBoolean().withMessage('useCoefficientWeight invalide'),
  body('normalizeTo20').optional().isBoolean().withMessage('normalizeTo20 invalide'),
  body('minValidGrade').optional().isFloat({ min: 0, max: 20 }).withMessage('minValidGrade invalide'),
  body('maxValidGrade').optional().isFloat({ min: 0, max: 20 }).withMessage('maxValidGrade invalide'),
  body('includeAbsentInAverage').optional().isBoolean().withMessage('includeAbsentInAverage invalide'),
  body('customGradeScales').optional().isObject().withMessage('customGradeScales invalide'),
  async (req: Request, res: Response) => {
    try {
      if (rejectInvalid(req, res)) return;
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, error: errors.array()[0].msg });
      }

      const config = await GradingConfig.findOne({
        where: { id: req.params.id, schoolId: req.user!.schoolId! },
      });
      if (!config) return res.status(404).json({ success: false, error: 'Configuration introuvable' });

      const body = req.body as Record<string, unknown>;
      const allowedFields = [
        'passingAverage', 'mentionThresholds', 'rounding', 'precision',
        'weighting', 'missingPolicy', 'minGrades', 'repEnabled',
        'repMinAverage', 'repMaxAverage', 'useCoefficientWeight',
        'normalizeTo20', 'minValidGrade', 'maxValidGrade',
        'includeAbsentInAverage', 'customGradeScales'
      ];

      const patch: Record<string, unknown> = {};
      for (const key of allowedFields) {
        if (body[key] !== undefined) {
          if (key === 'passingGrade') {
            patch['passingAverage'] = body[key];
          } else {
            patch[key] = body[key];
          }
        }
      }

      await config.update(patch);

      await logAudit(req, { action: 'grading_config_updated', entity: 'grading_config', entityId: config.id, details: { fields: Object.keys(patch) } });

      return res.json({ success: true, data: { config } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

/**
 * DELETE /config/:id — delete a grading config
 */
router.delete('/config/:id',
  requirePermission('grades', 'validate'),
  uuid('id'),
  async (req: Request, res: Response) => {
    try {
      if (rejectInvalid(req, res)) return;

      const config = await GradingConfig.findOne({
        where: { id: req.params.id, schoolId: req.user!.schoolId! },
      });
      if (!config) return res.status(404).json({ success: false, error: 'Configuration introuvable' });

      await config.destroy();

      await logAudit(req, { action: 'grading_config_deleted', entity: 'grading_config', entityId: req.params.id });

      return res.json({ success: true, data: { message: 'Configuration supprimée' } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

export default router;