import { useUnreadCount } from '@/lib/useUnreadCount';
import { useNotificationCount } from '@/lib/useNotificationCount';

/**
 * What the Inbox section holds unread: direct messages plus notifications (the Inbox's notifications tab). Both are the
 * shell's existing shared sources (one SSE stream, one poll for the whole app), so reading them here costs nothing.
 */
export function useInboxCount(signedIn: boolean): number {
  const unread = useUnreadCount(signedIn);
  const { count: notifications } = useNotificationCount(signedIn);
  return unread + notifications;
}
