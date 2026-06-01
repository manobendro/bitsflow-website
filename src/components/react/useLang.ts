import { useEffect, useState } from 'react';
import type { Lang } from '../../lib/i18n';

/**
 * Reactive language for React islands. Reads <html data-lang> and updates when
 * the LangToggle changes it (observed via MutationObserver), so island text
 * switches live without a reload.
 */
export function useLang(): Lang {
  const [lang, setLang] = useState<Lang>('en');

  useEffect(() => {
    const read = () =>
      setLang(
        document.documentElement.getAttribute('data-lang') === 'bn' ? 'bn' : 'en'
      );
    read();
    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-lang'],
    });
    return () => obs.disconnect();
  }, []);

  return lang;
}
