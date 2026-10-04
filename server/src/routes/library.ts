import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { authenticateToken } from '../middleware/auth.js';
import { requireRole, requirePermission } from '../middleware/rbac.js';
import { requireModule } from '../utils/modules.js';
import { logAudit } from '../middleware/auditLog.js';
import { Student, User, School } from '../models/index.js';
import { v4 as uuidv4 } from 'uuid';

const router = Router();
router.use(authenticateToken);
router.use(requireModule('library'));

const ROLES = ['super_admin', 'admin', 'director', 'teacher'] as const;

// In-memory store for library items (would be a model in production)
const libraryItems: Map<string, any> = new Map();
const loans: Map<string, any> = new Map();

// GET /library/items — list catalogue
router.get('/items',
  requireRole(...ROLES),
  requirePermission('library', 'view'),
  async (req: Request, res: Response) => {
    try {
      const items = [...libraryItems.values()].filter((i) => i.schoolId === req.user!.schoolId);
      res.json({ success: true, data: { items } });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

// POST /library/items — add item to catalogue
router.post('/items',
  requireRole('super_admin', 'admin', 'director'),
  requirePermission('library', 'manage'),
  body('title').isString().withMessage('Title is required'),
  body('author').optional().isString(),
  body('category').optional().isString(),
  body('copies').optional().isInt({ min: 1 }),
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ success: false, error: errors.array()[0].msg });

      const { title, author, category, copies = 1 } = req.body;
      const item = {
        id: uuidv4(),
        schoolId: req.user!.schoolId,
        title,
        author: author || null,
        category: category || 'general',
        totalCopies: copies,
        availableCopies: copies,
        createdAt: new Date(),
      };
      libraryItems.set(item.id, item);

      await logAudit(req, { action: 'create', entity: 'library_item', entityId: item.id, details: { title } });
      res.status(201).json({ success: true, data: { item } });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

// POST /library/loans — create a loan
router.post('/loans',
  requireRole(...ROLES),
  requirePermission('library', 'manage'),
  body('itemId').isUUID().withMessage('Valid item ID is required'),
  body('studentId').isUUID().withMessage('Valid student ID is required'),
  body('dueDate').isISO8601().withMessage('Valid due date is required'),
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ success: false, error: errors.array()[0].msg });

      const { itemId, studentId, dueDate } = req.body;
      const item = libraryItems.get(itemId);
      if (!item || item.schoolId !== req.user!.schoolId) {
        return res.status(404).json({ success: false, error: 'Library item not found' });
      }
      if (item.availableCopies < 1) {
        return res.status(400).json({ success: false, error: 'No copies available' });
      }

      const loan = {
        id: uuidv4(),
        schoolId: req.user!.schoolId,
        itemId,
        studentId,
        loanedAt: new Date(),
        dueDate: new Date(dueDate),
        returnedAt: null,
        status: 'active',
      };
      loans.set(loan.id, loan);
      item.availableCopies--;

      await logAudit(req, { action: 'create', entity: 'library_loan', entityId: loan.id, details: { itemId, studentId } });
      res.status(201).json({ success: true, data: { loan } });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

// POST /library/loans/:id/return — return a loan
router.post('/loans/:id/return',
  requireRole(...ROLES),
  requirePermission('library', 'manage'),
  async (req: Request, res: Response) => {
    try {
      const loan = loans.get(req.params.id);
      if (!loan || loan.schoolId !== req.user!.schoolId) {
        return res.status(404).json({ success: false, error: 'Loan not found' });
      }
      if (loan.status === 'returned') {
        return res.status(400).json({ success: false, error: 'Loan already returned' });
      }

      loan.status = 'returned';
      loan.returnedAt = new Date();
      const item = libraryItems.get(loan.itemId);
      if (item) item.availableCopies++;

      await logAudit(req, { action: 'return', entity: 'library_loan', entityId: loan.id, details: {} });
      res.json({ success: true, data: { loan } });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

// GET /library/loans — list loans
router.get('/loans',
  requireRole(...ROLES),
  requirePermission('library', 'view'),
  async (req: Request, res: Response) => {
    try {
      const { status, studentId } = req.query;
      let loanList = [...loans.values()].filter((l) => l.schoolId === req.user!.schoolId);
      if (status) loanList = loanList.filter((l) => l.status === status);
      if (studentId) loanList = loanList.filter((l) => l.studentId === studentId);
      res.json({ success: true, data: { loans: loanList } });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

// GET /library/overdue — list overdue loans
router.get('/overdue',
  requireRole(...ROLES),
  requirePermission('library', 'view'),
  async (req: Request, res: Response) => {
    try {
      const now = new Date();
      const overdue = [...loans.values()].filter(
        (l) => l.schoolId === req.user!.schoolId && l.status === 'active' && new Date(l.dueDate) < now
      );
      res.json({ success: true, data: { overdue } });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

export default router;
