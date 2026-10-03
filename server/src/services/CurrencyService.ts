import { Op } from 'sequelize';
import { ExchangeRate, School } from '../models/index.js';

/**
 * CurrencyService — multi-currency for the school's internal finance.
 *
 * Design rules (these are accounting rules, not preferences):
 *
 * 1. A school has ONE base currency (its accounting currency). Fees are
 *    always expressed in it.
 * 2. A payment may be received in another currency. It is converted and the
 *    rate is FROZEN on the payment. Later rate changes never rewrite it.
 * 3. The MANUAL rate is authoritative — it is the "taux convenu" the school
 *    agrees with parents. A LIVE rate is a convenience for the cashier and is
 *    flagged as provisional; it is never applied to a posted payment without
 *    the school explicitly choosing it.
 * 4. All arithmetic is done in integer minor units. Binary floats round
 *    money wrong (1.005 * 100 = 100.49999...), which matters when a rate is
 *    ~2500 CDF per USD.
 */

export interface CurrencyInfo {
  code: string;
  name: string;
  symbol: string;
  /** Number of decimals normally used. */
  decimals: number;
  /** Currencies a Congolese school realistically handles. */
  common: boolean;
}

export const CURRENCIES: CurrencyInfo[] = [
  { code: 'CDF', name: 'Franc congolais', symbol: 'FC', decimals: 0, common: true },
  { code: 'USD', name: 'Dollar américain', symbol: '$', decimals: 2, common: true },
  { code: 'EUR', name: 'Euro', symbol: '€', decimals: 2, common: true },
  { code: 'GBP', name: 'Livre sterling', symbol: '£', decimals: 2, common: false },
  { code: 'ZAR', name: 'Rand sud-africain', symbol: 'R', decimals: 2, common: false },
  { code: 'CNY', name: 'Yuan chinois', symbol: '¥', decimals: 2, common: false },
  { code: 'AOA', name: 'Kwanza angolais', symbol: 'Kz', decimals: 2, common: false },
  { code: 'BIF', name: 'Franc burundais', symbol: 'FBu', decimals: 0, common: false },
  { code: 'XAF', name: 'Franc CFA (BEAC)', symbol: 'FCFA', decimals: 0, common: false },
];

export const COMMON_CURRENCIES = CURRENCIES.filter((c) => c.common);

const CURRENCY_CODES = new Set(CURRENCIES.map((c) => c.code));

export function isKnownCurrency(code: string): boolean {
  return CURRENCY_CODES.has(code.toUpperCase());
}

export function currencyInfo(code: string): CurrencyInfo | undefined {
  return CURRENCIES.find((c) => c.code === code.toUpperCase());
}

// ───────────────────────────── Decimal-safe arithmetic ─────────────────────────────

/** Scales a decimal string/number to an integer of `decimals` places. */
function toScaled(value: number, decimals: number): bigint {
  // Avoid float multiplication: go through the shortest round-trip string.
  const s = value.toFixed(decimals);
  const neg = s.startsWith('-');
  const abs = neg ? s.slice(1) : s;
  const [intPart, fracPart = ''] = abs.split('.');
  const padded = (fracPart + '0'.repeat(decimals)).slice(0, decimals);
  const combined = `${intPart}${padded}`.replace(/^0+(?=\d)/, '');
  const big = BigInt(combined || '0');
  return neg ? -big : big;
}

function fromScaled(scaled: bigint, decimals: number): number {
  const neg = scaled < 0n;
  const abs = neg ? -scaled : scaled;
  const s = abs.toString().padStart(decimals + 1, '0');
  const intPart = s.slice(0, s.length - decimals);
  const fracPart = decimals > 0 ? s.slice(s.length - decimals) : '';
  const out = decimals > 0 ? `${intPart}.${fracPart}` : intPart;
  return Number(neg ? `-${out}` : out);
}

/**
 * Rounds the quotient n/d to the nearest integer, halves going up.
 * Must be a true division round — an earlier `(n + 5) / 10` shortcut divided
 * the result by 10 and silently under-reported every amount.
 */
