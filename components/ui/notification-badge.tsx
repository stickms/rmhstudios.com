import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

interface NotificationBadgeProps {
  count: number;
  className?: string;
}

/**
 * Canonical unread mark (Steel G8): an 8px dot on the fixed red-pink `--site-notify` fill, the same in every theme
 * and edition. The number is not drawn; it is the dot's text equivalent for screen readers.
 */
export function NotificationBadge({ count, className }: NotificationBadgeProps) {
  const { t } = useTranslation('c-ui');
  if (!count || count <= 0) return null;
  return (
    <span
      data-slot="notification-badge"
      className={cn('inline-block size-2 shrink-0 rounded-full bg-site-notify', className)}
    >
      <span className="sr-only">
        {t('notification-badge-unread', {
          count,
          defaultValue_one: '{{count}} unread',
          defaultValue_other: '{{count}} unread',
        })}
      </span>
    </span>
  );
}
