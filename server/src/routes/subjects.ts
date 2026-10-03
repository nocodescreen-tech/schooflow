import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { authenticateToken } from '../middleware/auth.js';
import { requireRole, requirePermission } from '../middleware/rbac.js';
import { Subject, User, Class } from '../models/index.js';
import { logAudit } from '../middleware/auditLog.js';
import { getPagination, pages } from '../utils/listQuery.js';

const router = Router();
router.use(authenticateToken);

const VIEW_ROLES = ['super_admin', 'admin', 'director', 'teacher', 'accountant', 'receptionist', 'prefect'] as const;
const WRITE_ROLES = ['super_admin', 'admin', 'director'] as const;

router.get('/',
  requireRole(...VIEW_ROLES),
  requirePermission('subjects', 'view'),
  async (req: Request, res: Response) => {
    try {
      const schoolId = req.user!.schoolId!;
      const { classId, search } = req.query;
      const where: Record<string, unknown> = { schoolId };
      if (classId) where.classId = classId;
      const { page, limit, offset } = getPagination(req.query);
      const { count, rows } = await Subject.findAndCountAll({
        where,
        include: [
          { model: User, as: 'teacher', attributes: ['id', 'name'] },
          { model: Class, as: 'class', attributes: ['id', 'name'] },
        ],
        order: [['name', 'ASC']],
        limit,
        offset,
      });
      let items: unknown[] = rows;
      if (search) {
        const q = String(search).toLowerCase();
        items = rows.filter((s) => s.name.toLowerCase().includes(q) || (s.code || '').toLowerCase().includes(q));
      }
      return res.json({ success: true, data: { items, total: count, page, pages: pages(count, limit) } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

router.post('/',
  requireRole(...WRITE_ROLES),
  requirePermission('subjects', 'create'),
  body('name').trim().notEmpty().withMessage('Name is required'),
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ success: false, error: errors.array()[0].msg });
      const { name, code, coefficient, department, teacherId, classId } = req.body;
      const subject = await Subject.create({
        schoolId: req.user!.schoolId!,
        name,
        code,
        coefficient: coefficient ?? 1,
        department,
        teacherId: teacherId || null,
        classId: classId || null,
      });
      await logAudit(req, { action: 'create', entity: 'subject', entityId: subject.id, details: { name } });
      return res.status(201).json({ success: true, data: { subject } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

router.patch('/:id',
  requireRole(...WRITE_ROLES),
  requirePermission('subjects', 'update'),
  async (req: Request, res: Response) => {
    try {
      const subject = await Subject.findOne({ where: { id: req.params.id, schoolId: req.user!.schoolId! } });
      if (!subject) return res.status(404).json({ success: false, error: 'Subject not found' });
      const allowed = ['name', 'code', 'coefficient', 'department', 'teacherId', 'classId'];
      const updates: Record<string, unknown> = {};
      for (const f of allowed) if (req.body[f] !== undefined) updates[f] = req.body[f];
      await subject.update(updates);
      await logAudit(req, { action: 'update', entity: 'subject', entityId: subject.id, details: updates });
      return res.json({ success: true, data: { subject } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

router.delete('/:id',
  requireRole(...WRITE_ROLES),
  requirePermission('subjects', 'delete'),
  async (req: Request, res: Response) => {
    try {
      const subject = await Subject.findOne({ where: { id: req.params.id, schoolId: req.user!.schoolId! } });
      if (!subject) return res.status(404).json({ success: false, error: 'Subject not found' });
      await subject.destroy();
      await logAudit(req, { action: 'delete', entity: 'subject', entityId: req.params.id });
      return res.json({ success: true, data: { message: 'Subject deleted' } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

export default router;
