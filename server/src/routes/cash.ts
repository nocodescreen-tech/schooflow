import { Router, Request, Response } from 'express';
import { body, query, validationResult } from 'express-validator';
import { Op } from 'sequelize';
import { authenticateToken } from '../middleware/auth.js';
import { requireRole, requirePermission } from '../middleware/rbac.js';
import { CashTransaction, User } from '../models/index.js';
import { logAudit } from '../middleware/auditLog.js';
import { getPagination, getSort, pages } from '../utils/listQuery.js';
import { requireModule } from '../utils/modules.js';

const router = Router();
router.use(authenticateToken);
router.use(requireModule('finance'));

const CASH_READ = ['super_admin', 'admin', 'director', 'accountant'] as const;
const CASH_WRITE = ['super_admin', 'admin', 'director', 'accountant'] as const;

// GET / — list with filters
router.get('/',
  requireRole(...CASH_READ),
  requirePermission('cash', 'view'),
  query('dateFrom').optional().isISO8601(),
  query('dateTo').optional().isISO8601(),
  async (req: Request, res: Response) => {
    try {
      const { type, category, dateFrom, dateTo } = req.query;
      const where: any = { schoolId: req.user!.schoolId!, isDeleted: false };

      if (type) where.type = type;
      if (category) where.category = category;
      if (dateFrom || dateTo) {
        where.date = {};
        if (dateFrom) where.date[Op.gte] = new Date(dateFrom as string);
        if (dateTo) where.date[Op.lte] = new Date(dateTo as string);
      }

      const { page, limit, offset } = getPagination(req.query);
      const sort = getSort(req.query, { date: 'date', amount: 'amount', type: 'type', createdAt: 'createdAt' }, 'date', 'DESC');
      if (!sort) return res.status(400).json({ success: false, error: 'Invalid sortBy or sortOrder' });

      const { count, rows: transactions } = await CashTransaction.findAndCountAll({
        where,
        include: [{ model: User, as: 'recordedBy', attributes: ['id', 'name'] }],
        order: [[sort.column, sort.order]],
        limit,
        offset,
      });

      return res.json({ success: true, data: { items: transactions, total: count, page, pages: pages(count, limit) } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

// GET /summary — get cash summary
router.get('/summary',
  requireRole(...CASH_READ),
  requirePermission('cash', 'view'),
  async (req: Request, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [totalIncome, totalExpense, todayTransactions] = await Promise.all([
      CashTransaction.sum('amount', { where: { schoolId, type: 'income', isDeleted: false } }),
      CashTransaction.sum('amount', { where: { schoolId, type: 'expense', isDeleted: false } }),
      CashTransaction.findAll({
        where: { schoolId, date: { [Op.gte]: today, [Op.lt]: tomorrow }, isDeleted: false },
        include: [{ model: User, as: 'recordedBy', attributes: ['id', 'name'] }],
        order: [['date', 'DESC']],
      }),
    ]);

    const income = Number(totalIncome) || 0;
    const expense = Number(totalExpense) || 0;

    return res.json({
      success: true,
      data: {
        totalIncome: income,
        totalExpense: expense,
        balance: income - expense,
        todayTransactions,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// GET /daily — get daily cash report
router.get('/daily',
  requireRole(...CASH_READ),
  requirePermission('cash', 'view'),
  async (req: Request, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!;
    const { date } = req.query;

    const targetDate = date ? new Date(date as string) : new Date();
    targetDate.setHours(0, 0, 0, 0);
    const nextDate = new Date(targetDate);
    nextDate.setDate(nextDate.getDate() + 1);

    const transactions = await CashTransaction.findAll({
      where: { schoolId, date: { [Op.gte]: targetDate, [Op.lt]: nextDate }, isDeleted: false },
      include: [{ model: User, as: 'recordedBy', attributes: ['id', 'name'] }],
      order: [['date', 'ASC']],
    });

    let income = 0;
    let expense = 0;
    for (const t of transactions) {
      if (t.type === 'income') income += Number(t.amount);
      else expense += Number(t.amount);
    }

    return res.json({
      success: true,
      data: {
        date: targetDate.toISOString().split('T')[0],
        transactions,
        totalIncome: income,
        totalExpense: expense,
        netBalance: income - expense,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// POST / — create transaction
router.post('/',
  requireRole(...CASH_WRITE),
  requirePermission('cash', 'create'),
  body('type').isIn(['income', 'expense']).withMessage('Type must be income or expense'),
  body('amount').isFloat({ min: 0.01 }).withMessage('Amount must be positive'),
  body('category').optional().isString(),
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ success: false, error: errors.array()[0].msg });

      const { type, category, amount, description, reference, date, notes, responsible, attachment } = req.body;

      const transaction = await CashTransaction.create({
        schoolId: req.user!.schoolId!,
        type,
        category: category || 'other',
        amount,
        description,
        reference,
        date: date ? new Date(date) : new Date(),
        recordedById: req.user!.id,
        notes,
        responsible,
        attachment,
      });

      await logAudit(req, { action: 'create', entity: 'cashTransaction', entityId: transaction.id, details: { type, amount, category } });

      return res.status(201).json({ success: true, data: { transaction } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

// PATCH /:id — update (only if not yet closed)
router.patch('/:id',
  requireRole(...CASH_WRITE),
  requirePermission('cash', 'create'),
  async (req: Request, res: Response) => {
  try {
    const transaction = await CashTransaction.findOne({
      where: { id: req.params.id, schoolId: req.user!.schoolId! },
    });
    if (!transaction) return res.status(404).json({ success: false, error: 'Transaction not found' });
    if (transaction.closedAt) return res.status(400).json({ success: false, error: 'Cannot modify a closed transaction' });

    const allowed = ['type', 'category', 'amount', 'description', 'reference', 'date', 'notes', 'responsible', 'attachment'];
    const updates: any = {};
    for (const field of allowed) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    }

    await transaction.update(updates);

    await logAudit(req, { action: 'update', entity: 'cashTransaction', entityId: transaction.id, details: updates });

    return res.json({ success: true, data: { transaction } });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// DELETE /:id — soft delete (only admin)
router.delete('/:id',
  requireRole('super_admin', 'admin'),
  requirePermission('cash', 'create'),
  async (req: Request, res: Response) => {
  try {
    const transaction = await CashTransaction.findOne({
      where: { id: req.params.id, schoolId: req.user!.schoolId! },
    });
    if (!transaction) return res.status(404).json({ success: false, error: 'Transaction not found' });
    if (transaction.closedAt) return res.status(400).json({ success: false, error: 'Cannot delete a closed transaction' });

    await transaction.update({ isDeleted: true });

    await logAudit(req, { action: 'delete', entity: 'cashTransaction', entityId: transaction.id });

    return res.json({ success: true, data: { message: 'Transaction deleted' } });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// POST /close — close daily cash (prevents further modifications)
router.post('/close',
  requireRole(...CASH_WRITE),
  requirePermission('cash', 'create'),
  async (req: Request, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!;
    const { date } = req.body;

    const targetDate = date ? new Date(date) : new Date();
    targetDate.setHours(0, 0, 0, 0);
    const nextDate = new Date(targetDate);
    nextDate.setDate(nextDate.getDate() + 1);

    const [updatedCount] = await CashTransaction.update(
      { closedAt: new Date() },
      {
        where: {
          schoolId,
          date: { [Op.gte]: targetDate, [Op.lt]: nextDate },
          closedAt: null,
          isDeleted: false,
        },
      }
    );

    await logAudit(req, { action: 'close', entity: 'cash', details: { date: targetDate, closedCount: updatedCount } });

    return res.json({ success: true, data: { message: 'Cash closed', closedCount: updatedCount } });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

export default router;
