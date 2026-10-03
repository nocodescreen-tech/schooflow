import { Router, Request, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { authenticateToken } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { AppError } from '../middleware/errorHandler.js';
import { logAudit } from '../middleware/auditLog.js';
import {
  CURRENCIES, COMMON_CURRENCIES, isKnownCurrency, getBaseCurrency, setBaseCurrency,
  listRates, setManualRate, getEffectiveRate, fetchLiveRates, getLiveRate,
  convertForPayment, convertAmount, formatMoney, currencyInfo,
} from '../services/CurrencyService.js';
import { requireModule } from '../utils/modules.js';

const router = Router();
router.use(authenticateToken);
router.use(requireModule('finance'));

function rejectInvalid(req: Request, res: Response): boolean {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ success: false, error: errors.array()[0].msg });
    return true;
  }
  return false;
}

/** Currency catalogue + the school's current base currency. */
router.get('/', requirePermission('finance', 'view'), async (req: Request, res: Response) => {
  try {
    const base = await getBaseCurrency(req.user!.schoolId);
    return res.json({
      success: true,
      data: {
        baseCurrency: base,
        currencies: CURRENCIES,
        common: COMMON_CURRENCIES,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/** Change the accounting currency. Existing amounts are never rewritten. */
router.put('/base', requirePermission('finance', 'create'),
  body('currency').trim().isLength({ min: 3, max: 3 }).withMessage('Code devise invalide (3 lettres)'),
  async (req: Request, res: Response) => {
    try {
      if (rejectInvalid(req, res)) return;
      const previous = await getBaseCurrency(req.user!.schoolId);
      const code = await setBaseCurrency(req.user!.schoolId, (req.body as { currency: string }).currency);
      await logAudit(req, {
        action: 'base_currency_changed',
        entity: 'school',
        entityId: req.user!.schoolId,
        details: { from: previous, to: code },
      });
      return res.json({ success: true, data: { baseCurrency: code, previous } });
    } catch (error) {
      const message = (error as Error).message;
      return res.status(/inconnue|introuvable/.test(message) ? 400 : 500).json({ success: false, error: message });
    }
  }
);

/** Rate history — appended over time, never edited. */
router.get('/rates', requirePermission('finance', 'view'),
  query('onlyManual').optional().isIn(['true', 'false']),
  async (req: Request, res: Response) => {
    try {
      const onlyManual = req.query.onlyManual === 'true';
      const rates = await listRates(req.user!.schoolId, { onlyManual });
      return res.json({ success: true, data: { items: rates } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

/** Record a manually agreed rate ("taux convenu"). */
router.post('/rates', requirePermission('finance', 'create'),
  body('from').trim().isLength({ min: 3, max: 3 }).withMessage('Devise source invalide'),
  body('to').trim().isLength({ min: 3, max: 3 }).withMessage('Devise cible invalide'),
  body('rate').isFloat({ gt: 0 }).withMessage('Taux invalide'),
  body('effectiveFrom').optional().isISO8601(),
  body('note').optional().trim(),
  async (req: Request, res: Response) => {
    try {
      if (rejectInvalid(req, res)) return;
      const { from, to, rate, effectiveFrom, note } = req.body as Record<string, string>;
      const row = await setManualRate(req.user!.schoolId, from, to, Number(rate), req.user!.id, {
        effectiveFrom: effectiveFrom ? new Date(effectiveFrom) : new Date(),
        note,
      });
      await logAudit(req, {
        action: 'exchange_rate_set',
        entity: 'exchange_rate',
        entityId: row.id,
        details: { from: row.fromCurrency, to: row.toCurrency, rate: Number(row.rate) },
      });
      return res.status(201).json({ success: true, data: { rate: row } });
    } catch (error) {
      const message = (error as Error).message;
      return res.status(/Devise|identiques/i.test(message) ? 400 : 500).json({ success: false, error: message });
    }
  }
);

/**
 * Live reference rates. Always advisory: it never overrides a manual rate and
 * never posts a payment on its own.
 */
router.get('/live', requirePermission('finance', 'view'),
  query('base').optional().isLength({ min: 3, max: 3 }),
  query('force').optional().isIn(['true', 'false']),
  async (req: Request, res: Response) => {
    try {
      const base = ((req.query.base as string) || (await getBaseCurrency(req.user!.schoolId))).toUpperCase();
      const force = req.query.force === 'true';
      const result = await fetchLiveRates(base, { force });
      if (!result.ok) {
        // Degrade gracefully: the UI shows manual rates instead of blocking.
        return res.json({
          success: true,
          data: { ok: false, provider: result.provider, error: result.error, rates: {} },
        });
      }
      // Only return the currencies the school actually cares about.
      const wanted = COMMON_CURRENCIES.map((c) => c.code);
      const filtered: Record<string, number> = {};
      for (const code of wanted) {
        const value = code === result.base.toUpperCase() ? 1 : result.rates[code];
        if (value) filtered[code] = value;
      }
      return res.json({
        success: true,
        data: {
          ok: true,
          provider: result.provider,
          base: result.base,
          rates: filtered,
          fetchedAt: result.fetchedAt,
          cached: result.cached,
          advisory: 'Taux de référence uniquement. Définissez un taux convenu pour la comptabilité.',
        },
      });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

/** The rate currently in force for a pair, plus the live reference for comparison. */
router.get('/rate', requirePermission('finance', 'view'),
  query('from').isLength({ min: 3, max: 3 }).withMessage('from requis'),
  query('to').isLength({ min: 3, max: 3 }).withMessage('to requis'),
  async (req: Request, res: Response) => {
    try {
      if (rejectInvalid(req, res)) return;
      const from = (req.query.from as string).toUpperCase();
      const to = (req.query.to as string).toUpperCase();
      if (!isKnownCurrency(from) || !isKnownCurrency(to)) {
        return res.status(400).json({ success: false, error: 'Devise inconnue' });
      }
      const effective = await getEffectiveRate(req.user!.schoolId, from, to);
      const live = await getLiveRate(from, to);
      return res.json({
        success: true,
        data: {
          from, to,
          effective: effective ?? null,
          live: live ?? null,
          // Warn when the two drift apart — a common sign the agreed rate is stale.
          divergence:
            effective && live && live.rate > 0
              ? Number((((effective.rate - live.rate) / live.rate) * 100).toFixed(2))
              : null,
        },
      });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

/**
 * Conversion preview used by the live cashier UI: type an amount, see what it
 * becomes in the base currency, and why.
 */
router.get('/convert', requirePermission('finance', 'view'),
  query('amount').isFloat().withMessage('Montant invalide'),
  query('from').isLength({ min: 3, max: 3 }).withMessage('from requis'),
  query('to').optional().isLength({ min: 3, max: 3 }),
  async (req: Request, res: Response) => {
    try {
      if (rejectInvalid(req, res)) return;
      const result = await convertForPayment({
        schoolId: req.user!.schoolId,
        amount: Number(req.query.amount),
        from: req.query.from as string,
        to: req.query.to as string | undefined,
      });
      return res.json({
        success: true,
        data: {
          ...result,
          formatted: {
            original: formatMoney(result.amount, result.currency),
            inBase: formatMoney(result.baseAmount, result.baseCurrency),
          },
        },
      });
    } catch (error) {
      return res.status(400).json({ success: false, error: (error as Error).message });
    }
  }
);

export default router;
