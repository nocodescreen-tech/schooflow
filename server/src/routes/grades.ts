import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { authenticateToken } from '../middleware/auth.js';
import { requireRole, requirePermission, assertTeacherScope } from '../middleware/rbac.js';
import { AppError } from '../middleware/errorHandler.js';
import { Grade, Student, Subject, Class } from '../models/index.js';
import { logAudit } from '../middleware/auditLog.js';
import { getPagination, getSort, pages } from '../utils/listQuery.js';
import { WebSocketEvents } from '../services/websocket.js';

const router = Router();
router.use(authenticateToken);

router.get('/',
  requireRole('super_admin', 'admin', 'director', 'teacher', 'accountant', 'receptionist'),
  requirePermission('grades', 'view'),
  async (req: Request, res: Response) => {
  try {
    const { classId, subjectId, term, studentId } = req.query;
    const where: any = { schoolId: req.user!.schoolId! };
    if (subjectId) where.subjectId = subjectId;
    if (term) where.term = parseInt(term as string);
    if (studentId) where.studentId = studentId;

    const { page, limit, offset } = getPagination(req.query);
    const sort = getSort(req.query, { date: 'date', score: 'score', term: 'term', createdAt: 'createdAt' }, 'date', 'DESC');
    if (!sort) return res.status(400).json({ success: false, error: 'Invalid sortBy or sortOrder' });

    const { count, rows: grades } = await Grade.findAndCountAll({
      where,
      include: [
        { model: Student, as: 'student', attributes: ['id', 'firstName', 'lastName', 'studentId'] },
        { model: Subject, as: 'subject', attributes: ['id', 'name', 'code'] },
      ],
      order: [[sort.column, sort.order]],
      limit,
      offset,
    });
    return res.json({ success: true, data: { items: grades, total: count, page, pages: pages(count, limit) } });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.post('/',
  requireRole('super_admin', 'admin', 'director', 'teacher'),
  requirePermission('grades', 'create'),
  body('studentId').isUUID().withMessage('Valid student ID is required'),
  body('subjectId').isUUID().withMessage('Valid subject ID is required'),
  body('score').isFloat({ min: 0, max: 20 }).withMessage('Score must be between 0 and 20'),
  body('term').isInt({ min: 1, max: 3 }).withMessage('Term must be 1, 2, or 3'),
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ success: false, error: errors.array()[0].msg });
      const { studentId, subjectId, examType, examName, score, coefficient, term, academicYear, date } = req.body;
      try {
        await assertTeacherScope(req, undefined, subjectId, studentId);
      } catch (scopeError) {
        const status = scopeError instanceof AppError ? scopeError.statusCode : 403;
        return res.status(status).json({ success: false, error: (scopeError as Error).message });
      }
      const grade = await Grade.create({ schoolId: req.user!.schoolId!, studentId, subjectId, examType, examName, score, coefficient, term, academicYear, date, createdBy: req.user!.id });
      await logAudit(req, { action: 'create', entity: 'grade', entityId: grade.id, details: { studentId, subjectId, score } });

      // Emit real-time event
      const student = await Student.findByPk(studentId, { attributes: ['firstName', 'lastName', 'studentId', 'classId'] });
      const subject = await Subject.findByPk(subjectId, { attributes: ['name', 'code'] });
      const studentClass = student?.classId ? await Class.findByPk(student.classId, { attributes: ['name'] }) : null;

      WebSocketEvents.grade.created(req.user!.schoolId!, {
        id: grade.id,
        studentId,
        studentName: student ? `${student.lastName} ${student.firstName}` : 'Unknown',
        className: studentClass?.name,
        subjectId,
        subjectName: subject?.name || 'Unknown',
        score: Number(score),
        coefficient: Number(coefficient) || 1,
        term,
        academicYear: academicYear || '',
        action: 'created',
      });

      return res.status(201).json({ success: true, data: { grade } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

router.patch('/:id',
  requireRole('super_admin', 'admin', 'director', 'teacher'),
  requirePermission('grades', 'update'),
  async (req: Request, res: Response) => {
  try {
    const grade = await Grade.findOne({ where: { id: req.params.id, schoolId: req.user!.schoolId! } });
    if (!grade) return res.status(404).json({ success: false, error: 'Grade not found' });
    try {
      await assertTeacherScope(req, undefined, grade.subjectId ?? undefined, grade.studentId);
    } catch (scopeError) {
      const status = scopeError instanceof AppError ? scopeError.statusCode : 403;
      return res.status(status).json({ success: false, error: (scopeError as Error).message });
    }
    const allowed = ['examType', 'examName', 'score', 'coefficient', 'term', 'date'];
    const updates: any = {};
    for (const field of allowed) { if (req.body[field] !== undefined) updates[field] = req.body[field]; }
    await grade.update(updates);
    await logAudit(req, { action: 'update', entity: 'grade', entityId: grade.id, details: updates });

    // Emit real-time event
    const student = await Student.findByPk(grade.studentId, { attributes: ['firstName', 'lastName', 'studentId', 'classId'] });
    const subject = await Subject.findByPk(grade.subjectId as string, { attributes: ['name', 'code'] });
    const studentClass = student?.classId ? await Class.findByPk(student.classId, { attributes: ['name'] }) : null;

    WebSocketEvents.grade.updated(req.user!.schoolId!, {
      id: grade.id,
      studentId: grade.studentId,
      studentName: student ? `${student.lastName} ${student.firstName}` : 'Unknown',
      className: studentClass?.name,
      subjectId: grade.subjectId || '',
      subjectName: subject?.name || 'Unknown',
      score: Number(grade.score),
      coefficient: Number(grade.coefficient) || 1,
      term: grade.term,
      academicYear: grade.academicYear || '',
      action: 'updated',
    });

    return res.json({ success: true, data: { grade } });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.delete('/:id',
  requireRole('super_admin', 'admin', 'director', 'teacher'),
  requirePermission('grades', 'delete'),
  async (req: Request, res: Response) => {
  try {
    const grade = await Grade.findOne({ where: { id: req.params.id, schoolId: req.user!.schoolId! } });
    if (!grade) return res.status(404).json({ success: false, error: 'Grade not found' });

    // Store data for WebSocket event before destroying
    const gradeId = grade.id;
    const studentId = grade.studentId;
    const subjectId = grade.subjectId;

    await grade.destroy();
    await logAudit(req, { action: 'delete', entity: 'grade', entityId: req.params.id });

    // Emit real-time event
    const student = await Student.findByPk(studentId, { attributes: ['firstName', 'lastName', 'studentId', 'classId'] });
    const subject = await Subject.findByPk(subjectId as string, { attributes: ['name', 'code'] });
    const studentClass = student?.classId ? await Class.findByPk(student.classId, { attributes: ['name'] }) : null;

    WebSocketEvents.grade.deleted(req.user!.schoolId!, {
      id: gradeId,
      studentId,
      studentName: student ? `${student.lastName} ${student.firstName}` : 'Unknown',
      className: studentClass?.name,
      subjectId: subjectId || '',
      subjectName: subject?.name || 'Unknown',
      score: 0,
      coefficient: 1,
      term: 1,
      academicYear: '',
      action: 'deleted',
    });

    return res.json({ success: true, data: { message: 'Grade deleted' } });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.post('/:id/submit',
  requireRole('super_admin', 'admin', 'director', 'teacher'),
  requirePermission('grades', 'update'),
  async (req: Request, res: Response) => {
  try {
    const grade = await Grade.findOne({ where: { id: req.params.id, schoolId: req.user!.schoolId! } });
    if (!grade) return res.status(404).json({ success: false, error: 'Grade not found' });
    const current = (grade.status as string) || 'DRAFT';
    if (current !== 'DRAFT') {
      return res.status(400).json({ success: false, error: 'Only DRAFT grades can be submitted' });
    }
    await grade.update({ status: 'SUBMITTED' });
    await logAudit(req, { action: 'submit', entity: 'grade', entityId: grade.id });
    return res.json({ success: true, data: { grade } });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.post('/:id/validate',
  requireRole('super_admin', 'admin', 'director', 'teacher'),
  requirePermission('grades', 'update'),
  async (req: Request, res: Response) => {
  try {
    const grade = await Grade.findOne({ where: { id: req.params.id, schoolId: req.user!.schoolId! } });
    if (!grade) return res.status(404).json({ success: false, error: 'Grade not found' });
    const current = (grade.status as string) || 'DRAFT';
    if (current !== 'SUBMITTED') {
      return res.status(400).json({ success: false, error: 'Only SUBMITTED grades can be validated' });
    }
    await grade.update({ status: 'VALIDATED' });
    await logAudit(req, { action: 'validate', entity: 'grade', entityId: grade.id });
    return res.json({ success: true, data: { grade } });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.post('/:id/publish',
  requireRole('super_admin', 'admin', 'director', 'teacher'),
  requirePermission('grades', 'publish'),
  async (req: Request, res: Response) => {
  try {
    const grade = await Grade.findOne({ where: { id: req.params.id, schoolId: req.user!.schoolId! } });
    if (!grade) return res.status(404).json({ success: false, error: 'Grade not found' });
    await grade.update({ status: 'PUBLISHED' });
    await logAudit(req, { action: 'publish', entity: 'grade', entityId: grade.id });
    return res.json({ success: true, data: { grade } });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

export default router;
