import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';

/**
 * What the owner sees on a key an admin suspended: when and why, on a rule (a line of text, not a
 * box), and where to reply. The reason is shown here only; the API's error body never carries it.
 */
export function KeySuspendedLine({
  suspendedAt,
  reason,
}: {
  suspendedAt: string | Date | null;
  reason: string | null;
}) {
  const { t } = useTranslation('admin-api-oversight');
  const fmt = useLocaleFormat();
  if (!suspendedAt) return null;
  return (
    <p className="t-meta mt-2 border-t border-site-border pt-2 break-words text-site-text">
      {t('owner-suspended', {
        defaultValue: 'Suspended {{date}}: {{reason}}',
        date: fmt.date(suspendedAt),
        reason: reason ?? '',
      })}{' '}
      <Link to="/settings/feedback" className="underline">
        {t('owner-reply', {
          defaultValue: 'Reply in the feedback inbox',
        })}
      </Link>
    </p>
  );
}
