/**
 * Post-login redirect helpers.
 *
 * `?next=` comes from the URL, so it's attacker-controllable. Only accept a
 * same-origin *relative path*; anything else falls back to the dashboard. This
 * blocks open redirects like `//evil.com`, `/\evil.com`, `https://evil.com`,
 * `javascript:…`, and tricks with tabs/newlines that browsers strip from URLs.
 */
export const DEFAULT_AFTER_LOGIN = '/dashboard';

export function safeNextPath(
  raw: string | null | undefined,
  fallback: string = DEFAULT_AFTER_LOGIN
): string {
  if (!raw) return fallback;
  const v = raw.trim();
  if (!v.startsWith('/')) return fallback; // relative paths only (no protocol)
  if (v.startsWith('//') || v.startsWith('/\\')) return fallback; // protocol-relative
  // Backslashes are normalised to "/" by browsers; control chars/whitespace are
  // stripped — both can smuggle a "//host". Reject outright.
  if (/[\\\u0000-\u001f\u007f\s]/.test(v)) return fallback;
  // Don't bounce straight back to the login page.
  if (/^\/login(?:[/?#]|$)/.test(v)) return fallback;
  if (typeof window !== 'undefined') {
    try {
      const url = new URL(v, window.location.origin);
      if (url.origin !== window.location.origin) return fallback;
      return url.pathname + url.search + url.hash;
    } catch {
      return fallback;
    }
  }
  return v;
}

/** The validated `?next=` of the current page (or the default). */
export function nextFromLocation(fallback: string = DEFAULT_AFTER_LOGIN): string {
  if (typeof window === 'undefined') return fallback;
  return safeNextPath(new URLSearchParams(window.location.search).get('next'), fallback);
}

/** `/login?next=<current page>` — send someone to sign in and bring them back. */
export function loginHrefForHere(): string {
  if (typeof window === 'undefined') return '/login';
  const here = window.location.pathname + window.location.search;
  return `/login?next=${encodeURIComponent(here)}`;
}
