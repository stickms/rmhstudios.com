'use client';

/**
 * Notification bell for the left sidebar: opens a compact popover with the
 * most recent notifications so triage doesn't require leaving the page. On
 * small screens it navigates straight to /notifications instead (the drawer +
 * popover combination is cramped and the full page is one tap away).
 */

import { useCallback, useRef, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { Bell, CheckCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { NotificationBadge } from '@/components/ui/notification-badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useReservedRows } from '@/hooks/useReservedRows';
import { NOTIFICATIONS_READ_EVENT } from '@/lib/useNotificationCount';
import { timeAgoShort } from '@/lib/utils';
import { AnchoredMenu } from '@/components/ui/anchored-menu';
import { MENU_ITEM_ATTR } from '@/components/ui/menu';

/**
 * Rows the popover asks for — and what the loading skeleton reserves, which only
 * works because they are the same number (see `hooks/useReservedRows.ts`).
 */
const PREVIEW_LIMIT = 10;

interface NotificationActor {
  id: string;
  name: string | null;
  handle: string | null;
  image: string | null;
}

interface NotificationItem {
  id: string;
  type: 'LIKE' | 'COMMENT' | 'REPLY' | 'FOLLOW' | 'MENTION' | 'REPOST' | 'SYSTEM';
  entityType: string | null;
  entityId: string | null;
  preview: string | null;
  link: string | null;
  read: boolean;
  createdAt: string;
  actor: NotificationActor | null;
}

const TYPE_COPY: Record<NotificationItem['type'], { key: string; fallback: string }> = {
  LIKE: { key: 'notif-pop-like', fallback: 'liked your post' },
  COMMENT: { key: 'notif-pop-comment', fallback: 'commented on your post' },
  REPLY: { key: 'notif-pop-reply', fallback: 'replied to you' },
  FOLLOW: { key: 'notif-pop-follow', fallback: 'followed you' },
  MENTION: { key: 'notif-pop-mention', fallback: 'mentioned you' },
  REPOST: { key: 'notif-pop-repost', fallback: 'reposted your post' },
  SYSTEM: { key: 'notif-pop-system', fallback: 'System update' },
};

// Same fallback rules as the /notifications page: prefer the stored link,
// otherwise derive one from the referenced entity.
function resolveLink(n: NotificationItem): string | null {
  if (n.link) return n.link;
  switch (n.entityType) {
    case 'rmhark':
      return n.entityId ? `/u/${n.actor?.handle ?? '_'}/post/${n.entityId}` : null;
    case 'user':
      if (!n.entityId) return null;
      return `/u/${n.actor?.handle ?? n.entityId}`;
    default:
      return null;
  }
}

export function NotificationsPopover({
  count,
  refreshCount,
  className,
  labelClass = '',
}: {
  count: number;
  refreshCount: () => void;
  /** Class for the trigger button — pass the sidebar leaf style for a consistent rail. */
  className?: string;
  /** Class applied to the trigger label (sidebar hides labels below xl). */
  labelClass?: string;
}) {
  const { t } = useTranslation('feed');
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  // Reserve the height of the list that is coming. The popover used to open on a
  // centred spinner and then jump to ten rows the moment the fetch landed — the
  // bud animation was fine, the BOX moved out from under it.
  const reserved = useReservedRows('sidebar-notifications', items?.length ?? null, PREVIEW_LIMIT);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/notifications?limit=${PREVIEW_LIMIT}`, { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      setItems(data.items ?? []);
    } catch {
      // Leave the spinner; the "see all" link still works.
    }
  }, []);

  const openPanel = () => {
    // Small screens: the full page beats a cramped popover inside the drawer.
    if (window.innerWidth < 768) {
      navigate({ to: '/messages', search: { tab: 'notifications' } });
      return;
    }
    setItems(null);
    setOpen(true);
    void load();
  };

  const markAllRead = async () => {
    try {
      await fetch('/api/notifications/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ all: true }),
      });
      setItems((prev) => prev?.map((n) => ({ ...n, read: true })) ?? prev);
      window.dispatchEvent(new Event(NOTIFICATIONS_READ_EVENT));
      refreshCount();
    } catch {
      // ignore — badge refreshes on the next poll
    }
  };

  const onItemClick = (n: NotificationItem) => {
    setOpen(false);
    if (!n.read) {
      fetch('/api/notifications/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ids: [n.id] }),
      })
        .then(() => {
          window.dispatchEvent(new Event(NOTIFICATIONS_READ_EVENT));
          refreshCount();
        })
        .catch(() => {});
    }
    const link = resolveLink(n);
    if (link) navigate({ to: link });
    else navigate({ to: '/messages', search: { tab: 'notifications' } });
  };

  const label = t('notifications', { defaultValue: 'Notifications' });

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => (open ? setOpen(false) : openPanel())}
        aria-expanded={open}
        aria-haspopup="menu"
        className={className}
        title={label}
      >
        <div className="relative shrink-0">
          <Bell className="w-5 h-5" />
          <NotificationBadge count={count} className="absolute -top-1.5 -right-1.5" />
        </div>
        <span className={labelClass}>{label}</span>
      </button>


      {/* AnchoredMenu owns placement (flips and caps to the room there is), the portal,
          Escape, outside press and focus return. The panel is the L4 overlay it supplies. */}
      <AnchoredMenu
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={btnRef}
        label={label}
        side="bottom"
        align="start"
        className="w-[352px] max-w-[calc(100vw-1.5rem)] overflow-hidden p-0"
      >
            <div className="flex items-center justify-between border-b border-site-border px-3 py-2">
              <p className="text-sm font-bold text-site-text">{label}</p>
              <button
                type="button"
                role="menuitem"
                {...{ [MENU_ITEM_ATTR]: '' }}
                onClick={markAllRead}
                className="flex items-center gap-1 rounded-site-sm px-2 py-1 text-xs text-site-text-muted transition-colors hover:bg-site-surface-hover hover:text-site-text"
              >
                <CheckCheck className="h-3.5 w-3.5" aria-hidden />
                {t('notif-pop-mark-all', { defaultValue: 'Mark all read' })}
              </button>
            </div>

            <div className="max-h-[50dvh] overflow-y-auto overscroll-contain">
              {items === null ? (
                <div role="status" aria-live="polite">
                  <span className="sr-only">{t('loading', { defaultValue: 'Loading…' })}</span>
                  {Array.from({ length: Math.max(1, reserved) }, (_, i) => (
                    <div key={i} aria-hidden className="flex w-full items-start gap-2.5 px-3 py-2.5">
                      <Skeleton className="size-8 shrink-0 rounded-full" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm">
                          <Skeleton className="skeleton-line w-4/5" />
                        </span>
                        <span className="mt-0.5 block text-xs">
                          <Skeleton className="skeleton-line w-3/5" />
                        </span>
                        <span className="mt-0.5 block text-[11px]">
                          <Skeleton className="skeleton-line w-10" />
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              ) : items.length === 0 ? (
                <p className="px-3 py-8 text-center text-sm text-site-text-muted">
                  {t('notif-pop-empty', { defaultValue: "You're all caught up." })}
                </p>
              ) : (
                <ul>
                  {items.map((n) => {
                    const actorName =
                      n.actor?.name || n.actor?.handle || t('someone', { defaultValue: 'Someone' });
                    const body =
                      n.type === 'SYSTEM'
                        ? n.preview ||
                          t(TYPE_COPY.SYSTEM.key, { defaultValue: TYPE_COPY.SYSTEM.fallback })
                        : t(TYPE_COPY[n.type].key, { defaultValue: TYPE_COPY[n.type].fallback });
                    return (
                      <li key={n.id}>
                        <button
                          type="button"
                          role="menuitem"
                          {...{ [MENU_ITEM_ATTR]: '' }}
                          onClick={() => onItemClick(n)}
                          className="glass-interactive flex w-full items-start gap-2.5 px-3 py-2.5 text-left"
                        >
                          <UserAvatar
                            src={n.actor?.image}
                            alt={n.type === 'SYSTEM' ? 'RMH Studios' : actorName}
                            size={32}
                            fallbackName={n.type === 'SYSTEM' ? 'RMH' : actorName}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm text-site-text">
                              {n.type !== 'SYSTEM' && (
                                <span className="font-semibold">{actorName}</span>
                              )}{' '}
                              <span className="text-site-text-muted">{body}</span>
                            </span>
                            {n.preview && n.type !== 'SYSTEM' && (
                              <span className="mt-0.5 block truncate text-xs text-site-text-dim">
                                {n.preview}
                              </span>
                            )}
                            <span className="mt-0.5 block text-[11px] text-site-text-dim">
                              {timeAgoShort(n.createdAt)}
                            </span>
                          </span>
                          {!n.read && (
                            <span
                              aria-hidden
                              className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-site-accent"
                            />
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <Link
              to="/messages"
              search={{ tab: 'notifications' }}
              role="menuitem"
              {...{ [MENU_ITEM_ATTR]: '' }}
              onClick={() => setOpen(false)}
              className="block border-t border-site-border px-3 py-2 text-center text-sm font-medium text-site-accent transition-colors hover:bg-site-surface-hover"
            >
              {t('notif-pop-see-all', { defaultValue: 'See all notifications' })}
            </Link>
      </AnchoredMenu>
    </>
  );
}