function divRoundHalfUp(n: bigint, d: bigint): bigint {
  if (d === 0n) throw new Error('Division par zéro');
  const neg = (n < 0n) !== (d < 0n);
  const num = n < 0n ? -n : n;
  const den = d < 0n ? -d : d;
  const q = num / den;
  const r = num % den;
  if (r === 0n) return neg ? -q : q;
  const twice = r * 2n;
  const rounded = twice >= den ? q + 1n : q;
  return neg ? -rounded : rounded;
}

export interface ConvertOptions {
  /** Decimal places of the resulting amount. Defaults to the target currency's. */
  decimals?: number;
}

/**
 * Converts an amount between currencies using exact decimal arithmetic.
 * `rate` is how many `to` one `from` buys.
 */
export function convertAmount(
  amount: number,
  fromCode: string,
  toCode: string,
  rate: number,
  options: ConvertOptions = {}
): number {
  if (!Number.isFinite(amount)) throw new Error('Montant invalide');
  if (!Number.isFinite(rate) || rate <= 0) throw new Error('Taux invalide');
  if (fromCode.toUpperCase() === toCode.toUpperCase()) return amount;

  const outDecimals = options.decimals ?? currencyInfo(toCode)?.decimals ?? 2;
  // Work at a fixed high precision, then round ONCE to the target decimals.
  // Scaling the input by the OUTPUT decimals truncates it: 0.50 USD into CDF
  // (0 decimals) would collapse to 0 before the rate was even applied.
  const WORK = 8;

  const amountScaled = toScaled(amount, WORK);
  const rateScaled = toScaled(rate, WORK);

  // raw = amount * rate, still carrying WORK decimals
  const rawScaled = divRoundHalfUp(amountScaled * rateScaled, 10n ** BigInt(WORK));

  // single rounding step down to the target precision
  const shrink = WORK - outDecimals;
  const resultScaled = shrink > 0 ? divRoundHalfUp(rawScaled, 10n ** BigInt(shrink)) : rawScaled;

  return fromScaled(resultScaled, outDecimals);
}

// ───────────────────────────── Base currency ─────────────────────────────

export async function getBaseCurrency(schoolId: string): Promise<string> {
  const school = await School.findByPk(schoolId, { attributes: ['currency'] });
  const code = (school?.currency || 'USD').toUpperCase();
  return isKnownCurrency(code) ? code : 'USD';
}

/** Updates the school's accounting currency. Existing amounts are untouched. */
export async function setBaseCurrency(schoolId: string, currency: string): Promise<string> {
  const code = currency.toUpperCase();
  if (!isKnownCurrency(code)) throw new Error(`Devise inconnue : ${currency}`);
  const school = await School.findByPk(schoolId);
  if (!school) throw new Error('Établissement introuvable');
  await school.update({ currency: code });
  return code;
}

// ───────────────────────────── Rates ─────────────────────────────

export interface ResolvedRate {
  from: string;
  to: string;
  rate: number;
  source: 'manual' | 'live';
  effectiveFrom: Date;
  provider: string | null;
  /** true when the rate was derived by inverting another pair. */
  inverted: boolean;
  /** Present when no rate could be found. */
  missing?: boolean;
}

/**
 * Finds the rate to use on a given date: the most recent row whose
 * effectiveFrom is on or before that date. Manual rates win over live ones
 * when both are available for the same pair.
 */
export async function getEffectiveRate(
  schoolId: string,
  from: string,
  to: string,
  at: Date = new Date()
): Promise<ResolvedRate | null> {
  const f = from.toUpperCase();
  const t = to.toUpperCase();
  if (f === t) {
    return { from: f, to: t, rate: 1, source: 'manual', effectiveFrom: at, provider: null, inverted: false };
  }

  const direct = await findRate(schoolId, f, t, at);
  if (direct) return direct;

  // Try the inverse pair (e.g. school accounts in USD, rate stored as USD→CDF).
  const inverse = await findRate(schoolId, t, f, at);
  if (inverse && inverse.rate > 0) {
    return {
      from: f,
      to: t,
      // Invert at full precision, then round down to 8 decimals.
      rate: Number((1 / inverse.rate).toFixed(8)),
      source: inverse.source,
      effectiveFrom: inverse.effectiveFrom,
      provider: inverse.provider,
      inverted: true,
    };
  }

  return null;
}

