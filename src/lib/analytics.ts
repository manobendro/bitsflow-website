/**
 * Analytics (Firebase Analytics → GA4) — one small API for the whole site.
 *
 * Modes, decided once per page load:
 *   live  — production build + measurement ID + supported browser + no privacy
 *           signal (Global Privacy Control / Do-Not-Track) + not an /admin page.
 *           Loads `firebase/analytics` after the page has loaded and sends to GA4.
 *   debug — `astro dev`. Nothing leaves the browser: events go to the console
 *           and to sessionStorage["bf:analytics"] (the E2E suite asserts on it).
 *   off   — everything else (emulator builds, privacy signal, admin, SSR).
 *
 * Privacy (the audience includes children): Google signals and ad
 * personalisation are disabled, and `track()` drops anything that looks like
 * PII — email addresses, phone numbers, and name/address/contact keys.
 *
 * Declarative "custom tags": any element with `data-track="<cta_id>"` logs
 * `cta_click` { cta_id, location, link_url } when clicked. Extra
 * `data-track-<param>` attributes become params; `data-track-event` overrides
 * the event name. A `<details data-track=…>` fires when it is opened.
 *
 * Event catalogue: see the "Analytics" section in CLAUDE.md.
 */
import type { CatalogProduct } from './catalog';

type Mode = 'live' | 'debug' | 'off';
type Primitive = string | number | boolean;

export interface AnalyticsItem {
  item_id: string;
  item_name: string;
  item_category?: string;
  price?: number;
  quantity?: number;
  index?: number;
  item_list_id?: string;
  item_list_name?: string;
}

export type EventParams = Record<string, Primitive | AnalyticsItem[] | null | undefined>;

interface State {
  mode: Mode;
  started: boolean;
  ready: boolean;
  queue: [string, Record<string, unknown>][];
  pendingProps: Record<string, Primitive>;
  send?: (name: string, params: Record<string, unknown>) => void;
  setProps?: (props: Record<string, Primitive>) => void;
}

const GLOBAL_KEY = '__bitsflowAnalytics';
const LOG_KEY = 'bf:analytics';
const GA_DEBUG_KEY = 'bf:ga_debug';
const MEASUREMENT_ID = import.meta.env.PUBLIC_FIREBASE_MEASUREMENT_ID as string | undefined;
const EMULATOR_BUILD = import.meta.env.PUBLIC_USE_EMULATORS === 'true';

// GA4 limits: event names ≤ 40 chars; param values ≤ 100 chars.
const EVENT_NAME = /^[a-z][a-z0-9_]{0,39}$/;
const PII_KEYS = new Set([
  'email',
  'phone',
  'name',
  'full_name',
  'first_name',
  'last_name',
  'address',
  'line1',
  'line2',
  'city',
  'district',
  'postcode',
  'customer',
  'shipping',
  'uid',
  'password',
]);
const EMAIL_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const BD_PHONE_RE = /(?:\+?88)?01[3-9]\d{8}/;

// State lives on `window` so every bundle chunk shares one queue.
function state(): State | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as Record<string, State | undefined>;
  if (!w[GLOBAL_KEY]) {
    w[GLOBAL_KEY] = { mode: decideMode(), started: false, ready: false, queue: [], pendingProps: {} };
  }
  return w[GLOBAL_KEY]!;
}

function decideMode(): Mode {
  // Staff pages are never measured (checked first so dev mirrors production).
  if (location.pathname.startsWith('/admin')) return 'off';
  if (import.meta.env.DEV) return 'debug';
  if (EMULATOR_BUILD || !MEASUREMENT_ID) return 'off';
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
  if (nav.globalPrivacyControl === true || nav.doNotTrack === '1') return 'off';
  return 'live';
}

/** Strip PII and enforce GA4 value limits. */
function clean(params: EventParams = {}): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value == null || PII_KEYS.has(key)) continue;
    if (typeof value === 'string') {
      const compact = value.replace(/[\s-]/g, '');
      if (EMAIL_RE.test(value) || BD_PHONE_RE.test(compact)) continue;
      out[key] = value.slice(0, 100);
    } else if (Array.isArray(value)) {
      out[key] = value.slice(0, 50);
    } else {
      out[key] = value;
    }
  }
  return out;
}

function debugLog(name: string, params: Record<string, unknown>) {
  // eslint-disable-next-line no-console
  console.debug('[analytics]', name, params);
  try {
    const log = JSON.parse(sessionStorage.getItem(LOG_KEY) || '[]') as unknown[];
    log.push({ name, params, path: location.pathname, t: Date.now() });
    sessionStorage.setItem(LOG_KEY, JSON.stringify(log.slice(-500)));
  } catch {
    /* storage unavailable — console only */
  }
}

/** Log an event. Safe to call anywhere (no-op on the server / when off). */
export function track(name: string, params?: EventParams): void {
  const s = state();
  if (!s || s.mode === 'off') return;
  if (!EVENT_NAME.test(name)) {
    if (s.mode === 'debug') console.warn(`[analytics] invalid event name "${name}"`);
    return;
  }
  const p = clean(params);
  if (s.mode === 'debug') return debugLog(name, p);
  if (s.ready && s.send) s.send(name, p);
  else if (s.queue.length < 50) s.queue.push([name, p]);
}

