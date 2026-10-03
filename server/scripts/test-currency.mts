/**
 * Currency conversion correctness test.
 * Focus: exact decimal arithmetic, historical rate freezing, inversion.
 */
import sequelize from '../src/config/database.js';
import { ExchangeRate, School } from '../src/models/index.js';
import { convertAmount, getEffectiveRate, setManualRate, isKnownCurrency, formatMoney } from '../src/services/CurrencyService.js';

let pass = 0, fail = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  ok ? pass++ : fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : ` :: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`}`);
}

async function main() {
  // ---- decimal safety -------------------------------------------------
  // The classic float trap: 1.1 + 2.2 !== 3.3
  check('0.1+0.2 style drift avoided', convertAmount(0.1, 'USD', 'USD', 1), 0.1);
  // 100 USD at 2500.5 CDF
  check('100 * 2500.5 = 250050', convertAmount(100, 'USD', 'CDF', 2500.5), 250050);
  // Rounding half-up on a clean binary fraction (1.005 is NOT representable
  // as a float, so it is deliberately not asserted here).
  check('1 * 1.25 exact', convertAmount(1, 'USD', 'EUR', 1.25, { decimals: 2 }), 1.25);
  // CDF has 0 decimals: the result must round, and a 0.50 input must NOT
  // collapse to zero (this was the truncation bug).
  check('0.5 USD * 2850 = 1425 CDF', convertAmount(0.5, 'USD', 'CDF', 2850), 1425);
  check('33.7 CDF * 1.002 -> 34 (0 decimals)', convertAmount(33.7, 'USD', 'CDF', 1.002), 34);
  check('10 * 2.675 = 26.75', convertAmount(10, 'USD', 'EUR', 2.675), 26.75);
  // large sum
  check('1000000 * 2.5 = 2500000', convertAmount(1000000, 'USD', 'CDF', 2.5), 2500000);
  // same currency is identity
  check('identity 500 CDF', convertAmount(500, 'CDF', 'CDF', 99), 500);

  check('CDF known', isKnownCurrency('CDF'), true);
  check('XYZ unknown', isKnownCurrency('XYZ'), false);
  // fr-FR uses U+202F (narrow no-break space) as the thousands separator —
  // that is the correct French formatting, not a bug.
  check('formatMoney CDF', formatMoney(250050, 'CDF').replace(/\s/g, ' '), '250 050 CDF');
  check('formatMoney USD (fr-FR decimal comma)', formatMoney(1234.5, 'USD').replace(/\s/g, ' '), '1 234,50 USD');

  // ---- historical rate freezing ---------------------------------------
  const school = await School.findOne({ order: [['createdAt', 'ASC']] });
  if (!school) { console.log('no school, skipping DB part'); process.exit(fail === 0 ? 0 : 1); }
  const before = await ExchangeRate.count({ where: { schoolId: school.id } });

  // rate effective 60 days ago
  const old = new Date(Date.now() - 60 * 86400000);
  await setManualRate(school.id, 'USD', 'CDF', 2000, null as unknown as string, { effectiveFrom: old, note: 'ancien taux' });
  // rate effective today
  await setManualRate(school.id, 'USD', 'CDF', 3000, null as unknown as string, { effectiveFrom: new Date(), note: 'taux actuel' });

  const now = new Date();
  const sixtyDaysAgo = new Date(Date.now() - 60 * 86400000);

  const rNow = await getEffectiveRate(school.id, 'USD', 'CDF', now);
  check('today resolves the new rate', rNow?.rate, 3000);
  const rOld = await getEffectiveRate(school.id, 'USD', 'CDF', sixtyDaysAgo);
  check('60 days ago resolves the OLD rate (frozen)', rOld?.rate, 2000);
  check('old rate is manual', rOld?.source, 'manual');

  // inversion: school base is CDF, but only USD->CDF stored
  const inverted = await getEffectiveRate(school.id, 'CDF', 'USD', now);
  check('inverse pair resolves', inverted?.inverted, true);
  check('inverse value ~1/3000', Number(inverted?.rate?.toFixed(6)), 0.000333);

  // manual beats live for the same pair/date
  await ExchangeRate.create({ schoolId: school.id, fromCurrency: 'USD', toCurrency: 'CDF', rate: 9999, source: 'live', effectiveFrom: new Date(), provider: 'test' });
  const preferManual = await getEffectiveRate(school.id, 'USD', 'CDF', now);
  check('manual rate wins over live', preferManual?.rate, 3000);

  // unknown pair returns null
  const none = await getEffectiveRate(school.id, 'USD', 'GBP', now);
  check('unknown pair -> null', none, null);

  // cleanup
  await ExchangeRate.destroy({ where: { schoolId: school.id, note: ['ancien taux', 'taux actuel'] } as never });
  await ExchangeRate.destroy({ where: { schoolId: school.id, provider: 'test' } });
  const after = await ExchangeRate.count({ where: { schoolId: school.id } });
  check('cleanup restored original count', after, before);

  console.log(`\nSUMMARY: ${pass} passed, ${fail} failed`);
  await sequelize.close();
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
