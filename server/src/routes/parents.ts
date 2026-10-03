import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { Op, fn, col } from 'sequelize';
import { authenticateToken } from '../middleware/auth.js';
import { requireRole, requirePermission } from '../middleware/rbac.js';
import { Parent, Student, StudentParent, Class } from '../models/index.js';
import { logAudit } from '../middleware/auditLog.js';
import { getPagination, pages } from '../utils/listQuery.js';
import { requireModule } from '../utils/modules.js';

const router = Router();
router.use(authenticateToken);
router.use(requireModule('parents'));

const VIEW_ROLES = ['super_admin', 'admin', 'director', 'teacher', 'accountant', 'receptionist', 'prefect'] as const;
const WRITE_ROLES = ['super_admin', 'admin', 'director', 'receptionist'] as const;

router.get('/',
  requireRole(...VIEW_ROLES),
  requirePermission('parents', 'view'),
  async (req: Request, res: Response) => {
    try {
      const schoolId = req.user!.schoolId!;
      const { search, childrenCount } = req.query;
      const where: any = { schoolId };
      if (search) {
        where[Op.or] = [
          { firstName: { [Op.iLike]: `%${search}%` } },
          { lastName: { [Op.iLike]: `%${search}%` } },
          { phone: { [Op.iLike]: `%${search}%` } },
          { email: { [Op.iLike]: `%${search}%` } },
        ];
      }
      const { page, limit, offset } = getPagination(req.query);
      const { count, rows } = await Parent.findAndCountAll({
        where,
        order: [['lastName', 'ASC'], ['firstName', 'ASC']],
        limit,
        offset,
      });
      let items: unknown[] = rows;
      if (childrenCount === 'true' || childrenCount === '1') {
        const ids = rows.map((p) => p.id);
        const counts = ids.length > 0
          ? await StudentParent.findAll({
              attributes: ['parentId', [fn('COUNT', col('StudentParent.id')), 'count']],
              where: { parentId: { [Op.in]: ids } },
              group: ['parentId'],
              raw: true,
            }) as unknown as Array<{ parentId: string; count: string }>
          : [];
        const map = new Map(counts.map((c) => [c.parentId, Number(c.count)]));
        items = rows.map((p) => ({ ...(p.toJSON() as object), childrenCount: map.get(p.id) || 0 }));
      }
      return res.json({ success: true, data: { items, total: count, page, pages: pages(count, limit) } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

router.post('/',
  requireRole(...WRITE_ROLES),
  requirePermission('parents', 'create'),
  body('firstName').trim().notEmpty().withMessage('First name is required'),
  body('lastName').trim().notEmpty().withMessage('Last name is required'),
  body('email').optional().isEmail().withMessage('Valid email is required'),
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ success: false, error: errors.array()[0].msg });
      const { firstName, lastName, phone, email, address, profession } = req.body;
      const parent = await Parent.create({ schoolId: req.user!.schoolId!, firstName, lastName, phone, email, address, profession });
      await logAudit(req, { action: 'create', entity: 'parent', entityId: parent.id, details: { firstName, lastName } });
      return res.status(201).json({ success: true, data: { parent } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

router.get('/:id',
  requireRole(...VIEW_ROLES),
  requirePermission('parents', 'view'),
  async (req: Request, res: Response) => {
    try {
      const parent = await Parent.findOne({
        where: { id: req.params.id, schoolId: req.user!.schoolId! },
        include: [{
          model: Student,
          as: 'children',
          attributes: ['id', 'firstName', 'lastName', 'studentId', 'classId', 'status'],
          include: [{ model: Class, as: 'class', attributes: ['id', 'name'] }],
          through: { attributes: ['relation', 'isPrimaryContact', 'emergencyContact'] },
        }],
      });
      if (!parent) return res.status(404).json({ success: false, error: 'Parent not found' });
      return res.json({ success: true, data: { parent } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

router.patch('/:id',
  requireRole(...WRITE_ROLES),
  requirePermission('parents', 'update'),
  async (req: Request, res: Response) => {
    try {
      const parent = await Parent.findOne({ where: { id: req.params.id, schoolId: req.user!.schoolId! } });
      if (!parent) return res.status(404).json({ success: false, error: 'Parent not found' });
      const allowed = ['firstName', 'lastName', 'phone', 'email', 'address', 'profession'];
      const updates: Record<string, unknown> = {};
      for (const f of allowed) if (req.body[f] !== undefined) updates[f] = req.body[f];
      await parent.update(updates);
      await logAudit(req, { action: 'update', entity: 'parent', entityId: parent.id, details: updates });
      return res.json({ success: true, data: { parent } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

router.delete('/:id',
  requireRole(...WRITE_ROLES),
  requirePermission('parents', 'delete'),
  async (req: Request, res: Response) => {
    try {
      const parent = await Parent.findOne({ where: { id: req.params.id, schoolId: req.user!.schoolId! } });
      if (!parent) return res.status(404).json({ success: false, error: 'Parent not found' });
      await StudentParent.destroy({ where: { parentId: parent.id } });
      await parent.destroy();
      await logAudit(req, { action: 'delete', entity: 'parent', entityId: req.params.id });
      return res.json({ success: true, data: { message: 'Parent deleted' } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

router.post('/:id/children',
  requireRole(...WRITE_ROLES),
  requirePermission('parents', 'create'),
  body('studentId').isUUID().withMessage('Valid student ID is required'),
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ success: false, error: errors.array()[0].msg });
      const schoolId = req.user!.schoolId!;
      const parent = await Parent.findOne({ where: { id: req.params.id, schoolId } });
      if (!parent) return res.status(404).json({ success: false, error: 'Parent not found' });
      const { studentId, relation, isPrimaryContact, emergencyContact, authorization } = req.body;
      const student = await Student.findOne({ where: { id: studentId, schoolId } });
      if (!student) return res.status(404).json({ success: false, error: 'Student not found' });
      const [link] = await StudentParent.findOrCreate({
        where: { studentId, parentId: parent.id },
        defaults: {
          studentId,
          parentId: parent.id,
          relation: relation || 'parent',
          isPrimaryContact: !!isPrimaryContact,
          emergencyContact: !!emergencyContact,
          authorization,
        },
      });
      await logAudit(req, { action: 'link', entity: 'student_parent', entityId: link.id, details: { studentId, parentId: parent.id } });
      return res.status(201).json({ success: true, data: { link } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

router.delete('/:id/children/:studentId',
  requireRole(...WRITE_ROLES),
  requirePermission('parents', 'delete'),
  async (req: Request, res: Response) => {
    try {
      const parent = await Parent.findOne({ where: { id: req.params.id, schoolId: req.user!.schoolId! } });
      if (!parent) return res.status(404).json({ success: false, error: 'Parent not found' });
      const deleted = await StudentParent.destroy({ where: { parentId: parent.id, studentId: req.params.studentId } });
      if (!deleted) return res.status(404).json({ success: false, error: 'Link not found' });
      await logAudit(req, { action: 'unlink', entity: 'student_parent', details: { studentId: req.params.studentId, parentId: parent.id } });
      return res.json({ success: true, data: { message: 'Link removed' } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

export default router;
