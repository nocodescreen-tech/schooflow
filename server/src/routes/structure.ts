import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { Model, ModelStatic } from 'sequelize';
import { authenticateToken } from '../middleware/auth.js';
import { requireRole, requirePermission } from '../middleware/rbac.js';
import { Cycle, Filiere, Section, Option, Niveau, Class } from '../models/index.js';
import { logAudit } from '../middleware/auditLog.js';

const router = Router();
router.use(authenticateToken);

const STAFF_READ = ['super_admin', 'admin', 'director', 'teacher', 'accountant', 'receptionist'] as const;
const ADMIN_WRITE = ['super_admin', 'admin', 'director'] as const;

async function duplicateName(model: ModelStatic<Model>, schoolId: string, name: string, excludeId?: string): Promise<boolean> {
  const where: Record<string, unknown> = { schoolId, name };
  const existing = await model.findOne({ where }) as unknown as { id: string } | null;
  if (!existing) return false;
  if (excludeId && existing.id === excludeId) return false;
  return true;
}

// ============================
// CYCLES
// ============================

router.get('/cycles',
  requireRole(...STAFF_READ),
  requirePermission('classes', 'view'),
  async (req: Request, res: Response) => {
    try {
      const schoolId = req.user!.schoolId!;
      const cycles = await Cycle.findAll({ where: { schoolId }, order: [['order', 'ASC'], ['name', 'ASC']] });
      const items = await Promise.all(cycles.map(async (c) => {
        const [filieresCount, niveauxCount, classesCount] = await Promise.all([
          Filiere.count({ where: { schoolId, cycleId: c.id } }),
          Niveau.count({ where: { schoolId, cycleId: c.id } }),
          Class.count({ where: { schoolId, cycleId: c.id } }),
        ]);
        return { ...c.toJSON(), filieresCount, niveauxCount, classesCount };
      }));
      return res.json({ success: true, data: { items, total: items.length } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

router.post('/cycles',
  requireRole(...ADMIN_WRITE),
  requirePermission('classes', 'create'),
  body('name').trim().notEmpty().withMessage('Le nom du cycle est requis'),
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ success: false, error: errors.array()[0].msg });
      const schoolId = req.user!.schoolId!;
      const { name, code, order } = req.body;
      if (await duplicateName(Cycle, schoolId, name)) {
        return res.status(400).json({ success: false, error: 'Un cycle avec ce nom existe déjà' });
      }
      const cycle = await Cycle.create({ schoolId, name, code, order: order ?? 0 });
      await logAudit(req, { action: 'create', entity: 'cycle', entityId: cycle.id, details: { name } });
      return res.status(201).json({ success: true, data: { cycle } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

router.patch('/cycles/:id',
  requireRole(...ADMIN_WRITE),
  requirePermission('classes', 'update'),
  async (req: Request, res: Response) => {
    try {
      const schoolId = req.user!.schoolId!;
      const cycle = await Cycle.findOne({ where: { id: req.params.id, schoolId } });
      if (!cycle) return res.status(404).json({ success: false, error: 'Cycle introuvable' });
      const allowed = ['name', 'code', 'order'];
      const updates: Record<string, unknown> = {};
      for (const f of allowed) if (req.body[f] !== undefined) updates[f] = req.body[f];
      if (typeof updates['name'] === 'string' && updates['name'] !== cycle.name) {
        if (await duplicateName(Cycle, schoolId, updates['name'] as string, cycle.id)) {
          return res.status(400).json({ success: false, error: 'Un cycle avec ce nom existe déjà' });
        }
      }
      await cycle.update(updates);
      await logAudit(req, { action: 'update', entity: 'cycle', entityId: cycle.id, details: updates });
      return res.json({ success: true, data: { cycle } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

router.delete('/cycles/:id',
  requireRole(...ADMIN_WRITE),
  requirePermission('classes', 'delete'),
  async (req: Request, res: Response) => {
    try {
      const schoolId = req.user!.schoolId!;
      const cycle = await Cycle.findOne({ where: { id: req.params.id, schoolId } });
      if (!cycle) return res.status(404).json({ success: false, error: 'Cycle introuvable' });
      const [f, n, c] = await Promise.all([
        Filiere.count({ where: { schoolId, cycleId: cycle.id } }),
        Niveau.count({ where: { schoolId, cycleId: cycle.id } }),
        Class.count({ where: { schoolId, cycleId: cycle.id } }),
      ]);
      if (f + n + c > 0) {
        return res.status(400).json({ success: false, error: 'Ce cycle est encore utilisé (filières, niveaux ou classes)' });
      }
      await cycle.destroy();
      await logAudit(req, { action: 'delete', entity: 'cycle', entityId: req.params.id });
      return res.json({ success: true, data: { message: 'Cycle supprimé' } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

// ============================
// FILIERES
// ============================

router.get('/filieres',
  requireRole(...STAFF_READ),
  requirePermission('classes', 'view'),
  async (req: Request, res: Response) => {
    try {
      const schoolId = req.user!.schoolId!;
      const where: Record<string, unknown> = { schoolId };
      if (req.query.cycleId) where['cycleId'] = req.query.cycleId;
      const filieres = await Filiere.findAll({
        where,
        include: [{ model: Cycle, as: 'cycle', attributes: ['id', 'name', 'code'] }],
        order: [['name', 'ASC']],
      });
      const items = await Promise.all(filieres.map(async (f) => {
        const [sectionsCount, classesCount] = await Promise.all([
          Section.count({ where: { schoolId, filiereId: f.id } }),
          Class.count({ where: { schoolId, filiereId: f.id } }),
        ]);
        return { ...f.toJSON(), sectionsCount, classesCount };
      }));
      return res.json({ success: true, data: { items, total: items.length } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

router.post('/filieres',
  requireRole(...ADMIN_WRITE),
  requirePermission('classes', 'create'),
  body('name').trim().notEmpty().withMessage('Le nom de la filière est requis'),
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ success: false, error: errors.array()[0].msg });
      const schoolId = req.user!.schoolId!;
      const { name, code, cycleId } = req.body;
      if (await duplicateName(Filiere, schoolId, name)) {
        return res.status(400).json({ success: false, error: 'Une filière avec ce nom existe déjà' });
      }
      if (cycleId) {
        const cycle = await Cycle.findOne({ where: { id: cycleId, schoolId } });
        if (!cycle) return res.status(400).json({ success: false, error: 'Cycle introuvable' });
      }
      const filiere = await Filiere.create({ schoolId, name, code, cycleId: cycleId || null });
      await logAudit(req, { action: 'create', entity: 'filiere', entityId: filiere.id, details: { name } });
      return res.status(201).json({ success: true, data: { filiere } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

router.patch('/filieres/:id',
  requireRole(...ADMIN_WRITE),
  requirePermission('classes', 'update'),
  async (req: Request, res: Response) => {
    try {
      const schoolId = req.user!.schoolId!;
      const filiere = await Filiere.findOne({ where: { id: req.params.id, schoolId } });
      if (!filiere) return res.status(404).json({ success: false, error: 'Filière introuvable' });
      const allowed = ['name', 'code', 'cycleId'];
      const updates: Record<string, unknown> = {};
      for (const f of allowed) if (req.body[f] !== undefined) updates[f] = req.body[f];
      if (typeof updates['name'] === 'string' && updates['name'] !== filiere.name) {
        if (await duplicateName(Filiere, schoolId, updates['name'] as string, filiere.id)) {
          return res.status(400).json({ success: false, error: 'Une filière avec ce nom existe déjà' });
        }
      }
      if (updates['cycleId']) {
        const cycle = await Cycle.findOne({ where: { id: updates['cycleId'] as string, schoolId } });
        if (!cycle) return res.status(400).json({ success: false, error: 'Cycle introuvable' });
      }
      await filiere.update(updates);
      await logAudit(req, { action: 'update', entity: 'filiere', entityId: filiere.id, details: updates });
      return res.json({ success: true, data: { filiere } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

router.delete('/filieres/:id',
  requireRole(...ADMIN_WRITE),
  requirePermission('classes', 'delete'),
  async (req: Request, res: Response) => {
    try {
      const schoolId = req.user!.schoolId!;
      const filiere = await Filiere.findOne({ where: { id: req.params.id, schoolId } });
      if (!filiere) return res.status(404).json({ success: false, error: 'Filière introuvable' });
      const [s, c] = await Promise.all([
        Section.count({ where: { schoolId, filiereId: filiere.id } }),
        Class.count({ where: { schoolId, filiereId: filiere.id } }),
      ]);
      if (s + c > 0) {
        return res.status(400).json({ success: false, error: 'Cette filière est encore utilisée (sections ou classes)' });
      }
      await filiere.destroy();
      await logAudit(req, { action: 'delete', entity: 'filiere', entityId: req.params.id });
      return res.json({ success: true, data: { message: 'Filière supprimée' } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

// ============================
// SECTIONS
// ============================

router.get('/sections',
  requireRole(...STAFF_READ),
  requirePermission('classes', 'view'),
  async (req: Request, res: Response) => {
    try {
      const schoolId = req.user!.schoolId!;
      const where: Record<string, unknown> = { schoolId };
      if (req.query.filiereId) where['filiereId'] = req.query.filiereId;
      const sections = await Section.findAll({
        where,
        include: [{ model: Filiere, as: 'filiere', attributes: ['id', 'name', 'code'] }],
        order: [['name', 'ASC']],
      });
      const items = await Promise.all(sections.map(async (s) => {
        const [optionsCount, classesCount] = await Promise.all([
          Option.count({ where: { schoolId, sectionId: s.id } }),
          Class.count({ where: { schoolId, sectionId: s.id } }),
        ]);
        return { ...s.toJSON(), optionsCount, classesCount };
      }));
      return res.json({ success: true, data: { items, total: items.length } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

router.post('/sections',
  requireRole(...ADMIN_WRITE),
  requirePermission('classes', 'create'),
  body('name').trim().notEmpty().withMessage('Le nom de la section est requis'),
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ success: false, error: errors.array()[0].msg });
      const schoolId = req.user!.schoolId!;
      const { name, code, filiereId } = req.body;
      if (await duplicateName(Section, schoolId, name)) {
        return res.status(400).json({ success: false, error: 'Une section avec ce nom existe déjà' });
      }
      if (filiereId) {
        const filiere = await Filiere.findOne({ where: { id: filiereId, schoolId } });
        if (!filiere) return res.status(400).json({ success: false, error: 'Filière introuvable' });
      }
      const section = await Section.create({ schoolId, name, code, filiereId: filiereId || null });
      await logAudit(req, { action: 'create', entity: 'section', entityId: section.id, details: { name } });
      return res.status(201).json({ success: true, data: { section } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

router.patch('/sections/:id',
  requireRole(...ADMIN_WRITE),
  requirePermission('classes', 'update'),
  async (req: Request, res: Response) => {
    try {
      const schoolId = req.user!.schoolId!;
      const section = await Section.findOne({ where: { id: req.params.id, schoolId } });
      if (!section) return res.status(404).json({ success: false, error: 'Section introuvable' });
      const allowed = ['name', 'code', 'filiereId'];
      const updates: Record<string, unknown> = {};
      for (const f of allowed) if (req.body[f] !== undefined) updates[f] = req.body[f];
      if (typeof updates['name'] === 'string' && updates['name'] !== section.name) {
        if (await duplicateName(Section, schoolId, updates['name'] as string, section.id)) {
          return res.status(400).json({ success: false, error: 'Une section avec ce nom existe déjà' });
        }
      }
      if (updates['filiereId']) {
        const filiere = await Filiere.findOne({ where: { id: updates['filiereId'] as string, schoolId } });
        if (!filiere) return res.status(400).json({ success: false, error: 'Filière introuvable' });
      }
      await section.update(updates);
      await logAudit(req, { action: 'update', entity: 'section', entityId: section.id, details: updates });
      return res.json({ success: true, data: { section } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

router.delete('/sections/:id',
  requireRole(...ADMIN_WRITE),
  requirePermission('classes', 'delete'),
  async (req: Request, res: Response) => {
    try {
      const schoolId = req.user!.schoolId!;
      const section = await Section.findOne({ where: { id: req.params.id, schoolId } });
      if (!section) return res.status(404).json({ success: false, error: 'Section introuvable' });
      const [o, c] = await Promise.all([
        Option.count({ where: { schoolId, sectionId: section.id } }),
        Class.count({ where: { schoolId, sectionId: section.id } }),
      ]);
      if (o + c > 0) {
        return res.status(400).json({ success: false, error: 'Cette section est encore utilisée (options ou classes)' });
      }
      await section.destroy();
      await logAudit(req, { action: 'delete', entity: 'section', entityId: req.params.id });
      return res.json({ success: true, data: { message: 'Section supprimée' } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

// ============================
// OPTIONS
// ============================

router.get('/options',
  requireRole(...STAFF_READ),
  requirePermission('classes', 'view'),
  async (req: Request, res: Response) => {
    try {
      const schoolId = req.user!.schoolId!;
      const where: Record<string, unknown> = { schoolId };
      if (req.query.sectionId) where['sectionId'] = req.query.sectionId;
      const options = await Option.findAll({
        where,
        include: [{ model: Section, as: 'section', attributes: ['id', 'name', 'code'] }],
        order: [['name', 'ASC']],
      });
      const items = await Promise.all(options.map(async (o) => {
        const classesCount = await Class.count({ where: { schoolId, optionId: o.id } });
        return { ...o.toJSON(), classesCount };
      }));
      return res.json({ success: true, data: { items, total: items.length } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

router.post('/options',
  requireRole(...ADMIN_WRITE),
  requirePermission('classes', 'create'),
  body('name').trim().notEmpty().withMessage("Le nom de l'option est requis"),
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ success: false, error: errors.array()[0].msg });
      const schoolId = req.user!.schoolId!;
      const { name, code, sectionId, durationYears } = req.body;
      if (await duplicateName(Option, schoolId, name)) {
        return res.status(400).json({ success: false, error: 'Une option avec ce nom existe déjà' });
      }
      if (sectionId) {
        const section = await Section.findOne({ where: { id: sectionId, schoolId } });
        if (!section) return res.status(400).json({ success: false, error: 'Section introuvable' });
      }
      const option = await Option.create({ schoolId, name, code, sectionId: sectionId || null, durationYears: durationYears ?? null });
      await logAudit(req, { action: 'create', entity: 'option', entityId: option.id, details: { name } });
      return res.status(201).json({ success: true, data: { option } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

router.patch('/options/:id',
  requireRole(...ADMIN_WRITE),
  requirePermission('classes', 'update'),
  async (req: Request, res: Response) => {
    try {
      const schoolId = req.user!.schoolId!;
      const option = await Option.findOne({ where: { id: req.params.id, schoolId } });
      if (!option) return res.status(404).json({ success: false, error: 'Option introuvable' });
      const allowed = ['name', 'code', 'sectionId', 'durationYears'];
      const updates: Record<string, unknown> = {};
      for (const f of allowed) if (req.body[f] !== undefined) updates[f] = req.body[f];
      if (typeof updates['name'] === 'string' && updates['name'] !== option.name) {
        if (await duplicateName(Option, schoolId, updates['name'] as string, option.id)) {
          return res.status(400).json({ success: false, error: 'Une option avec ce nom existe déjà' });
        }
      }
      if (updates['sectionId']) {
        const section = await Section.findOne({ where: { id: updates['sectionId'] as string, schoolId } });
        if (!section) return res.status(400).json({ success: false, error: 'Section introuvable' });
      }
      await option.update(updates);
      await logAudit(req, { action: 'update', entity: 'option', entityId: option.id, details: updates });
      return res.json({ success: true, data: { option } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

router.delete('/options/:id',
  requireRole(...ADMIN_WRITE),
  requirePermission('classes', 'delete'),
  async (req: Request, res: Response) => {
    try {
      const schoolId = req.user!.schoolId!;
      const option = await Option.findOne({ where: { id: req.params.id, schoolId } });
      if (!option) return res.status(404).json({ success: false, error: 'Option introuvable' });
      const used = await Class.count({ where: { schoolId, optionId: option.id } });
      if (used > 0) {
        return res.status(400).json({ success: false, error: 'Cette option est encore utilisée par des classes' });
      }
      await option.destroy();
      await logAudit(req, { action: 'delete', entity: 'option', entityId: req.params.id });
      return res.json({ success: true, data: { message: 'Option supprimée' } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

// ============================
// NIVEAUX
// ============================

router.get('/niveaux',
  requireRole(...STAFF_READ),
  requirePermission('classes', 'view'),
  async (req: Request, res: Response) => {
    try {
      const schoolId = req.user!.schoolId!;
      const where: Record<string, unknown> = { schoolId };
      if (req.query.cycleId) where['cycleId'] = req.query.cycleId;
      const niveaux = await Niveau.findAll({
        where,
        include: [{ model: Cycle, as: 'cycle', attributes: ['id', 'name', 'code'] }],
        order: [['order', 'ASC'], ['name', 'ASC']],
      });
      const items = await Promise.all(niveaux.map(async (n) => {
        const classesCount = await Class.count({ where: { schoolId, niveauId: n.id } });
        return { ...n.toJSON(), classesCount };
      }));
      return res.json({ success: true, data: { items, total: items.length } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

router.post('/niveaux',
  requireRole(...ADMIN_WRITE),
  requirePermission('classes', 'create'),
  body('name').trim().notEmpty().withMessage('Le nom du niveau est requis'),
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ success: false, error: errors.array()[0].msg });
      const schoolId = req.user!.schoolId!;
      const { name, cycleId, order } = req.body;
      if (await duplicateName(Niveau, schoolId, name)) {
        return res.status(400).json({ success: false, error: 'Un niveau avec ce nom existe déjà' });
      }
      if (cycleId) {
        const cycle = await Cycle.findOne({ where: { id: cycleId, schoolId } });
        if (!cycle) return res.status(400).json({ success: false, error: 'Cycle introuvable' });
      }
      const niveau = await Niveau.create({ schoolId, name, cycleId: cycleId || null, order: order ?? 0 });
      await logAudit(req, { action: 'create', entity: 'niveau', entityId: niveau.id, details: { name } });
      return res.status(201).json({ success: true, data: { niveau } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

router.patch('/niveaux/:id',
  requireRole(...ADMIN_WRITE),
  requirePermission('classes', 'update'),
  async (req: Request, res: Response) => {
    try {
      const schoolId = req.user!.schoolId!;
      const niveau = await Niveau.findOne({ where: { id: req.params.id, schoolId } });
      if (!niveau) return res.status(404).json({ success: false, error: 'Niveau introuvable' });
      const allowed = ['name', 'cycleId', 'order'];
      const updates: Record<string, unknown> = {};
      for (const f of allowed) if (req.body[f] !== undefined) updates[f] = req.body[f];
      if (typeof updates['name'] === 'string' && updates['name'] !== niveau.name) {
        if (await duplicateName(Niveau, schoolId, updates['name'] as string, niveau.id)) {
          return res.status(400).json({ success: false, error: 'Un niveau avec ce nom existe déjà' });
        }
      }
      if (updates['cycleId']) {
        const cycle = await Cycle.findOne({ where: { id: updates['cycleId'] as string, schoolId } });
        if (!cycle) return res.status(400).json({ success: false, error: 'Cycle introuvable' });
      }
      await niveau.update(updates);
      await logAudit(req, { action: 'update', entity: 'niveau', entityId: niveau.id, details: updates });
      return res.json({ success: true, data: { niveau } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

router.delete('/niveaux/:id',
  requireRole(...ADMIN_WRITE),
  requirePermission('classes', 'delete'),
  async (req: Request, res: Response) => {
    try {
      const schoolId = req.user!.schoolId!;
      const niveau = await Niveau.findOne({ where: { id: req.params.id, schoolId } });
      if (!niveau) return res.status(404).json({ success: false, error: 'Niveau introuvable' });
      const used = await Class.count({ where: { schoolId, niveauId: niveau.id } });
      if (used > 0) {
        return res.status(400).json({ success: false, error: 'Ce niveau est encore utilisé par des classes' });
      }
      await niveau.destroy();
      await logAudit(req, { action: 'delete', entity: 'niveau', entityId: req.params.id });
      return res.json({ success: true, data: { message: 'Niveau supprimé' } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

// ============================
// CLASS STRUCTURE ASSIGNMENT
// ============================

router.patch('/classes/:id/structure',
  requireRole(...ADMIN_WRITE),
  requirePermission('classes', 'update'),
  async (req: Request, res: Response) => {
    try {
      const schoolId = req.user!.schoolId!;
      const cls = await Class.findOne({ where: { id: req.params.id, schoolId } });
      if (!cls) return res.status(404).json({ success: false, error: 'Classe introuvable' });
      const fields = ['cycleId', 'filiereId', 'sectionId', 'optionId', 'niveauId'] as const;
      const updates: Record<string, unknown> = {};
      for (const f of fields) {
        if (req.body[f] !== undefined) updates[f] = req.body[f] || null;
      }
      if (updates['cycleId']) {
        const row = await Cycle.findOne({ where: { id: updates['cycleId'] as string, schoolId } });
        if (!row) return res.status(400).json({ success: false, error: 'Cycle introuvable' });
      }
      if (updates['filiereId']) {
        const row = await Filiere.findOne({ where: { id: updates['filiereId'] as string, schoolId } });
        if (!row) return res.status(400).json({ success: false, error: 'Filière introuvable' });
      }
      if (updates['sectionId']) {
        const row = await Section.findOne({ where: { id: updates['sectionId'] as string, schoolId } });
        if (!row) return res.status(400).json({ success: false, error: 'Section introuvable' });
      }
      if (updates['optionId']) {
        const row = await Option.findOne({ where: { id: updates['optionId'] as string, schoolId } });
        if (!row) return res.status(400).json({ success: false, error: 'Option introuvable' });
      }
      if (updates['niveauId']) {
        const row = await Niveau.findOne({ where: { id: updates['niveauId'] as string, schoolId } });
        if (!row) return res.status(400).json({ success: false, error: 'Niveau introuvable' });
      }
      await cls.update(updates);
      await logAudit(req, { action: 'update', entity: 'class_structure', entityId: cls.id, details: updates });
      return res.json({ success: true, data: { class: cls } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

// ============================
// SEED RDC
// ============================

async function findOrCreateByCode(
  model: ModelStatic<Model>,
  schoolId: string,
  values: Record<string, unknown>
): Promise<{ row: Model & { id: string }; created: boolean }> {
  const existing = await model.findOne({ where: { schoolId, code: values['code'] } }) as unknown as (Model & { id: string }) | null;
  if (existing) return { row: existing, created: false };
  const row = await model.create({ schoolId, ...values }) as unknown as Model & { id: string };
  return { row, created: true };
}

router.post('/seed-rdc',
  requireRole(...ADMIN_WRITE),
  requirePermission('classes', 'create'),
  async (req: Request, res: Response) => {
    try {
      const schoolId = req.user!.schoolId!;
      let created = 0;
      let skipped = 0;
      const count = (wasCreated: boolean): void => { if (wasCreated) created += 1; else skipped += 1; };

      // --- Cycles ---
      const cycleDefs = [
        { name: 'Maternel', code: 'MAT', order: 1 },
        { name: 'Primaire', code: 'PRIM', order: 2 },
        { name: 'CTEB', code: 'CTEB', order: 3 },
        { name: 'Humanités générales', code: 'HUM-GEN', order: 4 },
        { name: 'Humanités techniques', code: 'HUM-TECH', order: 5 },
        { name: 'Humanités professionnelles', code: 'HUM-PRO', order: 6 },
      ];
      const cycleIds: Record<string, string> = {};
      for (const def of cycleDefs) {
        const { row, created: c } = await findOrCreateByCode(Cycle, schoolId, def);
        count(c);
        cycleIds[def.code] = row.id;
      }

      // --- Niveaux ---
      const niveauDefs = [
        { name: '1ère maternelle', code: 'MAT-1', cycle: 'MAT', order: 1 },
        { name: '2ème maternelle', code: 'MAT-2', cycle: 'MAT', order: 2 },
        { name: '3ème maternelle', code: 'MAT-3', cycle: 'MAT', order: 3 },
        { name: '1ère primaire', code: 'PRIM-1', cycle: 'PRIM', order: 1 },
        { name: '2ème primaire', code: 'PRIM-2', cycle: 'PRIM', order: 2 },
        { name: '3ème primaire', code: 'PRIM-3', cycle: 'PRIM', order: 3 },
        { name: '4ème primaire', code: 'PRIM-4', cycle: 'PRIM', order: 4 },
        { name: '5ème primaire', code: 'PRIM-5', cycle: 'PRIM', order: 5 },
        { name: '6ème primaire', code: 'PRIM-6', cycle: 'PRIM', order: 6 },
        { name: '7e', code: 'CTEB-7', cycle: 'CTEB', order: 7 },
        { name: '8e', code: 'CTEB-8', cycle: 'CTEB', order: 8 },
      ];
      for (const def of niveauDefs) {
        const { created: c } = await findOrCreateByCode(Niveau, schoolId, {
          name: def.name,
          code: def.code,
          order: def.order,
          cycleId: cycleIds[def.cycle],
        });
        count(c);
      }

      // --- Filières ---
      const filiereDefs = [
        { name: 'Enseignement primaire', code: 'PRIM-GEN', cycle: 'PRIM' },
        { name: 'Tronc commun CTEB', code: 'CTEB-GEN', cycle: 'CTEB' },
        { name: 'Humanités générales', code: 'HG-GEN', cycle: 'HUM-GEN' },
        { name: 'Techniques industrielles et commerciales', code: 'HT-TECH', cycle: 'HUM-TECH' },
        { name: 'Filières professionnelles', code: 'HP-PRO', cycle: 'HUM-PRO' },
      ];
      const filiereIds: Record<string, string> = {};
      for (const def of filiereDefs) {
        const { row, created: c } = await findOrCreateByCode(Filiere, schoolId, {
          name: def.name,
          code: def.code,
          cycleId: cycleIds[def.cycle],
        });
        count(c);
        filiereIds[def.code] = row.id;
      }

      // --- Sections ---
      const sectionDefs = [
        { name: 'Élémentaire', code: 'PRIM-ELEM', filiere: 'PRIM-GEN' },
        { name: 'Moyen', code: 'PRIM-MOY', filiere: 'PRIM-GEN' },
        { name: 'Terminal', code: 'PRIM-TERM', filiere: 'PRIM-GEN' },
        { name: 'Pédagogique', code: 'HG-PED', filiere: 'HG-GEN' },
        { name: 'Littéraire', code: 'HG-LIT', filiere: 'HG-GEN' },
        { name: 'Scientifique', code: 'HG-SCI', filiere: 'HG-GEN' },
      ];
      const sectionIds: Record<string, string> = {};
      for (const def of sectionDefs) {
        const { row, created: c } = await findOrCreateByCode(Section, schoolId, {
          name: def.name,
          code: def.code,
          filiereId: filiereIds[def.filiere],
        });
        count(c);
        sectionIds[def.code] = row.id;
      }

      // --- Options ---
      const optionDefs = [
        { name: 'Pédagogie Générale', code: 'OPT-PED-GEN', section: 'HG-PED', durationYears: 4 },
        { name: 'Latin-Philosophie', code: 'OPT-LAT-PHI', section: 'HG-LIT', durationYears: 4 },
        { name: 'Mathématiques-Physique', code: 'OPT-MATH-PHY', section: 'HG-SCI', durationYears: 4 },
        { name: 'Chimie-Biologie', code: 'OPT-CHI-BIO', section: 'HG-SCI', durationYears: 4 },
        { name: 'Construction', code: 'OPT-CONST', section: null, durationYears: 4 },
        { name: 'Électricité', code: 'OPT-ELEC', section: null, durationYears: 4 },
        { name: 'Informatique', code: 'OPT-INFO', section: null, durationYears: 4 },
        { name: 'Commerciale et Gestion', code: 'OPT-COM-GES', section: null, durationYears: 4 },
        { name: 'Maçonnerie', code: 'OPT-MAC', section: null, durationYears: 3 },
        { name: 'Menuiserie', code: 'OPT-MEN', section: null, durationYears: 3 },
        { name: 'Électricité bâtiment', code: 'OPT-ELEC-BAT', section: null, durationYears: 3 },
      ];
      for (const def of optionDefs) {
        const sectionId: string | null = def.section ? sectionIds[def.section] : null;
        // Technique options attach to no section; pro options likewise (filiere link is flat here).
        const { created: c } = await findOrCreateByCode(Option, schoolId, {
          name: def.name,
          code: def.code,
          sectionId,
          durationYears: def.durationYears,
        });
        count(c);
      }

      await logAudit(req, {
        action: 'create',
        entity: 'academic_structure',
        details: { seed: 'rdc', created, skipped },
      });

      return res.json({ success: true, data: { created, skipped } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

export default router;
