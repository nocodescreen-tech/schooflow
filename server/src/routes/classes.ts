import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { authenticateToken } from '../middleware/auth.js';
import { requireRole, requirePermission } from '../middleware/rbac.js';
import { Class, Student, Subject, User } from '../models/index.js';
import { getPagination, getSort, pages } from '../utils/listQuery.js';
import { WebSocketEvents } from '../services/websocket.js';

const STAFF_READ = ['super_admin', 'admin', 'director', 'teacher', 'accountant', 'receptionist'] as const;
const SINGLE_READ = [...STAFF_READ, 'parent', 'student'] as const;

const router = Router();
router.use(authenticateToken);

router.get('/',
  requireRole(...STAFF_READ),
  requirePermission('classes', 'view'),
  async (req: Request, res: Response) => {
  try {
    const { page, limit, offset } = getPagination(req.query);
    const sort = getSort(req.query, { name: 'name', level: 'level', createdAt: 'createdAt' }, 'name', 'ASC');
    if (!sort) return res.status(400).json({ success: false, error: 'Invalid sortBy or sortOrder' });
    const { count, rows: classes } = await Class.findAndCountAll({
      where: { schoolId: req.user!.schoolId! },
      include: [
        { model: User, as: 'teacher', attributes: ['id', 'name'] },
        { model: Student, as: 'students', attributes: ['id', 'firstName', 'lastName'] },
        { model: Subject, as: 'subjects' },
      ],
      order: [[sort.column, sort.order]],
      limit,
      offset,
    });
    return res.json({ success: true, data: { items: classes, total: count, page, pages: pages(count, limit) } });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.post('/',
  requireRole('super_admin', 'admin', 'director'),
  requirePermission('classes', 'create'),
  body('name').trim().notEmpty().withMessage('Class name is required'),
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, error: errors.array()[0].msg });
      }
      const { name, level, section, capacity, teacherId, academicYear } = req.body;
      const newClass = await Class.create({ schoolId: req.user!.schoolId!, name, level, section, capacity, teacherId, academicYear });

      // Emit real-time event
      const teacher = teacherId ? await User.findByPk(teacherId, { attributes: ['name'] }) : null;
      const studentCount = await Student.count({ where: { classId: newClass.id } });

      WebSocketEvents.class.created(req.user!.schoolId!, {
        id: newClass.id,
        name: newClass.name,
        level: newClass.level,
        teacherId: newClass.teacherId,
        teacherName: teacher?.name,
        studentCount,
        action: 'created',
      });

      return res.status(201).json({ success: true, data: { class: newClass } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

router.get('/:id',
  requireRole(...SINGLE_READ),
  requirePermission('classes', 'view'),
  async (req: Request, res: Response) => {
  try {
    const newClass = await Class.findOne({
      where: { id: req.params.id, schoolId: req.user!.schoolId! },
      include: [
        { model: User, as: 'teacher' },
        { model: Student, as: 'students' },
        { model: Subject, as: 'subjects', include: [{ model: User, as: 'teacher', attributes: ['id', 'name'] }] },
      ],
    });
    if (!newClass) return res.status(404).json({ success: false, error: 'Class not found' });
    return res.json({ success: true, data: { class: newClass } });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.patch('/:id',
  requireRole('super_admin', 'admin', 'director'),
  requirePermission('classes', 'update'),
  async (req: Request, res: Response) => {
  try {
    const newClass = await Class.findOne({ where: { id: req.params.id, schoolId: req.user!.schoolId! } });
    if (!newClass) return res.status(404).json({ success: false, error: 'Class not found' });
    const allowed = ['name', 'level', 'section', 'capacity', 'teacherId', 'academicYear'];
    const updates: any = {};
    for (const field of allowed) { if (req.body[field] !== undefined) updates[field] = req.body[field]; }
    await newClass.update(updates);

    // Emit real-time event
    const teacher = newClass.teacherId ? await User.findByPk(newClass.teacherId, { attributes: ['name'] }) : null;
    const studentCount = await Student.count({ where: { classId: newClass.id } });

    WebSocketEvents.class.updated(req.user!.schoolId!, {
      id: newClass.id,
      name: newClass.name,
      level: newClass.level,
      teacherId: newClass.teacherId,
      teacherName: teacher?.name,
      studentCount,
      action: 'updated',
    });

    return res.json({ success: true, data: { class: newClass } });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.delete('/:id',
  requireRole('super_admin', 'admin', 'director'),
  requirePermission('classes', 'delete'),
  async (req: Request, res: Response) => {
  try {
    const newClass = await Class.findOne({ where: { id: req.params.id, schoolId: req.user!.schoolId! } });
    if (!newClass) return res.status(404).json({ success: false, error: 'Class not found' });

    const classId = newClass.id;
    const className = newClass.name;
    const teacherId = newClass.teacherId;

    await newClass.destroy();

    // Emit real-time event
    WebSocketEvents.class.deleted(req.user!.schoolId!, {
      id: classId,
      name: className,
      teacherId,
      studentCount: 0,
      action: 'deleted',
    });

    return res.json({ success: true, data: { message: 'Class deleted' } });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

export default router;
