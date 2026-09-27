/**
 * Small shared building blocks for the admin product manager: modal/drawer
 * focus management, switches, field wrappers, toasts and scoped keyframes.
 * Admin UI is English-only (staff tool).
 */
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { CircleAlert, CircleCheck, X } from 'lucide-react';

// ---------------------------------------------------------------------------
// Modal / drawer: focus first field, trap Tab, Esc closes, restore focus,
// lock background scroll. Nested modals: only the top-most handles keys.
// ---------------------------------------------------------------------------

const modalStack: symbol[] = [];

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.getClientRects().length > 0 && !el.closest('[inert]')
  );
}

export function useModal<T extends HTMLElement = HTMLDivElement>(
  open: boolean,
  onRequestClose: () => void
) {
  const ref = useRef<T>(null);
  const closeRef = useRef(onRequestClose);
  closeRef.current = onRequestClose;

  useEffect(() => {
    if (!open) return;
    const id = Symbol('modal');
    modalStack.push(id);
    const trigger = document.activeElement as HTMLElement | null;

    // Scroll lock (compensate for the scrollbar so the page doesn't jump).
    const body = document.body;
    const prevOverflow = body.style.overflow;
    const prevPadding = body.style.paddingRight;
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    body.style.overflow = 'hidden';
    if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;

    const raf = requestAnimationFrame(() => {
      const root = ref.current;
      if (!root) return;
      const preferred = root.querySelector<HTMLElement>('[data-autofocus]');
      (preferred ?? focusables(root)[0] ?? root).focus();
    });

    function onKey(e: KeyboardEvent) {
      if (modalStack[modalStack.length - 1] !== id) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const root = ref.current;
      if (!root) return;
      const items = focusables(root);
      if (items.length === 0) {
        e.preventDefault();
        root.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && (active === first || !root.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !root.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', onKey, true);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKey, true);
      const i = modalStack.indexOf(id);
      if (i >= 0) modalStack.splice(i, 1);
      body.style.overflow = prevOverflow;
      body.style.paddingRight = prevPadding;
      if (trigger) {
        // After the unmount paint, so the trigger is focusable again.
        requestAnimationFrame(() => {
          if (trigger.isConnected) trigger.focus({ preventScroll: true });
        });
      }
    };
  }, [open]);

  return ref;
}

/** True while any admin modal/drawer is open (used to suppress shortcuts). */
export function isModalOpen(): boolean {
  return modalStack.length > 0;
}

// ---------------------------------------------------------------------------
// Scoped keyframes (kept here so global.css stays untouched). Reduced-motion
// users get no movement.
// ---------------------------------------------------------------------------

export function AdminStyles() {
  return (
    <style>{`
@keyframes ap-fade { from { opacity: 0 } to { opacity: 1 } }
@keyframes ap-slide { from { transform: translateX(32px); opacity: 0 } to { transform: none; opacity: 1 } }
@keyframes ap-pop { from { transform: translateY(8px) scale(.98); opacity: 0 } to { transform: none; opacity: 1 } }
@keyframes ap-toast { from { transform: translateY(12px); opacity: 0 } to { transform: none; opacity: 1 } }
.ap-fade { animation: ap-fade .18s ease-out both }
.ap-slide { animation: ap-slide .28s cubic-bezier(.22,1,.36,1) both }
.ap-pop { animation: ap-pop .2s cubic-bezier(.22,1,.36,1) both }
.ap-toast { animation: ap-toast .25s cubic-bezier(.22,1,.36,1) both }
@media (prefers-reduced-motion: reduce) {
  .ap-fade, .ap-slide, .ap-pop, .ap-toast { animation: none }
}
/* Hue slider (custom track is set inline; thumb styled here). */
.ap-range { -webkit-appearance: none; appearance: none; height: 10px; border-radius: 3px; background-color: transparent }
.ap-range::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 22px; height: 22px; border-radius: 4px; background: #fff; border: 2px solid var(--color-brand-600); box-shadow: 0 1px 3px rgb(20 39 31 / .3); cursor: grab }
.ap-range::-moz-range-thumb { width: 18px; height: 18px; border-radius: 4px; background: #fff; border: 2px solid var(--color-brand-600); box-shadow: 0 1px 3px rgb(20 39 31 / .3); cursor: grab }
.ap-range:focus-visible { outline: 2px solid var(--color-brand-500); outline-offset: 4px }
/* Local EN / বাংলা preview, independent of the site-wide language toggle. */
[data-preview-lang='en'] .lang-en { display: inline !important }
[data-preview-lang='en'] .lang-bn { display: none !important }
[data-preview-lang='bn'] .lang-en { display: none !important }
[data-preview-lang='bn'] .lang-bn { display: inline !important }
`}</style>
  );
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

export function Switch({
  checked,
  onChange,
  label,
  name,
  disabled,
  size = 'md',
  testId,
  describedBy,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Accessible name. */
  label: string;
  name?: string;
  disabled?: boolean;
  size?: 'sm' | 'md';
  testId?: string;
  describedBy?: string;
}) {
  const track = size === 'sm' ? 'h-5 w-9' : 'h-6 w-11';
  const knob = size === 'sm' ? 'h-4 w-4' : 'h-5 w-5';
  const shift = size === 'sm' ? 'translate-x-4' : 'translate-x-5';
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-describedby={describedBy}
      name={name}
      data-testid={testId}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="group/sw inline-grid min-h-11 min-w-11 shrink-0 place-items-center rounded-md disabled:cursor-wait disabled:opacity-60 lg:min-h-8 lg:min-w-8"
    >
      <span
        aria-hidden="true"
        className={`relative inline-flex ${track} items-center rounded-md border p-[1px] transition-colors duration-150 motion-reduce:transition-none ${
          checked
            ? 'border-brand-600 bg-brand-600 group-hover/sw:bg-brand-700'
            : 'border-black/15 bg-ink/15 group-hover/sw:bg-ink/25'
        }`}
      >
        <span
          className={`${knob} rounded-sm bg-white shadow-sm transition-transform duration-150 motion-reduce:transition-none ${
            checked ? shift : 'translate-x-0'
          }`}
        />
      </span>
    </button>
  );
}

export function Spinner({ size = 16, className = '' }: { size?: number; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
      style={{ width: size, height: size }}
    />
  );
}

export function LangTag({ lang }: { lang: 'en' | 'bn' }) {
  return lang === 'en' ? (
    <span className="rounded-sm bg-ink/[0.06] px-1.5 py-px text-[10px] font-bold uppercase tracking-wider text-ink-soft">
      EN
    </span>
  ) : (
    <span
      lang="bn"
      className="rounded-sm bg-brand-50 px-1.5 py-px text-[11px] font-semibold text-brand-700"
    >
      বাংলা
    </span>
  );
}

/**
 * Label + control + hint/error with the aria wiring done. `children` receives
 * the ids to spread onto the control.
 */
export function Field({
  label,
  lang,
  hint,
  error,
  optional,
  children,
  className = '',
}: {
  label: string;
  lang?: 'en' | 'bn';
  hint?: ReactNode;
  error?: string;
  optional?: boolean;
  className?: string;
  children: (ids: {
    id: string;
    'aria-invalid': boolean | undefined;
    'aria-describedby': string | undefined;
  }) => ReactNode;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errId = `${id}-err`;
  const described = [error ? errId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className="label flex items-center gap-2">
        <span>{label}</span>
        {lang && <LangTag lang={lang} />}
        {optional && <span className="text-xs font-normal text-ink-soft/70">Optional</span>}
      </label>
      {children({ id, 'aria-invalid': error ? true : undefined, 'aria-describedby': described })}
      {error && (
        <p id={errId} className="mt-1.5 flex items-start gap-1.5 text-xs font-medium text-accent-600">
          <CircleAlert size={14} className="mt-px shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}
      {hint && (
        <p id={hintId} className="mt-1.5 text-xs text-ink-soft">
          {hint}
        </p>
      )}
    </div>
  );
}

export function Section({
  icon,
  title,
  description,
  children,
  aside,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className="rounded-lg border border-black/5 bg-white p-5 shadow-[0_1px_2px_rgb(20_39_31_/_0.04)] sm:p-6"
    >
      <div className="mb-5 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="icon-tile h-9 w-9 shrink-0" aria-hidden="true">
            {icon}
          </span>
          <div>
            <h3 id={id} className="text-base font-bold leading-tight">
              {title}
            </h3>
            {description && <p className="mt-0.5 text-sm text-ink-soft">{description}</p>}
          </div>
        </div>
        {aside}
      </div>
      <div className="space-y-5">{children}</div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------------

export interface Toast {
  id: number;
  kind: 'success' | 'error' | 'info';
  text: string;
}

export function Toasts({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[120] flex flex-col items-center gap-2 p-4 sm:items-end sm:p-6"
      aria-live="polite"
      aria-relevant="additions"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.kind === 'error' ? 'alert' : 'status'}
          data-testid="admin-toast"
          className={`ap-toast pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border px-4 py-3 text-sm shadow-[0_2px_4px_rgb(20_39_31_/_0.05),0_18px_40px_-16px_rgb(20_39_31_/_0.28)] ${
            t.kind === 'error'
              ? 'border-accent-500/30 bg-white text-ink'
              : 'border-brand-200 bg-white text-ink'
          }`}
        >
          <span className={t.kind === 'error' ? 'mt-px text-accent-500' : 'mt-px text-brand-600'}>
            {t.kind === 'error' ? <CircleAlert size={18} /> : <CircleCheck size={18} />}
          </span>
          <p className="flex-1 font-medium leading-snug">{t.text}</p>
          <button
            type="button"
            onClick={() => onDismiss(t.id)}
            aria-label="Dismiss notification"
            className="-m-1.5 grid h-8 w-8 place-items-center rounded-md text-ink-soft hover:bg-sand hover:text-ink"
          >
            <X size={15} />
          </button>
        </div>
      ))}
    </div>
  );
}
