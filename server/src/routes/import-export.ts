import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { Op } from 'sequelize';
import { authenticateToken } from '../middleware/auth.js';
import { requireRole, requirePermission } from '../middleware/rbac.js';
import { Student, User, Class, Subject, Grade, Payment } from '../models/index.js';
import { logAudit } from '../middleware/auditLog.js';

const router = Router();
router.use(authenticateToken);

const IMPORT_STUDENTS = ['super_admin', 'admin', 'director', 'receptionist'] as const;
const IMPORT_GRADES = ['super_admin', 'admin', 'director', 'teacher'] as const;
const EXPORT_ROLES = ['super_admin', 'admin', 'director', 'accountant'] as const;

/**
 * Parse CSV string into array of objects
 */
function parseCSV(csvText: string): Record<string, string>[] {
  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map((h) => h.trim());
  const results: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Simple CSV parsing (handles basic cases, not quoted fields with commas)
    const values = line.split(',').map((v) => v.trim());
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });
    results.push(row);
  }

  return results;
}

/**
 * Convert array of objects to CSV string
 */
function toCSV(items: Record<string, unknown>[], columns: string[]): string {
  const header = columns.join(',');
  const rows = items.map((item) =>
    columns.map((col) => {
      const val = item[col];
      if (val === null || val === undefined) return '';
      const str = String(val);
      // Escape quotes and wrap in quotes if contains comma or quote
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    }).join(',')
  );
  return [header, ...rows].join('\n');
}

// ============================================
// IMPORT ENDPOINTS
// ============================================

// POST /import/students — import students from CSV
router.post('/import/students',
  requireRole(...IMPORT_STUDENTS),
  requirePermission('students', 'create'),
  body('csv').isString().withMessage('CSV data is required'),
  body('preview').optional().isBoolean(),
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ success: false, error: errors.array()[0].msg });

      const { csv, preview } = req.body;
      const schoolId = req.user!.schoolId!;
      const rows = parseCSV(csv);

      if (rows.length === 0) return res.status(400).json({ success: false, error: 'No valid CSV data found' });

      const results: { row: number; status: string; message: string; data?: unknown }[] = [];
      const classes = await Class.findAll({ where: { schoolId }, attributes: ['id', 'name'] });
      const classMap = new Map(classes.map((c) => [c.name.toLowerCase(), c.id]));

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNum = i + 2; // +2 because row 1 is header

        try {
          // Validate required fields
          if (!row.firstName || !row.lastName) {
            results.push({ row: rowNum, status: 'error', message: 'firstName and lastName are required' });
            continue;
          }

          // Find class
          let classId = row.classId || null;
          if (row.classId && !classId) {
            const classIdFromMap = classMap.get(row.classId.toLowerCase());
            if (classIdFromMap) classId = classIdFromMap;
          }

          const studentCount = await Student.count({ where: { schoolId } });
          const studentId = `SCH-${String(studentCount + i + 1).padStart(5, '0')}`;

          const studentData = {
            schoolId,
            studentId,
            firstName: row.firstName,
            lastName: row.lastName,
            dateOfBirth: row.dateOfBirth || null,
            gender: row.gender || null,
            classId,
            parentName: row.parentName || null,
            parentPhone: row.parentPhone || null,
            parentEmail: row.parentEmail || null,
          };

          if (preview) {
            results.push({ row: rowNum, status: 'preview', message: 'Valid', data: studentData });
          } else {
            const student = await Student.create(studentData);
            results.push({ row: rowNum, status: 'success', message: 'Created', data: { id: student.id, studentId: student.studentId } });
          }
        } catch (err) {
          results.push({ row: rowNum, status: 'error', message: (err as Error).message });
        }
      }

      const successCount = results.filter((r) => r.status === 'success' || r.status === 'preview').length;
      const errorCount = results.filter((r) => r.status === 'error').length;

      await logAudit(req, { action: 'import', entity: 'students', details: { total: rows.length, success: successCount, errors: errorCount, preview } });

      return res.json({
        success: true,
        data: {
          preview: preview || false,
          total: rows.length,
          successCount,
          errorCount,
          results,
        },
      });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

