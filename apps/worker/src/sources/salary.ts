export interface SalaryRange {
  min: number;
  max: number;
}

// Anything that is not clearly per year, or not clearly USD.
const NOT_USD_YEARLY = /hour|\bhr\b|\/h\b|month|week|\bday\b|€|£|\beur\b|\bgbp\b|\bcad\b|\baud\b/i;
const AMOUNT = /\$\s*(\d+(?:[.,]\d+)?)\s*(k)?/gi;
const PLAUSIBLE_YEARLY = { min: 10_000, max: 1_000_000 };

/**
 * Parses free-text salaries such as "$170k - $200k", "$35,3k- $52k" or
 * "$120,000 - $150,000". Returns null for anything hourly, non-USD, or
 * ambiguous: no number is better than a wrong one.
 */
export function parseUsdYearlyRange(text: string): SalaryRange | null {
  if (!text.trim() || NOT_USD_YEARLY.test(text)) return null;

  const amounts = [...text.matchAll(AMOUNT)].map(([, digits = '', k]) => toNumber(digits, k));
  if (amounts.length === 0 || amounts.length > 2) return null;

  const [a = 0, b = a] = amounts;
  const range = { min: Math.min(a, b), max: Math.max(a, b) };
  const plausible = range.min >= PLAUSIBLE_YEARLY.min && range.max <= PLAUSIBLE_YEARLY.max;
  return plausible ? range : null;
}

function toNumber(digits: string, k: string | undefined): number {
  // With a "k" the separator is a decimal point ("35,3k" = 35,300);
  // without one it separates thousands ("120,000").
  if (k) return Math.round(parseFloat(digits.replace(',', '.')) * 1000);
  return parseInt(digits.replace(/[.,]/g, ''), 10);
}
