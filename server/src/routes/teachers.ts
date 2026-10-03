import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { authenticateToken } from '../middleware/auth.js';
import { requireRole, requirePermission } from '../middleware/rbac.js';
import { AppError } from '../middleware/errorHandler.js';
import { logAudit } from '../middleware/auditLog.js';
import { User, Class, Subject } from '../models/index.js';
import { createStaffAccount } from '../services/UserProvisioningService.js';
import { getPagination, getSort, pages } from '../utils/listQuery.js';
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
  requirePermission('teachers', 'view'),
  async (req: Request, res: Response) => {
  try {
    const { page, limit, offset } = getPagination(req.query);
    const sort = getSort(req.query, { name: 'name', email: 'email', createdAt: 'createdAt' }, 'name', 'ASC');
    if (!sort) return res.status(400).json({ success: false, error: 'Invalid sortBy or sortOrder' });
    const { count, rows: teachers } = await User.findAndCountAll({
      where: { schoolId: req.user!.schoolId!, role: 'teacher' },
      include: [
        { model: Class, as: 'classes' },
        { model: Subject, as: 'subjects' },
      ],
      order: [[sort.column, sort.order]],
      limit,
      offset,
    });
    return res.json({ success: true, data: { items: teachers, total: count, page, pages: pages(count, limit) } });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.post('/',
  requireRole('super_admin', 'admin', 'director'),
  requirePermission('teachers', 'create'),
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('username').optional().trim(),
  body('temporaryPassword').optional().isLength({ min: 8 }).withMessage('Temporary password must be at least 8 characters'),
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ success: false, error: errors.array()[0].msg });
      const { name, email, phone, username, temporaryPassword } = req.body;
      // The account is provisioned, never created with a client-typed password:
      // a temporary password is generated, shown once, and must be changed at
      // first login.
      const result = await createStaffAccount({
        schoolId: req.user!.schoolId!,
        name,
        email,
        role: 'teacher',
        phone,
        username,
        temporaryPassword,
        mustChangePassword: true,
        createdBy: req.user!.id,
      });
      await logAudit(req, { action: 'account_created', entity: 'user', entityId: result.user.id, details: { role: 'teacher' } });

      // Emit real-time event
      const teacherClasses = await Class.findAll({ where: { teacherId: result.user.id }, attributes: ['id', 'name'] });
      const teacherSubjects = await Subject.findAll({ where: { teacherId: result.user.id }, attributes: ['id', 'name'] });

      WebSocketEvents.teacher.created(req.user!.schoolId!, {
        id: result.user.id,
        name: result.user.name,
        email: result.user.email,
        subjectIds: teacherSubjects.map(s => s.id),
        classIds: teacherClasses.map(c => c.id),
        action: 'created',
      });

      return res.status(201).json({ success: true, data: { teacher: result.user, temporaryPassword: result.temporaryPassword } });
    } catch (error) {
      if (error instanceof AppError) {
        return res.status(error.statusCode).json({ success: false, error: error.message });
      }
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

router.get('/:id',
  requireRole('super_admin', 'admin', 'director', 'teacher', 'accountant', 'receptionist'),
  requirePermission('teachers', 'view'),
  async (req: Request, res: Response) => {
  try {
    const teacher = await User.findOne({
      where: { id: req.params.id, schoolId: req.user!.schoolId!, role: 'teacher' },
      include: [{ model: Class, as: 'classes' }, { model: Subject, as: 'subjects' }],
    });
    if (!teacher) return res.status(404).json({ success: false, error: 'Teacher not found' });
    return res.json({ success: true, data: { teacher } });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.patch('/:id',
  requireRole('super_admin', 'admin', 'director'),
  requirePermission('teachers', 'update'),
  async (req: Request, res: Response) => {
  try {
    const teacher = await User.findOne({ where: { id: req.params.id, schoolId: req.user!.schoolId!, role: 'teacher' } });
    if (!teacher) return res.status(404).json({ success: false, error: 'Teacher not found' });
    const allowed = ['name', 'email', 'phone', 'isActive'];
    const updates: any = {};
    for (const field of allowed) { if (req.body[field] !== undefined) updates[field] = req.body[field]; }
    await teacher.update(updates);

    // Emit real-time event
    const teacherClasses = await Class.findAll({ where: { teacherId: teacher.id }, attributes: ['id', 'name'] });
    const teacherSubjects = await Subject.findAll({ where: { teacherId: teacher.id }, attributes: ['id', 'name'] });

    WebSocketEvents.teacher.updated(req.user!.schoolId!, {
      id: teacher.id,
      name: teacher.name,
      email: teacher.email,
      subjectIds: teacherSubjects.map(s => s.id),
      classIds: teacherClasses.map(c => c.id),
      action: 'updated',
    });

    return res.json({ success: true, data: { teacher } });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.delete('/:id',
  requireRole('super_admin', 'admin', 'director'),
  requirePermission('teachers', 'delete'),
  async (req: Request, res: Response) => {
  try {
    const teacher = await User.findOne({ where: { id: req.params.id, schoolId: req.user!.schoolId!, role: 'teacher' } });
    if (!teacher) return res.status(404).json({ success: false, error: 'Teacher not found' });

    const teacherId = teacher.id;
    const teacherName = teacher.name;
    const teacherEmail = teacher.email;

    await teacher.update({ isActive: false });

    // Emit real-time event
    WebSocketEvents.teacher.deleted(req.user!.schoolId!, {
      id: teacherId,
      name: teacherName,
      email: teacherEmail,
      action: 'deleted',
    });

    return res.json({ success: true, data: { message: 'Teacher deactivated' } });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// PATCH /:id/photo - Upload teacher photo
router.patch('/:id/photo',
  requireRole('super_admin', 'admin', 'director'),
  requirePermission('teachers', 'update'),
  upload.single('photo'),
  async (req: Request, res: Response) => {
    try {
      const teacher = await User.findOne({ where: { id: req.params.id, schoolId: req.user!.schoolId!, role: 'teacher' } });
      if (!teacher) return res.status(404).json({ success: false, error: 'Teacher not found' });
      if (!req.file) return res.status(400).json({ success: false, error: 'No photo uploaded' });
      const photoUrl = `/uploads/${req.file.filename}`;
      await teacher.update({ photo: photoUrl });
      return res.json({ success: true, data: { teacher } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

export default router;
