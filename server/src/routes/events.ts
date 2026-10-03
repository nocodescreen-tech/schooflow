import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { authenticateToken } from '../middleware/auth.js';
import { requireRole, requirePermission } from '../middleware/rbac.js';
import { CalendarEvent } from '../models/index.js';
import { logAudit } from '../middleware/auditLog.js';
import { getPagination, pages } from '../utils/listQuery.js';
import { requireModule } from '../utils/modules.js';

const router = Router();
router.use(authenticateToken);
router.use(requireModule('calendar'));

const VIEW_ROLES = ['super_admin', 'admin', 'director', 'teacher', 'accountant', 'receptionist', 'prefect', 'parent', 'student'] as const;
const CREATE_ROLES = ['super_admin', 'admin', 'director', 'teacher'] as const;
const MANAGE_ROLES = ['super_admin', 'admin', 'director'] as const;

router.get('/',
  requireRole(...VIEW_ROLES),
  requirePermission('events', 'view'),
  async (req: Request, res: Response) => {
    try {
      const { type } = req.query;
      const where: Record<string, unknown> = { schoolId: req.user!.schoolId! };
      if (type) where.type = type;
      const { page, limit, offset } = getPagination(req.query);
      const { count, rows } = await CalendarEvent.findAndCountAll({
        where,
        order: [['startDate', 'ASC']],
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
  requireRole(...CREATE_ROLES),
  requirePermission('events', 'create'),
  body('title').trim().notEmpty().withMessage('Title is required'),
  body('startDate').notEmpty().withMessage('Start date is required'),
  body('type').optional().isIn(['rentree', 'vacances', 'examen', 'reunion', 'conseil', 'evaluation', 'pedagogique', 'autre']),
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ success: false, error: errors.array()[0].msg });
      const { title, description, type, startDate, endDate, audience } = req.body;
      const event = await CalendarEvent.create({
        schoolId: req.user!.schoolId!,
        title,
        description,
        type: type || 'autre',
        startDate: new Date(startDate),
        endDate: endDate ? new Date(endDate) : null,
        audience: audience || 'all',
      });
      await logAudit(req, { action: 'create', entity: 'calendar_event', entityId: event.id, details: { title } });
      return res.status(201).json({ success: true, data: { event } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

router.patch('/:id',
  requireRole(...MANAGE_ROLES),
  requirePermission('events', 'update'),
  async (req: Request, res: Response) => {
    try {
      const event = await CalendarEvent.findOne({ where: { id: req.params.id, schoolId: req.user!.schoolId! } });
      if (!event) return res.status(404).json({ success: false, error: 'Event not found' });
      const allowed = ['title', 'description', 'type', 'startDate', 'endDate', 'audience'];
      const updates: Record<string, unknown> = {};
      for (const f of allowed) if (req.body[f] !== undefined) updates[f] = req.body[f];
      await event.update(updates);
      await logAudit(req, { action: 'update', entity: 'calendar_event', entityId: event.id, details: updates });
      return res.json({ success: true, data: { event } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

router.delete('/:id',
  requireRole(...MANAGE_ROLES),
  requirePermission('events', 'delete'),
  async (req: Request, res: Response) => {
    try {
      const event = await CalendarEvent.findOne({ where: { id: req.params.id, schoolId: req.user!.schoolId! } });
      if (!event) return res.status(404).json({ success: false, error: 'Event not found' });
      await event.destroy();
      await logAudit(req, { action: 'delete', entity: 'calendar_event', entityId: req.params.id });
      return res.json({ success: true, data: { message: 'Event deleted' } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

export default router;