// POST /import/teachers — import teachers from CSV
router.post('/import/teachers',
  requireRole('super_admin', 'admin', 'director'),
  requirePermission('teachers', 'create'),
  body('csv').isString().withMessage('CSV data is required'),
  body('preview').optional().isBoolean(),
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ success: false, error: errors.array()[0].msg });

      const { csv, preview } = req.body;
      const schoolId = req.user!.schoolId!;
      const rows = parseCSV(csv);

      if (rows.length === 0) return res.status(400).json({ success: false, error: 'No valid CSV data found' });

      const results: { row: number; status: string; message: string; data?: unknown }[] = [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNum = i + 2;

        try {
          if (!row.name || !row.email) {
            results.push({ row: rowNum, status: 'error', message: 'name and email are required' });
            continue;
          }

          // Check for duplicate email
          const existing = await User.findOne({ where: { schoolId, email: row.email } });
          if (existing) {
            results.push({ row: rowNum, status: 'error', message: `Email ${row.email} already exists` });
            continue;
          }

          const bcrypt = await import('bcryptjs');
          const passwordHash = await bcrypt.hash(row.password || 'password123', 12);

          const teacherData = {
            schoolId,
            name: row.name,
            email: row.email,
            passwordHash,
            phone: row.phone || null,
            role: 'teacher',
          };

          if (preview) {
            results.push({ row: rowNum, status: 'preview', message: 'Valid', data: { name: row.name, email: row.email } });
          } else {
            const teacher = await User.create(teacherData);
            results.push({ row: rowNum, status: 'success', message: 'Created', data: { id: teacher.id, email: teacher.email } });
          }
        } catch (err) {
          results.push({ row: rowNum, status: 'error', message: (err as Error).message });
        }
      }

      const successCount = results.filter((r) => r.status === 'success' || r.status === 'preview').length;
      const errorCount = results.filter((r) => r.status === 'error').length;

      await logAudit(req, { action: 'import', entity: 'teachers', details: { total: rows.length, success: successCount, errors: errorCount, preview } });

      return res.json({
        success: true,
        data: {
          preview: preview || false,
          total: rows.length,
          successCount,
          errorCount,
          results,
        },
      });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

// POST /import/grades — import grades from CSV
router.post('/import/grades',
  requireRole(...IMPORT_GRADES),
  requirePermission('grades', 'create'),
  body('csv').isString().withMessage('CSV data is required'),
  body('preview').optional().isBoolean(),
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ success: false, error: errors.array()[0].msg });

      const { csv, preview } = req.body;
      const schoolId = req.user!.schoolId!;
      const rows = parseCSV(csv);

      if (rows.length === 0) return res.status(400).json({ success: false, error: 'No valid CSV data found' });

      // Pre-load subjects and students for lookup
      const subjects = await Subject.findAll({ where: { schoolId }, attributes: ['id', 'name', 'code'] });
      const students = await Student.findAll({ where: { schoolId }, attributes: ['id', 'studentId'] });
      const subjectMap = new Map(subjects.map((s) => [s.name.toLowerCase(), s.id]));
      const subjectCodeMap = new Map(subjects.map((s) => [s.code?.toLowerCase(), s.id]));
      const studentMap = new Map(students.map((s) => [s.studentId.toLowerCase(), s.id]));

      const results: { row: number; status: string; message: string; data?: unknown }[] = [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNum = i + 2;

        try {
          if (!row.studentId || !row.subject || !row.score || !row.term) {
            results.push({ row: rowNum, status: 'error', message: 'studentId, subject, score, and term are required' });
            continue;
          }

          // Find student
          const studentId = studentMap.get(row.studentId.toLowerCase());
          if (!studentId) {
            results.push({ row: rowNum, status: 'error', message: `Student ${row.studentId} not found` });
            continue;
          }

          // Find subject
          let subjectId = subjectMap.get(row.subject.toLowerCase()) || subjectCodeMap.get(row.subject.toLowerCase());
          if (!subjectId) {
            results.push({ row: rowNum, status: 'error', message: `Subject ${row.subject} not found` });
            continue;
          }

          const score = parseFloat(row.score);
          if (isNaN(score) || score < 0 || score > 20) {
            results.push({ row: rowNum, status: 'error', message: 'Score must be between 0 and 20' });
            continue;
          }

          const term = parseInt(row.term, 10);
          if (isNaN(term) || term < 1 || term > 3) {
            results.push({ row: rowNum, status: 'error', message: 'Term must be 1, 2, or 3' });
            continue;
          }

          const gradeData = {
            schoolId,
            studentId,
            subjectId,
            score,
            term,
            examType: row.examType || 'test',
            examName: row.examName || null,
            coefficient: parseFloat(row.coefficient) || 1.0,
            academicYear: row.academicYear || '2025-2026',
            createdBy: req.user!.id,
          };

          if (preview) {
            results.push({ row: rowNum, status: 'preview', message: 'Valid', data: gradeData });
          } else {
            const grade = await Grade.create(gradeData);
            results.push({ row: rowNum, status: 'success', message: 'Created', data: { id: grade.id } });
          }
        } catch (err) {
          results.push({ row: rowNum, status: 'error', message: (err as Error).message });
        }
      }

      const successCount = results.filter((r) => r.status === 'success' || r.status === 'preview').length;
      const errorCount = results.filter((r) => r.status === 'error').length;

      await logAudit(req, { action: 'import', entity: 'grades', details: { total: rows.length, success: successCount, errors: errorCount, preview } });

      return res.json({
        success: true,
        data: {
          preview: preview || false,
          total: rows.length,
          successCount,
          errorCount,
          results,
        },
      });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

