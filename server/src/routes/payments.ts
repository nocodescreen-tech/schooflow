import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { authenticateToken } from '../middleware/auth.js';
import { requireRole, requirePermission } from '../middleware/rbac.js';
import { Payment, Student, Fee, School } from '../models/index.js';
import { logAudit } from '../middleware/auditLog.js';
import { convertForPayment, getBaseCurrency } from '../services/CurrencyService.js';
import sequelize from '../config/database.js';
import { getPagination, getSort, pages } from '../utils/listQuery.js';
import { requireModule } from '../utils/modules.js';
import { WebSocketEvents } from '../services/websocket.js';
import { AppError, ErrorCode } from '../middleware/errorHandler.js';

const router = Router();
router.use(authenticateToken);
router.use(requireModule('finance'));

const LIST_ROLES = ['super_admin', 'admin', 'director', 'accountant'] as const;
const WRITE_ROLES = ['super_admin', 'admin', 'director', 'accountant'] as const;
const READ_ROLES = [
  'super_admin',
  'admin',
  'director',
  'accountant',
  'receptionist',
  'teacher',
  'parent',
  'student',
] as const;

const SORTABLE: Record<string, string> = {
  date: 'date',
  amount: 'amount',
  createdAt: 'createdAt',
  reference: 'reference',
};

function computeFeeStatus(paidAmount: number, totalAmount: number): string {
  if (paidAmount >= totalAmount) return 'paid';
  if (paidAmount > 0) return 'partial';
  return 'pending';
}

async function generateUniqueReference(schoolId: string, year: number): Promise<string> {
  const base = await Payment.count({ where: { schoolId } });
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = `PAY-${year}-${String(base + 1 + attempt).padStart(5, '0')}`;
    const existing = await Payment.findOne({ where: { schoolId, reference: candidate } });
    if (!existing) return candidate;
  }
  // Fallback: timestamp-based suffix (still PAY-YYYY-XXXXX shaped)
  for (let attempt = 0; attempt < 10; attempt++) {
    const suffix = String(Date.now() % 100000).padStart(5, '0');
    const candidate = `PAY-${year}-${suffix}`;
    const existing = await Payment.findOne({ where: { schoolId, reference: candidate } });
    if (!existing) return candidate;
  }
  throw new Error('Could not generate a unique payment reference');
}

