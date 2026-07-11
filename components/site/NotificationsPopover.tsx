'use client';

/**
 * Notification bell for the left sidebar: opens a compact popover with the
 * most recent notifications so triage doesn't require leaving the page. On
 * small screens it navigates straight to /notifications instead (the drawer +
 * popover combination is cramped and the full page is one tap away).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from '@tanstack/react-router';
import { Bell, CheckCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { NotificationBadge } from '@/components/ui/notification-badge';
import { Spinner } from '@/components/ui/spinner';
import { NOTIFICATIONS_READ_EVENT } from '@/lib/useNotificationCount';
import { timeAgoShort } from '@/lib/utils';

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
      return n.actor?.handle ? `/u/${n.actor.handle}` : `/profile/${n.entityId}`;
    default:
      return null;
  }
}

const PANEL_WIDTH = 352;

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
  const [pos, setPos] = useState({ left: 0, top: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications?limit=10', { credentials: 'include' });
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
      navigate({ to: '/notifications' });
      return;
    }
    const rect = btnRef.current?.getBoundingClientRect();
    if (rect) {
      const margin = 8;
      const vw = window.visualViewport?.width ?? window.innerWidth;
      const vh = window.visualViewport?.height ?? window.innerHeight;
      const left = Math.min(rect.right + margin, vw - PANEL_WIDTH - margin);
      const top = Math.min(Math.max(rect.top - 8, margin), Math.max(vh - 440, margin));
      setPos({ left, top });
    }
    setItems(null);
    setOpen(true);
    void load();
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (panelRef.current?.contains(e.target as Node)) return;
      if (btnRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

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
    else navigate({ to: '/notifications' });
  };

  const label = t('notifications', { defaultValue: 'Notifications' });

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => (open ? setOpen(false) : openPanel())}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={className}
        title={label}
      >
        <div className="relative shrink-0">
          <Bell className="w-5 h-5" />
          <NotificationBadge count={count} className="absolute -top-1.5 -right-1.5" />
        </div>
        <span className={labelClass}>{label}</span>
      </button>

      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-label={label}
            style={{ position: 'fixed', left: pos.left, top: pos.top, width: PANEL_WIDTH }}
            className="z-[80] overflow-hidden rounded-site border border-site-border bg-site-surface shadow-[var(--site-shadow)]"
          >
            <div className="flex items-center justify-between border-b border-site-border px-3 py-2">
              <p className="text-sm font-bold text-site-text">{label}</p>
              <button
                type="button"
                onClick={markAllRead}
                className="flex items-center gap-1 rounded-site-sm px-2 py-1 text-xs text-site-text-muted transition-colors hover:bg-site-surface-hover hover:text-site-text"
              >
                <CheckCheck className="h-3.5 w-3.5" aria-hidden />
                {t('notif-pop-mark-all', { defaultValue: 'Mark all read' })}
              </button>
            </div>

            <div className="max-h-[50dvh] overflow-y-auto overscroll-contain">
              {items === null ? (
                <div className="flex justify-center py-8">
                  <Spinner />
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
                          onClick={() => onItemClick(n)}
                          className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-site-surface-hover"
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
              to="/notifications"
              onClick={() => setOpen(false)}
              className="block border-t border-site-border px-3 py-2 text-center text-sm font-medium text-site-accent transition-colors hover:bg-site-surface-hover"
            >
              {t('notif-pop-see-all', { defaultValue: 'See all notifications' })}
            </Link>
          </div>,
          document.body
        )}
    </>
  );
}
