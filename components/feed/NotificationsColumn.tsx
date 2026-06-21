'use client';

import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { formatDistanceToNow } from 'date-fns';
import { Heart, MessageCircle, UserPlus, AtSign, Repeat2, Bell, CheckCheck, Loader2 } from 'lucide-react';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { Button } from '@/components/ui/button';

type NotificationType = 'LIKE' | 'COMMENT' | 'REPLY' | 'FOLLOW' | 'MENTION' | 'REPOST' | 'SYSTEM';

interface NotificationActor {
  id: string;
  name: string | null;
  image: string | null;
  handle: string | null;
}

interface NotificationItem {
  id: string;
  type: NotificationType;
  entityType: string | null;
  entityId: string | null;
  preview: string | null;
  link: string | null;
  read: boolean;
  createdAt: string;
  actor: NotificationActor | null;
}

const TYPE_META: Record<NotificationType, { icon: typeof Heart; color: string; verb: string }> = {
  LIKE: { icon: Heart, color: 'text-rose-500', verb: 'liked your post' },
  COMMENT: { icon: MessageCircle, color: 'text-sky-500', verb: 'commented on your post' },
  REPLY: { icon: MessageCircle, color: 'text-sky-500', verb: 'replied to you' },
  FOLLOW: { icon: UserPlus, color: 'text-site-accent', verb: 'followed you' },
  MENTION: { icon: AtSign, color: 'text-violet-500', verb: 'mentioned you' },
  REPOST: { icon: Repeat2, color: 'text-emerald-500', verb: 'reposted your post' },
  SYSTEM: { icon: Bell, color: 'text-site-text-muted', verb: '' },
};

export function NotificationsColumn() {
  const navigate = useNavigate();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async (cursor?: string) => {
    try {
      const url = new URL('/api/notifications', window.location.origin);
      if (cursor) url.searchParams.set('cursor', cursor);
      const res = await fetch(url.toString(), { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      setItems((prev) => (cursor ? [...prev, ...data.items] : data.items));
      setNextCursor(data.nextCursor ?? null);
    } catch {
      // ignore
    }
  }, []);

  // Initial load, then mark everything read so the badge clears.
  useEffect(() => {
    let active = true;
    (async () => {
      await load();
      if (!active) return;
      setLoading(false);
      fetch('/api/notifications/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ all: true }),
      }).catch(() => {});
    })();
    return () => {
      active = false;
    };
  }, [load]);

  const markAllRead = async () => {
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    await fetch('/api/notifications/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ all: true }),
    }).catch(() => {});
  };

  // Where a notification should take you when tapped. Prefer the link stored at
  // creation time; otherwise derive one from the entity it refers to so older
  // (or link-less) notifications still navigate somewhere useful.
  const resolveLink = (n: NotificationItem): string | null => {
    if (n.link) return n.link;
    if (!n.entityId) return null;
    switch (n.entityType) {
      case 'rmhark':
        // The post detail route resolves by post id; the handle segment is
        // decorative, so a placeholder is fine when the actor has no handle.
        return `/u/${n.actor?.handle ?? '_'}/post/${n.entityId}`;
      case 'user':
        return n.actor?.handle ? `/u/${n.actor.handle}` : `/profile/${n.entityId}`;
      default:
        return null;
    }
  };

  const handleClick = (n: NotificationItem) => {
    const link = resolveLink(n);
    if (link) navigate({ to: link });
  };

  const loadMore = async () => {
    if (!nextCursor) return;
    setLoadingMore(true);
    await load(nextCursor);
    setLoadingMore(false);
  };

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-site-border bg-site-bg/80 px-4 py-3 backdrop-blur">
        <h1 className="text-lg font-bold text-site-text">Notifications</h1>
        <Button variant="accent-ghost" size="sm" onClick={markAllRead}>
          <CheckCheck className="h-4 w-4" />
          Mark all read
        </Button>
      </header>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-site-accent" />
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 px-6 py-24 text-center">
          <div className="rounded-2xl border border-site-border bg-site-surface p-4">
            <Bell className="h-8 w-8 text-site-text-muted" />
          </div>
          <p className="font-medium text-site-text">No notifications yet</p>
          <p className="max-w-xs text-sm text-site-text-muted">
            When someone likes, comments on, reposts, or mentions you, it&apos;ll show up here.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-site-border">
          {items.map((n) => {
            const meta = TYPE_META[n.type];
            const Icon = meta.icon;
            const actorName = n.actor?.name || n.actor?.handle || 'Someone';
            const clickable = resolveLink(n) !== null;
            return (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => handleClick(n)}
                  disabled={!clickable}
                  className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors ${
                    clickable ? 'cursor-pointer hover:bg-site-surface-hover' : 'cursor-default'
                  } ${n.read ? '' : 'bg-site-accent-dim/40'}`}
                >
                  <div className="relative shrink-0">
                    <UserAvatar src={n.actor?.image} alt={actorName} size={40} fallbackName={actorName} />
                    <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border border-site-border bg-site-bg">
                      <Icon className={`h-3 w-3 ${meta.color}`} />
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-site-text">
                      <span className="font-semibold">{actorName}</span>{' '}
                      <span className="text-site-text-muted">{meta.verb}</span>
                    </p>
                    {n.preview && (
                      <p className="mt-0.5 line-clamp-2 text-sm text-site-text-muted">{n.preview}</p>
                    )}
                    <p className="mt-1 text-xs text-site-text-dim">
                      {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                    </p>
                  </div>
                  {!n.read && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-site-accent" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {nextCursor && (
        <div className="flex justify-center py-4">
          <Button variant="secondary" size="sm" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Load more'}
          </Button>
        </div>
      )}
    </div>
  );
}
