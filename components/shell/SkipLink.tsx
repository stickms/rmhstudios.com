import { useTranslation } from 'react-i18next';

/** A5: the first focusable element on every `_site` page. Visible only while focused (site-shell.css). */
export function SkipLink() {
  const {
    t,
  } =
    useTranslation(
      'common',
    );
  return (
    <a
      href="#main-content"
      className="site-skip"
    >
      {t(
        'skipToContent',
        {
          defaultValue:
            'Skip to content',
        },
      )}
    </a>
  );
}
