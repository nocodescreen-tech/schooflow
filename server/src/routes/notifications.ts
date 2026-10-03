import { Router, Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { requireRole, requirePermission } from '../middleware/rbac.js';
import { Notification } from '../models/index.js';
import { getPagination, getSort, pages } from '../utils/listQuery.js';

const router = Router();
router.use(authenticateToken);

// Notifications are strictly user-scoped; any authenticated role may use them.
const ANY_ROLE = ['super_admin', 'admin', 'director', 'teacher', 'accountant', 'receptionist', 'parent', 'student'] as const;

router.get('/',
  requireRole(...ANY_ROLE),
  requirePermission('notifications', 'view'),
  async (req: Request, res: Response) => {
  try {
    const { page, limit, offset } = getPagination(req.query);
    const sort = getSort(req.query, { createdAt: 'createdAt' }, 'createdAt', 'DESC');
    if (!sort) return res.status(400).json({ success: false, error: 'Invalid sortBy or sortOrder' });
    const where = { schoolId: req.user!.schoolId!, userId: req.user!.id };
    const { count, rows: notifications } = await Notification.findAndCountAll({
      where,
      order: [[sort.column, sort.order]],
      limit,
      offset,
    });
    const unreadCount = await Notification.count({ where: { ...where, isRead: false } });
    return res.json({ success: true, data: { items: notifications, unreadCount, total: count, page, pages: pages(count, limit) } });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.patch('/:id/read',
  requireRole(...ANY_ROLE),
  requirePermission('notifications', 'view'),
  async (req: Request, res: Response) => {
  try {
    const notification = await Notification.findOne({ where: { id: req.params.id, schoolId: req.user!.schoolId!, userId: req.user!.id } });
    if (!notification) return res.status(404).json({ success: false, error: 'Notification not found' });
    await notification.update({ isRead: true });
    return res.json({ success: true, data: { notification } });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.post('/read-all',
  requireRole(...ANY_ROLE),
  requirePermission('notifications', 'view'),
  async (req: Request, res: Response) => {
  try {
    await Notification.update({ isRead: true }, { where: { schoolId: req.user!.schoolId!, userId: req.user!.id, isRead: false } });
    return res.json({ success: true, data: { message: 'All notifications marked as read' } });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

export default router;
