import { useTranslation } from 'react-i18next';

/**
 * "Continued from your other device (page 214)": the one-line notice a reader shows when
 * the account's place, not this device's, decided where the book opened. A polite live
 * region that is always mounted (so a screen reader announces the text when it arrives),
 * plain `t-meta` text with no banner, and it never takes focus.
 */
export function ContinuedNotice({ page }: { page: number | null }) {
  const { t, i18n } = useTranslation('reading-sync');
  return (
    <p
      role="status"
      aria-live="polite"
      className="t-meta pointer-events-none absolute inset-x-0 top-20 z-10 px-4 text-center"
    >
      {page === null
        ? null
        : t('continued-from', {
            defaultValue: 'Continued from your other device (page {{page}})',
            page: new Intl.NumberFormat(i18n.language).format(page),
          })}
    </p>
  );
}
