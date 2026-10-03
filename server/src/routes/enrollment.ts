import { Router, Request, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { Op } from 'sequelize';
import { authenticateToken } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { requireModule } from '../utils/modules.js';
import { AppError } from '../middleware/errorHandler.js';
import { logAudit } from '../middleware/auditLog.js';
import { AcademicYear, Class, Enrollment, Student } from '../models/index.js';
import {
  createDossier, updateDossier, submitDossier, decideDossier, reopenDossier,
  withdrawDossier, enrollDossier, enrollmentStats, ENROLLMENT_STATUSES, REQUIRED_DOCUMENTS,
} from '../services/EnrollmentService.js';

/**
 * Admissions & inscriptions API.
 *
 * `schoolId` is never read from the client: it always comes from the
 * authenticated account, so no dossier of another establishment is reachable by
 * guessing an id. The module gate means switching the module off blocks every
 * route here while keeping the dossiers in the database.
 */
const router = Router();
router.use(authenticateToken);
router.use(requireModule('enrollment'));

function fail(error: unknown): { status: number; body: { success: false; error: string } } {
  return {
    status: error instanceof AppError ? error.statusCode : 500,
    body: { success: false, error: (error as Error).message },
  };
}

function assertValid(req: Request): void {
  const errors = validationResult(req);
  if (errors.isEmpty()) return;
  throw new AppError(String(errors.array()[0].msg), 400);
}

/**
 * The academic year the dossiers belong to. Falls back to the active year; a
 * school with no year at all is reported as `needsSetup` rather than erroring.
 */
async function resolveYear(schoolId: string, academicYearId?: string) {
  if (academicYearId) {
    const explicit = await AcademicYear.findOne({ where: { id: academicYearId, schoolId } });
    if (explicit) return explicit;
  }
  return AcademicYear.findOne({
    where: { schoolId, status: 'active' },
    order: [['startDate', 'DESC']],
  });
}

// ─────────────────────────── Read ───────────────────────────

/** GET /enrollment — the dossier register, filtered and paginated. */
router.get(
  '/',
  requirePermission('enrollment', 'view'),
  query('status').optional().isIn(Object.keys(ENROLLMENT_STATUSES)).withMessage('Statut invalide'),
  query('academicYearId').optional().isUUID(),
  query('classId').optional().isUUID(),
  query('search').optional().isString(),
  async (req: Request, res: Response) => {
    try {
      assertValid(req);
      const schoolId = req.user!.schoolId!;
      const year = await resolveYear(schoolId, req.query.academicYearId as string | undefined);

      if (!year) {
        const activeStudents = await Student.count({ where: { schoolId, status: 'active' } });
        return res.json({
          success: true,
          data: {
            items: [], total: 0, page: 1, pages: 0,
            academicYear: null, needsSetup: true, activeStudents,
          },
        });
      }

      const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '50'), 10) || 50));
      const search = (req.query.search as string) || '';
      const status = req.query.status as string | undefined;

      const where: Record<string | symbol, unknown> = { schoolId, academicYearId: year.id };
      if (status) where.status = status;
      if (req.query.classId) where.requestedClassId = req.query.classId;
      if (search) {
        where[Op.or] = [
          { firstName: { [Op.iLike]: `%${search}%` } },
          { lastName: { [Op.iLike]: `%${search}%` } },
          { reference: { [Op.iLike]: `%${search}%` } },
          { guardianName: { [Op.iLike]: `%${search}%` } },
        ];
      }

      const { rows, count } = await Enrollment.findAndCountAll({
        where,
        include: [{ model: Class, as: 'requestedClass', attributes: ['id', 'name'] }],
        order: [['createdAt', 'DESC']],
        limit,
        offset: (page - 1) * limit,
      });

      return res.json({
        success: true,
        data: {
          items: rows,
          total: count,
          page,
          pages: Math.ceil(count / limit),
          academicYear: { id: year.id, name: year.name, status: year.status },
          needsSetup: false,
        },
      });
    } catch (error) {
      const { status, body } = fail(error);
      return res.status(status).json(body);
    }
  }
);