// ============================================
// EXPORT ENDPOINTS
// ============================================

// GET /export/students — export students to CSV
router.get('/export/students',
  requireRole(...EXPORT_ROLES),
  requirePermission('import-export', 'export'),
  async (req: Request, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!;
    const students = await Student.findAll({
      where: { schoolId },
      include: [{ model: Class, as: 'class', attributes: ['name'] }],
      order: [['lastName', 'ASC']],
    });

    const data = students.map((s) => ({
      studentId: s.studentId,
      firstName: s.firstName,
      lastName: s.lastName,
      dateOfBirth: s.dateOfBirth ? new Date(s.dateOfBirth).toISOString().split('T')[0] : '',
      gender: s.gender || '',
      class: (s as any).class?.name || '',
      parentName: s.parentName || '',
      parentPhone: s.parentPhone || '',
      parentEmail: s.parentEmail || '',
      status: s.status,
      enrollmentDate: s.enrollmentDate ? new Date(s.enrollmentDate).toISOString().split('T')[0] : '',
    }));

    const csv = toCSV(data, ['studentId', 'firstName', 'lastName', 'dateOfBirth', 'gender', 'class', 'parentName', 'parentPhone', 'parentEmail', 'status', 'enrollmentDate']);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="students-${new Date().toISOString().split('T')[0]}.csv"`);
    return res.send(csv);
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// GET /export/teachers — export teachers to CSV
router.get('/export/teachers',
  requireRole(...EXPORT_ROLES),
  requirePermission('import-export', 'export'),
  async (req: Request, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!;
    const teachers = await User.findAll({
      where: { schoolId, role: 'teacher' },
      order: [['name', 'ASC']],
    });

    const data = teachers.map((t) => ({
      name: t.name,
      email: t.email,
      phone: t.phone || '',
      isActive: t.isActive ? 'yes' : 'no',
    }));

    const csv = toCSV(data, ['name', 'email', 'phone', 'isActive']);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="teachers-${new Date().toISOString().split('T')[0]}.csv"`);
    return res.send(csv);
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// GET /export/grades — export grades to CSV
router.get('/export/grades',
  requireRole('super_admin', 'admin', 'director', 'teacher', 'accountant'),
  requirePermission('import-export', 'export'),
  async (req: Request, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!;
    const { classId, term, academicYear } = req.query;

    const where: any = { schoolId };
    if (academicYear) where.academicYear = academicYear;

    const grades = await Grade.findAll({
      where,
      include: [
        { model: Student, as: 'student', attributes: ['studentId', 'firstName', 'lastName'] },
        { model: Subject, as: 'subject', attributes: ['name', 'code'] },
      ],
      order: [[{ model: Student, as: 'student' }, 'lastName', 'ASC']],
    });

    const data = grades.map((g) => ({
      studentId: (g as any).student?.studentId || '',
      firstName: (g as any).student?.firstName || '',
      lastName: (g as any).student?.lastName || '',
      subject: (g as any).subject?.name || '',
      code: (g as any).subject?.code || '',
      score: g.score,
      coefficient: g.coefficient,
      term: g.term,
      examType: g.examType,
      examName: g.examName || '',
      academicYear: g.academicYear,
    }));

    const csv = toCSV(data, ['studentId', 'firstName', 'lastName', 'subject', 'code', 'score', 'coefficient', 'term', 'examType', 'examName', 'academicYear']);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="grades-${new Date().toISOString().split('T')[0]}.csv"`);
    return res.send(csv);
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// GET /export/payments — export payments to CSV
router.get('/export/payments',
  requireRole(...EXPORT_ROLES),
  requirePermission('import-export', 'export'),
  async (req: Request, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!;
    const payments = await Payment.findAll({
      where: { schoolId },
      include: [
        { model: Student, as: 'student', attributes: ['studentId', 'firstName', 'lastName'] },
      ],
      order: [['date', 'DESC']],
    });

    const data = payments.map((p) => ({
      date: p.date ? new Date(p.date).toISOString().split('T')[0] : '',
      studentId: (p as any).student?.studentId || '',
      firstName: (p as any).student?.firstName || '',
      lastName: (p as any).student?.lastName || '',
      reference: p.reference || '',
      amount: p.amount,
      method: p.method,
      notes: p.notes || '',
    }));

    const csv = toCSV(data, ['date', 'studentId', 'firstName', 'lastName', 'reference', 'amount', 'method', 'notes']);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="payments-${new Date().toISOString().split('T')[0]}.csv"`);
    return res.send(csv);
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

export default router;
