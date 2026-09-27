/** Shared formatting helpers. Primary market: Bangladesh (BDT). */

/**
 * Format an amount given in BDT *taka* (not paisa). e.g. 4500 -> "৳4,500",
 * -250 -> "-৳250".
 *
 * Deliberately NOT Intl-based: `Intl.NumberFormat('en-BD', {currency:'BDT'})`
 * renders differently per runtime (Node: "BDT 4,500", browsers: "৳4,500"),
 * which breaks React hydration of server-rendered prices. This is identical
 * everywhere: whole taka, Western 3-digit grouping, "৳" with no space.
 */
export function formatBDT(taka: number): string {
  const n = Math.round(Number(taka) || 0);
  const sign = n < 0 ? '-' : '';
  const grouped = String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}৳${grouped}`;
}

/** Format an amount stored in the smallest unit (paisa) -> taka string. */
export function formatPaisa(paisa: number): string {
  return formatBDT(Math.round(paisa) / 100);
}

const DATE_OPTS: Intl.DateTimeFormatOptions = {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
};
const DATE_EN = new Intl.DateTimeFormat('en-GB', DATE_OPTS);
const DATE_BN = new Intl.DateTimeFormat('bn-BD', DATE_OPTS);

/** Format a date. In Bengali ('bn') uses native month names + numerals. */
export function formatDate(
  input: Date | number | string,
  lang: 'en' | 'bn' = 'en'
): string {
  const d = input instanceof Date ? input : new Date(input);
  return (lang === 'bn' ? DATE_BN : DATE_EN).format(d);
}

const DATETIME_OPTS: Intl.DateTimeFormatOptions = {
  ...DATE_OPTS,
  hour: 'numeric',
  minute: '2-digit',
};
const DATETIME_EN = new Intl.DateTimeFormat('en-GB', DATETIME_OPTS);
const DATETIME_BN = new Intl.DateTimeFormat('bn-BD', DATETIME_OPTS);

/** Format a date + time, e.g. "12 Mar 2026, 14:05". */
export function formatDateTime(
  input: Date | number | string,
  lang: 'en' | 'bn' = 'en'
): string {
  const d = input instanceof Date ? input : new Date(input);
  return (lang === 'bn' ? DATETIME_BN : DATETIME_EN).format(d);
}

/** Percent saved vs. a compare-at price (whole number), or 0 if no saving. */
export function percentOff(price: number, compareAt?: number): number {
  if (!compareAt || compareAt <= price || compareAt <= 0) return 0;
  return Math.round((1 - price / compareAt) * 100);
}
