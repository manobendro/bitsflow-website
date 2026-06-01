/** Shared formatting helpers. Primary market: Bangladesh (BDT). */

const BDT = new Intl.NumberFormat('en-BD', {
  style: 'currency',
  currency: 'BDT',
  maximumFractionDigits: 0,
});

/** Format an amount given in BDT *taka* (not paisa). e.g. 4500 -> "৳4,500". */
export function formatBDT(taka: number): string {
  return BDT.format(taka);
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
