import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { Op } from 'sequelize';
import { authenticateToken } from '../middleware/auth.js';
import { requireRole, requirePermission } from '../middleware/rbac.js';
import { Announcement, User, Class } from '../models/index.js';
import { logAudit } from '../middleware/auditLog.js';
import { getPagination, getSort, pages } from '../utils/listQuery.js';
import { requireModule } from '../utils/modules.js';
import { WebSocketEvents } from '../services/websocket.js';

const router = Router();
router.use(authenticateToken);
router.use(requireModule('communication'));

const ALL_READ = ['super_admin', 'admin', 'director', 'teacher', 'accountant', 'receptionist', 'parent', 'student'] as const;
const WRITE_ROLES = ['super_admin', 'admin', 'director', 'teacher'] as const;

const AUDIENCES = ['all', 'teachers', 'parents', 'students', 'staff'] as const;

// GET / — list with filters
router.get('/',
  requireRole(...ALL_READ),
  requirePermission('announcements', 'view'),
  async (req: Request, res: Response) => {
  try {
    const { audience, classId, search, includeExpired } = req.query;
    const and: Record<string, unknown>[] = [{ schoolId: req.user!.schoolId! }];

    if (audience) and.push({ audience });
    if (classId) and.push({ classId });
    if (includeExpired !== 'true') {
      and.push({ [Op.or]: [{ expiresAt: null }, { expiresAt: { [Op.gt]: new Date() } }] });
    }
    if (search) {
      and.push({
        [Op.or]: [
          { title: { [Op.iLike]: `%${search}%` } },
          { content: { [Op.iLike]: `%${search}%` } },
        ],
      });
    }
    const where = { [Op.and]: and };

    const { page, limit, offset } = getPagination(req.query);
    const sort = getSort(req.query, { publishedAt: 'publishedAt', title: 'title', createdAt: 'createdAt' }, 'publishedAt', 'DESC');
    if (!sort) return res.status(400).json({ success: false, error: 'Invalid sortBy or sortOrder' });

    const { count, rows: announcements } = await Announcement.findAndCountAll({
      where,
      include: [
        { model: User, as: 'author', attributes: ['id', 'name'] },
        { model: Class, as: 'class', attributes: ['id', 'name'] },
      ],
      order: [[sort.column, sort.order]],
      limit,
      offset,
    });

    return res.json({ success: true, data: { items: announcements, total: count, page, pages: pages(count, limit) } });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// POST / — create
router.post('/',
  requireRole(...WRITE_ROLES),
  requirePermission('announcements', 'create'),
  body('title').isString().trim().notEmpty().withMessage('Title is required'),
  body('content').isString().trim().notEmpty().withMessage('Content is required'),
  body('audience').optional().isIn([...AUDIENCES]),
  body('classId').optional({ nullable: true }).isUUID().withMessage('Valid class ID required'),
  body('expiresAt').optional({ nullable: true }).isISO8601().withMessage('Valid expiry date required'),
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ success: false, error: errors.array()[0].msg });

      const { title, content, audience, classId, expiresAt } = req.body;

      const announcement = await Announcement.create({
        schoolId: req.user!.schoolId!,
        title,
        content,
        audience: audience || 'all',
        classId: classId || null,
        expiresAt: expiresAt || null,
        authorId: req.user!.id,
      });

      await logAudit(req, { action: 'create', entity: 'announcement', entityId: announcement.id, details: { title } });

      // Emit real-time event
      WebSocketEvents.announcement.created(req.user!.schoolId!, {
        id: announcement.id,
        title: announcement.title,
        content: announcement.content,
        audience: announcement.audience,
        authorId: announcement.authorId || '',
        authorName: req.user!.name,
        publishedAt: announcement.publishedAt ? announcement.publishedAt.toISOString() : new Date().toISOString(),
        action: 'created',
      });

      return res.status(201).json({ success: true, data: { announcement } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

// PATCH /:id — update
router.patch('/:id',
  requireRole(...WRITE_ROLES),
  requirePermission('announcements', 'create'),
  async (req: Request, res: Response) => {
  try {
    const announcement = await Announcement.findOne({
      where: { id: req.params.id, schoolId: req.user!.schoolId! },
    });
    if (!announcement) return res.status(404).json({ success: false, error: 'Announcement not found' });

    const allowed = ['title', 'content', 'audience', 'classId', 'expiresAt', 'publishedAt'];
    const updates: Record<string, unknown> = {};
    for (const field of allowed) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    }
    if (updates.audience && !(AUDIENCES as readonly string[]).includes(updates.audience as string)) {
      return res.status(400).json({ success: false, error: 'Invalid audience' });
    }

    await announcement.update(updates);

    await logAudit(req, { action: 'update', entity: 'announcement', entityId: announcement.id, details: updates });

    // Emit real-time event
    WebSocketEvents.announcement.updated(req.user!.schoolId!, {
      id: announcement.id,
      title: announcement.title,
      content: announcement.content,
      audience: announcement.audience,
      authorId: announcement.authorId || '',
      authorName: req.user!.name,
      publishedAt: announcement.publishedAt ? announcement.publishedAt.toISOString() : new Date().toISOString(),
      action: 'updated',
    });

    return res.json({ success: true, data: { announcement } });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// DELETE /:id
router.delete('/:id',
  requireRole('super_admin', 'admin', 'director'),
  requirePermission('announcements', 'create'),
  async (req: Request, res: Response) => {
  try {
    const announcement = await Announcement.findOne({
      where: { id: req.params.id, schoolId: req.user!.schoolId! },
    });
    if (!announcement) return res.status(404).json({ success: false, error: 'Announcement not found' });

    await announcement.destroy();

    await logAudit(req, { action: 'delete', entity: 'announcement', entityId: req.params.id });

    // Emit real-time event
    WebSocketEvents.announcement.deleted(req.user!.schoolId!, {
      id: announcement.id,
      title: announcement.title,
      content: announcement.content,
      audience: announcement.audience,
      authorId: announcement.authorId || '',
      authorName: req.user!.name,
      publishedAt: announcement.publishedAt ? announcement.publishedAt.toISOString() : new Date().toISOString(),
      action: 'deleted',
    });

    return res.json({ success: true, data: { message: 'Announcement deleted' } });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

export default router;
