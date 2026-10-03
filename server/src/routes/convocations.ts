import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { authenticateToken } from '../middleware/auth.js';
import { requireRole, requirePermission } from '../middleware/rbac.js';
import { Convocation, Student, Parent } from '../models/index.js';
import { logAudit } from '../middleware/auditLog.js';
import { getPagination, pages } from '../utils/listQuery.js';
import { requireModule } from '../utils/modules.js';

const router = Router();
router.use(authenticateToken);
router.use(requireModule('discipline'));

const GUARD = ['super_admin', 'admin', 'director', 'prefect', 'receptionist'] as const;

router.get('/',
  requireRole(...GUARD),
  requirePermission('discipline', 'view'),
  async (req: Request, res: Response) => {
    try {
      const schoolId = req.user!.schoolId!;
      const { studentId, status } = req.query;
      const where: Record<string, unknown> = { schoolId };
      if (studentId) where.studentId = studentId;
      if (status) where.status = status;
      const { page, limit, offset } = getPagination(req.query);
      const { count, rows } = await Convocation.findAndCountAll({
        where,
        include: [
          { model: Student, as: 'student', attributes: ['id', 'firstName', 'lastName', 'studentId'] },
          { model: Parent, as: 'parent', attributes: ['id', 'firstName', 'lastName'] },
        ],
        order: [['date', 'DESC']],
        limit,
        offset,
      });
      return res.json({ success: true, data: { items: rows, total: count, page, pages: pages(count, limit) } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

router.post('/',
  requireRole(...GUARD),
  requirePermission('discipline', 'create'),
  body('studentId').isUUID().withMessage('Valid student ID is required'),
  body('date').notEmpty().withMessage('Date is required'),
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ success: false, error: errors.array()[0].msg });
      const schoolId = req.user!.schoolId!;
      const { studentId, parentId, date, reason, status } = req.body;
      const student = await Student.findOne({ where: { id: studentId, schoolId } });
      if (!student) return res.status(404).json({ success: false, error: 'Student not found' });
      if (parentId) {
        const parent = await Parent.findOne({ where: { id: parentId, schoolId } });
        if (!parent) return res.status(404).json({ success: false, error: 'Parent not found' });
      }
      const convocation = await Convocation.create({
        schoolId,
        studentId,
        parentId: parentId || null,
        date: new Date(date),
        reason,
        status: status || 'envoyee',
      });
      await logAudit(req, { action: 'create', entity: 'convocation', entityId: convocation.id, details: { studentId } });
      return res.status(201).json({ success: true, data: { convocation } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

router.patch('/:id',
  requireRole(...GUARD),
  requirePermission('discipline', 'manage'),
  body('status').optional().isIn(['envoyee', 'confirmee', 'terminee']),
  async (req: Request, res: Response) => {
    try {
      const convocation = await Convocation.findOne({ where: { id: req.params.id, schoolId: req.user!.schoolId! } });
      if (!convocation) return res.status(404).json({ success: false, error: 'Convocation not found' });
      const allowed = ['date', 'reason', 'status', 'parentId'];
      const updates: Record<string, unknown> = {};
      for (const f of allowed) if (req.body[f] !== undefined) updates[f] = req.body[f];
      await convocation.update(updates);
      await logAudit(req, { action: 'update', entity: 'convocation', entityId: convocation.id, details: updates });
      return res.json({ success: true, data: { convocation } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

export default router;