/** GET /enrollment/stats — per-status counts for the year. */
router.get('/stats', requirePermission('enrollment', 'view'), async (req: Request, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!;
    const year = await resolveYear(schoolId, req.query.academicYearId as string | undefined);
    if (!year) {
      const activeStudents = await Student.count({ where: { schoolId, status: 'active' } });
      return res.json({
        success: true,
        data: { academicYear: null, needsSetup: true, total: 0, byStatus: {}, completeFiles: 0, activeStudents },
      });
    }
    const stats = await enrollmentStats(schoolId, year.id);
    const activeStudents = await Student.count({ where: { schoolId, status: 'active' } });
    return res.json({
      success: true,
      data: {
        academicYear: { id: year.id, name: year.name, status: year.status },
        needsSetup: false,
        ...stats,
        activeStudents,
      },
    });
  } catch (error) {
    const { status, body } = fail(error);
    return res.status(status).json(body);
  }
});

/** GET /enrollment/meta — reference data the page needs: statuses, documents, classes. */
router.get('/meta', requirePermission('enrollment', 'view'), async (req: Request, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!;
    const year = await resolveYear(schoolId, req.query.academicYearId as string | undefined);
    const classes = year
      ? await Class.findAll({
          where: { schoolId, academicYear: year.name },
          attributes: ['id', 'name', 'level'],
          order: [['name', 'ASC']],
        })
      : [];
    const years = await AcademicYear.findAll({
      where: { schoolId },
      attributes: ['id', 'name', 'status'],
      order: [['startDate', 'DESC']],
    });
    return res.json({
      success: true,
      data: {
        statuses: ENROLLMENT_STATUSES,
        documents: REQUIRED_DOCUMENTS,
        classes: classes.map((c) => c.get()),
        years,
        academicYear: year ? { id: year.id, name: year.name, status: year.status } : null,
        needsSetup: !year,
      },
    });
  } catch (error) {
    const { status, body } = fail(error);
    return res.status(status).json(body);
  }
});

/** GET /enrollment/:id — one dossier with its document checklist. */
router.get(
  '/:id',
  requirePermission('enrollment', 'view'),
  param('id').isUUID('4').withMessage('Identifiant invalide'),
  async (req: Request, res: Response) => {
    try {
      assertValid(req);
      const row = await Enrollment.findOne({
        where: { id: req.params.id, schoolId: req.user!.schoolId! },
        include: [
          { model: Class, as: 'requestedClass', attributes: ['id', 'name'] },
          { model: Student, as: 'student', attributes: ['id', 'studentId', 'classId', 'userId'] },
        ],
      });
      if (!row) throw new AppError('Dossier introuvable', 404);
      return res.json({ success: true, data: { enrollment: row } });
    } catch (error) {
      const { status, body } = fail(error);
      return res.status(status).json(body);
    }
  }
);

// ─────────────────────────── Write ───────────────────────────