/** Set GA4 user properties (names ≤ 24 chars, values ≤ 36 chars). */
export function setUserProps(props: Record<string, Primitive>): void {
  const s = state();
  if (!s || s.mode === 'off') return;
  const safe: Record<string, Primitive> = {};
  for (const [k, v] of Object.entries(props)) {
    safe[k.slice(0, 24)] = typeof v === 'string' ? v.slice(0, 36) : v;
  }
  if (s.mode === 'debug') return debugLog('user_properties', safe);
  if (s.ready && s.setProps) s.setProps(safe);
  else Object.assign(s.pendingProps, safe);
}

/** GA4 e-commerce item from a catalog product (English name for consistent reports). */
export function productItem(
  p: Pick<CatalogProduct, 'id' | 'name' | 'category' | 'price'>,
  extra: Partial<AnalyticsItem> = {}
): AnalyticsItem {
  return { item_id: p.id, item_name: p.name, item_category: p.category, price: p.price, ...extra };
}

// ---------------------------------------------------------------------------

/** Start analytics for this page. Idempotent; call once from BaseLayout. */
export function initAnalytics(): void {
  const s = state();
  if (!s || s.started) return;
  s.started = true;
  if (s.mode === 'off') return;

  installAutoTracking();
  setUserProps({
    ui_language: document.documentElement.getAttribute('data-lang') === 'bn' ? 'bn' : 'en',
  });

  if (s.mode === 'debug') {
    debugLog('page_view', { page_path: location.pathname });
    return;
  }
  // Live: load the SDK once the page has finished loading (keeps it off the
  // critical path). gtag sends the page_view automatically on init.
  const start = () => void loadLive(s);
  if (document.readyState === 'complete') setTimeout(start, 0);
  else window.addEventListener('load', start, { once: true });
}

function gaDebugRequested(): boolean {
  try {
    const q = new URLSearchParams(location.search).get('ga_debug');
    if (q === '1') sessionStorage.setItem(GA_DEBUG_KEY, '1');
    if (q === '0') sessionStorage.removeItem(GA_DEBUG_KEY);
    return sessionStorage.getItem(GA_DEBUG_KEY) === '1';
  } catch {
    return false;
  }
}

async function loadLive(s: State) {
  try {
    const [{ initializeAnalytics, isSupported, logEvent, setUserProperties }, { app }] =
      await Promise.all([import('firebase/analytics'), import('./firebase/client')]);
    if (!(await isSupported())) {
      s.mode = 'off';
      s.queue = [];
      return;
    }
    const analytics = initializeAnalytics(app(), {
      config: {
        allow_google_signals: false,
        allow_ad_personalization_signals: false,
        // `?ga_debug=1` → events show up live in Firebase / GA DebugView.
        ...(gaDebugRequested() ? { debug_mode: true } : {}),
      },
    });
    s.send = (name, params) => logEvent(analytics, name, params);
    s.setProps = (props) => setUserProperties(analytics, props);
    s.ready = true;
    if (Object.keys(s.pendingProps).length) s.setProps(s.pendingProps);
    for (const [name, params] of s.queue.splice(0)) s.send(name, params);
  } catch (err) {
    s.mode = 'off';
    s.queue = [];
    // eslint-disable-next-line no-console
    console.warn('[analytics] disabled:', err);
  }
}

// --- declarative tags: data-track ------------------------------------------

const snake = (s: string) =>
  s.replace(/^[A-Z]/, (c) => c.toLowerCase()).replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

function whereIs(el: Element): string {
  return (
    el.closest('[data-track-section]')?.getAttribute('data-track-section') ||
    el.closest('section[id]')?.id ||
    (el.closest('header') ? 'header' : el.closest('footer') ? 'footer' : 'page')
  );
}

function paramsFrom(el: HTMLElement): [string, EventParams] {
  const { track: id, trackEvent, trackSection: _section, ...rest } = el.dataset;
  const params: EventParams = {};
  for (const [k, v] of Object.entries(rest)) {
    if (k.startsWith('track') && k.length > 5 && v != null) params[snake(k.slice(5))] = v;
  }
  params.cta_id ??= id;
  params.location ??= whereIs(el);
  const href = el.getAttribute('href');
  if (href) params.link_url = href.split('?')[0];
  return [trackEvent || 'cta_click', params];
}

function installAutoTracking() {
  document.addEventListener(
    'click',
    (e) => {
      const el = (e.target as Element | null)?.closest?.('[data-track]') as HTMLElement | null;
      // <details> fire on open (below); a click on its <summary> would double count.
      if (!el || el instanceof HTMLDetailsElement) return;
      track(...paramsFrom(el));
    },
    { capture: true }
  );
  // `toggle` doesn't bubble, so listen in the capture phase.
  document.addEventListener(
    'toggle',
    (e) => {
      const el = e.target;
      if (el instanceof HTMLDetailsElement && el.open && el.dataset.track) {
        track(...paramsFrom(el));
      }
    },
    { capture: true }
  );
}