async function findRate(
  schoolId: string,
  from: string,
  to: string,
  at: Date
): Promise<ResolvedRate | null> {
  const rows = await ExchangeRate.findAll({
    where: {
      schoolId,
      fromCurrency: from,
      toCurrency: to,
      effectiveFrom: { [Op.lte]: at },
    },
    order: [['effectiveFrom', 'DESC'], ['createdAt', 'DESC']],
  });
  if (rows.length === 0) return null;
  // Prefer a manual rate over a live one for the same date.
  const row = rows.find((r) => r.source === 'manual') ?? rows[0];
  return {
    from,
    to,
    rate: Number(row.rate),
    source: row.source,
    effectiveFrom: row.effectiveFrom,
    provider: row.provider,
    inverted: false,
  };
}

/**
 * Records a manually agreed rate. This APPENDS; it never edits an existing
 * row, so a payment posted last month still resolves to the rate that was in
 * force back then.
 */
export async function setManualRate(
  schoolId: string,
  from: string,
  to: string,
  rate: number,
  userId: string,
  options: { effectiveFrom?: Date; note?: string } = {}
): Promise<ExchangeRate> {
  const f = from.toUpperCase();
  const t = to.toUpperCase();
  if (!isKnownCurrency(f) || !isKnownCurrency(t)) throw new Error('Devise inconnue');
  if (f === t) throw new Error('Devise source et cible identiques');
  if (!Number.isFinite(rate) || rate <= 0) throw new Error('Taux invalide');

  return ExchangeRate.create({
    schoolId,
    fromCurrency: f,
    toCurrency: t,
    rate,
    effectiveFrom: options.effectiveFrom ?? new Date(),
    source: 'manual',
    setBy: userId,
    note: options.note ?? null,
  });
}

export async function listRates(
  schoolId: string,
  options: { limit?: number; onlyManual?: boolean } = {}
): Promise<ExchangeRate[]> {
  return ExchangeRate.findAll({
    where: { schoolId, ...(options.onlyManual ? { source: 'manual' } : {}) },
    order: [['effectiveFrom', 'DESC'], ['createdAt', 'DESC']],
    limit: options.limit ?? 200,
  });
}

// ───────────────────────────── Live rates ─────────────────────────────

/**
 * Fetches live reference rates from a free, key-less provider.
 *
 * This is deliberately a *reference*, not an accounting source:
 *  - it never overrides a manual rate
 *  - it is cached in-process
 *  - it degrades gracefully (returns null) so the UI can fall back to the
 *    school's manual rate instead of blocking the cashier
 */
const LIVE_CACHE_TTL_MS = 10 * 60 * 1000;
let liveCache: { data: Record<string, number>; fetchedAt: number; provider: string } | null = null;

export interface LiveRateResult {
  ok: boolean;
  provider: string;
  base: string;
  rates: Record<string, number>;
  fetchedAt: string;
  /** Set when the fetch failed; callers fall back to manual rates. */
  error?: string;
  /** true when the value came from cache rather than a fresh call. */
  cached: boolean;
}

export async function fetchLiveRates(
  base: string = 'USD',
  options: { force?: boolean } = {}
): Promise<LiveRateResult> {
  const now = Date.now();
  if (!options.force && liveCache && now - liveCache.fetchedAt < LIVE_CACHE_TTL_MS && liveCache.provider) {
    return { ok: true, provider: liveCache.provider, base, rates: liveCache.data, fetchedAt: new Date(liveCache.fetchedAt).toISOString(), cached: true };
  }

  const provider = 'open.er-api.com';
  const url = `https://open.er-api.com/v6/latest/${encodeURIComponent(base.toUpperCase())}`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as { result?: string; base_code?: string; rates?: Record<string, number> };
    if (json.result !== 'success' || !json.rates) throw new Error('Réponse inattendue du fournisseur');

    liveCache = { data: json.rates, fetchedAt: now, provider };
    return {
      ok: true,
      provider,
      base: json.base_code ?? base.toUpperCase(),
      rates: json.rates,
      fetchedAt: new Date(now).toISOString(),
      cached: false,
    };
  } catch (error) {
    return {
      ok: false,
      provider,
      base: base.toUpperCase(),
      rates: {},
      fetchedAt: new Date(now).toISOString(),
      error: (error as Error).message,
      cached: false,
    };
  }
}