router.get('/',
  requireRole(...LIST_ROLES),
  requirePermission('payments', 'view'),
  async (req: Request, res: Response) => {
  try {
    const { studentId } = req.query;
    const where: any = { schoolId: req.user!.schoolId! };
    if (studentId) where.studentId = studentId;

    const { page, limit, offset } = getPagination(req.query);
    const sort = getSort(req.query, SORTABLE, 'date', 'DESC');
    if (!sort) return res.status(400).json({ success: false, error: 'Invalid sortBy or sortOrder' });

    const { count, rows: payments } = await Payment.findAndCountAll({
      where,
      include: [
        { model: Student, as: 'student', attributes: ['id', 'firstName', 'lastName', 'studentId'] },
        { model: Fee, as: 'fee', attributes: ['id', 'type', 'amount'] },
      ],
      order: [[sort.column, sort.order]],
      limit,
      offset,
    });
    return res.json({ success: true, data: { items: payments, total: count, page, pages: pages(count, limit) } });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.post('/',
  requireRole(...WRITE_ROLES),
  requirePermission('payments', 'create'),
  body('studentId').isUUID().withMessage('Valid student ID is required'),
  body('amount').isFloat({ min: 0 }).withMessage('Amount must be positive'),
  body('method').isIn(['cash', 'bank', 'transfer', 'other']),
  body('currency').optional().isLength({ min: 3, max: 3 }).withMessage('Invalid currency code'),
  body('allowLiveRate').optional().isBoolean(),
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ success: false, error: errors.array()[0].msg });

      const { studentId, feeId, amount, method, reference, notes } = req.body;
      const schoolId = req.user!.schoolId!;
      const numericAmount = Number(amount);
      if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
        return res.status(400).json({ success: false, error: 'Amount must be greater than 0' });
      }

      // Idempotency: if a key is provided, check for an existing payment first
      const idempotencyKey = req.headers['idempotency-key'] as string | undefined;
      if (idempotencyKey) {
        const existing = await Payment.findOne({ where: { schoolId, idempotencyKey } });
        if (existing) {
          // Verify the request body matches the original to prevent key reuse
          const bodyMatches =
            existing.studentId === studentId &&
            existing.amount === numericAmount &&
            existing.method === method &&
            (existing.feeId || null) === (feeId || null);
          if (!bodyMatches) {
            throw new AppError(
              'Idempotency-Key was already used with different parameters',
              409,
              ErrorCode.IDEMPOTENCY_KEY_REUSED
            );
          }
          return res.status(200).json({ success: true, data: { payment: existing, idempotent: true } });
        }
      }

      // Multi-currency: the parent may hand over a currency other than the
      // school's accounting currency. The rate is resolved (and frozen) BEFORE
      // the balance check, because fees and balances live in the base currency.
      const paidCurrency = ((req.body as { currency?: string }).currency || (await getBaseCurrency(schoolId))).toUpperCase();
      const conversion = await convertForPayment({ schoolId, amount: numericAmount, from: paidCurrency });
      if (conversion.needsManualRate && conversion.rate === null) {
        return res.status(400).json({
          success: false,
          error: `Aucun taux de change disponible entre ${paidCurrency} et ${conversion.baseCurrency}. Enregistrez un taux avant d'encaisser.`,
          code: 'MISSING_RATE',
        });
      }
      if (conversion.needsManualRate && !(req.body as { allowLiveRate?: boolean }).allowLiveRate) {
        return res.status(400).json({
          success: false,
          error: `Aucun taux convenu pour ${paidCurrency} → ${conversion.baseCurrency}. Un taux live provisoire est disponible : confirmez explicitement pour l'utiliser.`,
          code: 'LIVE_RATE_CONFIRMATION_REQUIRED',
          liveRate: conversion.rate,
          baseAmount: conversion.baseAmount,
        });
      }
      // From here on, accounting always works in the base currency.
      const baseAmount = conversion.baseAmount;

      const payment = await sequelize.transaction(async (t) => {
        const student = await Student.findOne({ where: { id: studentId, schoolId }, transaction: t });
        if (!student) {
          const err = new Error('Student not found') as Error & { statusCode?: number };
          err.statusCode = 404;
          throw err;
        }

        let fee: Fee | null = null;
        if (feeId) {
          fee = await Fee.findOne({ where: { id: feeId, schoolId }, transaction: t });
          if (!fee) {
            const err = new Error('Fee not found') as Error & { statusCode?: number };
            err.statusCode = 404;
            throw err;
          }
          if (fee.studentId !== studentId) {
            const err = new Error('Fee does not belong to this student') as Error & { statusCode?: number };
            err.statusCode = 400;
            throw err;
          }
          const totalAmount = Number(fee.totalAmount ?? fee.amount);
          const remaining = totalAmount - Number(fee.paidAmount || 0);
          // Compare in the base currency: a 100 USD payment must be weighed
          // against a balance denominated in CDF.
          if (baseAmount > remaining) {
            const err = new Error(
              `Amount exceeds remaining balance (${remaining} ${conversion.baseCurrency})`
            ) as Error & { statusCode?: number };
            err.statusCode = 400;
            throw err;
          }
        }

        // Auto-generate unique reference if not provided (retry on collision)
        let paymentReference = reference;
        if (!paymentReference) {
          paymentReference = await generateUniqueReference(schoolId, new Date().getFullYear());
        } else {
          const clash = await Payment.findOne({ where: { schoolId, reference: paymentReference }, transaction: t });
          if (clash) {
            const err = new Error('Payment reference already exists') as Error & { statusCode?: number };
            err.statusCode = 400;
            throw err;
          }
        }

        const created = await Payment.create({
          schoolId,
          studentId,
          feeId: feeId || null,
          amount: numericAmount,
          method,
          reference: paymentReference,
          notes,
          receivedById: req.user!.id,
          date: new Date(),
          // Frozen at posting time: later rate changes never rewrite this.
          currency: paidCurrency,
          amountInBase: baseAmount,
          exchangeRate: conversion.rate,
          rateSource: conversion.rateSource,
          rateEffectiveFrom: conversion.rateEffectiveFrom,
          idempotencyKey: idempotencyKey || null,
        }, { transaction: t });

        // Fee balances always live in the base currency.
        if (fee) {
          const newPaidAmount = Number(fee.paidAmount || 0) + baseAmount;
          const totalAmount = Number(fee.totalAmount ?? fee.amount);
          await fee.update(
            { paidAmount: newPaidAmount, status: computeFeeStatus(newPaidAmount, totalAmount) },
            { transaction: t }
          );
        }

        return created;
      });

      await logAudit(req, {
        action: 'create',
        entity: 'payment',
        entityId: payment.id,
        details: {
          amount: numericAmount,
          currency: paidCurrency,
          amountInBase: baseAmount,
          rate: conversion.rate,
          rateSource: conversion.rateSource,
          reference: payment.reference,
        },
      });

      // Emit real-time event
      const student = await Student.findByPk(studentId, { attributes: ['firstName', 'lastName', 'studentId', 'classId'] });
      const fee = feeId ? await Fee.findByPk(feeId, { attributes: ['type'] }) : null;
      const studentClass = student?.classId ? await (await import('../models/index.js')).Class.findByPk(student.classId, { attributes: ['name'] }) : null;

      WebSocketEvents.payment.created(schoolId, {
        id: payment.id,
        amount: numericAmount,
        method: payment.method,
        reference: payment.reference,
        studentId: studentId,
        studentName: student ? `${student.lastName} ${student.firstName}` : 'Unknown',
        className: studentClass?.name,
        feeType: fee?.type,
        date: payment.date.toISOString(),
        action: 'created',
      });

      return res.status(201).json({ success: true, data: { payment, conversion } });
    } catch (error) {
      if (error instanceof AppError) {
        return res.status(error.statusCode).json({
          success: false,
          error: error.message,
          code: error.code,
        });
      }
      const statusCode = (error as Error & { statusCode?: number }).statusCode || 500;
      return res.status(statusCode).json({ success: false, error: (error as Error).message });
    }
  }
);

