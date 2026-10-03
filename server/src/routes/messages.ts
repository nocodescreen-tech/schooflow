import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { Op } from 'sequelize';
import { authenticateToken } from '../middleware/auth.js';
import { requireRole, requirePermission } from '../middleware/rbac.js';
import { Message, User } from '../models/index.js';
import { logAudit } from '../middleware/auditLog.js';
import { getPagination, getSort, pages } from '../utils/listQuery.js';
import { requireModule } from '../utils/modules.js';

const router = Router();
router.use(authenticateToken);
router.use(requireModule('communication'));

// Messages are user-scoped (inbox/sent by user id); any authenticated role may use them.
const ANY_ROLE = ['super_admin', 'admin', 'director', 'teacher', 'accountant', 'receptionist', 'parent', 'student'] as const;

const senderInclude = { model: User, as: 'sender', attributes: ['id', 'name'] };
const recipientInclude = { model: User, as: 'recipient', attributes: ['id', 'name'] };

/**
 * GET /recipients — directory of people the current user may write to.
 *
 * Deliberately separate from /settings/users: that route requires
 * `users.view` (an admin capability), so a teacher could not pick a recipient
 * without being an administrator. This one only requires `messages.create`
 * and never exposes emails, phone numbers or account status.
 */
router.get('/recipients',
  requireRole(...ANY_ROLE),
  requirePermission('messages', 'create'),
  async (req: Request, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!;
    const search = ((req.query.search as string) || '').trim();

    const where: Record<string | symbol, unknown> = {
      schoolId,
      // A user cannot write to themselves.
      id: { [Op.ne]: req.user!.id },
    };
    if (search) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } },
      ];
    }

    const users = await User.findAll({
      where,
      attributes: ['id', 'name', 'role'],
      order: [['name', 'ASC']],
      limit: 200,
    });

    return res.json({ success: true, data: { items: users, total: users.length } });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// GET / — inbox or sent folder
router.get('/',
  requireRole(...ANY_ROLE),
  requirePermission('messages', 'view'),
  async (req: Request, res: Response) => {
  try {
    const folder = req.query.folder === 'sent' ? 'sent' : 'inbox';
    const schoolId = req.user!.schoolId!;
    const userId = req.user!.id;

    const where: Record<string, unknown> =
      folder === 'sent'
        ? { schoolId, senderId: userId }
        : { schoolId, recipientId: userId };

    const { page, limit, offset } = getPagination(req.query);
    const sort = getSort(req.query, { createdAt: 'createdAt' }, 'createdAt', 'DESC');
    if (!sort) return res.status(400).json({ success: false, error: 'Invalid sortBy or sortOrder' });

    const { count, rows: messages } = await Message.findAndCountAll({
      where,
      include: [senderInclude, recipientInclude],
      order: [[sort.column, sort.order]],
      limit,
      offset,
    });

    return res.json({ success: true, data: { items: messages, total: count, page, pages: pages(count, limit) } });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// POST / — send a message
router.post('/',
  requireRole(...ANY_ROLE),
  requirePermission('messages', 'create'),
  body('recipientId').isUUID().withMessage('Destinataire invalide'),
  body('body').trim().notEmpty().withMessage('Le message est obligatoire'),
  body('subject').optional().isString().isLength({ max: 255 }).withMessage('Objet trop long'),
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ success: false, error: errors.array()[0].msg });

      const { recipientId, subject, body: messageBody } = req.body;
      const schoolId = req.user!.schoolId!;
      const senderId = req.user!.id;

      if (recipientId === senderId) {
        return res.status(400).json({ success: false, error: 'Impossible de vous envoyer un message à vous-même' });
      }

      const recipient = await User.findOne({ where: { id: recipientId, schoolId } });
      if (!recipient) {
        return res.status(404).json({ success: false, error: 'Destinataire introuvable dans votre école' });
      }

      const message = await Message.create({
        schoolId,
        senderId,
        recipientId,
        subject: subject?.trim() || null,
        body: messageBody.trim(),
      });

      await logAudit(req, { action: 'send', entity: 'message', entityId: message.id, details: { recipientId } });

      const created = await Message.findByPk(message.id, { include: [senderInclude, recipientInclude] });

      return res.status(201).json({ success: true, data: { message: created } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

// PATCH /:id/read — mark as read (recipient only)
router.patch('/:id/read',
  requireRole(...ANY_ROLE),
  requirePermission('messages', 'view'),
  async (req: Request, res: Response) => {
  try {
    const message = await Message.findOne({
      where: {
        id: req.params.id,
        schoolId: req.user!.schoolId!,
        recipientId: req.user!.id,
      },
    });
    if (!message) return res.status(404).json({ success: false, error: 'Message introuvable' });

    if (!message.isRead) {
      await message.update({ isRead: true, readAt: new Date() });
    }

    return res.json({ success: true, data: { message } });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// DELETE /:id — sender or recipient, school-scoped
router.delete('/:id',
  requireRole(...ANY_ROLE),
  requirePermission('messages', 'create'),
  async (req: Request, res: Response) => {
  try {
    const message = await Message.findOne({
      where: {
        id: req.params.id,
        schoolId: req.user!.schoolId!,
        [Op.or]: [{ senderId: req.user!.id }, { recipientId: req.user!.id }],
      },
    });
    if (!message) return res.status(404).json({ success: false, error: 'Message introuvable' });

    await message.destroy();

    await logAudit(req, { action: 'delete', entity: 'message', entityId: message.id });

    return res.json({ success: true, data: { message: 'Message supprimé' } });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

export default router;
