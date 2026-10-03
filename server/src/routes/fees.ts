import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { authenticateToken } from '../middleware/auth.js';
import { requireRole, requirePermission } from '../middleware/rbac.js';
import { Fee, Student, Payment, Class } from '../models/index.js';
import { Op } from 'sequelize';
import { logAudit } from '../middleware/auditLog.js';
import { getPagination, getSort, pages } from '../utils/listQuery.js';
import { requireModule } from '../utils/modules.js';
import { WebSocketEvents } from '../services/websocket.js';

const router = Router();
router.use(authenticateToken);
router.use(requireModule('finance'));

router.get('/',
  requireRole('super_admin', 'admin', 'director', 'teacher', 'accountant', 'receptionist'),
  requirePermission('fees', 'view'),
  async (req: Request, res: Response) => {
  try {
    const { studentId, status, type } = req.query;
    const where: any = { schoolId: req.user!.schoolId! };
    if (studentId) where.studentId = studentId;
    if (status) where.status = status;
    if (type) where.type = type;

    const { page, limit, offset } = getPagination(req.query);
    const sort = getSort(req.query, { dueDate: 'dueDate', totalAmount: 'totalAmount', status: 'status', createdAt: 'createdAt' }, 'dueDate', 'ASC');
    if (!sort) return res.status(400).json({ success: false, error: 'Invalid sortBy or sortOrder' });

    const { count, rows: fees } = await Fee.findAndCountAll({
      where,
      include: [{ model: Student, as: 'student', attributes: ['id', 'firstName', 'lastName', 'studentId'] }],
      order: [[sort.column, sort.order]],
      limit,
      offset,
    });
    return res.json({ success: true, data: { items: fees, total: count, page, pages: pages(count, limit) } });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.post('/',
  requireRole('super_admin', 'admin', 'director', 'accountant'),
  requirePermission('fees', 'create'),
  body('studentId').isUUID().withMessage('Valid student ID is required'),
  body('type').isIn(['tuition', 'registration', 'exam', 'transport', 'canteen', 'uniform', 'other']),
  body('totalAmount').isFloat({ min: 0 }).withMessage('Total amount must be positive'),
  body('dueDate').isISO8601().withMessage('Valid due date is required'),
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ success: false, error: errors.array()[0].msg });

      const { studentId, type, totalAmount, dueDate, academicYear, term, notes, installments } = req.body;
      const numInstallments = Math.max(1, installments || 1);
      const installmentAmount = Number(totalAmount) / numInstallments;

      const fee = await Fee.create({
        schoolId: req.user!.schoolId!,
        studentId,
        type,
        amount: installmentAmount,
        totalAmount,
        paidAmount: 0,
        installments: numInstallments,
        dueDate,
        academicYear,
        term,
        notes,
      });

      await logAudit(req, { action: 'create', entity: 'fee', entityId: fee.id, details: { totalAmount, installments: numInstallments } });

      // Emit real-time event
      const student = await Student.findByPk(studentId, { attributes: ['firstName', 'lastName', 'studentId', 'classId'] });
      const studentClass = student?.classId ? await Class.findByPk(student.classId, { attributes: ['name'] }) : null;

      WebSocketEvents.fee.created(req.user!.schoolId!, {
        id: fee.id,
        studentId,
        studentName: student ? `${student.lastName} ${student.firstName}` : 'Unknown',
        className: studentClass?.name,
        type,
        totalAmount: Number(totalAmount),
        paidAmount: 0,
        balance: Number(totalAmount),
        dueDate,
        status: fee.status,
        action: 'created',
      });

      return res.status(201).json({ success: true, data: { fee, installmentAmount } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

router.patch('/:id',
  requireRole('super_admin', 'admin', 'director', 'accountant'),
  requirePermission('fees', 'update'),
  async (req: Request, res: Response) => {
  try {
    const fee = await Fee.findOne({ where: { id: req.params.id, schoolId: req.user!.schoolId! } });
    if (!fee) return res.status(404).json({ success: false, error: 'Fee not found' });
    const allowed = ['type', 'amount', 'totalAmount', 'dueDate', 'status', 'notes'];
    const updates: any = {};
    for (const field of allowed) { if (req.body[field] !== undefined) updates[field] = req.body[field]; }
    await fee.update(updates);

    await logAudit(req, { action: 'update', entity: 'fee', entityId: fee.id, details: updates });

    // Emit real-time event
    const student = await Student.findByPk(fee.studentId, { attributes: ['firstName', 'lastName', 'studentId', 'classId'] });
    const studentClass = student?.classId ? await Class.findByPk(student.classId, { attributes: ['name'] }) : null;

    WebSocketEvents.fee.updated(req.user!.schoolId!, {
      id: fee.id,
      studentId: fee.studentId,
      studentName: student ? `${student.lastName} ${student.firstName}` : 'Unknown',
      className: studentClass?.name,
      type: fee.type,
      totalAmount: Number(fee.totalAmount),
      paidAmount: Number(fee.paidAmount),
      balance: Number(fee.totalAmount) - Number(fee.paidAmount),
      dueDate: fee.dueDate?.toISOString() || '',
      status: fee.status,
      action: 'updated',
    });

    return res.json({ success: true, data: { fee } });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.get('/overdue',
  requireRole('super_admin', 'admin', 'director', 'teacher', 'accountant', 'receptionist'),
  requirePermission('fees', 'view'),
  async (req: Request, res: Response) => {
  try {
    const fees = await Fee.findAll({
      where: { schoolId: req.user!.schoolId!, status: { [Op.in]: ['pending', 'partial'] }, dueDate: { [Op.lt]: new Date() } },
      include: [{ model: Student, as: 'student', attributes: ['id', 'firstName', 'lastName', 'studentId'] }],
      order: [['dueDate', 'ASC']],
    });
    return res.json({ success: true, data: { items: fees } });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

export default router;
