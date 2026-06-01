/**
 * Tiny i18n helpers for places where a <T> element can't be used — e.g. HTML
 * attributes (placeholder, title, aria-label) and React island strings.
 *
 * Language is stored in localStorage under "lang" and reflected on
 * <html data-lang="en|bn">. Default is English.
 */
export type Lang = 'en' | 'bn';

export const DEFAULT_LANG: Lang = 'en';

/** Read the current language on the client (falls back to default on server). */
export function getLang(): Lang {
  if (typeof document === 'undefined') return DEFAULT_LANG;
  const l = document.documentElement.getAttribute('data-lang');
  return l === 'bn' ? 'bn' : 'en';
}

/** Pick the right string for the current language. */
export function t(en: string, bn: string, lang: Lang = getLang()): string {
  return lang === 'bn' ? bn : en;
}
