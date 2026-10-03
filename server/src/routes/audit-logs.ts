import { Router, Request, Response } from 'express';
import { Op } from 'sequelize';
import { authenticateToken } from '../middleware/auth.js';
import { requireRole, requirePermission } from '../middleware/rbac.js';
import { AuditLog, User } from '../models/index.js';
import { getPagination, getSort, pages } from '../utils/listQuery.js';
import { requireModule } from '../utils/modules.js';

const router = Router();
router.use(authenticateToken);
router.use(requireModule('reports'));

router.get('/',
  requireRole('super_admin', 'admin', 'director'),
  requirePermission('audit', 'view'),
  async (req: Request, res: Response) => {
    try {
      const schoolId = req.user!.schoolId!;
      const { action, search } = req.query;
      const where: any = { schoolId };
      if (action) where.action = action;
      if (search) {
        where[Op.or] = [
          { entity: { [Op.iLike]: `%${search}%` } },
          { action: { [Op.iLike]: `%${search}%` } },
        ];
      }
      const { page, limit, offset } = getPagination(req.query);
      const sort = getSort(req.query, { createdAt: 'createdAt', action: 'action', entity: 'entity' }, 'createdAt', 'DESC');
      if (!sort) return res.status(400).json({ success: false, error: 'Invalid sortBy or sortOrder' });
      const { count, rows } = await AuditLog.findAndCountAll({
        where,
        include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email'] }],
        order: [[sort.column, sort.order]],
        limit,
        offset,
      });
      return res.json({ success: true, data: { items: rows, total: count, page, pages: pages(count, limit) } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

export default router;