/** A live rate for one pair, or null when unavailable. */
export async function getLiveRate(
  from: string,
  to: string,
  base = 'USD'
): Promise<{ rate: number; provider: string; fetchedAt: string } | null> {
  const f = from.toUpperCase();
  const t = to.toUpperCase();
  if (f === t) return { rate: 1, provider: 'identity', fetchedAt: new Date().toISOString() };

  const live = await fetchLiveRates(base);
  if (!live.ok) return null;

  const fRate = f === live.base.toUpperCase() ? 1 : live.rates[f];
  const tRate = t === live.base.toUpperCase() ? 1 : live.rates[t];
  if (!fRate || !tRate) return null;

  return {
    rate: Number((tRate / fRate).toFixed(8)),
    provider: live.provider,
    fetchedAt: live.fetchedAt,
  };
}

// ───────────────────────────── Conversion for payments ─────────────────────────────

export interface ConversionRequest {
  schoolId: string;
  amount: number;
  from: string;
  /** Defaults to the school's base currency. */
  to?: string;
  /** Which rate to use. Manual is the default and the only safe one to post. */
  prefer?: 'manual' | 'live';
  at?: Date;
}

export interface ConversionResult {
  amount: number;
  currency: string;
  baseAmount: number;
  baseCurrency: string;
  /** null when no conversion was needed or no rate was available. */
  rate: number | null;
  rateSource: 'manual' | 'live' | 'none';
  rateEffectiveFrom: Date | null;
  provider: string | null;
  /** true when a live rate would be needed but none is available. */
  needsManualRate: boolean;
  warnings: string[];
}

/**
 * Converts an amount into the school's base currency, choosing the rate.
 * Returns everything needed to freeze the decision on a payment.
 */
export async function convertForPayment(req: ConversionRequest): Promise<ConversionResult> {
  const warnings: string[] = [];
  const base = (await getBaseCurrency(req.schoolId));
  const from = req.from.toUpperCase();
  const to = (req.to ?? base).toUpperCase();

  if (from === to) {
    return {
      amount: req.amount,
      currency: from,
      baseAmount: req.amount,
      baseCurrency: to,
      rate: 1,
      rateSource: 'none',
      rateEffectiveFrom: null,
      provider: null,
      needsManualRate: false,
      warnings,
    };
  }

  const effective = await getEffectiveRate(req.schoolId, from, to, req.at ?? new Date());
  if (effective) {
    const baseAmount = convertAmount(req.amount, from, to, effective.rate);
    if (effective.source === 'live') {
      warnings.push('Taux de référence (live) utilisé. Pour une comptabilité fiable, definez un taux convenu.');
    }
    return {
      amount: req.amount,
      currency: from,
      baseAmount,
      baseCurrency: to,
      rate: effective.rate,
      rateSource: effective.source,
      rateEffectiveFrom: effective.effectiveFrom,
      provider: effective.provider,
      needsManualRate: false,
      warnings,
    };
  }

  // No stored rate: offer a live one as a preview, clearly provisional.
  const live = await getLiveRate(from, to);
  if (live) {
    warnings.push(
      'Aucun taux convenu enregistré pour cette paire. Le taux live est provisoire : enregistrez un taux manuel avant d’encaisser.'
    );
    return {
      amount: req.amount,
      currency: from,
      baseAmount: convertAmount(req.amount, from, to, live.rate),
      baseCurrency: to,
      rate: live.rate,
      rateSource: 'live',
      rateEffectiveFrom: null,
      provider: live.provider,
      needsManualRate: true,
      warnings,
    };
  }

  return {
    amount: req.amount,
    currency: from,
    baseAmount: req.amount,
    baseCurrency: to,
    rate: null,
    rateSource: 'none',
    rateEffectiveFrom: null,
    provider: null,
    needsManualRate: true,
    warnings: [
      `Aucun taux disponible entre ${from} et ${to}. Enregistrez un taux manuel avant d’encaisser dans cette devise.`,
    ],
  };
}

/** Formats an amount with its currency, for receipts and lists. */
export function formatMoney(amount: number, currency: string, locale = 'fr-FR'): string {
  const info = currencyInfo(currency);
  const decimals = info?.decimals ?? 2;
  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(Number(amount) || 0);
  return `${formatted} ${currency.toUpperCase()}`;
}
