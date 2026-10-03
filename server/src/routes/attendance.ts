import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { authenticateToken } from '../middleware/auth.js';
import { requireRole, requirePermission, assertTeacherScope } from '../middleware/rbac.js';
import { AppError } from '../middleware/errorHandler.js';
import { Attendance, Student, Class } from '../models/index.js';
import { getPagination, getSort, pages } from '../utils/listQuery.js';
import { WebSocketEvents } from '../services/websocket.js';

const router = Router();
router.use(authenticateToken);

router.get('/',
  requireRole('super_admin', 'admin', 'director', 'teacher', 'accountant', 'receptionist'),
  requirePermission('attendance', 'view'),
  async (req: Request, res: Response) => {
  try {
    const { classId, date, studentId } = req.query;
    const where: any = { schoolId: req.user!.schoolId! };
    if (classId) where.classId = classId;
    if (date) where.date = date;
    if (studentId) where.studentId = studentId;

    const { page, limit, offset } = getPagination(req.query);
    const sort = getSort(req.query, { date: 'date', status: 'status', createdAt: 'createdAt' }, 'date', 'DESC');
    if (!sort) return res.status(400).json({ success: false, error: 'Invalid sortBy or sortOrder' });

    const { count, rows: attendance } = await Attendance.findAndCountAll({
      where,
      include: [{ model: Student, as: 'student', attributes: ['id', 'firstName', 'lastName', 'studentId'] }],
      order: [[sort.column, sort.order]],
      limit,
      offset,
    });
    return res.json({ success: true, data: { items: attendance, total: count, page, pages: pages(count, limit) } });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.post('/',
  requireRole('super_admin', 'admin', 'director', 'teacher'),
  requirePermission('attendance', 'create'),
  body('classId').isUUID().withMessage('Valid class ID is required'),
  body('date').isISO8601().withMessage('Valid date is required'),
  body('records').isArray().withMessage('Records must be an array'),
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ success: false, error: errors.array()[0].msg });
      const { classId, date, records } = req.body;
      const schoolId = req.user!.schoolId!;
      try {
        await assertTeacherScope(req, classId);
      } catch (scopeError) {
        const status = scopeError instanceof AppError ? scopeError.statusCode : 403;
        return res.status(status).json({ success: false, error: (scopeError as Error).message });
      }

      const results = [];
      for (const record of records) {
        const [attendance, created] = await Attendance.findOrCreate({
          where: { schoolId, studentId: record.studentId, classId, date },
          defaults: { schoolId, studentId: record.studentId, classId, date, status: record.status, notes: record.notes },
        });
        if (!created) {
          await attendance.update({ status: record.status, notes: record.notes });
        }
        results.push(attendance);
      }

      // Emit real-time events
      const classRecord = await Class.findByPk(classId, { attributes: ['name'] });
      const sId = req.user!.schoolId!;
      for (const record of records) {
        const student = await Student.findByPk(record.studentId, { attributes: ['firstName', 'lastName', 'studentId'] });
        WebSocketEvents.attendance.created(sId, {
          id: record.id || 'new',
          studentId: record.studentId,
          studentName: student ? `${student.lastName} ${student.firstName}` : 'Unknown',
          classId,
          className: classRecord?.name || 'Unknown',
          status: record.status,
          date,
          action: 'created',
        });
      }

      return res.status(201).json({ success: true, data: { items: results } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

router.patch('/:id',
  requireRole('super_admin', 'admin', 'director', 'teacher'),
  requirePermission('attendance', 'update'),
  async (req: Request, res: Response) => {
  try {
    const attendance = await Attendance.findOne({ where: { id: req.params.id, schoolId: req.user!.schoolId! } });
    if (!attendance) return res.status(404).json({ success: false, error: 'Attendance not found' });
    try {
      await assertTeacherScope(req, attendance.classId);
    } catch (scopeError) {
      const status = scopeError instanceof AppError ? scopeError.statusCode : 403;
      return res.status(status).json({ success: false, error: (scopeError as Error).message });
    }
    const allowed = ['status', 'notes'];
    const updates: any = {};
    for (const field of allowed) { if (req.body[field] !== undefined) updates[field] = req.body[field]; }
    await attendance.update(updates);
    return res.json({ success: true, data: { attendance } });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

export default router;