router.post('/:id/cancel',
  requireRole('super_admin', 'admin', 'director', 'accountant'),
  requirePermission('payments', 'create'),
  async (req: Request, res: Response) => {
    try {
      const { reason } = req.body as { reason?: string };
      const schoolId = req.user!.schoolId!;

      const result = await sequelize.transaction(async (t) => {
        const payment = await Payment.findOne({ where: { id: req.params.id, schoolId }, transaction: t });
        if (!payment) {
          const err = new Error('Payment not found') as Error & { statusCode?: number };
          err.statusCode = 404;
          throw err;
        }
        if (payment.status === 'cancelled') {
          const err = new Error('Payment is already cancelled') as Error & { statusCode?: number };
          err.statusCode = 400;
          throw err;
        }

        await payment.update({ status: 'cancelled' }, { transaction: t });

        let fee: Fee | null = null;
        if (payment.feeId) {
          fee = await Fee.findOne({ where: { id: payment.feeId, schoolId }, transaction: t });
          if (fee) {
            // Subtract the BASE amount that was actually credited, not the raw
            // foreign amount: the fee balance lives in the base currency.
            const credited = Number(payment.amountInBase || 0) || Number(payment.amount || 0);
            const newPaidAmount = Math.max(0, Number(fee.paidAmount || 0) - credited);
            const totalAmount = Number(fee.totalAmount ?? fee.amount);
            await fee.update(
              { paidAmount: newPaidAmount, status: computeFeeStatus(newPaidAmount, totalAmount) },
              { transaction: t }
            );
          }
        }

        return { payment, fee };
      });

      await logAudit(req, {
        action: 'cancel',
        entity: 'payment',
        entityId: result.payment.id,
        details: { amount: result.payment.amount, reason: reason || null },
      });

      // Emit real-time event
      const student = await Student.findByPk(result.payment.studentId, { attributes: ['firstName', 'lastName', 'studentId', 'classId'] });
      const fee = result.payment.feeId ? await Fee.findByPk(result.payment.feeId, { attributes: ['type'] }) : null;
      const studentClass = student?.classId ? await (await import('../models/index.js')).Class.findByPk(student.classId, { attributes: ['name'] }) : null;

      WebSocketEvents.payment.deleted(schoolId, {
        id: result.payment.id,
        amount: Number(result.payment.amount),
        method: result.payment.method,
        reference: result.payment.reference,
        studentId: result.payment.studentId,
        studentName: student ? `${student.lastName} ${student.firstName}` : 'Unknown',
        className: studentClass?.name,
        feeType: fee?.type,
        date: result.payment.date.toISOString(),
        action: 'deleted',
      });

      return res.json({ success: true, data: { payment: result.payment, fee: result.fee } });
    } catch (error) {
      if (error instanceof AppError) {
        return res.status(error.statusCode).json({
          success: false,
          error: error.message,
          code: error.code,
        });
      }
      const statusCode = (error as Error & { statusCode?: number }).statusCode || 500;
      return res.status(statusCode).json({ success: false, error: (error as Error).message });
    }
  }
);

router.get('/:id/receipt-data',
  requireRole(...READ_ROLES),
  requirePermission('payments', 'view'),
  async (req: Request, res: Response) => {
    try {
      const payment = await Payment.findOne({
        where: { id: req.params.id, schoolId: req.user!.schoolId! },
        include: [{ model: Student, as: 'student' }, { model: Fee, as: 'fee' }],
      });
      if (!payment) return res.status(404).json({ success: false, error: 'Payment not found' });
      const school = await School.findByPk(req.user!.schoolId!);
      return res.json({
        success: true,
        data: {
          payment,
          student: (payment as unknown as { student?: unknown }).student || null,
          fee: (payment as unknown as { fee?: unknown }).fee || null,
          school,
          verifyUrl: null,
        },
      });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

router.get('/:id',
  requireRole(...READ_ROLES),
  requirePermission('payments', 'view'),
  async (req: Request, res: Response) => {
  try {
    const payment = await Payment.findOne({
      where: { id: req.params.id, schoolId: req.user!.schoolId! },
      include: [{ model: Student, as: 'student' }, { model: Fee, as: 'fee' }],
    });
    if (!payment) return res.status(404).json({ success: false, error: 'Payment not found' });
    return res.json({ success: true, data: { payment } });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

export default router;
