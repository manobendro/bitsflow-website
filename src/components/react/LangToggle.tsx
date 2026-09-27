import type { Lang } from '../../lib/i18n';
import { setUserProps, track } from '../../lib/analytics';
import { useLang } from './useLang';

interface Props {
  /**
   * `compact` (default) — 36px segmented control for the header bar.
   * `block` — full-width 44px control for the mobile menu panel.
   */
  variant?: 'compact' | 'block';
}

/**
 * EN / বাংলা switch. Writes the choice to localStorage and sets
 * <html data-lang> (+ lang), which CSS uses to flip all <T> text instantly.
 * A tiny inline script in BaseLayout applies the saved language before paint
 * so there is no flash of the wrong language.
 *
 * State comes from useLang (MutationObserver on <html data-lang>), so several
 * toggles on one page — header bar + mobile menu — always agree.
 */
export default function LangToggle({ variant = 'compact' }: Props) {
  const lang = useLang();

  function choose(next: Lang) {
    if (next !== lang) {
      track('language_change', { language: next, previous_language: lang, variant });
      setUserProps({ ui_language: next });
    }
    const html = document.documentElement;
    html.setAttribute('data-lang', next);
    html.setAttribute('lang', next);
    try {
      localStorage.setItem('lang', next);
    } catch {
      /* ignore */
    }
  }

  const block = variant === 'block';
  const cell = `inline-flex h-full items-center justify-center font-semibold leading-none transition-colors ${
    block ? 'flex-1 px-4 text-sm' : 'px-3 text-xs'
  }`;
  const on = 'bg-brand-600 text-white';
  const off = 'bg-white/60 text-ink-soft hover:bg-brand-50 hover:text-brand-700';

  return (
    <div
      className={`items-stretch overflow-hidden rounded-md border border-black/10 ${
        block ? 'flex h-11 w-full' : 'inline-flex h-9'
      }`}
      role="group"
      aria-label={lang === 'bn' ? 'ভাষা' : 'Language'}
    >
      <button
        type="button"
        onClick={() => choose('en')}
        lang="en"
        className={`${cell} ${lang === 'en' ? on : off}`}
        aria-pressed={lang === 'en'}
      >
        EN
      </button>
      <button
        type="button"
        onClick={() => choose('bn')}
        lang="bn"
        className={`${cell} border-l border-black/10 ${lang === 'bn' ? on : off}`}
        aria-pressed={lang === 'bn'}
      >
        বাংলা
      </button>
    </div>
  );
}
