import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import path from 'path';
import fs from 'fs';
import { authenticateToken } from '../middleware/auth.js';
import { requireRole, requirePermission } from '../middleware/rbac.js';
import { ReportCard, Student, Grade, Subject, Attendance, Class } from '../models/index.js';
import { fn, col } from 'sequelize';
import { generateReportCardPdf } from '../utils/reportCardPdf.js';
import { getStudentReportData } from '../utils/grades.js';
import { getPagination, getSort, pages } from '../utils/listQuery.js';

const router = Router();
router.use(authenticateToken);

const STAFF_READ = ['super_admin', 'admin', 'director', 'teacher', 'accountant', 'receptionist'] as const;
const SINGLE_READ = [...STAFF_READ, 'parent', 'student'] as const;
const WRITE_ROLES = ['super_admin', 'admin', 'director', 'teacher'] as const;

router.get('/',
  requireRole(...STAFF_READ),
  requirePermission('report-cards', 'view'),
  async (req: Request, res: Response) => {
  try {
    const { term, status } = req.query;
    const where: any = { schoolId: req.user!.schoolId! };
    if (term) where.term = parseInt(term as string);
    if (status) where.status = status;

    const { page, limit, offset } = getPagination(req.query);
    const sort = getSort(req.query, { generatedAt: 'generatedAt', average: 'average', term: 'term', createdAt: 'createdAt' }, 'generatedAt', 'DESC');
    if (!sort) return res.status(400).json({ success: false, error: 'Invalid sortBy or sortOrder' });

    const { count, rows: reportCards } = await ReportCard.findAndCountAll({
      where,
      include: [{ model: Student, as: 'student', attributes: ['id', 'firstName', 'lastName', 'studentId'] }],
      order: [[sort.column, sort.order]],
      limit,
      offset,
    });
    return res.json({ success: true, data: { items: reportCards, total: count, page, pages: pages(count, limit) } });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.post('/generate',
  requireRole(...WRITE_ROLES),
  requirePermission('reports', 'create'),
  body('studentId').isUUID().withMessage('Valid student ID is required'),
  body('term').isInt({ min: 1, max: 3 }).withMessage('Term must be 1, 2, or 3'),
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ success: false, error: errors.array()[0].msg });
      const { studentId, term, academicYear } = req.body;
      const schoolId = req.user!.schoolId!;

      const grades = await Grade.findAll({ where: { schoolId, studentId, term } });
      const totalScore = grades.reduce((sum, g) => sum + Number(g.score) * Number(g.coefficient), 0);
      const totalCoef = grades.reduce((sum, g) => sum + Number(g.coefficient), 0);
      const average = totalCoef > 0 ? Math.round((totalScore / totalCoef) * 100) / 100 : 0;

      const allStudents = await Student.findAll({ where: { schoolId, status: 'active' } });
      const studentAverages = [];
      for (const s of allStudents) {
        const sGrades = await Grade.findAll({ where: { schoolId, studentId: s.id, term } });
        const sTotal = sGrades.reduce((sum, g) => sum + Number(g.score) * Number(g.coefficient), 0);
        const sCoef = sGrades.reduce((sum, g) => sum + Number(g.coefficient), 0);
        studentAverages.push({ id: s.id, avg: sCoef > 0 ? sTotal / sCoef : 0 });
      }
      studentAverages.sort((a, b) => b.avg - a.avg);
      const rank = studentAverages.findIndex((s) => s.id === studentId) + 1;

      const [reportCard] = await ReportCard.findOrCreate({
        where: { schoolId, studentId, term },
        defaults: { schoolId, studentId, term, academicYear, average, rank, totalStudents: allStudents.length, status: 'draft', generatedAt: new Date() },
      });

      return res.status(201).json({ success: true, data: { reportCard } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

router.get('/:id',
  requireRole(...SINGLE_READ),
  requirePermission('report-cards', 'view'),
  async (req: Request, res: Response) => {
  try {
    const reportCard = await ReportCard.findOne({
      where: { id: req.params.id, schoolId: req.user!.schoolId! },
      include: [{ model: Student, as: 'student' }],
    });
    if (!reportCard) return res.status(404).json({ success: false, error: 'Report card not found' });

    const grades = await Grade.findAll({
      where: { schoolId: req.user!.schoolId!, studentId: reportCard.studentId, term: reportCard.term },
      include: [{ model: Subject, as: 'subject' }],
    });

    return res.json({ success: true, data: { reportCard, grades } });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.post('/:id/publish',
  requireRole(...WRITE_ROLES),
  requirePermission('reports', 'publish'),
  async (req: Request, res: Response) => {
  try {
    const reportCard = await ReportCard.findOne({ where: { id: req.params.id, schoolId: req.user!.schoolId! } });
    if (!reportCard) return res.status(404).json({ success: false, error: 'Report card not found' });
    await reportCard.update({ status: 'published' });
    return res.json({ success: true, data: { reportCard } });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// GET /:id/pdf - Generate and download PDF report card
router.get('/:id/pdf',
  requireRole(...SINGLE_READ),
  requirePermission('reports', 'download'),
  async (req: Request, res: Response) => {
  try {
    const reportCard = await ReportCard.findOne({
      where: { id: req.params.id, schoolId: req.user!.schoolId! },
      include: [{ model: Student, as: 'student' }],
    });
    if (!reportCard) return res.status(404).json({ success: false, error: 'Report card not found' });

    const pdfBuffer = await generateReportCardPdf(
      req.user!.schoolId!,
      reportCard.studentId,
      reportCard.academicYear
    );

    // Save PDF to disk
    const reportCardsDir = path.resolve(process.cwd(), 'uploads', 'report-cards', reportCard.studentId);
    if (!fs.existsSync(reportCardsDir)) {
      fs.mkdirSync(reportCardsDir, { recursive: true });
    }

    const studentName = reportCard.student
      ? `${reportCard.student.firstName}_${reportCard.student.lastName}`
      : 'student';
    const filename = `bulletin_${studentName}_T${reportCard.term}.pdf`;
    const relativePath = path.join('report-cards', reportCard.studentId, filename);
    const absolutePath = path.resolve(process.cwd(), 'uploads', relativePath);

    fs.writeFileSync(absolutePath, pdfBuffer);

    // Update report card with PDF path
    await reportCard.update({ pdfPath: relativePath });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    return res.send(pdfBuffer);
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// GET /:id/download - Serve the stored PDF file
router.get('/:id/download',
  requireRole(...SINGLE_READ),
  requirePermission('reports', 'download'),
  async (req: Request, res: Response) => {
  try {
    const reportCard = await ReportCard.findOne({
      where: { id: req.params.id, schoolId: req.user!.schoolId! },
    });
    if (!reportCard) return res.status(404).json({ success: false, error: 'Report card not found' });

    if (!reportCard.pdfPath) {
      return res.status(404).json({ success: false, error: 'PDF not generated yet. Use /pdf endpoint first.' });
    }

    const absolutePath = path.resolve(process.cwd(), 'uploads', reportCard.pdfPath);
    if (!fs.existsSync(absolutePath)) {
      return res.status(404).json({ success: false, error: 'PDF file not found on disk.' });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="bulletin_${reportCard.studentId}_T${reportCard.term}.pdf"`);
    return res.sendFile(absolutePath);
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.post('/:id/validate',
  requireRole(...WRITE_ROLES),
  requirePermission('reports', 'validate'),
  async (req: Request, res: Response) => {
  try {
    const reportCard = await ReportCard.findOne({ where: { id: req.params.id, schoolId: req.user!.schoolId! } });
    if (!reportCard) return res.status(404).json({ success: false, error: 'Report card not found' });
    if (reportCard.status === 'published') {
      return res.status(400).json({ success: false, error: 'Report card is already published' });
    }
    await reportCard.update({ status: 'sent' });
    return res.json({ success: true, data: { reportCard } });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// POST /generate-bulk - Generate report cards for an entire class
router.post('/generate-bulk',
  requireRole(...WRITE_ROLES),
  requirePermission('report-cards', 'create'),
  body('classId').isUUID().withMessage('Valid class ID is required'),
  body('term').optional().isInt({ min: 1, max: 3 }).withMessage('Term must be 1, 2, or 3'),
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ success: false, error: errors.array()[0].msg });

      const { classId, term, academicYear } = req.body;
      const schoolId = req.user!.schoolId!;

      const classInfo = await Class.findOne({ where: { id: classId, schoolId } });
      if (!classInfo) return res.status(404).json({ success: false, error: 'Class not found' });

      const students = await Student.findAll({
        where: { schoolId, classId, status: 'active' },
        order: [['lastName', 'ASC'], ['firstName', 'ASC']],
      });

      if (students.length === 0) {
        return res.status(404).json({ success: false, error: 'No active students found in this class' });
      }

      const results = [];
      for (const student of students) {
        const reportData = await getStudentReportData(schoolId, student.id, academicYear);
        if (!reportData) continue;

        // Create or update report card record
        const [reportCard] = await ReportCard.findOrCreate({
          where: { schoolId, studentId: student.id, term: term || 3 },
          defaults: {
            schoolId,
            studentId: student.id,
            term: term || 3,
            academicYear,
            average: reportData.annualAverage,
            rank: reportData.rank,
            totalStudents: reportData.totalStudents,
            status: 'draft',
            generatedAt: new Date(),
          },
        });

        results.push({
          studentId: student.id,
          studentName: `${student.firstName} ${student.lastName}`,
          average: reportData.annualAverage,
          rank: reportData.rank,
          reportCardId: reportCard.id,
        });
      }

      return res.status(201).json({
        success: true,
        data: {
          class: classInfo.name,
          totalGenerated: results.length,
          results,
        },
      });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

export default router;
