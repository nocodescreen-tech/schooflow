export type CurrencyCode = 'USD' | 'CDF' | 'EUR' | 'GBP';

export const CURRENCY_SYMBOLS: Record<CurrencyCode, string> = {
  USD: '$',
  CDF: 'FC',
  EUR: '€',
  GBP: '£',
};

export const CURRENCY_LABELS: Record<CurrencyCode, string> = {
  USD: 'USD ($)',
  CDF: 'CDF (FC)',
  EUR: 'EUR (€)',
  GBP: 'GBP (£)',
};

/**
 * Format an amount with the given currency.
 * USD: $1,234.56
 * CDF: 1.234,56 FC
 * EUR: 1.234,56 €
 * GBP: £1,234.56
 */
export function formatCurrency(amount: number, currency: CurrencyCode = 'USD'): string {
  const locale = currency === 'USD' || currency === 'GBP' ? 'en-US' : 'fr-FR';
  const formatted = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);

  // For CDF, Intl renders "CDF 1,234.56" — normalize to "1.234,56 FC"
  if (currency === 'CDF') {
    const numeric = new Intl.NumberFormat('fr-FR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
    return `${numeric} FC`;
  }

  return formatted;
}

/**
 * Get the symbol for a currency code.
 */
export function getCurrencySymbol(currency: CurrencyCode): string {
  return CURRENCY_SYMBOLS[currency];
}