/** POST /enrollment — open a dossier. */
router.post(
  '/',
  requirePermission('enrollment', 'create'),
  body('academicYearId').isUUID('4').withMessage('Année scolaire requise'),
  body('firstName').trim().notEmpty().withMessage('Le prénom est obligatoire'),
  body('lastName').trim().notEmpty().withMessage('Le nom est obligatoire'),
  body('gender').optional({ nullable: true }).isIn(['M', 'F']).withMessage('Sexe invalide'),
  body('requestedClassId').optional({ nullable: true }).isUUID('4'),
  body('dateOfBirth').optional({ nullable: true }).isISO8601(),
  body('submit').optional().isBoolean(),
  async (req: Request, res: Response) => {
    try {
      assertValid(req);
      const schoolId = req.user!.schoolId!;
      const b = req.body as Record<string, unknown>;
      const row = await createDossier({
        schoolId,
        academicYearId: b.academicYearId as string,
        firstName: b.firstName as string,
        lastName: b.lastName as string,
        requestedClassId: (b.requestedClassId as string | null) ?? null,
        dateOfBirth: b.dateOfBirth ? new Date(b.dateOfBirth as string) : null,
        gender: (b.gender as 'M' | 'F' | null) ?? null,
        birthPlace: (b.birthPlace as string | null) ?? null,
        nationality: (b.nationality as string | null) ?? null,
        address: (b.address as string | null) ?? null,
        phone: (b.phone as string | null) ?? null,
        email: (b.email as string | null) ?? null,
        guardianName: (b.guardianName as string | null) ?? null,
        guardianPhone: (b.guardianPhone as string | null) ?? null,
        guardianEmail: (b.guardianEmail as string | null) ?? null,
        guardianRelation: (b.guardianRelation as string | null) ?? null,
        previousSchool: (b.previousSchool as string | null) ?? null,
        previousClass: (b.previousClass as string | null) ?? null,
        previousAverage: (b.previousAverage as string | null) ?? null,
        documents: (b.documents as Record<string, boolean>) ?? {},
        createdBy: req.user!.id,
        submit: b.submit === true,
      });
      await logAudit(req, {
        action: 'enrollment_created',
        entity: 'enrollment',
        entityId: row.id,
        details: { reference: row.reference, status: row.status },
      });
      return res.status(201).json({ success: true, data: { enrollment: row } });
    } catch (error) {
      const { status, body } = fail(error);
      return res.status(status).json(body);
    }
  }
);

/** PUT /enrollment/:id — edit a dossier that has not been decided. */
router.put(
  '/:id',
  requirePermission('enrollment', 'update'),
  param('id').isUUID('4').withMessage('Identifiant invalide'),
  async (req: Request, res: Response) => {
    try {
      assertValid(req);
      const allowed = [
        'requestedClassId', 'firstName', 'lastName', 'dateOfBirth', 'gender', 'birthPlace',
        'nationality', 'address', 'phone', 'email', 'guardianName', 'guardianPhone',
        'guardianEmail', 'guardianRelation', 'previousSchool', 'previousClass',
        'previousAverage', 'documents',
      ] as const;
      const patch: Record<string, unknown> = {};
      for (const key of allowed) {
        if (req.body[key] !== undefined) patch[key] = req.body[key];
      }
      if (patch.dateOfBirth) patch.dateOfBirth = new Date(patch.dateOfBirth as string);

      const row = await updateDossier(req.user!.schoolId!, req.params.id, patch);
      await logAudit(req, {
        action: 'enrollment_updated',
        entity: 'enrollment',
        entityId: row.id,
        details: { reference: row.reference, fields: Object.keys(patch) },
      });
      return res.json({ success: true, data: { enrollment: row } });
    } catch (error) {
      const { status, body } = fail(error);
      return res.status(status).json(body);
    }
  }
);

/** POST /enrollment/:id/submit — file the dossier for instruction. */
router.post(
  '/:id/submit',
  requirePermission('enrollment', 'update'),
  param('id').isUUID('4').withMessage('Identifiant invalide'),
  async (req: Request, res: Response) => {
    try {
      assertValid(req);
      const row = await submitDossier(req.user!.schoolId!, req.params.id);
      await logAudit(req, {
        action: 'enrollment_submitted',
        entity: 'enrollment',
        entityId: row.id,
        details: { reference: row.reference },
      });
      return res.json({ success: true, data: { enrollment: row } });
    } catch (error) {
      const { status, body } = fail(error);
      return res.status(status).json(body);
    }
  }
);

/**
 * POST /enrollment/:id/decide — accept, waitlist or reject. Records a decision
 * only: no student row is created and nothing is moved.
 */
