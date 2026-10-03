import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { authenticateToken } from '../middleware/auth.js';
import { requireRole, requirePermission } from '../middleware/rbac.js';
import { School, User, AuditLog } from '../models/index.js';
import { logAudit } from '../middleware/auditLog.js';
import { getPagination, getSort, pages } from '../utils/listQuery.js';
import { storePhoto } from '../services/imagekit.js';

// Multer config for logo uploads
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
  requirePermission('settings', 'view'),
  async (req: Request, res: Response) => {
  try {
    const school = await School.findByPk(req.user!.schoolId!);
    if (!school) return res.status(404).json({ success: false, error: 'School not found' });
    return res.json({ success: true, data: { school } });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.patch('/',
  requireRole('super_admin', 'admin', 'director'),
  requirePermission('settings', 'manage'),
  async (req: Request, res: Response) => {
  try {
    const school = await School.findByPk(req.user!.schoolId!);
    if (!school) return res.status(404).json({ success: false, error: 'School not found' });
    const allowed = ['name', 'phone', 'address', 'logo', 'currency', 'settings', 'province', 'city', 'territory', 'code', 'emblem'];
    const updates: any = {};
    for (const field of allowed) { if (req.body[field] !== undefined) updates[field] = req.body[field]; }
    await school.update(updates);
    await logAudit(req, { action: 'update', entity: 'settings', entityId: school.id, details: updates });
    return res.json({ success: true, data: { school } });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// ─── Current user profile ────────────────────────────────────────────────────

router.put('/profile',
  body('name').trim().notEmpty().withMessage('Le nom est obligatoire'),
  body('phone').optional().trim(),
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ success: false, error: errors.array()[0].msg });

      const user = await User.findByPk(req.user!.id);
      if (!user) return res.status(404).json({ success: false, error: 'Utilisateur introuvable' });

      const { name, phone } = req.body;
      await user.update({ name, phone: phone || null });

      await logAudit(req, { action: 'update', entity: 'profile', entityId: user.id, details: { name } });

      return res.json({
        success: true,
        data: {
          user: { id: user.id, email: user.email, name: user.name, role: user.role, phone: user.phone, avatar: user.avatar },
        },
      });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

router.post('/photo', upload.single('photo'), async (req: Request, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'Aucun fichier reçu' });

    const user = await User.findByPk(req.user!.id);
    if (!user) return res.status(404).json({ success: false, error: 'Utilisateur introuvable' });

    const relativePath = await storePhoto(
      req.file.path,
      req.file.originalname,
      req.user!.schoolId!,
      'users',
      req.user!.id
    );
    await user.update({ avatar: relativePath, photo: relativePath });

    await logAudit(req, { action: 'update', entity: 'profile_photo', entityId: user.id, details: { file: req.file.originalname } });

    return res.json({
      success: true,
      data: {
        user: { id: user.id, email: user.email, name: user.name, role: user.role, phone: user.phone, avatar: user.avatar },
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.post('/password',
  body('currentPassword').notEmpty().withMessage('Mot de passe actuel requis'),
  body('newPassword').isLength({ min: 6 }).withMessage('Le nouveau mot de passe doit contenir au moins 6 caractères'),
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ success: false, error: errors.array()[0].msg });

      const user = await User.findByPk(req.user!.id);
      if (!user) return res.status(404).json({ success: false, error: 'Utilisateur introuvable' });

      const { currentPassword, newPassword } = req.body;

      const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!isValid) {
        return res.status(401).json({ success: false, error: 'Mot de passe actuel incorrect' });
      }

      const passwordHash = await bcrypt.hash(newPassword, 12);
      await user.update({ passwordHash });

      await logAudit(req, { action: 'update', entity: 'password', entityId: user.id });

      return res.json({ success: true, data: { message: 'Mot de passe modifié' } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

// ─── Sessions (sourced from the audit log) ──────────────────────────────────

router.get('/sessions', async (req: Request, res: Response) => {
  try {
    const { page, limit, offset } = getPagination(req.query);
    const sort = getSort(req.query, { createdAt: 'createdAt' }, 'createdAt', 'DESC');
    if (!sort) return res.status(400).json({ success: false, error: 'Invalid sortBy or sortOrder' });
    const { count, rows: sessions } = await AuditLog.findAndCountAll({
      where: {
        schoolId: req.user!.schoolId!,
        userId: req.user!.id,
        action: 'login',
      },
      order: [[sort.column, sort.order]],
      limit,
      offset,
    });

    const items = sessions.map((s) => ({
      id: s.id,
      userAgent: s.userAgent ?? 'inconnu',
      ipAddress: s.ipAddress,
      createdAt: s.createdAt,
    }));

    return res.json({ success: true, data: { items, total: count, page, pages: pages(count, limit) } });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.get('/users',
  requireRole('super_admin', 'admin', 'director'),
  requirePermission('users', 'view'),
  async (req: Request, res: Response) => {
  try {
    const { page, limit, offset } = getPagination(req.query);
    const sort = getSort(req.query, { name: 'name', email: 'email', role: 'role', createdAt: 'createdAt' }, 'name', 'ASC');
    if (!sort) return res.status(400).json({ success: false, error: 'Invalid sortBy or sortOrder' });
    const { count, rows: users } = await User.findAndCountAll({
      where: { schoolId: req.user!.schoolId! },
      order: [[sort.column, sort.order]],
      limit,
      offset,
    });
    return res.json({ success: true, data: { items: users, total: count, page, pages: pages(count, limit) } });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.post('/users',
  requireRole('super_admin', 'admin', 'director'),
  requirePermission('users', 'create'),
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('role').isIn(['admin', 'director', 'teacher', 'accountant', 'receptionist']),
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ success: false, error: errors.array()[0].msg });
      const { name, email, password, phone, role } = req.body;
      const bcrypt = await import('bcryptjs');
      const passwordHash = await bcrypt.hash(password, 12);
      const user = await User.create({ schoolId: req.user!.schoolId!, name, email, passwordHash, phone, role });
      await logAudit(req, { action: 'invite', entity: 'user', entityId: user.id, details: { name, email, role } });
      return res.status(201).json({ success: true, data: { user } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

router.patch('/users/:id',
  requireRole('super_admin', 'admin', 'director'),
  requirePermission('users', 'update'),
  async (req: Request, res: Response) => {
  try {
    const user = await User.findOne({ where: { id: req.params.id, schoolId: req.user!.schoolId! } });
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });
    const allowed = ['name', 'email', 'phone', 'role', 'isActive'];
    const updates: any = {};
    for (const field of allowed) { if (req.body[field] !== undefined) updates[field] = req.body[field]; }
    await user.update(updates);
    return res.json({ success: true, data: { user } });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.delete('/users/:id',
  requireRole('super_admin', 'admin', 'director'),
  requirePermission('users', 'update'),
  async (req: Request, res: Response) => {
  try {
    const user = await User.findOne({ where: { id: req.params.id, schoolId: req.user!.schoolId! } });
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });
    if (user.id === req.user!.id) return res.status(400).json({ success: false, error: 'Cannot delete yourself' });
    await user.update({ isActive: false });
    return res.json({ success: true, data: { message: 'User deactivated' } });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// PATCH /logo - Upload school logo
router.patch('/logo',
  requireRole('super_admin', 'admin', 'director'),
  requirePermission('settings', 'manage'),
  upload.single('logo'),
  async (req: Request, res: Response) => {
    try {
      const school = await School.findByPk(req.user!.schoolId!);
      if (!school) return res.status(404).json({ success: false, error: 'School not found' });
      if (!req.file) return res.status(400).json({ success: false, error: 'No logo uploaded' });
      const logoUrl = await storePhoto(
        req.file.path,
        req.file.originalname,
        req.user!.schoolId!,
        'schools',
        req.user!.schoolId!
      );
      await school.update({ logo: logoUrl });
      return res.json({ success: true, data: { school } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

export default router;
