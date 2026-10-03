import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { Op } from 'sequelize';
import { authenticateToken } from '../middleware/auth.js';
import { requireRole, requirePermission } from '../middleware/rbac.js';
import { Incident, Sanction, Student } from '../models/index.js';
import { logAudit } from '../middleware/auditLog.js';
import { getPagination, pages } from '../utils/listQuery.js';
import { requireModule } from '../utils/modules.js';

const router = Router();
router.use(authenticateToken);
router.use(requireModule('discipline'));

// CONFIDENTIAL: no teacher/parent/student
const GUARD = ['super_admin', 'admin', 'director', 'prefect', 'receptionist'] as const;

router.get('/',
  requireRole(...GUARD),
  requirePermission('discipline', 'view'),
  async (req: Request, res: Response) => {
    try {
      const schoolId = req.user!.schoolId!;
      const { studentId, type, status, severity } = req.query;
      const where: Record<string, unknown> = { schoolId };
      if (studentId) where.studentId = studentId;
      if (type) where.type = type;
      if (status) where.status = status;
      if (severity) where.severity = severity;
      const { page, limit, offset } = getPagination(req.query);
      const { count, rows } = await Incident.findAndCountAll({
        where,
        include: [{ model: Student, as: 'student', attributes: ['id', 'firstName', 'lastName', 'studentId'] }],
        order: [['date', 'DESC']],
        limit,
        offset,
      });
      return res.json({ success: true, data: { items: rows, total: count, page, pages: pages(count, limit) } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

router.post('/',
  requireRole(...GUARD),
  requirePermission('discipline', 'create'),
  body('studentId').isUUID().withMessage('Valid student ID is required'),
  body('type').isIn(['absence', 'retard', 'perturbation', 'violence', 'tricherie', 'autre']).withMessage('Invalid type'),
  body('severity').isIn(['faible', 'moyenne', 'grave']).withMessage('Invalid severity'),
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ success: false, error: errors.array()[0].msg });
      const schoolId = req.user!.schoolId!;
      const { studentId, type, description, date, severity, status } = req.body;
      const student = await Student.findOne({ where: { id: studentId, schoolId } });
      if (!student) return res.status(404).json({ success: false, error: 'Student not found' });
      const incident = await Incident.create({
        schoolId,
        studentId,
        type,
        description,
        date: date ? new Date(date) : new Date(),
        severity,
        status: status || 'ouvert',
        reportedById: req.user!.id,
      });
      await logAudit(req, { action: 'create', entity: 'incident', entityId: incident.id, details: { studentId, type, severity } });
      return res.status(201).json({ success: true, data: { incident } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

router.patch('/:id',
  requireRole(...GUARD),
  requirePermission('discipline', 'manage'),
  body('status').optional().isIn(['ouvert', 'examen', 'decide', 'clos']),
  async (req: Request, res: Response) => {
    try {
      const incident = await Incident.findOne({ where: { id: req.params.id, schoolId: req.user!.schoolId! } });
      if (!incident) return res.status(404).json({ success: false, error: 'Incident not found' });
      const allowed = ['type', 'description', 'date', 'severity', 'status'];
      const updates: Record<string, unknown> = {};
      for (const f of allowed) if (req.body[f] !== undefined) updates[f] = req.body[f];
      await incident.update(updates);
      await logAudit(req, { action: 'update', entity: 'incident', entityId: incident.id, details: updates });
      return res.json({ success: true, data: { incident } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

router.delete('/:id',
  requireRole(...GUARD),
  requirePermission('discipline', 'manage'),
  async (req: Request, res: Response) => {
    try {
      const incident = await Incident.findOne({ where: { id: req.params.id, schoolId: req.user!.schoolId! } });
      if (!incident) return res.status(404).json({ success: false, error: 'Incident not found' });
      await Sanction.destroy({ where: { incidentId: incident.id } });
      await incident.destroy();
      await logAudit(req, { action: 'delete', entity: 'incident', entityId: req.params.id });
      return res.json({ success: true, data: { message: 'Incident deleted' } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

router.get('/:id/sanctions',
  requireRole(...GUARD),
  requirePermission('discipline', 'view'),
  async (req: Request, res: Response) => {
    try {
      const incident = await Incident.findOne({ where: { id: req.params.id, schoolId: req.user!.schoolId! } });
      if (!incident) return res.status(404).json({ success: false, error: 'Incident not found' });
      const sanctions = await Sanction.findAll({ where: { incidentId: incident.id }, order: [['createdAt', 'DESC']] });
      return res.json({ success: true, data: { items: sanctions } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

router.post('/:id/sanctions',
  requireRole(...GUARD),
  requirePermission('discipline', 'manage'),
  body('sanction').trim().notEmpty().withMessage('Sanction is required'),
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ success: false, error: errors.array()[0].msg });
      const incident = await Incident.findOne({ where: { id: req.params.id, schoolId: req.user!.schoolId! } });
      if (!incident) return res.status(404).json({ success: false, error: 'Incident not found' });
      const { sanction, startDate, endDate } = req.body;
      const record = await Sanction.create({
        incidentId: incident.id,
        sanction,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        decidedById: req.user!.id,
      });
      await logAudit(req, { action: 'create', entity: 'sanction', entityId: record.id, details: { incidentId: incident.id } });
      return res.status(201).json({ success: true, data: { sanction: record } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

export default router;
