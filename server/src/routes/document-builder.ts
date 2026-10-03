import { Router, Request, Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { Op } from 'sequelize';
import { authenticateToken } from '../middleware/auth.js';
import { requireRole, requirePermission, getCustomRolePermissions } from '../middleware/rbac.js';
import { LEGACY_ROLE_PERMISSIONS } from '../utils/permissions.js';
import { buildRdcBulletinData, type RdcBulletinData, type RdcMaxima, type RdcSubjectLine } from '../utils/rdcBulletin.js';
import { DocumentTemplate, GeneratedDocument, User, Student, School, Fee, Grade, Attendance, Subject } from '../models/index.js';
import { logAudit } from '../middleware/auditLog.js';
import { getPagination, getSort, pages } from '../utils/listQuery.js';
import { requireModule } from '../utils/modules.js';
import QRCode from 'qrcode';
import { WebSocketEvents } from '../services/websocket.js';

const router = Router();
router.use(authenticateToken);
router.use(requireModule('templates'));

const STAFF_READ = ['super_admin', 'admin', 'director', 'teacher', 'accountant', 'receptionist'] as const;
const SINGLE_READ = [...STAFF_READ, 'parent', 'student'] as const;
const ADMIN_WRITE = ['super_admin', 'admin', 'director'] as const;
const AUTHOR_WRITE = ['super_admin', 'admin', 'director', 'teacher', 'receptionist'] as const;

/**
 * Guards every `/:id` route. Without it, a non-UUID path segment reaches a
 * UUID column and PostgreSQL raises `invalid input syntax for type uuid`,
 * surfacing as a 500 instead of a clean 404.
 */
const uuidId = param('id').isUUID().withMessage('Identifiant invalide');

function rejectInvalidIds(req: Request, res: Response): boolean {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(404).json({ success: false, error: 'Ressource introuvable' });
    return true;
  }
  return false;
}

export function buildVerifyUrl(documentNumber: string): string {
  const base = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/+$/, '');
  return `${base}/verify/${documentNumber}`;
}

async function assignDocumentNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `DOC-${year}-`;
  const count = await GeneratedDocument.count({ where: { documentNumber: { [Op.like]: `${prefix}%` } } });
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = `${prefix}${String(count + 1 + attempt).padStart(5, '0')}`;
    const existing = await GeneratedDocument.findOne({ where: { documentNumber: candidate } });
    if (!existing) return candidate;
  }
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = `${prefix}${String(Date.now() % 100000).padStart(5, '0')}`;
    const existing = await GeneratedDocument.findOne({ where: { documentNumber: candidate } });
    if (!existing) return candidate;
  }
  throw new Error('Could not generate a unique document number');
}

function getGradingPassMark(settings: unknown): number {
  if (settings && typeof settings === 'object') {
    const grading = (settings as Record<string, unknown>)['grading'] as Record<string, unknown> | undefined;
    const passMark = Number(grading?.['passMark']);
    if (Number.isFinite(passMark)) return passMark;
  }
  return 10;
}

/**
 * Builds the immutable bulletin snapshot stored on generated documents whose
 * template belongs to the `bulletin` category. Returns undefined when the
 * template is not a bulletin, there is no student, or computation fails.
 * The snapshot is written once at generation time and never mutated afterwards.
 */
async function buildBulletinSnapshot(
  template: DocumentTemplate,
  student: Student | null,
  overrides: Record<string, unknown>,
  userId: string
): Promise<Record<string, unknown> | undefined> {
  try {
    if (template.category !== 'bulletin' || !student) return undefined;
    const academicYear =
      typeof overrides['academicYear'] === 'string' ? (overrides['academicYear'] as string) : undefined;
    const observation =
      typeof overrides['observation'] === 'string' ? (overrides['observation'] as string) : '';
    const data = await buildRdcBulletinData(student.id, academicYear, { observation });
    if (!data) return undefined;
    return {
      ...data,
      templateVersion: template.version,
      generatedAt: new Date().toISOString(),
      generatedBy: userId,
    };
  } catch {
    return undefined;
  }
}

// Storage directory for generated documents
const generatedDir = path.resolve(process.cwd(), 'uploads', 'generated');
if (!fs.existsSync(generatedDir)) {
  fs.mkdirSync(generatedDir, { recursive: true });
}

// Multer config for template uploads (logo, signature images)
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, generatedDir),
  filename: (_req, file, cb) => {
    cb(null, `${uuidv4()}${path.extname(file.originalname).toLowerCase()}`);
  },
});

const fileFilter = (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowed = [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
  ];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Type de fichier non autorisé'));
  }
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 5 * 1024 * 1024 } });

// ============================
// TEMPLATES
// ============================

