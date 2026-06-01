import { useEffect, useState } from 'react';
import type { Lang } from '../../lib/i18n';

/**
 * EN / বাংলা switch. Writes the choice to localStorage and sets
 * <html data-lang>, which CSS uses to flip all <T> text instantly.
 * A tiny inline script in BaseLayout applies the saved language before paint
 * so there is no flash of the wrong language.
 */
export default function LangToggle() {
  const [lang, setLang] = useState<Lang>('en');

  useEffect(() => {
    const current = document.documentElement.getAttribute('data-lang');
    setLang(current === 'bn' ? 'bn' : 'en');
  }, []);

  function choose(next: Lang) {
    setLang(next);
    document.documentElement.setAttribute('data-lang', next);
    try {
      localStorage.setItem('lang', next);
    } catch {
      /* ignore */
    }
  }

  const cell =
    'inline-flex h-full items-center justify-center px-3 text-xs font-semibold leading-none transition-colors';
  return (
    <div
      className="inline-flex h-9 items-stretch overflow-hidden rounded-md border border-black/10"
      role="group"
      aria-label="Language"
    >
      <button
        onClick={() => choose('en')}
        className={`${cell} ${
          lang === 'en'
            ? 'bg-brand-600 text-white'
            : 'text-ink-soft hover:bg-brand-50 hover:text-brand-700'
        }`}
        aria-pressed={lang === 'en'}
      >
        EN
      </button>
      <button
        onClick={() => choose('bn')}
        lang="bn"
        className={`${cell} border-l border-black/10 ${
          lang === 'bn'
            ? 'bg-brand-600 text-white'
            : 'text-ink-soft hover:bg-brand-50 hover:text-brand-700'
        }`}
        aria-pressed={lang === 'bn'}
      >
        বাংলা
      </button>
    </div>
  );
}
