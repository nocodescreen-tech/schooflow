import { Router, Request, Response } from 'express';
import { body, query, validationResult } from 'express-validator';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { Op } from 'sequelize';
import { authenticateToken } from '../middleware/auth.js';
import { requireRole, requirePermission } from '../middleware/rbac.js';
import { Document, Student, User, School, Class, Subject, Grade } from '../models/index.js';
import { logAudit } from '../middleware/auditLog.js';
import { getPagination, getSort, pages } from '../utils/listQuery.js';

const router = Router();
router.use(authenticateToken);

const DOC_READ = ['super_admin', 'admin', 'director', 'teacher', 'accountant', 'receptionist', 'parent', 'student'] as const;
const DOC_WRITE = ['super_admin', 'admin', 'director', 'receptionist'] as const;

// Ensure uploads/documents directory exists
const documentsDir = path.resolve(process.cwd(), 'uploads', 'documents');
if (!fs.existsSync(documentsDir)) {
  fs.mkdirSync(documentsDir, { recursive: true });
}

// Multer config for document uploads
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, documentsDir),
  filename: (_req, file, cb) => {
    const uniqueName = `${uuidv4()}${path.extname(file.originalname).toLowerCase()}`;
    cb(null, uniqueName);
  },
});

const fileFilter = (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowed = [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
  ];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type'));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

// GET / — list with filters
router.get('/',
  requireRole(...DOC_READ),
  requirePermission('documents', 'view'),
  async (req: Request, res: Response) => {
    try {
      const { type, studentId, search } = req.query;
      const where: any = { schoolId: req.user!.schoolId! };

      if (type) where.type = type;
      if (studentId) where.studentId = studentId;
      if (search) {
        where[Op.or] = [
          { name: { [Op.iLike]: `%${search}%` } },
          { notes: { [Op.iLike]: `%${search}%` } },
        ];
      }

      const { page, limit, offset } = getPagination(req.query);
      const sort = getSort(req.query, { name: 'name', type: 'type', createdAt: 'createdAt' }, 'createdAt', 'DESC');
      if (!sort) return res.status(400).json({ success: false, error: 'Invalid sortBy or sortOrder' });

      const { count, rows: documents } = await Document.findAndCountAll({
        where,
        include: [
          { model: Student, as: 'student', attributes: ['id', 'firstName', 'lastName', 'studentId'] },
          { model: User, as: 'uploadedBy', attributes: ['id', 'name'] },
        ],
        order: [[sort.column, sort.order]],
        limit,
        offset,
      });

      return res.json({ success: true, data: { items: documents, total: count, page, pages: pages(count, limit) } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

// POST / — upload document
router.post('/',
  requireRole(...DOC_WRITE),
  requirePermission('documents', 'create'),
  upload.single('file'),
  body('name').optional().isString(),
  body('type').optional().isIn(['certificate', 'attestation', 'contract', 'report', 'other']),
  body('studentId').optional().isUUID(),
  async (req: Request, res: Response) => {
    try {
      if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });

      const { name, type, studentId, notes } = req.body;

      const document = await Document.create({
        schoolId: req.user!.schoolId!,
        name: name || req.file.originalname,
        type: type || 'other',
        filePath: `/uploads/documents/${req.file.filename}`,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        uploadedById: req.user!.id,
        studentId: studentId || null,
        notes,
      });

      await logAudit(req, { action: 'create', entity: 'document', entityId: document.id, details: { name: document.name, type: document.type } });

      return res.status(201).json({ success: true, data: { document } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

// GET /:id — get document info
router.get('/:id',
  requireRole(...DOC_READ),
  requirePermission('documents', 'view'),
  async (req: Request, res: Response) => {
  try {
    const document = await Document.findOne({
      where: { id: req.params.id, schoolId: req.user!.schoolId! },
      include: [
        { model: Student, as: 'student', attributes: ['id', 'firstName', 'lastName', 'studentId'] },
        { model: User, as: 'uploadedBy', attributes: ['id', 'name'] },
      ],
    });
    if (!document) return res.status(404).json({ success: false, error: 'Document not found' });

    return res.json({ success: true, data: { document } });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// GET /:id/download — download file
router.get('/:id/download',
  requireRole(...DOC_READ),
  requirePermission('documents', 'download'),
  async (req: Request, res: Response) => {
  try {
    const document = await Document.findOne({
      where: { id: req.params.id, schoolId: req.user!.schoolId! },
    });
    if (!document) return res.status(404).json({ success: false, error: 'Document not found' });

    const filePath = path.resolve(process.cwd(), document.filePath.replace(/^\//, ''));
    if (!fs.existsSync(filePath)) return res.status(404).json({ success: false, error: 'File not found on disk' });

    res.download(filePath, document.name);
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// PATCH /:id — update metadata
router.patch('/:id',
  requireRole(...DOC_WRITE),
  requirePermission('documents', 'create'),
  async (req: Request, res: Response) => {
  try {
    const document = await Document.findOne({
      where: { id: req.params.id, schoolId: req.user!.schoolId! },
    });
    if (!document) return res.status(404).json({ success: false, error: 'Document not found' });

    const allowed = ['name', 'type', 'studentId', 'notes'];
    const updates: any = {};
    for (const field of allowed) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    }

    await document.update(updates);

    await logAudit(req, { action: 'update', entity: 'document', entityId: document.id, details: updates });

    return res.json({ success: true, data: { document } });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// DELETE /:id — delete file and record
router.delete('/:id',
  requireRole('super_admin', 'admin', 'director'),
  requirePermission('documents', 'delete'),
  async (req: Request, res: Response) => {
  try {
    const document = await Document.findOne({
      where: { id: req.params.id, schoolId: req.user!.schoolId! },
    });
    if (!document) return res.status(404).json({ success: false, error: 'Document not found' });

    // Delete file from disk
    const filePath = path.resolve(process.cwd(), document.filePath.replace(/^\//, ''));
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    await document.destroy();

    await logAudit(req, { action: 'delete', entity: 'document', entityId: document.id });

    return res.json({ success: true, data: { message: 'Document deleted' } });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// POST /generate-certificate — generate a certificate PDF for a student
router.post('/generate-certificate',
  requireRole(...DOC_WRITE),
  requirePermission('documents', 'create'),
  body('studentId').isUUID().withMessage('Valid student ID is required'),
  body('type').optional().isIn(['certificate', 'attestation']),
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ success: false, error: errors.array()[0].msg });

      const { studentId, type } = req.body;
      const schoolId = req.user!.schoolId!;

      const student = await Student.findOne({
        where: { id: studentId, schoolId },
        include: [{ model: Class, as: 'class' }],
      });
      if (!student) return res.status(404).json({ success: false, error: 'Student not found' });

      const school = await School.findByPk(schoolId);
      if (!school) return res.status(404).json({ success: false, error: 'School not found' });

      // Generate PDF using pdfkit
      const PDFDocument = (await import('pdfkit')).default;
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));

      const certificateType = type || 'certificate';
      const title = certificateType === 'certificate' ? 'CERTIFICAT DE SCOLARITÉ' : 'ATTESTATION SCOLAIRE';

      // Header
      doc.fontSize(16).font('Helvetica-Bold').text(school.name, { align: 'center' });
      doc.fontSize(10).font('Helvetica');
      if (school.address) doc.text(school.address, { align: 'center' });
      if (school.phone) doc.text(`Tél: ${school.phone}`, { align: 'center' });

      doc.moveDown(2);

      // Title
      doc.fontSize(18).font('Helvetica-Bold').text(title, { align: 'center' });
      doc.moveDown(2);

      // Content
      const fullName = `${student.firstName} ${student.lastName}`;
      const className = (student as any).class?.name || 'N/A';

      doc.fontSize(12).font('Helvetica');
      const content = certificateType === 'certificate'
        ? `Nous soussignés, certifions que l'élève ${fullName}, matricule ${student.studentId}, est régulièrement inscrit(e) dans notre établissement en classe de ${className} pour l'année académique ${new Date().getFullYear()}-${new Date().getFullYear() + 1}.\n\nCe certificat est délivré à l'intéressé(e) pour servir et valoir ce que de droit.`
        : `Nous soussignés, attestons que l'élève ${fullName}, matricule ${student.studentId}, est régulièrement inscrit(e) dans notre établissement en classe de ${className} pour l'année académique ${new Date().getFullYear()}-${new Date().getFullYear() + 1}.\n\nCette attestation est délivrée à l'intéressé(e) pour servir et valoir ce que de droit.`;

      doc.text(content, { align: 'justify' });
      doc.moveDown(3);

      // Date and signature
      const dateStr = new Date().toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' });
      doc.text(`Fait à ${school.address || ''}, le ${dateStr}`, { align: 'center' });
      doc.moveDown(2);
      doc.text('Le Directeur/Directrice', { align: 'right' });

      doc.end();

      const buffer = await new Promise<Buffer>((resolve) => {
        doc.on('end', () => resolve(Buffer.concat(chunks)));
      });

      // Save document record
      const fileName = `${uuidv4()}.pdf`;
      const filePath = path.join(documentsDir, fileName);
      fs.writeFileSync(filePath, buffer);

      const document = await Document.create({
        schoolId,
        name: `${title} - ${fullName}`,
        type: certificateType,
        filePath: `/uploads/documents/${fileName}`,
        fileSize: buffer.length,
        mimeType: 'application/pdf',
        uploadedById: req.user!.id,
        studentId,
      });

      await logAudit(req, { action: 'generate', entity: 'document', entityId: document.id, details: { studentId, type: certificateType } });

      return res.status(201).json({ success: true, data: { document } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

export default router;
