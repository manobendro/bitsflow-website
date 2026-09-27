/**
 * Bilingual text for React islands — the React twin of `src/components/T.astro`.
 *
 * Renders BOTH languages; the `.lang-en` / `.lang-bn` CSS (keyed on
 * `<html data-lang>`) shows the active one. Because nothing depends on JS
 * state, islands can be server-rendered without a flash of the wrong language,
 * and they switch instantly with the header toggle.
 *
 * Use this for display text. For attributes (placeholder, aria-label, title) or
 * string logic, use `useLang()` + `t()` instead — attributes can't hold two
 * languages at once.
 */
export default function T({ en, bn }: { en: string; bn?: string }) {
  return (
    <>
      <span className="lang-en">{en}</span>
      <span className="lang-bn" lang="bn">
        {bn || en}
      </span>
    </>
  );
}
