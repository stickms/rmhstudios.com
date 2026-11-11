import { cn } from '@/lib/utils';

interface NotificationBadgeProps {
  count: number;
  /** Cap before showing "{max}+" (default 99). */
  max?: number;
  className?: string;
}

/**
 * Canonical unread-count mark (Steel G8: a small `--site-danger` number). A count is text, so it is Geist Mono, 500,
 * on a solid danger fill with `--site-danger-fg` (4.5:1 in both editions). It is a tag-radius box, not a pill.
 */
export function NotificationBadge({ count, max = 99, className }: NotificationBadgeProps) {
  if (!count || count <= 0) return null;
  const display = count > max ? `${max}+` : String(count);
  return (
    <span
      data-slot="notification-badge"
      className={cn(
        'inline-flex h-4 min-w-4 items-center justify-center rounded-site-sm bg-site-danger px-1 font-mono text-caption leading-none font-medium text-site-danger-fg',
        className,
      )}
    >
      {display}
    </span>
  );
}
