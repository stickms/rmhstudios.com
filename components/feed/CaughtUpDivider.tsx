import { useTranslation } from 'react-i18next';
import { CheckCheck } from 'lucide-react';

/**
 * X7 — drawn in the home timeline where the previous visit's posts begin.
 * Scrolling past it means everything new has been seen.
 */
export function CaughtUpDivider() {
  const { t } = useTranslation('f-feed-plus');
  return (
    <div
      role="separator"
      aria-label={t('caught-up-aria', { defaultValue: 'You are caught up. Older posts follow.' })}
      className="mx-auto flex w-full max-w-xl items-center gap-3 px-4 py-4 text-site-text-muted"
    >
      <span className="h-px flex-1 bg-site-border" aria-hidden />
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide">
        <CheckCheck className="h-3.5 w-3.5 text-site-success" aria-hidden />
        {t('caught-up', { defaultValue: "You're all caught up" })}
      </span>
      <span className="h-px flex-1 bg-site-border" aria-hidden />
    </div>
  );
}
