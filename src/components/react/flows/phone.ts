/**
 * Friendly Bangladesh mobile-number handling.
 *
 * Accepts the common ways people type their number — "01712345678",
 * "01712-345678", "+880 1712 345678", "8801712345678" — and normalises to the
 * 11-digit local form (01XXXXXXXXX). Valid BD mobile prefixes are 013–019.
 */
export function normalizeBDPhone(raw: string): string | null {
  const digits = raw.replace(/[\s\-().]/g, '');
  let local: string | null = null;
  if (/^\+?880\d+$/.test(digits)) local = '0' + digits.replace(/^\+?880/, '');
  else if (/^\d+$/.test(digits)) local = digits;
  if (!local) return null;
  return /^01[3-9]\d{8}$/.test(local) ? local : null;
}

export function isValidBDPhone(raw: string): boolean {
  return normalizeBDPhone(raw) !== null;
}
