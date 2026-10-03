import { Router, Request, Response } from 'express';
import { body, query, validationResult } from 'express-validator';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { authenticateToken } from '../middleware/auth.js';
import { requireRole, requirePermission } from '../middleware/rbac.js';
import { AppError } from '../middleware/errorHandler.js';
import { Student, Class, Grade, Attendance, Fee, Payment, Subject, AcademicYear, ActivationCode } from '../models/index.js';
import { Op } from 'sequelize';
import { logAudit } from '../middleware/auditLog.js';
import { getPagination, getSort } from '../utils/listQuery.js';
import { storePhoto } from '../services/imagekit.js';
import { createStudentAccount, generateSecureToken, hashToken } from '../services/UserProvisioningService.js';
import { nextMatricule } from '../services/EnrollmentService.js';
import { userHasPermission } from '../services/AuthorizationService.js';
import { WebSocketEvents } from '../services/websocket.js';

// Multer config for photo uploads
const uploadsDir = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const uniqueName = `${uuidv4()}${path.extname(file.originalname).toLowerCase()}`;
    cb(null, uniqueName);
  },
});

const fileFilter = (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowed = ['image/jpeg', 'image/png', 'image/webp'];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPG, PNG, and WEBP are allowed.'));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});

const router = Router();
router.use(authenticateToken);

router.get('/',
  requireRole('super_admin', 'admin', 'director', 'teacher', 'accountant', 'receptionist'),
  requirePermission('students', 'view'),
  async (req: Request, res: Response) => {
    try {
      const { classId, status, search, page: pageStr, limit: limitStr } = req.query;
      const { page, limit, offset } = getPagination({ page: pageStr, limit: limitStr });
      const schoolId = req.user!.schoolId!;

      const sort = getSort(req.query, { firstName: 'firstName', lastName: 'lastName', createdAt: 'createdAt', studentId: 'studentId' }, 'createdAt', 'DESC');
      if (!sort) return res.status(400).json({ success: false, error: 'Invalid sortBy or sortOrder' });

      const where: any = { schoolId };
      if (classId) where.classId = classId;
      if (status) where.status = status;
      if (search) {
        where[Op.or] = [
          { firstName: { [Op.iLike]: `%${search}%` } },
          { lastName: { [Op.iLike]: `%${search}%` } },
          { studentId: { [Op.iLike]: `%${search}%` } },
        ];
      }

      const { count, rows: students } = await Student.findAndCountAll({
        where,
        include: [{ model: Class, as: 'class', attributes: ['id', 'name'] }],
        order: [[sort.column, sort.order]],
        offset,
        limit,
      });

      return res.json({
        success: true,
        data: { items: students, page, pageSize: limit, total: count, totalPages: Math.ceil(count / limit) },
      });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

router.post('/',
  requireRole('super_admin', 'admin', 'director', 'receptionist'),
  requirePermission('students', 'create'),
  body('firstName').trim().notEmpty().withMessage('First name is required'),
  body('lastName').trim().notEmpty().withMessage('Last name is required'),
  body('classId').optional().isUUID(),
  body('gender').optional().isIn(['M', 'F']),
  body('createAccount').optional().isIn(['none', 'now', 'activation_code']).withMessage('createAccount must be none, now or activation_code'),
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, error: errors.array()[0].msg });
      }

      const schoolId = req.user!.schoolId!;
      const { firstName, lastName, dateOfBirth, gender, classId, phone, email, address, parentName, parentPhone, parentEmail, notes } = req.body;
      const { createAccount = 'none', accountEmail } = req.body as { createAccount?: 'none' | 'now' | 'activation_code'; accountEmail?: string };

      // Matricule: SCF-<school year>-<NNNNN>, allocated by the single source of
      // truth shared with the admissions module so both can never disagree.
      const { matricule: studentId } = await nextMatricule(schoolId);

      const student = await Student.create({
        schoolId, studentId, firstName, lastName, dateOfBirth, gender, classId, phone, email, address, parentName, parentPhone, parentEmail, notes,
      });

      await logAudit(req, { action: 'create', entity: 'student', entityId: student.id, details: { firstName, lastName, studentId } });

      // Emit real-time event
      const studentClass = student.classId ? await Class.findByPk(student.classId, { attributes: ['name'] }) : null;

      WebSocketEvents.student.created(req.user!.schoolId!, {
        id: student.id,
        firstName: student.firstName,
        lastName: student.lastName,
        studentId: student.studentId,
        classId: student.classId,
        className: studentClass?.name,
        status: student.status,
        action: 'created',
      });

      // Enrollment → account linkage. The admin chooses at admission time
      // whether the account is created immediately, handed over as an
      // activation code, or postponed.
      let account: { userId: string; username: string | null; temporaryPassword: string } | null = null;
      let activationCode: { code: string; expiresAt: Date } | null = null;

      if (createAccount !== 'none') {
        const hasGrant = await userHasPermission(req.user!, 'users.create_student');
        if (!hasGrant) throw new AppError('Insufficient permissions: users.create_student', 403);
      }

      if (createAccount === 'now') {
        const result = await createStudentAccount(student.id, req.user!.id, { email: accountEmail });
        account = { userId: result.user.id, username: result.user.username, temporaryPassword: result.temporaryPassword! };
        await logAudit(req, { action: 'account_created', entity: 'student_account', entityId: result.user.id, details: { studentId: student.id } });
      } else if (createAccount === 'activation_code') {
        const code = generateSecureToken(4).toUpperCase().slice(0, 8);
        const expiresAt = new Date(Date.now() + 72 * 3600 * 1000);
        await ActivationCode.create({
          schoolId,
          codeHash: hashToken(code),
          targetType: 'student',
          targetId: student.id,
          email: accountEmail ?? null,
          maxUses: 1,
          useCount: 0,
          expiresAt,
          status: 'active',
          createdBy: req.user!.id,
          note: `Inscription ${studentId}`,
        });
        activationCode = { code, expiresAt };
        await logAudit(req, { action: 'activation_code_created', entity: 'activation_code', entityId: student.id, details: { targetType: 'student' } });
      }

      return res.status(201).json({ success: true, data: { student, account, activationCode } });
    } catch (error) {
      if (error instanceof AppError) {
        return res.status(error.statusCode).json({ success: false, error: error.message });
      }
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

router.get('/:id',
  requireRole('super_admin', 'admin', 'director', 'teacher', 'accountant', 'receptionist', 'parent', 'student'),
  requirePermission('students', 'view'),
  async (req: Request, res: Response) => {
  try {
    const student = await Student.findOne({
      where: { id: req.params.id, schoolId: req.user!.schoolId! },
      include: [
        { model: Class, as: 'class' },
        { model: Grade, as: 'grades', include: [{ model: Subject, as: 'subject' }] },
        { model: Attendance, as: 'attendance' },
        { model: Fee, as: 'fees' },
        { model: Payment, as: 'payments' },
      ],
    });
    if (!student) {
      return res.status(404).json({ success: false, error: 'Student not found' });
    }
    return res.json({ success: true, data: { student } });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.patch('/:id',
  requireRole('super_admin', 'admin', 'director', 'receptionist'),
  requirePermission('students', 'update'),
  async (req: Request, res: Response) => {
  try {
    const student = await Student.findOne({ where: { id: req.params.id, schoolId: req.user!.schoolId! } });
    if (!student) {
      return res.status(404).json({ success: false, error: 'Student not found' });
    }
    const allowed = ['firstName', 'lastName', 'dateOfBirth', 'gender', 'classId', 'phone', 'email', 'address', 'parentName', 'parentPhone', 'parentEmail', 'status', 'notes'];
    const updates: any = {};
    for (const field of allowed) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    }
    await student.update(updates);

    await logAudit(req, { action: 'update', entity: 'student', entityId: student.id, details: updates });

    // Emit real-time event
    const studentClass = student.classId ? await Class.findByPk(student.classId, { attributes: ['name'] }) : null;

    WebSocketEvents.student.updated(req.user!.schoolId!, {
      id: student.id,
      firstName: student.firstName,
      lastName: student.lastName,
      studentId: student.studentId,
      classId: student.classId,
      className: studentClass?.name,
      status: student.status,
      action: 'updated',
    });

    return res.json({ success: true, data: { student } });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.delete('/:id',
  requireRole('super_admin', 'admin', 'director'),
  requirePermission('students', 'delete'),
  async (req: Request, res: Response) => {
  try {
    const student = await Student.findOne({ where: { id: req.params.id, schoolId: req.user!.schoolId! } });
    if (!student) {
      return res.status(404).json({ success: false, error: 'Student not found' });
    }
    await student.update({ status: 'inactive' });

    await logAudit(req, { action: 'delete', entity: 'student', entityId: student.id });

    // Emit real-time event
    const studentClass = student.classId ? await Class.findByPk(student.classId, { attributes: ['name'] }) : null;

    WebSocketEvents.student.archived(req.user!.schoolId!, {
      id: student.id,
      firstName: student.firstName,
      lastName: student.lastName,
      studentId: student.studentId,
      classId: student.classId,
      className: studentClass?.name,
      status: 'inactive',
      action: 'archived',
    });

    return res.json({ success: true, data: { message: 'Student archived' } });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// PATCH /:id/photo - Upload student photo
router.patch('/:id/photo',
  requireRole('super_admin', 'admin', 'director', 'receptionist'),
  requirePermission('students', 'update'),
  upload.single('photo'),
  async (req: Request, res: Response) => {
    try {
      const student = await Student.findOne({ where: { id: req.params.id, schoolId: req.user!.schoolId! } });
      if (!student) {
        return res.status(404).json({ success: false, error: 'Student not found' });
      }
      if (!req.file) {
        return res.status(400).json({ success: false, error: 'No photo uploaded' });
      }
      const photoUrl = await storePhoto(
        req.file.path,
        req.file.originalname,
        req.user!.schoolId!,
        'students',
        req.params.id
      );
      await student.update({ photo: photoUrl });
      return res.json({ success: true, data: { student } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

// POST /:id/restore - Restore an archived student (status active)
router.post('/:id/restore',
  requireRole('super_admin', 'admin', 'director'),
  requirePermission('students', 'update'),
  async (req: Request, res: Response) => {
  try {
    const student = await Student.findOne({ where: { id: req.params.id, schoolId: req.user!.schoolId! } });
    if (!student) {
      return res.status(404).json({ success: false, error: 'Student not found' });
    }
    await student.update({ status: 'active' });

    await logAudit(req, { action: 'restore', entity: 'student', entityId: student.id });

    // Emit real-time event
    const studentClass = student.classId ? await Class.findByPk(student.classId, { attributes: ['name'] }) : null;

    WebSocketEvents.student.updated(req.user!.schoolId!, {
      id: student.id,
      firstName: student.firstName,
      lastName: student.lastName,
      studentId: student.studentId,
      classId: student.classId,
      className: studentClass?.name,
      status: 'active',
      action: 'updated',
    });

    return res.json({ success: true, data: { student } });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

export default router;