// GET / — list templates with filters
router.get('/',
  requireRole(...STAFF_READ),
  requirePermission('templates', 'view'),
  async (req: Request, res: Response) => {
  try {
    const { category, status, search } = req.query;
    const where: Record<string, unknown> = { schoolId: req.user!.schoolId! };

    if (category) where.category = category;
    if (status) where.status = status;
    if (search) {
      (where as Record<string, unknown>)[Op.or as unknown as string] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { description: { [Op.iLike]: `%${search}%` } },
      ];
    }

    const { page, limit, offset } = getPagination(req.query);
    const sort = getSort(req.query, { updatedAt: 'updatedAt', name: 'name', createdAt: 'createdAt' }, 'updatedAt', 'DESC');
    if (!sort) return res.status(400).json({ success: false, error: 'Invalid sortBy or sortOrder' });

    const { count, rows: templates } = await DocumentTemplate.findAndCountAll({
      where,
      include: [{ model: User, as: 'creator', attributes: ['id', 'name'] }],
      order: [[sort.column, sort.order]],
      limit,
      offset,
    });

    return res.json({ success: true, data: { items: templates, total: count, page, pages: pages(count, limit) } });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// POST /upload-image — upload an image asset (logo, signature, stamp) for templates
router.post('/upload-image',
  requireRole(...AUTHOR_WRITE),
  requirePermission('documents', 'view'),
  upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'Aucun fichier reçu' });

    const url = `/uploads/generated/${req.file.filename}`;
    await logAudit(req, {
      action: 'create',
      entity: 'document_asset',
      details: { fileName: req.file.originalname, size: req.file.size },
    });

    return res.status(201).json({ success: true, data: { url, size: req.file.size, mime: req.file.mimetype } });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// GET /categories — distinct template categories
router.get('/categories',
  requireRole(...STAFF_READ),
  requirePermission('templates', 'view'),
  async (_req: Request, res: Response) => {
  try {
    const categories = [
      { id: 'bulletin', label: 'Bulletins' },
      { id: 'certificat', label: 'Certificats' },
      { id: 'billet_vacances', label: 'Billets de vacances' },
      { id: 'avis_parents', label: 'Avis aux parents' },
      { id: 'document_administratif', label: 'Documents administratifs' },
      { id: 'financier', label: 'Documents financiers' },
      { id: 'autre', label: 'Autres' },
    ];
    return res.json({ success: true, data: { items: categories } });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// POST /seed-reference-templates — idempotent creation of 4 reference RDC templates
router.post('/seed-reference-templates',
  requireRole(...ADMIN_WRITE),
  requirePermission('templates', 'create'),
  async (req: Request, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!;
    const defs = buildReferenceTemplateDefs();
    let created = 0;
    let skipped = 0;
    const templates: DocumentTemplate[] = [];

    for (const def of defs) {
      const existing = await DocumentTemplate.findOne({ where: { schoolId, name: def.name } });
      if (existing) {
        skipped += 1;
        templates.push(existing);
        continue;
      }
      const tpl = await DocumentTemplate.create({
        schoolId,
        name: def.name,
        description: def.description,
        category: def.category,
        format: 'A4',
        orientation: 'portrait',
        status: 'actif',
        creatorId: req.user!.id,
        schema: def.schema,
      });
      created += 1;
      templates.push(tpl);
    }

    await logAudit(req, {
      action: 'create',
      entity: 'document_template',
      details: { seed: 'reference-templates', created, skipped },
    });

    return res.json({ success: true, created, skipped, templates });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// POST / — create template
router.post(
  '/',
  requireRole(...ADMIN_WRITE),
  requirePermission('templates', 'create'),
  body('name').notEmpty().withMessage('Le nom du modèle est requis'),
  body('category').notEmpty().withMessage('La catégorie est requise'),
  body('format').optional().isIn(['A4', 'A5', 'A6', 'Letter', 'Legal', 'custom']),
  body('orientation').optional().isIn(['portrait', 'landscape']),
  body('schema').optional().custom((v) => v === undefined || typeof v === 'object'),
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ success: false, error: errors.array()[0].msg });

      const { name, category, description, format, orientation, schema } = req.body;

      const template = await DocumentTemplate.create({
        schoolId: req.user!.schoolId!,
        name,
        description: description || '',
        category,
        format: format || 'A4',
        orientation: orientation || 'portrait',
        status: 'brouillon',
        creatorId: req.user!.id,
        schema: schema || { elements: [] },
      });

      await logAudit(req, {
        action: 'create',
        entity: 'document_template',
        entityId: template.id,
        details: { name: template.name, category: template.category },
      });

      return res.status(201).json({ success: true, data: { template } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

// GET /recommend?classId= — recommend the best bulletin template for a class.
// Scores actif bulletin templates against the class structure (FKs + legacy
// level/section strings): +points for matching level/section/option/cycle
// keywords found in scope arrays or in the template name.
router.get('/recommend',
  requireRole(...STAFF_READ),
  requirePermission('templates', 'view'),
  async (req: Request, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!;
    const classId = req.query.classId as string | undefined;
    if (!classId) return res.status(400).json({ success: false, error: 'classId requis' });

    const models = await import('../models/index.js');
    const cls = await models.Class.findOne({
      where: { id: classId, schoolId },
      include: [
        { model: models.Cycle, as: 'cycle', attributes: ['id', 'name'] },
        { model: models.Filiere, as: 'filiere', attributes: ['id', 'name'] },
        { model: models.Section, as: 'sectionRef', attributes: ['id', 'name'] },
        { model: models.Option, as: 'optionRef', attributes: ['id', 'name'] },
        { model: models.Niveau, as: 'niveau', attributes: ['id', 'name'] },
      ],
    });
    if (!cls) return res.status(404).json({ success: false, error: 'Classe introuvable' });

    const c = cls as unknown as {
      level?: string; section?: string;
      cycle?: { name?: string }; filiere?: { name?: string };
      sectionRef?: { name?: string }; optionRef?: { name?: string }; niveau?: { name?: string };
    };
    const keywords = {
      cycle: [c.cycle?.name, c.filiere?.name].filter(Boolean) as string[],
      level: [c.niveau?.name, c.level].filter(Boolean) as string[],
      section: [c.sectionRef?.name, c.section].filter(Boolean) as string[],
      option: [c.optionRef?.name].filter(Boolean) as string[],
    };

    const templates = await DocumentTemplate.findAll({
      where: { schoolId, category: 'bulletin', status: 'actif' },
      order: [['name', 'ASC']],
    });

    const norm = (s: string): string => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const matches = (needles: string[], haystack: string): boolean => {
      const h = norm(haystack);
      return needles.some((n) => n && (h.includes(norm(n)) || norm(n).includes(h)));
    };

    const candidates = templates.map((t) => {
      let score = 0;
      const scope = (t.scope || {}) as { cycles?: string[]; levels?: string[]; sections?: string[]; options?: string[] };
      const name = t.name || '';
      if ((scope.levels || []).some((l) => matches(keywords.level, l))) score += 3;
      else if (matches(keywords.level, name)) score += 1;
      if ((scope.options || []).some((o) => matches(keywords.option, o))) score += 3;
      else if (keywords.option.length > 0 && matches(keywords.option, name)) score += 1;
      if ((scope.sections || []).some((s) => matches(keywords.section, s))) score += 2;
      else if (matches(keywords.section, name)) score += 1;
      if ((scope.cycles || []).some((cy) => matches(keywords.cycle, cy))) score += 2;
      else if (keywords.cycle.length > 0 && matches(keywords.cycle, name)) score += 1;
      return { id: t.id, name: t.name, score };
    });
    candidates.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

    const top = candidates[0];
    const recommended = top && top.score > 0
      ? await DocumentTemplate.findOne({ where: { id: top.id, schoolId } })
      : null;

    return res.json({ success: true, data: { recommended, candidates } });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// GET /:id — get template details
router.get('/:id',
  uuidId,
  requireRole(...STAFF_READ),
  requirePermission('templates', 'view'),
  async (req: Request, res: Response) => {
  if (rejectInvalidIds(req, res)) return;
  try {
    const template = await DocumentTemplate.findOne({
      where: { id: req.params.id, schoolId: req.user!.schoolId! },
      include: [{ model: User, as: 'creator', attributes: ['id', 'name'] }],
    });
    if (!template) return res.status(404).json({ success: false, error: 'Modèle introuvable' });

    return res.json({ success: true, data: { template } });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// PATCH /:id — update template (metadata + schema)
router.patch(
  '/:id',
  uuidId,
  requireRole(...ADMIN_WRITE),
  requirePermission('templates', 'update'),
  body('name').optional().isString(),
  body('description').optional().isString(),
  body('status').optional().isIn(['brouillon', 'actif', 'archive']),
  body('format').optional().isIn(['A4', 'A5', 'A6', 'Letter', 'Legal', 'custom']),
  body('orientation').optional().isIn(['portrait', 'landscape']),
  body('schema').optional().custom((v) => v === undefined || typeof v === 'object'),
  async (req: Request, res: Response) => {
    if (rejectInvalidIds(req, res)) return;
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ success: false, error: errors.array()[0].msg });

      const template = await DocumentTemplate.findOne({
        where: { id: req.params.id, schoolId: req.user!.schoolId! },
      });
      if (!template) return res.status(404).json({ success: false, error: 'Modèle introuvable' });

      const allowed = ['name', 'description', 'status', 'format', 'orientation', 'schema'];
      const updates: Record<string, unknown> = {};
      for (const field of allowed) {
        if (req.body[field] !== undefined) updates[field] = req.body[field];
      }

      await template.update(updates);

      await logAudit(req, {
        action: 'update',
        entity: 'document_template',
        entityId: template.id,
        details: { fields: Object.keys(updates) },
      });

      return res.json({ success: true, data: { template } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

// POST /:id/duplicate — duplicate template
router.post('/:id/duplicate',
  requireRole(...ADMIN_WRITE),
  requirePermission('templates', 'create'),
  async (req: Request, res: Response) => {
  try {
    const original = await DocumentTemplate.findOne({
      where: { id: req.params.id, schoolId: req.user!.schoolId! },
    });
    if (!original) return res.status(404).json({ success: false, error: 'Modèle introuvable' });

    const duplicated = await DocumentTemplate.create({
      schoolId: original.schoolId,
      name: `${original.name} (copie)`,
      description: original.description,
      category: original.category,
      format: original.format,
      orientation: original.orientation,
      status: 'brouillon',
      version: 1,
      creatorId: req.user!.id,
      schema: (original as unknown as { schema: unknown }).schema,
    });

    await logAudit(req, {
      action: 'duplicate',
      entity: 'document_template',
      entityId: duplicated.id,
      details: { originalId: original.id, originalName: original.name },
    });

    return res.json({ success: true, data: { template: duplicated } });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// POST /:id/publish — publish template (brouillon → actif)
router.post('/:id/publish',
  requireRole(...ADMIN_WRITE),
  requirePermission('templates', 'publish'),
  async (req: Request, res: Response) => {
  try {
    const template = await DocumentTemplate.findOne({
      where: { id: req.params.id, schoolId: req.user!.schoolId! },
    });
    if (!template) return res.status(404).json({ success: false, error: 'Modèle introuvable' });
    if (template.status === 'archive') {
      return res.status(400).json({ success: false, error: 'Un modèle archivé doit d\'abord être restauré' });
    }

    await template.update({ status: 'actif', version: (template.version || 1) + 1 });

    await logAudit(req, {
      action: 'publish',
      entity: 'document_template',
      entityId: template.id,
      details: { name: template.name },
    });

    return res.json({ success: true, data: { template } });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// POST /:id/archive — archive template
router.post('/:id/archive',
  requireRole(...ADMIN_WRITE),
  requirePermission('templates', 'delete'),
  async (req: Request, res: Response) => {
  try {
    const template = await DocumentTemplate.findOne({
      where: { id: req.params.id, schoolId: req.user!.schoolId! },
    });
    if (!template) return res.status(404).json({ success: false, error: 'Modèle introuvable' });

    await template.update({ status: 'archive' });

    await logAudit(req, {
      action: 'archive',
      entity: 'document_template',
      entityId: template.id,
      details: { name: template.name },
    });

    return res.json({ success: true, data: { template } });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// POST /:id/restore — restore archived template
router.post('/:id/restore',
  requireRole(...ADMIN_WRITE),
  requirePermission('templates', 'update'),
  async (req: Request, res: Response) => {
  try {
    const template = await DocumentTemplate.findOne({
      where: { id: req.params.id, schoolId: req.user!.schoolId! },
    });
    if (!template) return res.status(404).json({ success: false, error: 'Modèle introuvable' });

    await template.update({ status: 'brouillon' });

    await logAudit(req, {
      action: 'restore',
      entity: 'document_template',
      entityId: template.id,
      details: { name: template.name },
    });

    return res.json({ success: true, data: { template } });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// DELETE /:id — delete template (only drafts)
router.delete('/:id',
  uuidId,
  requireRole(...ADMIN_WRITE),
  requirePermission('templates', 'delete'),
  async (req: Request, res: Response) => {
  if (rejectInvalidIds(req, res)) return;
  try {
    const template = await DocumentTemplate.findOne({
      where: { id: req.params.id, schoolId: req.user!.schoolId! },
    });
    if (!template) return res.status(404).json({ success: false, error: 'Modèle introuvable' });
    if (template.status === 'actif') {
      return res.status(400).json({ success: false, error: 'Un modèle actif doit être archivé avant suppression' });
    }

    await template.destroy();

    await logAudit(req, {
      action: 'delete',
      entity: 'document_template',
      entityId: req.params.id,
      details: { name: template.name },
    });

    return res.json({ success: true, data: { message: 'Modèle supprimé' } });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// ============================
// DOCUMENT GENERATION
// ============================

// POST /generate — generate a single document from template + student data
router.post(
  '/generate',
  requireRole(...AUTHOR_WRITE),
  requirePermission('reports', 'create'),
  body('templateId').isUUID().withMessage('Modèle invalide'),
  body('studentId').optional().custom((v) => {
    if (v === undefined || v === null || v === '') return true;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v));
  }).withMessage('Élève invalide'),
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ success: false, error: errors.array()[0].msg });

      const { templateId, studentId, overrides } = req.body;
      const schoolId = req.user!.schoolId!;

      const template = await DocumentTemplate.findOne({ where: { id: templateId, schoolId } });
      if (!template) return res.status(404).json({ success: false, error: 'Modèle introuvable' });
      if (template.status !== 'actif') {
        return res.status(400).json({ success: false, error: 'Seuls les modèles actifs peuvent générer des documents' });
      }

      let student = null;
      if (studentId) {
        student = await Student.findOne({
          where: { id: studentId, schoolId },
          include: [{ model: (await import('../models/index.js')).Class, as: 'class' }],
        });
        if (!student) return res.status(404).json({ success: false, error: 'Élève introuvable' });
      }

      const documentNumber = await assignDocumentNumber();
      const verifyUrl = buildVerifyUrl(documentNumber);
      const result = await generatePdfFromTemplate(template, student, overrides || {}, schoolId, documentNumber, verifyUrl);

      const fileName = `${uuidv4()}.pdf`;
      const filePath = path.join(generatedDir, fileName);
      fs.writeFileSync(filePath, result.buffer);

      const snapshot = await buildBulletinSnapshot(template, student, overrides || {}, req.user!.id);

      const generatedDoc = await GeneratedDocument.create({
        schoolId,
        templateId,
        documentType: template.category,
        studentId: studentId || null,
        filePath: `/uploads/generated/${fileName}`,
        title: result.title,
        documentNumber,
        status: 'GENERATED',
        metadata: {
          templateVersion: template.version,
          generatedBy: req.user!.id,
          verifyUrl,
          academicYear: typeof overrides?.academicYear === 'string' ? overrides.academicYear : undefined,
          ...(snapshot ? { snapshot } : {}),
          ...result.metadata,
        },
      });

      await logAudit(req, {
        action: 'create',
        entity: 'generated_document',
        entityId: generatedDoc.id,
        details: { templateId, studentId, documentType: template.category },
      });

      // Emit real-time event
      WebSocketEvents.document.generated(schoolId, {
        id: generatedDoc.id,
        title: generatedDoc.title || result.title,
        documentType: template.category,
        studentId: studentId || undefined,
        studentName: student ? `${student.lastName} ${student.firstName}` : undefined,
        templateId,
        templateName: template.name,
        status: generatedDoc.status,
        action: 'generated',
      });

      return res.status(201).json({ success: true, data: { document: generatedDoc } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

// POST /generate-bulk — generate documents for a whole class
router.post(
  '/generate-bulk',
  requireRole(...AUTHOR_WRITE),
  requirePermission('reports', 'create'),
  body('templateId').isUUID(),
  body('classId').optional().custom((v) => {
    if (v === undefined || v === null || v === '') return true;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v));
  }).withMessage('Classe invalide'),
  body('studentIds').optional().isArray(),
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ success: false, error: errors.array()[0].msg });

      const { templateId, classId, studentIds } = req.body;
      const schoolId = req.user!.schoolId!;

      const template = await DocumentTemplate.findOne({ where: { id: templateId, schoolId } });
      if (!template) return res.status(404).json({ success: false, error: 'Modèle introuvable' });
      if (template.status !== 'actif') {
        return res.status(400).json({ success: false, error: 'Seuls les modèles actifs peuvent générer des documents' });
      }

      const { Class } = await import('../models/index.js');

      let targets: Student[] = [];
      if (studentIds && studentIds.length > 0) {
        targets = (await Student.findAll({
          where: { id: studentIds, schoolId },
          include: [{ model: Class, as: 'class' }],
        })) as Student[];
      } else if (classId) {
        targets = (await Student.findAll({
          where: { classId, schoolId, status: 'active' },
          include: [{ model: Class, as: 'class' }],
          order: [['lastName', 'ASC'], ['firstName', 'ASC']],
        })) as Student[];
      } else {
        return res.status(400).json({ success: false, error: 'classId ou studentIds requis' });
      }

      const created = [];
      const failed: Array<{ studentId: string; error: string }> = [];

      for (const student of targets) {
        try {
          const documentNumber = await assignDocumentNumber();
          const verifyUrl = buildVerifyUrl(documentNumber);
          const result = await generatePdfFromTemplate(template, student, {}, schoolId, documentNumber, verifyUrl);
          const fileName = `${uuidv4()}.pdf`;
          fs.writeFileSync(path.join(generatedDir, fileName), result.buffer);
          const snapshot = await buildBulletinSnapshot(template, student, {}, req.user!.id);

          const doc = await GeneratedDocument.create({
            schoolId,
            templateId,
            documentType: template.category,
            studentId: student.id,
            filePath: `/uploads/generated/${fileName}`,
            title: result.title,
            documentNumber,
            status: 'GENERATED',
            metadata: {
              templateVersion: template.version,
              generatedBy: req.user!.id,
              verifyUrl,
              ...(snapshot ? { snapshot } : {}),
            },
          });
          created.push(doc);
        } catch (err) {
          failed.push({ studentId: student.id, error: (err as Error).message });
        }
      }

      await logAudit(req, {
        action: 'create',
        entity: 'generated_document',
        details: { templateId, count: created.length, failed: failed.length },
      });

      // Emit real-time events for each created document
      for (const doc of created) {
        const student = targets.find(s => s.id === doc.studentId);
        WebSocketEvents.document.generated(schoolId, {
          id: doc.id,
          title: doc.title || '',
          documentType: template.category,
          studentId: doc.studentId,
          studentName: student ? `${student.lastName} ${student.firstName}` : undefined,
          templateId,
          templateName: template.name,
          status: doc.status,
          action: 'generated',
        });
      }

      return res.json({ success: true, data: { created: created.length, failed, documents: created } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

// ============================
// GENERATED DOCUMENTS
// ============================

// GET /generated — list generated documents
router.get('/generated/list',
  requireRole(...STAFF_READ),
  requirePermission('documents', 'view'),
  async (req: Request, res: Response) => {
  try {
    const { studentId, templateId, type, search, page = 1, limit = 20 } = req.query;
    const where: Record<string, unknown> = { schoolId: req.user!.schoolId! };

    if (studentId) where.studentId = studentId;
    if (templateId) where.templateId = templateId;
    if (type) where.documentType = type;
    if (search) {
      (where as Record<string, unknown>)[Op.or as unknown as string] = [{ title: { [Op.iLike]: `%${search}%` } }];
    }

    const offset = (Number(page) - 1) * Number(limit);
    const { count, rows } = await GeneratedDocument.findAndCountAll({
      where,
      include: [
        { model: Student, as: 'student', attributes: ['id', 'firstName', 'lastName', 'studentId'] },
        { model: DocumentTemplate, as: 'template', attributes: ['id', 'name', 'category'] },
      ],
      order: [['createdAt', 'DESC']],
      limit: Number(limit),
      offset,
    });

    return res.json({
      success: true,
      data: {
        items: rows,
        total: count,
        page: Number(page),
        pages: Math.ceil(count / Number(limit)),
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// GET /generated/:id/download — download generated document
router.get('/generated/:id/download',
  requireRole(...SINGLE_READ),
  requirePermission('reports', 'download'),
  async (req: Request, res: Response) => {
  try {
    const doc = await GeneratedDocument.findOne({
      where: { id: req.params.id, schoolId: req.user!.schoolId! },
    });
    if (!doc) return res.status(404).json({ success: false, error: 'Document introuvable' });

    const filePath = path.resolve(process.cwd(), doc.filePath.replace(/^\//, ''));
    if (!fs.existsSync(filePath)) return res.status(404).json({ success: false, error: 'Fichier introuvable sur disque' });

    await logAudit(req, { action: 'download', entity: 'generated_document', entityId: doc.id });
    res.download(filePath, `${doc.title || 'document'}.pdf`);
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// DELETE /generated/:id — delete generated document
router.delete('/generated/:id',
  requireRole(...ADMIN_WRITE),
  requirePermission('documents', 'delete'),
  async (req: Request, res: Response) => {
  try {
    const doc = await GeneratedDocument.findOne({
      where: { id: req.params.id, schoolId: req.user!.schoolId! },
    });
    if (!doc) return res.status(404).json({ success: false, error: 'Document introuvable' });

    const filePath = path.resolve(process.cwd(), doc.filePath.replace(/^\//, ''));
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    await doc.destroy();

    await logAudit(req, { action: 'delete', entity: 'generated_document', entityId: req.params.id });

    // Emit real-time event
    WebSocketEvents.document.deleted(req.user!.schoolId!, {
      id: doc.id,
      title: doc.title || '',
      documentType: doc.documentType,
      studentId: doc.studentId,
      studentName: undefined,
      templateId: doc.templateId,
      templateName: '',
      status: doc.status,
      action: 'deleted',
    });

    return res.json({ success: true, data: { message: 'Document supprimé' } });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// ============================
// GENERATED DOCUMENT WORKFLOW
// ============================

const GENERATED_DOC_STATUSES = ['DRAFT', 'GENERATED', 'REVIEWED', 'VALIDATED', 'PUBLISHED', 'ARCHIVED', 'REVOKED'];

const GENERATED_DOC_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['GENERATED', 'REVOKED'],
  GENERATED: ['REVIEWED', 'REVOKED'],
  REVIEWED: ['VALIDATED', 'REVOKED'],
  VALIDATED: ['PUBLISHED', 'REVOKED'],
  PUBLISHED: ['ARCHIVED', 'REVOKED'],
  ARCHIVED: ['REVOKED'],
  REVOKED: [],
};

async function hasReportPermission(req: Request, permission: string): Promise<boolean> {
  const role = req.user?.role || '';
  const legacy = LEGACY_ROLE_PERMISSIONS[role] || [];
  if (legacy.includes('*') || legacy.includes(permission)) return true;
  try {
    const custom = await getCustomRolePermissions(req.user!.id, req.user!.schoolId);
    return custom.includes('*') || custom.includes(permission);
  } catch {
    return false;
  }
}

// PATCH /generated/:id/status — legal workflow transitions with role guards + audit.
// Metadata (including metadata.snapshot) is never touched here.
router.patch('/generated/:id/status',
  requireRole('super_admin', 'admin', 'director', 'teacher'),
  body('status').isString().withMessage('Statut invalide'),
  async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, error: errors.array()[0].msg });

    const target = String(req.body.status || '').toUpperCase();
    if (!GENERATED_DOC_STATUSES.includes(target)) {
      return res.status(400).json({ success: false, error: 'Statut invalide' });
    }

    const doc = await GeneratedDocument.findOne({
      where: { id: req.params.id, schoolId: req.user!.schoolId! },
    });
    if (!doc) return res.status(404).json({ success: false, error: 'Document introuvable' });

    const current = String(doc.status || '');
    const allowed = GENERATED_DOC_TRANSITIONS[current] || ['GENERATED', 'REVOKED'];
    if (!allowed.includes(target)) {
      return res.status(400).json({ success: false, error: `Transition illégale : ${current} → ${target}` });
    }

    if (target === 'VALIDATED') {
      if (!(await hasReportPermission(req, 'reports.validate'))) {
        return res.status(403).json({ success: false, error: 'Insufficient permissions' });
      }
    } else if (target === 'PUBLISHED') {
      if (!(await hasReportPermission(req, 'reports.publish'))) {
        return res.status(403).json({ success: false, error: 'Insufficient permissions' });
      }
    } else if (!['super_admin', 'admin', 'director'].includes(req.user!.role)) {
      return res.status(403).json({ success: false, error: 'Insufficient permissions' });
    }

    await doc.update({ status: target });

    await logAudit(req, {
      action: 'status',
      entity: 'generated_document',
      entityId: doc.id,
      details: { from: current, to: target },
    });

    // Emit real-time event
    WebSocketEvents.document.statusChanged(req.user!.schoolId!, {
      id: doc.id,
      title: doc.title || '',
      documentType: doc.documentType,
      studentId: doc.studentId,
      studentName: undefined,
      templateId: doc.templateId,
      templateName: '',
      status: doc.status,
      action: 'status_changed',
    });

    return res.json({ success: true, data: { document: doc } });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// PATCH /generated/:id/decision — record jury decision + observation.
// Merges into metadata top-level keys only; metadata.snapshot is preserved untouched.
router.patch('/generated/:id/decision',
  requireRole('super_admin', 'admin', 'director', 'teacher'),
  body('decision').notEmpty().withMessage('La décision est requise'),
  async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, error: errors.array()[0].msg });

    const doc = await GeneratedDocument.findOne({
      where: { id: req.params.id, schoolId: req.user!.schoolId! },
    });
    if (!doc) return res.status(404).json({ success: false, error: 'Document introuvable' });

    const { decision, observation } = req.body as { decision: string; observation?: string };
    const meta = ((doc.metadata || {}) as Record<string, unknown>);
    await doc.update({
      metadata: {
        ...meta,
        decision: String(decision),
        observation: typeof observation === 'string' ? observation : '',
        decisionBy: req.user!.id,
        decisionAt: new Date().toISOString(),
      },
    });

    await logAudit(req, {
      action: 'decision',
      entity: 'generated_document',
      entityId: doc.id,
      details: { decision, observation: observation || '' },
    });

    // Emit real-time event
    WebSocketEvents.document.updated(req.user!.schoolId!, {
      id: doc.id,
      title: doc.title || '',
      documentType: doc.documentType,
      studentId: doc.studentId,
      studentName: undefined,
      templateId: doc.templateId,
      templateName: '',
      status: doc.status,
      action: 'updated',
    });

    const updated = await GeneratedDocument.findByPk(doc.id);
    return res.json({ success: true, data: { document: updated } });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// POST /preview-bulletin — computed RDC bulletin JSON (no PDF)
router.post('/preview-bulletin',
  requireRole('super_admin', 'admin', 'director', 'teacher', 'accountant', 'receptionist', 'prefect'),
  requirePermission('reports', 'view'),
  body('studentId').isUUID().withMessage('Élève invalide'),
  async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, error: errors.array()[0].msg });

    const { studentId, academicYear } = req.body as { studentId: string; academicYear?: string };
    const student = await Student.findOne({ where: { id: studentId, schoolId: req.user!.schoolId! } });
    if (!student) return res.status(404).json({ success: false, error: 'Élève introuvable' });

    const data = await buildRdcBulletinData(
      studentId,
      typeof academicYear === 'string' ? academicYear : undefined
    );
    if (!data) return res.status(404).json({ success: false, error: 'Élève introuvable' });

    return res.json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// POST /seed-rdc-bulletins — idempotent creation of 3 ACTIF RDC bulletin templates
router.post('/seed-rdc-bulletins',
  requireRole(...ADMIN_WRITE),
  requirePermission('templates', 'create'),
  async (req: Request, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!;
    const refresh = req.query['refresh'] === '1';
    const defs = buildRdcBulletinTemplateDefs();
    let created = 0;
    let skipped = 0;
    let refreshed = 0;
    const templates: DocumentTemplate[] = [];

    for (const def of defs) {
      const existing = await DocumentTemplate.findOne({ where: { schoolId, name: def.name } });
      if (existing) {
        if (refresh) {
          // Overwrite the schema with the upgraded official structure + bump version.
          await existing.update({
            schema: def.schema,
            scope: def.scope || null,
            version: Number(existing.version || 1) + 1,
          });
          refreshed += 1;
          const updated = await DocumentTemplate.findByPk(existing.id);
          templates.push(updated || existing);
          continue;
        }
        // Backfill scope on rows seeded before scopes existed.
        if (def.scope && !existing.scope) {
          await existing.update({ scope: def.scope });
          created += 1;
          const refreshed = await DocumentTemplate.findByPk(existing.id);
          templates.push(refreshed || existing);
          continue;
        }
        skipped += 1;
        templates.push(existing);
        continue;
      }
      const tpl = await DocumentTemplate.create({
        schoolId,
        name: def.name,
        description: def.description,
        category: def.category,
        format: 'A4',
        orientation: 'portrait',
        status: 'actif',
        creatorId: req.user!.id,
        schema: def.schema,
        scope: def.scope || null,
      });
      created += 1;
      templates.push(tpl);
    }

    await logAudit(req, {
      action: refresh ? 'update' : 'create',
      entity: 'document_template',
      details: { seed: 'rdc-bulletins', created, skipped, refreshed, refresh },
    });

    return res.json({ success: true, data: { created, skipped, refreshed, templates } });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// ============================
// PDF RENDERING ENGINE
// ============================

interface TemplateElement {
  id: string;
  type: 'text' | 'rich_text' | 'image' | 'logo' | 'table' | 'grades_table' | 'grades_table_rdc' | 'id_boxes' | 'fees_table' | 'rounded_frame' | 'line' | 'rectangle' | 'signature' | 'stamp' | 'qr_code' | 'page_number' | 'date' | 'dynamic_field' | 'divider';
  x: number;
  y: number;
  width: number;
  height: number;
  content?: string;
  text?: string;
  field?: string;
  boxSize?: number;
  fontSize?: number;
  fontFamily?: 'Helvetica' | 'Helvetica-Bold' | 'Times-Roman' | 'Times-Bold' | 'Courier';
  color?: string;
  align?: 'left' | 'center' | 'right' | 'justify';
  bold?: boolean;
  italic?: boolean;
  src?: string;
  rows?: string[][];
  borderWidth?: number;
  borderColor?: string;
  backgroundColor?: string;
  radius?: number;
  /** RDC grades table only: adds right-side REPÊCHAGE columns (% + Sign. Prof). */
  repechage?: boolean;
}

interface TemplateSchema {
  elements: TemplateElement[];
}

interface GradeRow {
  subject: string;
  coefficient: number;
  avg20: number | null;
  weighted: number | null;
}

interface FeeRow {
  type: string;
  amount: number;
  paid: number;
  balance: number;
  dueDate: string;
  status: string;
}

interface DocumentContext {
  student: {
    firstName: string;
    lastName: string;
    fullName: string;
    matricule: string;
    permanentNumber: string;
    className: string;
    dateOfBirth: string;
    birthDate: string;
    birthPlace: string;
    nationality: string;
    gender: string;
  };
  school: {
    name: string;
    address: string;
    phone: string;
    email: string;
    year: string;
    director: string;
    province: string;
    city: string;
    territory: string;
    code: string;
    emblem: string;
  };
  academicYear: string;
  report: { title: string };
  percentage: number | string;
  decision: string;
  observation: string;
  conduct: string;
  period: string;
  date: string;
  grades: {
    rows: GradeRow[];
    generalAvg: number | null;
    totalWeighted: number;
    totalCoef: number;
    rank: number | null;
    classSize: number;
    appreciation: string;
  };
  fees: {
    rows: FeeRow[];
    totalAmount: number;
    totalPaid: number;
    totalBalance: number;
  };
  absences: string;
  lates: string;
  absencesJustified: string;
  appreciation: string;
  appS1: string;
  appS2: string;
  generalAvg: string;
  rank: string;
  [key: string]: unknown;
}

const FEE_TYPE_LABELS_FR: Record<string, string> = {
  tuition: 'Minerval',
  registration: 'Inscription',
  exam: 'Examen',
  transport: 'Transport',
  canteen: 'Cantine',
  uniform: 'Uniforme',
  other: 'Autres',
};

const FEE_STATUS_LABELS_FR: Record<string, string> = {
  pending: 'En attente',
  paid: 'Payé',
  partial: 'Partiel',
  overdue: 'En retard',
};

function appreciationForAvg(avg: number | null, passMark = 10): string {
  if (avg === null) return '';
  if (avg >= 16) return 'Très Bien';
  if (avg >= 14) return 'Bien';
  if (avg >= 12) return 'Assez Bien';
  if (avg >= passMark) return 'Passable';
  if (avg >= passMark - 2) return 'Insuffisant';
  return 'Faible';
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function formatMoney(n: number): string {
  return Number(n || 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 });
}

/** Weighted average of raw scores, weights = per-grade coefficients. */
function weightedAvgOfScores(scores: { score: number; coefficient: number }[]): number | null {
  if (scores.length === 0) return null;
  const totalCoef = scores.reduce((s, g) => s + Number(g.coefficient || 0), 0);
  if (totalCoef === 0) return null;
  const total = scores.reduce((s, g) => s + Number(g.score || 0) * Number(g.coefficient || 0), 0);
  return round2(total / totalCoef);
}

/**
 * Builds the dynamic data context from real DB records.
 * Null-safe when no student is provided (empty grades/fees, zeroed counters).
 */
async function buildContext(
  template: DocumentTemplate,
  student: Student | null,
  overrides: Record<string, unknown>,
  schoolId: string
): Promise<DocumentContext> {
  void template;
  const now = new Date();
  const currentYear = `${now.getFullYear()}-${now.getFullYear() + 1}`;
  const academicYear = (overrides['academicYear'] as string) || (overrides['school.year'] as string) || undefined;
  const termRaw = overrides['term'] ?? overrides['period.term'];
  const termNum = Number(termRaw);
  const term = termRaw !== undefined && [1, 2, 3].includes(termNum) ? termNum : undefined;

  // --- School (DB first, overrides win) ---
  const schoolRec = await School.findByPk(schoolId);
  const settingsEmail =
    schoolRec && schoolRec.settings && typeof schoolRec.settings === 'object'
      ? String((schoolRec.settings as Record<string, unknown>)['email'] || '')
      : '';
  const schoolYear = academicYear || currentYear;
  const directorRec = await User.findOne({ where: { schoolId, role: 'director' } });
  const adminFallback = directorRec ? null : await User.findOne({ where: { schoolId, role: 'admin' } });
  const directorName = (directorRec || adminFallback)?.name || '';

  const studentRec = (student || null) as unknown as {
    id?: string;
    firstName?: string;
    lastName?: string;
    studentId?: string;
    classId?: string;
    class?: { name?: string };
    dateOfBirth?: Date | string | null;
    birthPlace?: string;
    nationality?: string;
    gender?: string;
  } | null;

  const dobStr = studentRec?.dateOfBirth ? new Date(studentRec.dateOfBirth).toLocaleDateString('fr-FR') : '';
  const fullName = `${studentRec?.firstName || ''} ${studentRec?.lastName || ''}`.trim();

  const ctx: DocumentContext = {
    student: {
      firstName: studentRec?.firstName || '',
      lastName: studentRec?.lastName || '',
      fullName,
      matricule: studentRec?.studentId || '',
      permanentNumber: studentRec?.studentId || '',
      className: studentRec?.class?.name || '',
      dateOfBirth: dobStr,
      birthDate: dobStr,
      birthPlace: studentRec?.birthPlace || '',
      nationality: studentRec?.nationality || '',
      gender: studentRec?.gender || '',
    },
    school: {
      name: schoolRec?.name || '',
      address: schoolRec?.address || '',
      phone: schoolRec?.phone || '',
      email: settingsEmail,
      year: schoolYear,
      director: directorName,
      province: (schoolRec as unknown as { province?: string })?.province || '',
      city: (schoolRec as unknown as { city?: string })?.city || '',
      territory: (schoolRec as unknown as { territory?: string })?.territory || '',
      code: (schoolRec as unknown as { code?: string })?.code || '',
      emblem: (schoolRec as unknown as { emblem?: string })?.emblem || '',
    },
    academicYear: academicYear || schoolYear,
    report: { title: '' },
    percentage: '',
    decision: '',
    observation: typeof overrides['observation'] === 'string' ? (overrides['observation'] as string) : '',
    conduct: '—',
    period: (overrides['period'] as string) || (term !== undefined ? `${term}${term === 1 ? 'er' : 'ème'} Trimestre` : `Année ${schoolYear}`),
    date: now.toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' }),
    grades: { rows: [], generalAvg: null, totalWeighted: 0, totalCoef: 0, rank: null, classSize: 0, appreciation: '' },
    fees: { rows: [], totalAmount: 0, totalPaid: 0, totalBalance: 0 },
    absences: '0',
    lates: '0',
    absencesJustified: '0',
    appreciation: '',
    appS1: '',
    appS2: '',
    generalAvg: '',
    rank: '',
  };

  // --- Grades / rank / attendance (student only) ---
  const passMark = getGradingPassMark(schoolRec?.settings);
  if (studentRec?.id) {
    const studentId = studentRec.id;
    const classId = studentRec.classId || '';
    const publishedFilter = { [Op.or]: [{ status: 'PUBLISHED' }, { status: null }] };

    const gradeWhere: Record<string, unknown> = { schoolId, studentId, ...publishedFilter };
    if (academicYear) gradeWhere['academicYear'] = academicYear;
    if (term !== undefined) gradeWhere['term'] = term;

    const classSubjects = classId
      ? await Subject.findAll({ where: { schoolId, classId }, order: [['name', 'ASC']] })
      : [];
    const studentGrades = await Grade.findAll({ where: gradeWhere });

    const rows: GradeRow[] = [];
    for (const subject of classSubjects) {
      const subjectGrades = studentGrades.filter((g) => g.subjectId === subject.id);
      if (subjectGrades.length === 0) continue;
      const avg20 = weightedAvgOfScores(
        subjectGrades.map((g) => ({ score: Number(g.score), coefficient: Number(g.coefficient || 1) }))
      );
      const coef = Number(subject.coefficient || 1);
      rows.push({
        subject: subject.name,
        coefficient: coef,
        avg20,
        weighted: avg20 === null ? null : round2(avg20 * coef),
      });
    }

    const totalWeighted = round2(rows.reduce((s, r) => s + (r.weighted || 0), 0));
    const totalCoef = round2(rows.reduce((s, r) => s + Number(r.coefficient || 0), 0));
    const generalAvg = rows.length > 0 && totalCoef > 0 ? round2(totalWeighted / totalCoef) : null;

    // Rank: same metric recomputed for every active classmate
    let rank: number | null = null;
    let classSize = 0;
    if (classId) {
      const classmates = await Student.findAll({
        where: { schoolId, classId, status: 'active' },
        attributes: ['id'],
      });
      classSize = classmates.length;
      if (rows.length > 0) {
        const subjectCoefById = new Map<string, number>();
        for (const s of classSubjects) subjectCoefById.set(s.id, Number(s.coefficient || 1));
        const averages: { id: string; avg: number }[] = [];
        for (const mate of classmates) {
          if (mate.id === studentId) {
            averages.push({ id: mate.id, avg: generalAvg || 0 });
            continue;
          }
          const mateWhere: Record<string, unknown> = { schoolId, studentId: mate.id, ...publishedFilter };
          if (academicYear) mateWhere['academicYear'] = academicYear;
          if (term !== undefined) mateWhere['term'] = term;
          const mateGrades = await Grade.findAll({ where: mateWhere });
          let w = 0;
          let c = 0;
          const bySubject = new Map<string, { score: number; coefficient: number }[]>();
          for (const g of mateGrades) {
            const list = bySubject.get(g.subjectId) || [];
            list.push({ score: Number(g.score), coefficient: Number(g.coefficient || 1) });
            bySubject.set(g.subjectId, list);
          }
          for (const [subjectId, list] of bySubject) {
            const avg = weightedAvgOfScores(list);
            if (avg === null) continue;
            const coef = subjectCoefById.get(subjectId) || 1;
            w += avg * coef;
            c += coef;
          }
          averages.push({ id: mate.id, avg: c > 0 ? round2(w / c) : 0 });
        }
        averages.sort((a, b) => b.avg - a.avg);
        const idx = averages.findIndex((a) => a.id === studentId);
        rank = idx >= 0 ? idx + 1 : null;
      }
    }

    const appreciation = appreciationForAvg(generalAvg, passMark);
    ctx.grades = { rows, generalAvg, totalWeighted, totalCoef, rank, classSize, appreciation };
    ctx.appreciation = appreciation;
    ctx.generalAvg = generalAvg !== null ? generalAvg.toFixed(2) : '';
    ctx.rank = rank !== null ? `${rank} / ${classSize}` : '';

    const attendances = await Attendance.findAll({ where: { schoolId, studentId } });
    const absent = attendances.filter((a) => a.status === 'absent').length;
    const late = attendances.filter((a) => a.status === 'late').length;
    const excused = attendances.filter((a) => a.status === 'excused').length;
    ctx.absences = String(absent);
    ctx.lates = String(late);
    ctx.absencesJustified = String(excused);

    // --- Fees ---
    const feeWhere: Record<string, unknown> = { schoolId, studentId };
    if (academicYear) feeWhere['academicYear'] = academicYear;
    const fees = await Fee.findAll({ where: feeWhere, order: [['dueDate', 'ASC']] });
    const feeRows: FeeRow[] = fees.map((f) => {
      const amount = Number(f.totalAmount ?? f.amount ?? 0) || 0;
      const paid = Number(f.paidAmount ?? 0) || 0;
      return {
        type: FEE_TYPE_LABELS_FR[String(f.type)] || String(f.type || 'Autres'),
        amount,
        paid,
        balance: round2(amount - paid),
        dueDate: f.dueDate ? new Date(f.dueDate).toLocaleDateString('fr-FR') : '',
        status: FEE_STATUS_LABELS_FR[String(f.status)] || String(f.status || ''),
      };
    });
    const totalAmount = round2(feeRows.reduce((s, r) => s + r.amount, 0));
    const totalPaid = round2(feeRows.reduce((s, r) => s + r.paid, 0));
    ctx.fees = { rows: feeRows, totalAmount, totalPaid, totalBalance: round2(totalAmount - totalPaid) };

    // --- RDC bulletin (published grades only, null-safe; never throws) ---
    try {
      const bulletin = await buildRdcBulletinData(studentId, academicYear, { observation: ctx.observation });
      if (bulletin) {
        (ctx as Record<string, unknown>)['bulletin'] = bulletin;
        ctx.report = { title: bulletin.report.title || '' };
        ctx.percentage = bulletin.percentage ?? '';
        ctx.decision = bulletin.decision || '';
        ctx.conduct = bulletin.conduct || '—';
        ctx.appS1 = bulletin.appS1 || '';
        ctx.appS2 = bulletin.appS2 || '';
        ctx.academicYear = bulletin.academicYear || schoolYear;
        ctx.student.fullName = bulletin.student.fullName || fullName;
        ctx.student.permanentNumber = bulletin.student.permanentNumber || ctx.student.matricule;
        ctx.student.birthPlace = bulletin.student.birthPlace || '';
        ctx.student.birthDate = bulletin.student.birthDate || '';
        ctx.student.dateOfBirth = bulletin.student.birthDate || '';
        ctx.student.nationality = bulletin.student.nationality || '';
        ctx.student.className = bulletin.student.className || ctx.student.className;
        ctx.school.province = bulletin.school.province || ctx.school.province;
        ctx.school.city = bulletin.school.city || ctx.school.city;
        ctx.school.territory = bulletin.school.territory || ctx.school.territory;
        ctx.school.code = bulletin.school.code || ctx.school.code;
        ctx.school.emblem = bulletin.school.emblem || ctx.school.emblem;
        if (!ctx.observation) ctx.observation = bulletin.observation || '';
      }
    } catch {
      // keep context defaults — a bulletin failure must never break generation
    }
  }

  // --- Overrides win (supports both nested objects and dotted keys) ---
  const flat = overrides as Record<string, unknown>;
  for (const [key, value] of Object.entries(flat)) {
    if (value === undefined) continue;
    if (!key.includes('.')) {
      (ctx as Record<string, unknown>)[key] = value;
      continue;
    }
    const parts = key.split('.');
    let target: Record<string, unknown> = ctx as unknown as Record<string, unknown>;
    for (let i = 0; i < parts.length - 1; i++) {
      const existing = target[parts[i]];
      if (!existing || typeof existing !== 'object') target[parts[i]] = {};
      target = target[parts[i]] as Record<string, unknown>;
    }
    target[parts[parts.length - 1]] = value;
  }

  return ctx;
}

/**
 * Replaces {{path.to.value}} tokens with real data.
 */
function resolveField(template: string, ctx: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, key: string) => {
    const parts = key.split('.');
    let value: unknown = ctx;
    for (const part of parts) {
      if (value && typeof value === 'object') {
        value = (value as Record<string, unknown>)[part];
      } else {
        value = undefined;
        break;
      }
    }
    if (value === undefined || value === null) return '';
    return String(value);
  });
}

/**
 * Generates a PDF buffer from a template schema and dynamic context.
 * Uses pdfkit — the same engine that powers the final download, so
 * preview and PDF stay visually consistent.
 */
async function generatePdfFromTemplate(
  template: DocumentTemplate,
  student: Student | null,
  overrides: Record<string, unknown>,
  schoolId: string,
  documentNumber?: string,
  verifyUrl?: string
): Promise<{ buffer: Buffer; title: string; metadata: Record<string, unknown> }> {
  const PDFDocument = (await import('pdfkit')).default;
  const schema = (template as unknown as { schema?: TemplateSchema }).schema;
  const ctx = await buildContext(template, student, overrides, schoolId);
  if (documentNumber) (ctx as Record<string, unknown>)['documentNumber'] = documentNumber;
  if (verifyUrl) (ctx as Record<string, unknown>)['verifyUrl'] = verifyUrl;

  let qrBuffer: Buffer | null = null;
  if (verifyUrl) {
    try {
      qrBuffer = await QRCode.toBuffer(verifyUrl, { width: 120, margin: 1 });
    } catch {
      qrBuffer = null;
    }
  }

  const isLandscape = template.orientation === 'landscape';
  const sizeMap: Record<string, string> = { A4: 'A4', A5: 'A5', A6: 'A6', Letter: 'LETTER', Legal: 'LEGAL' };
  const doc = new PDFDocument({
    size: (sizeMap[template.format] as 'A4') || 'A4',
    layout: isLandscape ? 'landscape' : 'portrait',
    margin: 40,
  });

  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));

  const pageWidth = doc.page.width - 80;
  const elements = schema?.elements || [];

  if (elements.length === 0) {
    // Fallback: structured default document so generation never produces a blank page
    renderDefaultDocument(doc, template, ctx, pageWidth, qrBuffer, documentNumber, verifyUrl);
  } else {
    for (const el of elements) {
      const x = 40 + (el.x || 0);
      const y = 40 + (el.y || 0);

      switch (el.type) {
        case 'text':
        case 'rich_text': {
          const raw = el.content || el.text || '';
          const resolved = resolveField(raw, ctx);
          doc.font(el.fontFamily || (el.bold ? 'Helvetica-Bold' : 'Helvetica'))
            .fontSize(el.fontSize || 12)
            .fillColor(el.color || '#111827');
          const align = el.align || 'left';
          doc.text(resolved, x, y, { width: el.width || pageWidth, align, lineGap: 2 });
          break;
        }
        case 'dynamic_field': {
          const resolved = resolveField(`{{${el.field || ''}}}`, ctx);
          doc.font(el.bold ? 'Helvetica-Bold' : 'Helvetica')
            .fontSize(el.fontSize || 12)
            .fillColor(el.color || '#111827')
            .text(resolved, x, y, { width: el.width || 200, align: el.align || 'left' });
          break;
        }
        case 'divider':
        case 'line': {
          doc.moveTo(x, y).lineTo(x + (el.width || pageWidth), y)
            .lineWidth(el.borderWidth || 1)
            .strokeColor(el.borderColor || '#94a3b8').stroke();
          break;
        }
        case 'image':
        case 'logo':
        case 'signature':
        case 'stamp': {
          if (el.src) {
            const assetPath = path.resolve(process.cwd(), el.src.replace(/^\//, ''));
            if (fs.existsSync(assetPath)) {
              try {
                doc.image(assetPath, x, y, {
                  fit: [el.width || 120, el.height || 60],
                });
              } catch {
                // ignore unreadable image assets
              }
            }
          }
          break;
        }
        case 'rectangle': {
          doc.rect(x, y, el.width || 100, el.height || 50)
            .lineWidth(el.borderWidth || 1)
            .strokeColor(el.borderColor || '#cbd5e1');
          if (el.backgroundColor) doc.fillColor(el.backgroundColor).fill();
          doc.stroke();
          break;
        }
        case 'date': {
          doc.font('Helvetica').fontSize(el.fontSize || 10).fillColor('#475569')
            .text(String(ctx.date), x, y, { width: el.width || 200, align: el.align || 'left' });
          break;
        }
        case 'page_number': {
          doc.font('Helvetica').fontSize(el.fontSize || 9).fillColor('#94a3b8')
            .text(`Page ${doc.bufferedPageRange().count > 0 ? 1 : 1}`, x, y, { width: el.width || 100, align: 'right' });
          break;
        }
        case 'table': {
          renderTable(doc, el, ctx, x, y);
          break;
        }
        case 'grades_table': {
          renderGradesTable(doc, el, ctx, x, y);
          break;
        }
        case 'grades_table_rdc': {
          renderRdcGradesTable(doc, el, ctx, x, y);
          break;
        }
        case 'id_boxes': {
          renderIdBoxes(doc, el, ctx, x, y);
          break;
        }
        case 'qr_code': {
          await renderQrCodeElement(doc, el, ctx, x, y);
          break;
        }
        case 'fees_table': {
          renderFeesTable(doc, el, ctx, x, y);
          break;
        }
        case 'rounded_frame': {
          doc.roundedRect(x, y, el.width || 100, el.height || 100, el.radius ?? 18)
            .lineWidth(el.borderWidth || 1)
            .strokeColor(el.borderColor || '#cbd5e1')
            .stroke();
          break;
        }
        default:
          break;
      }
    }
  }

  doc.end();

  const buffer = await new Promise<Buffer>((resolve) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
  });

  const studentRec = (ctx.student || {}) as unknown as Record<string, string>;
  const studentName = `${studentRec.firstName || ''} ${studentRec.lastName || ''}`.trim();

  return {
    buffer,
    title: studentName ? `${template.name} — ${studentName}` : template.name,
    metadata: { format: template.format, orientation: template.orientation, elementCount: elements.length, documentNumber, verifyUrl },
  };
}

function renderDefaultDocument(
  doc: InstanceType<typeof import('pdfkit')>,
  template: DocumentTemplate,
  ctx: Record<string, unknown>,
  pageWidth: number,
  qrBuffer?: Buffer | null,
  documentNumber?: string,
  verifyUrl?: string
): void {
  const school = ctx.school as Record<string, string>;
  const student = ctx.student as Record<string, string>;

  doc.font('Helvetica-Bold').fontSize(14).fillColor('#111827')
    .text(school?.name || '', 40, 50, { width: pageWidth, align: 'center' });
  doc.font('Helvetica').fontSize(10).fillColor('#475569')
    .text([school?.address, school?.phone].filter(Boolean).join(' · '), 40, 72, { width: pageWidth, align: 'center' });

  doc.moveTo(40, 100).lineTo(40 + pageWidth, 100).lineWidth(1).strokeColor('#cbd5e1').stroke();

  doc.font('Helvetica-Bold').fontSize(18).fillColor('#0f172a')
    .text(template.name.toUpperCase(), 40, 120, { width: pageWidth, align: 'center' });

  doc.moveDown(2);

  if (student?.firstName || student?.lastName) {
    doc.font('Helvetica').fontSize(12).fillColor('#111827');
    doc.text(`Élève : ${student.firstName} ${student.lastName}`.trim(), 60, 200, { width: pageWidth - 40 });
    if (student.matricule) doc.text(`Matricule : ${student.matricule}`, 60, 220, { width: pageWidth - 40 });
    if (student.className) doc.text(`Classe : ${student.className}`, 60, 240, { width: pageWidth - 40 });
  }

  doc.moveDown(3);
  doc.font('Helvetica').fontSize(11).fillColor('#334155')
    .text(String(ctx.date || ''), 60, 300, { width: pageWidth - 40, align: 'right' });

  doc.moveDown(4);
  doc.text('Le Directeur / Directrice', 60, 380, { width: pageWidth - 40, align: 'right' });

  if (documentNumber) {
    doc.font('Helvetica').fontSize(9).fillColor('#475569')
      .text(`N° ${documentNumber}`, 60, 410, { width: pageWidth - 40, align: 'left' });
  }
  // QR bottom-right encoding the public verify URL
  if (qrBuffer && verifyUrl) {
    try {
      const qrSize = 90;
      const qrX = 40 + pageWidth - qrSize;
      const qrY = doc.page.height - 140;
      doc.image(qrBuffer, qrX, qrY, { width: qrSize, height: qrSize });
      doc.font('Helvetica').fontSize(7).fillColor('#64748b')
        .text('Vérifier', qrX, qrY + qrSize + 2, { width: qrSize, align: 'center' });
    } catch {
      // ignore QR embed failures
    }
  }
}

function renderTable(
  doc: InstanceType<typeof import('pdfkit')>,
  el: TemplateElement,
  ctx: Record<string, unknown>,
  x: number,
  y: number
): void {
  const rows = (el.rows || []).map((row) => row.map((cell) => resolveField(cell, ctx)));
  if (rows.length === 0) return;

  const colCount = Math.max(...rows.map((r) => r.length));
  const tableWidth = el.width || 400;
  const colWidth = tableWidth / colCount;
  const rowHeight = (el.height || 20) || 20;
  let currentY = y;

  rows.forEach((row, rowIndex) => {
    let currentX = x;
    const isHeader = rowIndex === 0;

    for (let c = 0; c < colCount; c++) {
      const cellText = row[c] || '';

      if (isHeader && el.backgroundColor !== undefined) {
        doc.rect(currentX, currentY, colWidth, rowHeight).fill(el.backgroundColor);
      } else if (isHeader) {
        doc.rect(currentX, currentY, colWidth, rowHeight).fill('#f1f5f9');
      }

      doc.rect(currentX, currentY, colWidth, rowHeight)
        .lineWidth(el.borderWidth || 0.5)
        .strokeColor(el.borderColor || '#cbd5e1').stroke();

      doc.font(isHeader ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(el.fontSize || 9)
        .fillColor(el.color || '#111827')
        .text(cellText, currentX + 4, currentY + 5, { width: colWidth - 8, align: el.align || 'left', ellipsis: true, lineBreak: false });

      currentX += colWidth;
    }
    currentY += rowHeight;
  });
}

interface CellStyle {
  bold: boolean;
  fontSize: number;
  color: string;
  align: 'left' | 'center' | 'right' | 'justify';
  borderWidth: number;
  borderColor: string;
  fill?: string;
}

function drawCellsRow(
  doc: InstanceType<typeof import('pdfkit')>,
  cells: string[],
  colWidths: number[],
  x: number,
  y: number,
  rowHeight: number,
  style: CellStyle
): void {
  let cx = x;
  for (let i = 0; i < colWidths.length; i++) {
    const w = colWidths[i];
    if (style.fill) doc.rect(cx, y, w, rowHeight).fill(style.fill);
    doc.rect(cx, y, w, rowHeight).lineWidth(style.borderWidth).strokeColor(style.borderColor).stroke();
    doc.font(style.bold ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(style.fontSize)
      .fillColor(style.color)
      .text(cells[i] || '', cx + 4, y + 5, { width: w - 8, align: style.align, ellipsis: true, lineBreak: false });
    cx += w;
  }
}

function drawSpanningRow(
  doc: InstanceType<typeof import('pdfkit')>,
  text: string,
  tableWidth: number,
  x: number,
  y: number,
  rowHeight: number,
  style: CellStyle
): void {
  if (style.fill) doc.rect(x, y, tableWidth, rowHeight).fill(style.fill);
  doc.rect(x, y, tableWidth, rowHeight).lineWidth(style.borderWidth).strokeColor(style.borderColor).stroke();
  doc.font(style.bold ? 'Helvetica-Bold' : 'Helvetica')
    .fontSize(style.fontSize)
    .fillColor(style.color)
    .text(text, x + 4, y + 5, { width: tableWidth - 8, align: style.align, ellipsis: true, lineBreak: false });
}

function baseCellStyle(el: TemplateElement): CellStyle {
  return {
    bold: false,
    fontSize: el.fontSize || 9,
    color: el.color || '#111827',
    align: el.align || 'left',
    borderWidth: el.borderWidth ?? 0.5,
    borderColor: el.borderColor || '#cbd5e1',
  };
}

/**
 * Renders the per-subject grades of the context:
 * header [Matière, Coef, Moy /20, Pondéré] + one row per subject
 * + TOTAL row + Moyenne générale + Rang rows.
 */
function renderGradesTable(
  doc: InstanceType<typeof import('pdfkit')>,
  el: TemplateElement,
  ctx: Record<string, unknown>,
  x: number,
  y: number
): void {
  const g = (ctx['grades'] || {}) as unknown as DocumentContext['grades'];
  const rows = g.rows || [];
  const style = baseCellStyle(el);
  const headerStyle: CellStyle = { ...style, bold: true, fill: el.backgroundColor || '#f1f5f9' };
  const tableWidth = el.width || 400;
  const rowHeight = 20;
  const headerHeight = 22;
  const colWidths = [tableWidth * 0.46, tableWidth * 0.14, tableWidth * 0.2, tableWidth * 0.2];

  let cy = y;
  drawCellsRow(doc, ['Matière', 'Coef', 'Moy /20', 'Pondéré'], colWidths, x, cy, headerHeight, headerStyle);
  cy += headerHeight;

  if (rows.length === 0) {
    drawSpanningRow(doc, 'Aucune note enregistrée pour cette période', tableWidth, x, cy, rowHeight, style);
    return;
  }

  for (const r of rows) {
    drawCellsRow(
      doc,
      [r.subject, String(r.coefficient), r.avg20 !== null ? r.avg20.toFixed(2) : '-', r.weighted !== null ? r.weighted.toFixed(2) : '-'],
      colWidths,
      x,
      cy,
      rowHeight,
      style
    );
    cy += rowHeight;
  }

  drawCellsRow(
    doc,
    ['TOTAL', String(g.totalCoef), '', Number(g.totalWeighted || 0).toFixed(2)],
    colWidths,
    x,
    cy,
    rowHeight,
    { ...style, bold: true }
  );
  cy += rowHeight;

  const avgLabel = `Moyenne générale : ${g.generalAvg !== null && g.generalAvg !== undefined ? Number(g.generalAvg).toFixed(2) + ' / 20' : '-'}`;
  drawSpanningRow(doc, avgLabel, tableWidth, x, cy, rowHeight, { ...style, bold: true });
  cy += rowHeight;

  const rankLabel = `Rang : ${g.rank !== null && g.rank !== undefined ? `${g.rank} / ${g.classSize}` : '-'}`;
  drawSpanningRow(doc, rankLabel, tableWidth, x, cy, rowHeight, { ...style, bold: true });
}

/**
 * Renders the fee statement of the context:
 * header [Type de frais, Montant, Payé, Solde, Échéance, Statut] + TOTAL row.
 */
function renderFeesTable(
  doc: InstanceType<typeof import('pdfkit')>,
  el: TemplateElement,
  ctx: Record<string, unknown>,
  x: number,
  y: number
): void {
  const f = (ctx['fees'] || {}) as unknown as DocumentContext['fees'];
  const rows = f.rows || [];
  const style = baseCellStyle(el);
  const headerStyle: CellStyle = { ...style, bold: true, fill: el.backgroundColor || '#f1f5f9' };
  const tableWidth = el.width || 400;
  const rowHeight = 20;
  const headerHeight = 22;
  const colWidths = [
    tableWidth * 0.24,
    tableWidth * 0.15,
    tableWidth * 0.15,
    tableWidth * 0.15,
    tableWidth * 0.16,
    tableWidth * 0.15,
  ];

  let cy = y;
  drawCellsRow(doc, ['Type de frais', 'Montant', 'Payé', 'Solde', 'Échéance', 'Statut'], colWidths, x, cy, headerHeight, headerStyle);
  cy += headerHeight;

  if (rows.length === 0) {
    drawSpanningRow(doc, 'Aucun frais enregistré', tableWidth, x, cy, rowHeight, style);
    return;
  }

  for (const r of rows) {
    drawCellsRow(
      doc,
      [r.type, formatMoney(r.amount), formatMoney(r.paid), formatMoney(r.balance), r.dueDate, r.status],
      colWidths,
      x,
      cy,
      rowHeight,
      style
    );
    cy += rowHeight;
  }

  drawCellsRow(
    doc,
    ['TOTAL', formatMoney(f.totalAmount || 0), formatMoney(f.totalPaid || 0), formatMoney(f.totalBalance || 0), '', ''],
    colWidths,
    x,
    cy,
    rowHeight,
    { ...style, bold: true }
  );
}

/** Null-safe score formatting for the RDC table: missing → '—', never undefined/NaN. */
function fmtRdcScore(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return String(Math.round(n * 100) / 100);
}

/**
 * Coefficient-weighted per-column aggregates over subject lines.
 * Column order: P1, P2, EX1, TotS1, P3, P4, EX2, TotS2, Annual.
 * Missing scores stay out (never 0); maxima count present scores only.
 */
function rdcColumnAggregates(
  subjects: RdcSubjectLine[],
  maxima: RdcMaxima
): { sums: Array<number | null>; maxes: number[] } {
  const getters: Array<(s: RdcSubjectLine) => number | null> = [
    (s) => s.P1, (s) => s.P2, (s) => s.EX1, (s) => s.totalS1,
    (s) => s.P3, (s) => s.P4, (s) => s.EX2, (s) => s.totalS2,
    (s) => s.annualTotal,
  ];
  const unitMax: number[] = [
    maxima.period, maxima.period, maxima.exam, 0,
    maxima.period, maxima.period, maxima.exam, 0, 0,
  ];
  const sums: Array<number | null> = [];
  const maxes: number[] = [];
  for (let i = 0; i < getters.length; i++) {
    let sum = 0;
    let max = 0;
    let has = false;
    for (const s of subjects) {
      const v = getters[i](s);
      if (v === null || v === undefined || !Number.isFinite(Number(v))) continue;
      const c = Number(s.coef || 1);
      has = true;
      sum = round2(sum + Number(v) * c);
      if (i === 3) max = round2(max + Number(s.maxS1 || 0) * c);
      else if (i === 7) max = round2(max + Number(s.maxS2 || 0) * c);
      else if (i === 8) max = round2(max + Number(s.annualMax || 0) * c);
      else max = round2(max + unitMax[i] * c);
    }
    sums.push(has ? round2(sum) : null);
    maxes.push(round2(max));
  }
  return { sums, maxes };
}

function fmtRdcPct(sum: number | null, max: number): string {
  if (sum === null || !(max > 0)) return '—';
  return `${(Math.round((sum / max) * 1000) / 10).toFixed(1)} %`;
}

/**
 * Renders the official RDC bulletin grid from ctx['bulletin'] (see buildRdcBulletinData):
 * unit MAXIMA row + two-line semester headers [Matière|P1|P2|EX|Tot S1|P3|P4|EX|Tot S2|Total|Appréciation]
 * (+ optional REPÊCHAGE columns % / Sign. Prof) + one domain section each
 * (uppercase shaded header, subject rows, Sous-total row, MAXIMA row)
 * + MAXIMA GENERAUX / TOTAUX / POURCENTAGE (per column) / PLACE-NBRE (annual only)
 * / APPLICATION (semester appreciations) / CONDUITE / SIGNATURE (empty cells).
 * Missing scores render as '—'. Null-safe when no bulletin data is present.
 */
function renderRdcGradesTable(
  doc: InstanceType<typeof import('pdfkit')>,
  el: TemplateElement,
  ctx: Record<string, unknown>,
  x: number,
  y: number
): void {
  const bulletin = ctx['bulletin'] as RdcBulletinData | undefined;
  const style = baseCellStyle(el);
  const headerStyle: CellStyle = { ...style, bold: true, fill: el.backgroundColor || '#f1f5f9', align: 'center' };
  const domainStyle: CellStyle = { ...style, bold: true, fill: '#e2e8f0', align: 'left' };
  const subtotalStyle: CellStyle = { ...style, bold: true, fill: '#f8fafc', align: 'center' };
  const tableWidth = el.width || 515;
  const rowHeight = 18;
  const headerHeight = 20;
  // REPÊCHAGE columns are structure-only: no data model exists for catch-up
  // scores, so every cell stays empty for hand-written % + teacher signature.
  // Opt-in per template element via `repechage: true` to keep A4 widths sensible.
  const withRep = el.repechage === true;
  const baseWidths = [
    tableWidth * 0.2,
    tableWidth * 0.065,
    tableWidth * 0.065,
    tableWidth * 0.065,
    tableWidth * 0.065,
    tableWidth * 0.065,
    tableWidth * 0.065,
    tableWidth * 0.065,
    tableWidth * 0.065,
    tableWidth * 0.08,
    tableWidth * 0.2,
  ];
  const scale = withRep ? 0.85 : 1;
  const colWidths = [...baseWidths.map((w) => w * scale)];
  if (withRep) colWidths.push(tableWidth * 0.05, tableWidth * 0.1);
  const repCells: string[] = withRep ? ['', ''] : [];
  const repHeader: string[] = withRep ? ['%', 'Sign. Prof'] : [];

  const maxima = bulletin?.maxima || { period: 20, exam: 20 };
  const mp = fmtRdcScore(maxima.period);
  const me = fmtRdcScore(maxima.exam);

  let cy = y;
  drawCellsRow(doc, ['MAXIMA', mp, mp, me, '', mp, mp, me, '', '', '', ...repHeader.map(() => '')], colWidths, x, cy, headerHeight, headerStyle);
  cy += headerHeight;

  // Two-line semester headers are renderer-side: super-header spans, then labels.
  {
    const spans: Array<{ text: string; span: number }> = withRep
      ? [
          { text: '', span: 1 }, { text: '1er SEMESTRE', span: 4 }, { text: '2e SEMESTRE', span: 4 },
          { text: 'TOTAL ANNUEL', span: 1 }, { text: '', span: 1 }, { text: 'REPÊCHAGE', span: 2 },
        ]
      : [
          { text: '', span: 1 }, { text: '1er SEMESTRE', span: 4 }, { text: '2e SEMESTRE', span: 4 },
          { text: 'TOTAL ANNUEL', span: 1 }, { text: '', span: 1 },
        ];
    let cx = x;
    let ci = 0;
    for (const sp of spans) {
      let w = 0;
      for (let k = 0; k < sp.span; k++) w += colWidths[ci + k] || 0;
      if (headerStyle.fill) doc.rect(cx, cy, w, headerHeight).fill(headerStyle.fill);
      doc.rect(cx, cy, w, headerHeight).lineWidth(headerStyle.borderWidth).strokeColor(headerStyle.borderColor).stroke();
      doc.font('Helvetica-Bold').fontSize(headerStyle.fontSize).fillColor(headerStyle.color)
        .text(sp.text, cx + 4, cy + 5, { width: w - 8, align: 'center', ellipsis: true, lineBreak: false });
      cx += w;
      ci += sp.span;
    }
    cy += headerHeight;
  }
  drawCellsRow(
    doc,
    ['Matière', 'P1', 'P2', 'EX', 'Tot S1', 'P3', 'P4', 'EX', 'Tot S2', 'Total', 'Appréciation', ...repHeader],
    colWidths, x, cy, headerHeight, headerStyle
  );
  cy += headerHeight;

  const subjects = bulletin?.subjects || [];
  if (subjects.length === 0) {
    drawSpanningRow(doc, 'Aucune note publiée pour cette année scolaire', tableWidth, x, cy, rowHeight, style);
    return;
  }
  const groups = (bulletin?.domains && bulletin.domains.length > 0)
    ? bulletin.domains
    : [{ name: '', subjects, subtotal: bulletin?.totals, maxima: null as unknown as RdcBulletinData['domains'][number]['maxima'] }];

  const subjectCells = (s: RdcSubjectLine): string[] => [
    String(s.name || ''),
    fmtRdcScore(s.P1),
    fmtRdcScore(s.P2),
    fmtRdcScore(s.EX1),
    fmtRdcScore(s.totalS1),
    fmtRdcScore(s.P3),
    fmtRdcScore(s.P4),
    fmtRdcScore(s.EX2),
    fmtRdcScore(s.totalS2),
    fmtRdcScore(s.annualTotal),
    String(s.appreciation || ''),
    ...repCells,
  ];

  for (const g of groups) {
    if (g.name) {
      drawSpanningRow(doc, String(g.name).toUpperCase(), tableWidth, x, cy, rowHeight, domainStyle);
      cy += rowHeight;
    }
    for (const s of g.subjects) {
      drawCellsRow(doc, subjectCells(s), colWidths, x, cy, rowHeight, { ...style, align: 'center' });
      cy += rowHeight;
    }
    // Sous-total + MAXIMA per domain group (coefficient-weighted, null-safe).
    const agg = rdcColumnAggregates(g.subjects, maxima);
    drawCellsRow(
      doc,
      [
        g.name ? `Sous-total — ${g.name}` : 'Sous-total',
        fmtRdcScore(agg.sums[0]), fmtRdcScore(agg.sums[1]), fmtRdcScore(agg.sums[2]),
        fmtRdcScore(g.subtotal?.totalS1 ?? agg.sums[3]),
        fmtRdcScore(agg.sums[4]), fmtRdcScore(agg.sums[5]), fmtRdcScore(agg.sums[6]),
        fmtRdcScore(g.subtotal?.totalS2 ?? agg.sums[7]),
        fmtRdcScore(g.subtotal?.annualTotal ?? agg.sums[8]),
        '',
        ...repCells,
      ],
      colWidths, x, cy, rowHeight, subtotalStyle
    );
    cy += rowHeight;
    const gm = g.maxima;
    drawCellsRow(
      doc,
      [
        'MAXIMA',
        fmtRdcScore(gm?.maxP1 ?? agg.maxes[0]), fmtRdcScore(gm?.maxP2 ?? agg.maxes[1]),
        fmtRdcScore(gm?.maxEX1 ?? agg.maxes[2]), fmtRdcScore(gm?.maxS1 ?? agg.maxes[3]),
        fmtRdcScore(gm?.maxP3 ?? agg.maxes[4]), fmtRdcScore(gm?.maxP4 ?? agg.maxes[5]),
        fmtRdcScore(gm?.maxEX2 ?? agg.maxes[6]), fmtRdcScore(gm?.maxS2 ?? agg.maxes[7]),
        fmtRdcScore(gm?.maxAnnual ?? agg.maxes[8]),
        '',
        ...repCells,
      ],
      colWidths, x, cy, rowHeight, subtotalStyle
    );
    cy += rowHeight;
  }

  // General footer rows, per column where computable, else '—'.
  const totals = bulletin?.totals;
  const all = rdcColumnAggregates(subjects, maxima);
  const overallAvg20 =
    bulletin?.percentage !== null && bulletin?.percentage !== undefined && Number.isFinite(Number(bulletin.percentage))
      ? round2((Number(bulletin.percentage) / 100) * 20)
      : null;
  const overallApp = appreciationForAvg(overallAvg20, Number(bulletin?.passMark ?? 10));
  const dash9 = ['—', '—', '—', '—', '—', '—', '—', '—', '—'];
  drawCellsRow(
    doc,
    ['MAXIMA GENERAUX', ...all.maxes.map((m) => fmtRdcScore(m)), '', ...repCells],
    colWidths, x, cy, rowHeight, { ...style, bold: true, align: 'center' }
  );
  cy += rowHeight;
  drawCellsRow(
    doc,
    [
      'TOTAUX',
      fmtRdcScore(all.sums[0]), fmtRdcScore(all.sums[1]), fmtRdcScore(all.sums[2]),
      fmtRdcScore(totals?.totalS1), fmtRdcScore(all.sums[4]), fmtRdcScore(all.sums[5]),
      fmtRdcScore(all.sums[6]), fmtRdcScore(totals?.totalS2), fmtRdcScore(totals?.annualTotal),
      '', ...repCells,
    ],
    colWidths, x, cy, rowHeight, { ...style, bold: true, align: 'center' }
  );
  cy += rowHeight;
  const pctCells = all.sums.map((s, i) => fmtRdcPct(s, all.maxes[i]));
  drawCellsRow(
    doc,
    ['POURCENTAGE', ...pctCells, '', ...repCells],
    colWidths, x, cy, rowHeight, { ...style, bold: true, align: 'center' }
  );
  cy += rowHeight;
  const rank = bulletin?.rank;
  const classSize = bulletin?.classSize || 0;
  const placeAnnual = rank === null || rank === undefined ? '—' : `${rank} / ${classSize}`;
  drawCellsRow(
    doc,
    ['PLACE / NBRE', ...dash9.slice(0, 8), placeAnnual, '', ...repCells],
    colWidths, x, cy, rowHeight, { ...style, bold: true, align: 'center' }
  );
  cy += rowHeight;
  const appCells = [...dash9.slice(0, 8)];
  appCells[3] = String(bulletin?.appS1 || '—');
  appCells[7] = String(bulletin?.appS2 || '—');
  appCells[8] = overallApp || '—';
  drawCellsRow(
    doc,
    ['APPLICATION', ...appCells, '', ...repCells],
    colWidths, x, cy, rowHeight, { ...style, bold: true, align: 'center' }
  );
  cy += rowHeight;
  drawSpanningRow(
    doc,
    `CONDUITE : ${String(bulletin?.conduct || '—')}`,
    tableWidth, x, cy, rowHeight, { ...style, bold: true }
  );
  cy += rowHeight;
  // Empty cells for the hand signature.
  drawCellsRow(
    doc,
    ['SIGNATURE', '', '', '', '', '', '', '', '', '', '', ...repCells],
    colWidths, x, cy, 30, { ...style, align: 'center' }
  );
}

/**
 * Renders one box per character of the resolved field
 * (default `student.matricule`). Null-safe: renders nothing when empty.
 */
function renderIdBoxes(
  doc: InstanceType<typeof import('pdfkit')>,
  el: TemplateElement,
  ctx: Record<string, unknown>,
  x: number,
  y: number
): void {
  const value = String(resolveField(`{{${el.field || 'student.matricule'}}}`, ctx) || '');
  if (!value) return;
  const box = el.boxSize && el.boxSize > 0 ? el.boxSize : 18;
  const fontSize = Math.max(7, Math.min(14, box - 6));
  let cx = x;
  for (const ch of value.split('')) {
    doc.rect(cx, y, box, box)
      .lineWidth(el.borderWidth ?? 0.5)
      .strokeColor(el.borderColor || '#0f172a')
      .stroke();
    doc.font('Helvetica-Bold')
      .fontSize(fontSize)
      .fillColor(el.color || '#111827')
      .text(ch, cx, y + (box - fontSize) / 2 - 1, { width: box, align: 'center', lineBreak: false });
    cx += box + 2;
  }
}

/**
 * Renders a QR code. Content = resolved verifyUrl when present,
 * otherwise the resolved element content. Null-safe: renders nothing when empty.
 */
async function renderQrCodeElement(
  doc: InstanceType<typeof import('pdfkit')>,
  el: TemplateElement,
  ctx: Record<string, unknown>,
  x: number,
  y: number
): Promise<void> {
  const raw = el.content || el.text || '';
  const resolved = resolveField(raw, ctx);
  const payload = String(ctx['verifyUrl'] || resolved || '');
  if (!payload) return;
  try {
    const buf = await QRCode.toBuffer(payload, { width: 160, margin: 1 });
    doc.image(buf, x, y, { width: el.width || 90, height: el.height || 90 });
  } catch {
    // ignore QR embed failures
  }
}

interface ReferenceTemplateDef {
  name: string;
  description: string;
  category: string;
  schema: TemplateSchema;
  scope?: { cycles?: string[]; levels?: string[]; sections?: string[]; options?: string[] };
}

function txt(
  id: string,
  content: string,
  x: number,
  y: number,
  width: number,
  extra: Partial<TemplateElement> = {}
): TemplateElement {
  return { id, type: 'text', x, y, width, height: 20, content, ...extra };
}

/**
 * The 4 reference Congolese school layouts (A4 portrait, MARGIN=40).
 */
function buildReferenceTemplateDefs(): ReferenceTemplateDef[] {
  return [
    {
      name: 'Billet de Vacances Classique',
      description: 'Billet de vacances officiel RDC avec cadre arrondi',
      category: 'billet_vacances',
      schema: {
        elements: [
          { id: 'bv-frame', type: 'rounded_frame', x: 5, y: 5, width: 505, height: 752, borderWidth: 2, borderColor: '#0f172a', radius: 18 },
          txt('bv-rep', 'République Démocratique du Congo', 30, 30, 455, { fontSize: 13, bold: true, align: 'center', color: '#0f172a' }),
          txt('bv-min', "Ministère de l'Éducation Nationale", 30, 50, 455, { fontSize: 11, align: 'center' }),
          { id: 'bv-div', type: 'divider', x: 70, y: 72, width: 375, height: 1, borderWidth: 1, borderColor: '#94a3b8' },
          txt('bv-school', '{{school.name}}', 30, 82, 455, { fontSize: 14, bold: true, align: 'center' }),
          txt('bv-contact', '{{school.address}} · {{school.phone}}', 30, 104, 455, { fontSize: 9, align: 'center', color: '#475569' }),
          txt('bv-title', 'BILLET DE VACANCES', 30, 140, 455, { fontSize: 22, bold: true, align: 'center', color: '#0f172a' }),
          txt('bv-year', 'Année scolaire : {{school.year}}', 30, 170, 455, { fontSize: 11, align: 'center' }),
          txt('bv-body', "Il est accordé à l'élève {{student.firstName}} {{student.lastName}}, de la classe de {{student.className}} (matricule : {{student.matricule}}), le présent billet de vacances pour l'année scolaire {{school.year}}.", 45, 210, 425, { fontSize: 11, align: 'justify' }),
          txt('bv-body2', 'En foi de quoi, ce billet lui est délivré pour servir et valoir ce que de droit.', 45, 285, 425, { fontSize: 11, align: 'justify' }),
          { id: 'bv-date', type: 'date', x: 45, y: 400, width: 425, height: 16, fontSize: 10, align: 'right' },
          txt('bv-sign1', 'Le Directeur', 300, 460, 170, { fontSize: 11, align: 'center' }),
          txt('bv-sign2', '{{school.director}}', 300, 478, 170, { fontSize: 12, bold: true, align: 'center' }),
        ],
      },
    },
    {
      name: 'Avis aux Parents — Frais Scolaires',
      description: 'Avis aux parents avec relevé des frais scolaires',
      category: 'avis_parents',
      schema: {
        elements: [
          txt('ap-school', '{{school.name}}', 0, 20, 515, { fontSize: 15, bold: true, align: 'center' }),
          txt('ap-contact', '{{school.address}} · Tél : {{school.phone}}', 0, 42, 515, { fontSize: 9, align: 'center', color: '#475569' }),
          { id: 'ap-div', type: 'divider', x: 0, y: 62, width: 515, height: 1, borderWidth: 1, borderColor: '#94a3b8' },
          txt('ap-title', 'AVIS AUX PARENTS — FRAIS SCOLAIRES', 0, 80, 515, { fontSize: 16, bold: true, align: 'center', color: '#0f172a' }),
          txt('ap-intro', "Chers parents de l'élève {{student.firstName}} {{student.lastName}} (classe de {{student.className}}), nous vous prions de bien vouloir prendre connaissance de la situation des frais scolaires pour l'année {{school.year}} :", 0, 115, 515, { fontSize: 11, align: 'justify' }),
          { id: 'ap-fees', type: 'fees_table', x: 0, y: 185, width: 515, height: 20, fontSize: 9, borderWidth: 0.5, borderColor: '#cbd5e1', align: 'left' },
          txt('ap-rentree', 'La Direction rappelle que tout solde impayé devra être régularisé avant la rentrée. Merci de votre collaboration.', 0, 430, 515, { fontSize: 11, align: 'justify' }),
          { id: 'ap-date', type: 'date', x: 0, y: 490, width: 515, height: 16, fontSize: 10, align: 'right' },
          txt('ap-sign1', 'La Direction', 315, 515, 200, { fontSize: 11, align: 'center' }),
          txt('ap-sign2', '{{school.director}}', 315, 533, 200, { fontSize: 12, bold: true, align: 'center' }),
        ],
      },
    },
    {
      name: 'Bulletin Officiel (RDC)',
      description: 'Bulletin officiel congolais avec notes, assiduité et appréciation',
      category: 'bulletin',
      schema: {
        elements: [
          txt('bo-rep', 'République Démocratique du Congo', 0, 20, 515, { fontSize: 12, bold: true, align: 'center' }),
          txt('bo-min', "Ministère de l'Éducation Nationale", 0, 38, 515, { fontSize: 10, align: 'center' }),
          { id: 'bo-div', type: 'divider', x: 60, y: 58, width: 395, height: 1, borderWidth: 1, borderColor: '#94a3b8' },
          txt('bo-school', '{{school.name}}', 0, 66, 515, { fontSize: 13, bold: true, align: 'center' }),
          txt('bo-contact', '{{school.address}} · Tél : {{school.phone}}', 0, 86, 515, { fontSize: 9, align: 'center', color: '#475569' }),
          txt('bo-title', 'BULLETIN OFFICIEL — Année scolaire {{school.year}}', 0, 112, 515, { fontSize: 15, bold: true, align: 'center', color: '#0f172a' }),
          txt('bo-nom', 'Nom : {{student.lastName}} {{student.firstName}}', 0, 145, 515, { fontSize: 11 }),
          txt('bo-mat', 'Matricule : {{student.matricule}}', 0, 163, 515, { fontSize: 11 }),
          txt('bo-cls', 'Classe : {{student.className}}', 0, 181, 515, { fontSize: 11 }),
          txt('bo-dob', 'Date de naissance : {{student.dateOfBirth}}', 0, 199, 515, { fontSize: 11 }),
          { id: 'bo-grades', type: 'grades_table', x: 0, y: 222, width: 515, height: 20, fontSize: 9, borderWidth: 0.5, borderColor: '#cbd5e1', align: 'left' },
          txt('bo-att', 'Absences : {{absences}} (dont {{absencesJustified}} justifiée(s)) — Retards : {{lates}}', 0, 500, 515, { fontSize: 11 }),
          txt('bo-app', 'Appréciation : {{appreciation}} — Moyenne générale : {{generalAvg}} / 20 — Rang : {{rank}}', 0, 520, 515, { fontSize: 11, bold: true }),
          { id: 'bo-date', type: 'date', x: 0, y: 555, width: 515, height: 16, fontSize: 10, align: 'right' },
          txt('bo-sign1', 'Le Directeur', 315, 585, 200, { fontSize: 11, align: 'center' }),
          txt('bo-sign2', '{{school.director}}', 315, 603, 200, { fontSize: 12, bold: true, align: 'center' }),
        ],
      },
    },
    {
      name: 'Bulletin Semestriel',
      description: 'Bulletin de notes semestriel avec période dynamique',
      category: 'bulletin',
      schema: {
        elements: [
          txt('bs-school', '{{school.name}}', 0, 20, 515, { fontSize: 15, bold: true, align: 'center' }),
          txt('bs-contact', '{{school.address}} · Tél : {{school.phone}} · {{school.email}}', 0, 42, 515, { fontSize: 9, align: 'center', color: '#475569' }),
          { id: 'bs-div', type: 'divider', x: 0, y: 62, width: 515, height: 1, borderWidth: 1, borderColor: '#94a3b8' },
          txt('bs-title', 'BULLETIN DE NOTES', 0, 85, 515, { fontSize: 18, bold: true, align: 'center', color: '#0f172a' }),
          txt('bs-period', '{{period}} — Année scolaire {{school.year}}', 0, 110, 515, { fontSize: 11, align: 'center' }),
          txt('bs-nom', 'Nom : {{student.lastName}} {{student.firstName}}', 0, 140, 515, { fontSize: 11 }),
          txt('bs-cls', 'Classe : {{student.className}}', 0, 158, 515, { fontSize: 11 }),
          txt('bs-mat', 'Matricule : {{student.matricule}}', 0, 176, 515, { fontSize: 11 }),
          { id: 'bs-grades', type: 'grades_table', x: 0, y: 200, width: 515, height: 20, fontSize: 9, borderWidth: 0.5, borderColor: '#cbd5e1', align: 'left' },
          { id: 'bs-date', type: 'date', x: 0, y: 500, width: 515, height: 16, fontSize: 10, align: 'right' },
          txt('bs-sign1', 'Le Titulaire', 0, 540, 250, { fontSize: 11, align: 'center' }),
          txt('bs-sign2', 'La Direction — {{school.director}}', 265, 540, 250, { fontSize: 11, align: 'center' }),
        ],
      },
    },
  ];
}

/**
 * The 3 ACTIF RDC bulletin layouts (A4 portrait, MARGIN=40 → x:0/width:515 = full width).
 * They consume the RDC context keys: school.province/city/territory/code/emblem,
 * student.fullName/birthPlace/birthDate/className/permanentNumber, academicYear,
 * report.title, percentage, decision, observation, conduct + grades_table_rdc,
 * id_boxes and qr_code elements.
 */
function buildRdcBulletinTemplateDefs(): ReferenceTemplateDef[] {
  const header = (p: string): TemplateElement[] => [
    txt(`${p}-rep`, 'RÉPUBLIQUE DÉMOCRATIQUE DU CONGO', 0, 20, 515, { fontSize: 12, bold: true, align: 'center' }),
    txt(`${p}-min`, "Ministère de l'Enseignement Primaire, Secondaire et Technique", 0, 38, 515, { fontSize: 10, align: 'center' }),
    { id: `${p}-div`, type: 'divider', x: 60, y: 56, width: 395, height: 1, borderWidth: 1, borderColor: '#94a3b8' },
    txt(`${p}-prov`, 'Province : {{school.province}} · Ville : {{school.city}} · Territoire : {{school.territory}}', 0, 62, 515, { fontSize: 9, align: 'center', color: '#475569' }),
    txt(`${p}-school`, '{{school.name}} — Code : {{school.code}}', 0, 78, 515, { fontSize: 13, bold: true, align: 'center' }),
    txt(`${p}-title`, '{{report.title}}', 0, 102, 515, { fontSize: 16, bold: true, align: 'center', color: '#0f172a' }),
    txt(`${p}-year`, 'Année scolaire : {{academicYear}}', 0, 124, 515, { fontSize: 11, align: 'center' }),
    txt(`${p}-id1`, 'Nom : {{student.fullName}} — Né(e) le {{student.birthDate}} à {{student.birthPlace}}', 0, 146, 515, { fontSize: 10 }),
    txt(`${p}-id2`, 'N° permanent : {{student.permanentNumber}} · Classe : {{student.className}}', 0, 162, 515, { fontSize: 10 }),
    { id: `${p}-boxes`, type: 'id_boxes', x: 0, y: 182, width: 300, height: 20, field: 'student.permanentNumber', boxSize: 16, borderWidth: 0.5, borderColor: '#0f172a' },
  ];
  const footer = (p: string): TemplateElement[] => [
    txt(`${p}-repz`, "Zone de repêchage : l'élève repêché(e) reprend les évaluations des périodes non validées avant la délibération finale.", 0, 450, 515, { fontSize: 10, align: 'justify' }),
    txt(`${p}-synth`, 'Pourcentage : {{percentage}} % · Conduite : {{conduct}}', 0, 472, 515, { fontSize: 11, bold: true }),
    txt(`${p}-dec`, 'Décision du jury : {{decision}} — Observation : {{observation}}', 0, 488, 515, { fontSize: 11 }),
    txt(`${p}-decz`, 'Décision : Passe / Double / A échoué — (barrer la mention inutile)', 0, 504, 515, { fontSize: 10, bold: true }),
    txt(`${p}-fait`, 'Fait à {{school.city}}, le {{date}}', 0, 520, 515, { fontSize: 10, align: 'right' }),
    txt(`${p}-sig-el`, "Signature de l'élève", 0, 546, 170, { fontSize: 10, align: 'center' }),
    txt(`${p}-sceau`, "Sceau de l'école", 172, 546, 171, { fontSize: 10, align: 'center' }),
    txt(`${p}-sig-chef`, "Le Chef d'Établissement", 345, 546, 170, { fontSize: 10, align: 'center' }),
    txt(`${p}-dir`, '{{school.director}}', 345, 564, 170, { fontSize: 11, bold: true, align: 'center' }),
    txt(`${p}-note`, "NOTE IMPORTANTE : Le bulletin est sans valeur s'il est raturé ou surchargé.", 0, 596, 340, { fontSize: 9, bold: true }),
    { id: `${p}-qr`, type: 'qr_code', x: 430, y: 590, width: 85, height: 75, content: '{{verifyUrl}}' },
  ];
  const table = (p: string): TemplateElement => (
    { id: `${p}-grades`, type: 'grades_table_rdc', x: 0, y: 222, width: 515, height: 18, fontSize: 8, borderWidth: 0.5, borderColor: '#0f172a', align: 'center', repechage: true }
  );

  return [
    {
      name: 'Bulletin Éducation de Base (RDC)',
      description: 'Bulletin RDC éducation de base : domaines, maxima, repêchage, décision, QR',
      category: 'bulletin',
      scope: {
        cycles: ['Primaire', 'CTEB'],
        levels: ['1ère primaire', '2ème primaire', '3ème primaire', '4ème primaire', '5ème primaire', '6ème primaire', '7e', '8e'],
        sections: [],
        options: [],
      },
      schema: {
        elements: [
          ...header('eb'),
          txt('eb-dom', "DOMAINES : Langues · Mathématiques · Éveil scientifique · Éducation à la vie", 0, 202, 515, { fontSize: 9, align: 'center', color: '#475569' }),
          table('eb'),
          ...footer('eb'),
        ],
      },
    },
    {
      name: 'Bulletin Secondaire — Construction (RDC)',
      description: 'Bulletin RDC secondaire filière construction avec note d’atelier',
      category: 'bulletin',
      scope: {
        cycles: [],
        levels: [],
        sections: ['Construction'],
        options: ['Construction'],
      },
      schema: {
        elements: [
          ...header('co'),
          txt('co-fil', 'FILIÈRE : CONSTRUCTION — Maçonnerie · Menuiserie · Électricité bâtiment', 0, 202, 515, { fontSize: 9, align: 'center', color: '#475569' }),
          table('co'),
          txt('co-atel', "Note d'atelier intégrée aux périodes P2 et P4. Maxima et totaux calculés par semestre.", 0, 432, 515, { fontSize: 10, align: 'justify' }),
          ...footer('co'),
        ],
      },
    },
    {
      name: 'Bulletin Pédagogie Générale (RDC)',
      description: 'Bulletin RDC pédagogie générale avec stage pratique',
      category: 'bulletin',
      scope: {
        cycles: [],
        levels: [],
        sections: ['Pédagogique'],
        options: ['Pédagogie Générale'],
      },
      schema: {
        elements: [
          ...header('pg'),
          txt('pg-opt', 'OPTION : PÉDAGOGIE GÉNÉRALE — Formation des futurs enseignants du primaire', 0, 202, 515, { fontSize: 9, align: 'center', color: '#475569' }),
          table('pg'),
          txt('pg-stage', "Stage pratique pris en compte dans l'appréciation et la conduite professionnelle.", 0, 432, 515, { fontSize: 10, align: 'justify' }),
          ...footer('pg'),
        ],
      },
    },
  ];
}

export default router;
