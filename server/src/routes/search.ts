import { Router, Request, Response } from 'express';
import { Op } from 'sequelize';
import { authenticateToken } from '../middleware/auth.js';
import { requireRole, requirePermission } from '../middleware/rbac.js';
import { Student, User, Class, Payment, Document } from '../models/index.js';

const router = Router();
router.use(authenticateToken);

// Global search exposes cross-entity school data: staff only.
const SEARCH_ROLES = ['super_admin', 'admin', 'director', 'teacher', 'accountant', 'receptionist'] as const;

// GET / — global search across multiple entities
router.get('/',
  requireRole(...SEARCH_ROLES),
  requirePermission('students', 'view'),
  async (req: Request, res: Response) => {
  try {
    const { q } = req.query;
    if (!q || typeof q !== 'string' || q.trim().length < 2) {
      return res.status(400).json({ success: false, error: 'Search query must be at least 2 characters' });
    }

    const schoolId = req.user!.schoolId!;
    const searchTerm = `%${q.trim()}%`;

    // Search students (name, studentId)
    const students = await Student.findAll({
      where: {
        schoolId,
        [Op.or]: [
          { firstName: { [Op.iLike]: searchTerm } },
          { lastName: { [Op.iLike]: searchTerm } },
          { studentId: { [Op.iLike]: searchTerm } },
        ],
      },
      attributes: ['id', 'firstName', 'lastName', 'studentId', 'classId'],
      limit: 10,
    });

    // Search teachers (name, email)
    const teachers = await User.findAll({
      where: {
        schoolId,
        role: 'teacher',
        [Op.or]: [
          { name: { [Op.iLike]: searchTerm } },
          { email: { [Op.iLike]: searchTerm } },
        ],
      },
      attributes: ['id', 'name', 'email', 'phone'],
      limit: 10,
    });

    // Search parents (name, phone) — search via students' parent info
    const studentsWithParents = await Student.findAll({
      where: {
        schoolId,
        [Op.or]: [
          { parentName: { [Op.iLike]: searchTerm } },
          { parentPhone: { [Op.iLike]: searchTerm } },
        ],
      },
      attributes: ['id', 'firstName', 'lastName', 'parentName', 'parentPhone', 'parentEmail'],
      limit: 10,
    });

    // Search classes (name)
    const classes = await Class.findAll({
      where: {
        schoolId,
        name: { [Op.iLike]: searchTerm },
      },
      attributes: ['id', 'name', 'level', 'section'],
      limit: 10,
    });

    // Search payments (reference)
    const payments = await Payment.findAll({
      where: {
        schoolId,
        reference: { [Op.iLike]: searchTerm },
      },
      attributes: ['id', 'reference', 'amount', 'method', 'date'],
      limit: 10,
    });

    // Search documents (name)
    const documents = await Document.findAll({
      where: {
        schoolId,
        name: { [Op.iLike]: searchTerm },
      },
      attributes: ['id', 'name', 'type', 'createdAt'],
      limit: 10,
    });

    return res.json({
      success: true,
      data: {
        query: q,
        results: {
          students: { items: students, count: students.length },
          teachers: { items: teachers, count: teachers.length },
          parents: { items: studentsWithParents, count: studentsWithParents.length },
          classes: { items: classes, count: classes.length },
          payments: { items: payments, count: payments.length },
          documents: { items: documents, count: documents.length },
        },
        totalCount: students.length + teachers.length + studentsWithParents.length + classes.length + payments.length + documents.length,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

export default router;