router.post(
  '/:id/decide',
  requirePermission('enrollment', 'decide'),
  param('id').isUUID('4').withMessage('Identifiant invalide'),
  body('decision').isIn(['accepted', 'waitlisted', 'rejected']).withMessage('Décision invalide'),
  body('requestedClassId').optional({ nullable: true }).isUUID('4'),
  body('note').optional({ nullable: true }).isString(),
  async (req: Request, res: Response) => {
    try {
      assertValid(req);
      const b = req.body as { decision: 'accepted' | 'waitlisted' | 'rejected'; requestedClassId?: string | null; note?: string | null };
      const row = await decideDossier(req.user!.schoolId!, req.params.id, {
        decision: b.decision,
        requestedClassId: b.requestedClassId ?? null,
        note: b.note ?? null,
        actorId: req.user!.id,
      });
      await logAudit(req, {
        action: `enrollment_${b.decision}`,
        entity: 'enrollment',
        entityId: row.id,
        details: { reference: row.reference, classId: row.requestedClassId, note: b.note ?? null },
      });
      return res.json({ success: true, data: { enrollment: row } });
    } catch (error) {
      const { status, body } = fail(error);
      return res.status(status).json(body);
    }
  }
);

/** POST /enrollment/:id/reopen — send a waitlisted dossier back to instruction. */
router.post(
  '/:id/reopen',
  requirePermission('enrollment', 'decide'),
  param('id').isUUID('4').withMessage('Identifiant invalide'),
  async (req: Request, res: Response) => {
    try {
      assertValid(req);
      const row = await reopenDossier(req.user!.schoolId!, req.params.id);
      await logAudit(req, { action: 'enrollment_reopened', entity: 'enrollment', entityId: row.id });
      return res.json({ success: true, data: { enrollment: row } });
    } catch (error) {
      const { status, body } = fail(error);
      return res.status(status).json(body);
    }
  }
);

/** POST /enrollment/:id/withdraw — close a dossier as withdrawn. Never deleted. */
router.post(
  '/:id/withdraw',
  requirePermission('enrollment', 'update'),
  param('id').isUUID('4').withMessage('Identifiant invalide'),
  async (req: Request, res: Response) => {
    try {
      assertValid(req);
      const row = await withdrawDossier(req.user!.schoolId!, req.params.id);
      await logAudit(req, { action: 'enrollment_withdrawn', entity: 'enrollment', entityId: row.id });
      return res.json({ success: true, data: { enrollment: row } });
    } catch (error) {
      const { status, body } = fail(error);
      return res.status(status).json(body);
    }
  }
);

/**
 * POST /enrollment/:id/enroll — the admission becomes a real student.
 *
 * This is the only step that writes a `students` row. It returns the temporary
 * password or the activation code exactly once, like the students route does;
 * the password itself is only ever stored hashed.
 */
router.post(
  '/:id/enroll',
  requirePermission('enrollment', 'decide'),
  param('id').isUUID('4').withMessage('Identifiant invalide'),
  body('createAccount').optional().isIn(['none', 'now', 'activation_code']).withMessage('Mode de compte invalide'),
  body('classId').optional({ nullable: true }).isUUID('4'),
  async (req: Request, res: Response) => {
    try {
      assertValid(req);
      const b = req.body as { createAccount?: 'none' | 'now' | 'activation_code'; classId?: string | null };
      const result = await enrollDossier(req.user!.schoolId!, req.params.id, req.user!, {
        createAccount: b.createAccount ?? 'none',
        classId: b.classId ?? null,
      });
      await logAudit(req, {
        action: 'enrollment_applied',
        entity: 'student',
        entityId: result.student.id,
        details: {
          enrollmentId: result.enrollment.id,
          reference: result.enrollment.reference,
          matricule: result.student.studentId,
          classId: b.classId ?? result.enrollment.requestedClassId,
          accountMode: b.createAccount ?? 'none',
        },
      });
      return res.json({ success: true, data: result });
    } catch (error) {
      const { status, body } = fail(error);
      return res.status(status).json(body);
    }
  }
);

export default router;