import { Router, Request, Response } from 'express';
import { GeneratedDocument, School, Student } from '../models/index.js';

const router = Router();

function maskStudentName(firstName: string, lastName: string): string {
  const initial = lastName ? `${lastName.charAt(0).toUpperCase()}.` : '';
  return `${firstName || ''} ${initial}`.trim();
}

// PUBLIC — no auth
router.get('/:documentNumber', async (req: Request, res: Response) => {
  try {
    const doc = await GeneratedDocument.findOne({
      where: { documentNumber: req.params.documentNumber },
      include: [
        { model: School, as: 'school', attributes: ['id', 'name'] },
        { model: Student, as: 'student', attributes: ['id', 'firstName', 'lastName'] },
      ],
    });
    if (!doc) {
      return res.json({ success: true, data: { valid: false } });
    }
    const school = (doc as unknown as { school?: { name?: string } }).school;
    const student = (doc as unknown as { student?: { firstName?: string; lastName?: string } }).student;
    const metadata = (doc.metadata || {}) as Record<string, unknown>;
    return res.json({
      success: true,
      data: {
        valid: true,
        documentType: doc.documentType,
        title: doc.title,
        date: doc.createdAt,
        schoolName: school?.name || null,
        studentName: student ? maskStudentName(student.firstName || '', student.lastName || '') : null,
        academicYear: (metadata['academicYear'] as string) || (metadata['year'] as string) || null,
        status: doc.status,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

export default router;
