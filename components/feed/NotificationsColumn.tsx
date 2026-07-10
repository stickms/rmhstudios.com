'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { formatDistanceToNow } from 'date-fns';
import { Heart, MessageCircle, UserPlus, AtSign, Repeat2, Bell, BellRing, BellOff, CheckCheck, Loader2, Trophy, Sparkles, Zap, Gift, Car, MapPin, Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useOptimisticAction } from '@/hooks/useOptimisticAction';
import { NOTIFICATIONS_READ_EVENT } from '@/lib/useNotificationCount';
import { usePushSubscription } from '@/lib/usePushSubscription';

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
  LIKE: { icon: Heart, color: 'text-site-danger', verb: 'liked your post' },
  COMMENT: { icon: MessageCircle, color: 'text-site-accent', verb: 'commented on your post' },
  REPLY: { icon: MessageCircle, color: 'text-site-accent', verb: 'replied to you' },
  FOLLOW: { icon: UserPlus, color: 'text-site-accent', verb: 'followed you' },
  MENTION: { icon: AtSign, color: 'text-site-accent', verb: 'mentioned you' },
  REPOST: { icon: Repeat2, color: 'text-site-success', verb: 'reposted your post' },
  SYSTEM: { icon: Bell, color: 'text-site-text-muted', verb: '' },
};

// Branded identity for system notifications (no human actor), keyed by the
// entity the notification refers to.
function systemIdentity(entityType: string | null): { label: string; Icon: typeof Heart; tint: string; bg: string } {
  switch (entityType) {
    case 'achievement':
      return { label: 'Achievement', Icon: Trophy, tint: 'text-site-warning', bg: 'bg-site-warning/15' };
    case 'level':
      return { label: 'Level up', Icon: Zap, tint: 'text-site-accent', bg: 'bg-site-accent/15' };
    case 'membership':
      return { label: 'Membership', Icon: Gift, tint: 'text-site-accent', bg: 'bg-site-accent/15' };
    case 'ride':
      return { label: 'RMH Rideshare', Icon: Car, tint: 'text-site-success', bg: 'bg-site-success/15' };
    case 'ride_request':
      return { label: 'New ride request', Icon: MapPin, tint: 'text-site-accent', bg: 'bg-site-accent/15' };
    case 'ride_message':
      return { label: 'Ride message', Icon: MessageCircle, tint: 'text-site-accent', bg: 'bg-site-accent/15' };
    default:
      return { label: 'RMH Studios', Icon: Sparkles, tint: 'text-site-accent', bg: 'bg-site-accent/15' };
  }
}

/**
 * A displayed row: either a single notification or a collapsed group of
 * same-event notifications ("A, B and 3 others liked your post"). Only
 * LIKE/REPOST on the same entity and FOLLOW collapse — comment-like types
 * carry distinct previews worth reading individually.
 */
interface DisplayGroup {
  key: string;
  newest: NotificationItem;
  actors: NotificationActor[];
  count: number;
  read: boolean;
}

const GROUPABLE: ReadonlySet<NotificationType> = new Set(['LIKE', 'REPOST', 'FOLLOW']);

function groupNotifications(items: NotificationItem[]): DisplayGroup[] {
  const groups: DisplayGroup[] = [];
  const byKey = new Map<string, DisplayGroup>();
  for (const n of items) {
    const groupable = GROUPABLE.has(n.type) && n.actor;
    const key = groupable ? `${n.type}:${n.entityType}:${n.entityId}` : `single:${n.id}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.count += 1;
      existing.read = existing.read && n.read;
      if (n.actor && !existing.actors.some((a) => a.id === n.actor!.id)) {
        existing.actors.push(n.actor);
      }
    } else {
      const group: DisplayGroup = {
        key,
        newest: n,
        actors: n.actor ? [n.actor] : [],
        count: 1,
        read: n.read,
      };
      byKey.set(key, group);
      groups.push(group); // items arrive newest-first; group anchors at first sighting
    }
  }
  return groups;
}

interface NotificationPrefs {
  likes: boolean;
  comments: boolean;
  follows: boolean;
  mentions: boolean;
  reposts: boolean;
  system: boolean;
}

/** Inline per-type toggles, saved on every change. */
function PreferencesPanel() {
  const { t } = useTranslation('feed');
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const { run: runToggle } = useOptimisticAction();

  useEffect(() => {
    let cancelled = false;
    fetch('/api/notifications/preferences', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data) setPrefs(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = (field: keyof NotificationPrefs) => {
    if (!prefs) return;
    const nextValue = !prefs[field];
    runToggle({
      apply: () => setPrefs((p) => (p ? { ...p, [field]: nextValue } : p)),
      // Previously a failed PUT was swallowed, leaving the switch out of sync
      // with the server — now it reverts.
      rollback: () => setPrefs((p) => (p ? { ...p, [field]: !nextValue } : p)),
      commit: () =>
        fetch('/api/notifications/preferences', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ [field]: nextValue }),
        }),
    });
  };

  const ROWS: Array<{ field: keyof NotificationPrefs; label: string; fallback: string }> = [
    { field: 'likes', label: 'pref-likes', fallback: 'Likes' },
    { field: 'comments', label: 'pref-comments', fallback: 'Comments & replies' },
    { field: 'follows', label: 'pref-follows', fallback: 'New followers' },
    { field: 'mentions', label: 'pref-mentions', fallback: 'Mentions' },
    { field: 'reposts', label: 'pref-reposts', fallback: 'Reposts & quotes' },
    { field: 'system', label: 'pref-system', fallback: 'Achievements & system' },
  ];

  return (
    <div className="border-b border-site-border bg-site-surface/40 px-4 py-3">
      <p className="mb-2 text-sm font-semibold text-site-text">
        {t('notification-prefs-title', { defaultValue: 'Which notifications do you want?' })}
      </p>
      {!prefs ? (
        <div className="py-3">
          <Spinner />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {ROWS.map((row) => (
            <label key={row.field} className="flex cursor-pointer items-center justify-between gap-2 rounded-site-sm px-2 py-1.5 text-sm text-site-text hover:bg-site-surface-hover">
              {t(row.label, { defaultValue: row.fallback })}
              <input
                type="checkbox"
                checked={prefs[row.field]}
                onChange={() => toggle(row.field)}
                className="h-4 w-4 accent-(--site-accent)"
              />
            </label>
          ))}
        </div>
      )}
      <p className="mt-2 text-xs text-site-text-dim">
        {t('notification-prefs-hint', {
          defaultValue: 'Applies to in-app and push notifications. Moderation notices are always delivered.',
        })}
      </p>
    </div>
  );
}

export function NotificationsColumn({
  embedded = false,
  initialData,
}: {
  embedded?: boolean;
  /** First page prefetched by the route loader; `null` when signed out. */
  initialData?: { items: NotificationItem[]; nextCursor: string | null } | null;
} = {}) {
  const { t } = useTranslation('feed');
  const navigate = useNavigate();
  const push = usePushSubscription(true);
  const [prefsOpen, setPrefsOpen] = useState(false);
  // Seed from the loader when provided so the list paints immediately.
  const seeded = useRef(initialData !== undefined && initialData !== null);
  const [items, setItems] = useState<NotificationItem[]>(initialData?.items ?? []);
  const [nextCursor, setNextCursor] = useState<string | null>(initialData?.nextCursor ?? null);
  const [loading, setLoading] = useState(!(initialData));
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

  // Initial load, then mark everything read so the badge clears. When the route
  // loader already seeded the list, skip the fetch and go straight to marking
  // read.
  useEffect(() => {
    let active = true;
    (async () => {
      if (!seeded.current) {
        await load();
        if (!active) return;
        setLoading(false);
      }
      // Mark everything read server-side, and reflect it locally so rows don't
      // stay visually unread (system notifications can't be "clicked" read).
      fetch('/api/notifications/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ all: true }),
      })
        .then(() => {
          if (active) setItems((prev) => prev.map((n) => ({ ...n, read: true })));
          // Tell the nav badge to refresh now instead of waiting for its poll.
          window.dispatchEvent(new Event(NOTIFICATIONS_READ_EVENT));
        })
        .catch(() => {});
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
    // Refresh the nav badge immediately rather than on its next poll.
    window.dispatchEvent(new Event(NOTIFICATIONS_READ_EVENT));
  };

  // Where a notification should take you when tapped. Prefer the link stored at
  // creation time; otherwise derive one from the entity it refers to so older
  // (or link-less) notifications still navigate somewhere useful.
  const resolveLink = (n: NotificationItem): string | null => {
    if (n.link) return n.link;
    switch (n.entityType) {
      case 'rmhark':
        if (!n.entityId) return null;
        // The post detail route resolves by post id; the handle segment is
        // decorative, so a placeholder is fine when the actor has no handle.
        return `/u/${n.actor?.handle ?? '_'}/post/${n.entityId}`;
      case 'user':
        if (!n.entityId) return null;
        return n.actor?.handle ? `/u/${n.actor.handle}` : `/profile/${n.entityId}`;
      // System notifications route to the relevant hub.
      case 'achievement':
        return '/achievements';
      case 'level':
        return '/progress';
      case 'membership':
        return '/pricing';
      case 'ride':
      case 'ride_message':
        return '/rideshare/ride';
      case 'ride_request':
        return '/rideshare/drive';
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

  const groups = useMemo(() => groupNotifications(items), [items]);

  return (
    <div className="min-h-screen">
      <header className={`flex items-center gap-3 border-b border-site-border px-4 py-3 ${embedded ? 'justify-end' : 'sticky top-0 z-10 justify-between bg-site-bg/80 backdrop-blur'}`}>
        {!embedded && <h1 className="text-lg font-bold text-site-text">{t('notifications-heading', { defaultValue: 'Notifications' })}</h1>}
        <div className="flex items-center gap-1.5">
          {push.supported && (
            <Button
              variant="accent-ghost"
              size="sm"
              disabled={push.busy}
              onClick={async () => {
                if (push.subscribed) {
                  await push.unsubscribe();
                  toast.success(t('push-disabled', { defaultValue: 'Push notifications turned off on this device.' }));
                } else {
                  const ok = await push.subscribe();
                  if (ok) toast.success(t('push-enabled', { defaultValue: "You'll now get push notifications on this device." }));
                  else toast.error(t('push-enable-failed', { defaultValue: 'Could not enable push — check browser permissions.' }));
                }
              }}
              title={push.subscribed
                ? t('push-toggle-off', { defaultValue: 'Turn off push notifications' })
                : t('push-toggle-on', { defaultValue: 'Turn on push notifications' })}
            >
              {push.subscribed ? <BellOff className="h-4 w-4" /> : <BellRing className="h-4 w-4" />}
              <span className="hidden sm:inline">
                {push.subscribed
                  ? t('push-off', { defaultValue: 'Disable push' })
                  : t('push-on', { defaultValue: 'Enable push' })}
              </span>
            </Button>
          )}
          <Button variant="accent-ghost" size="sm" onClick={markAllRead}>
            <CheckCheck className="h-4 w-4" />
            {t('mark-all-read', { defaultValue: 'Mark all read' })}
          </Button>
          <Button
            variant="accent-ghost"
            size="sm"
            onClick={() => setPrefsOpen((v) => !v)}
            aria-expanded={prefsOpen}
            aria-label={t('notification-prefs-toggle', { defaultValue: 'Notification preferences' })}
            title={t('notification-prefs-toggle', { defaultValue: 'Notification preferences' })}
          >
            <Settings2 className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {prefsOpen && <PreferencesPanel />}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Spinner />
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 px-6 py-24 text-center">
          <div className="rounded-site border border-site-border bg-site-surface p-4">
            <Bell className="h-8 w-8 text-site-text-muted" />
          </div>
          <p className="font-medium text-site-text">{t('no-notifications-yet', { defaultValue: 'No notifications yet' })}</p>
          <p className="max-w-xs text-sm text-site-text-muted">
            {t('no-notifications-description', { defaultValue: "When someone likes, comments on, reposts, or mentions you, it'll show up here." })}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-site-border">
          {groups.map((g) => {
            const n = g.newest;
            const grouped = g.count > 1;
            const meta = TYPE_META[n.type];
            const Icon = meta.icon;
            const clickable = resolveLink(n) !== null;
            // System notifications have no human actor — render a branded badge
            // and lead with the message instead of a "Someone" line.
            const isSystem = n.type === 'SYSTEM' || !n.actor;
            const sys = isSystem ? systemIdentity(n.entityType) : null;
            const firstName = n.actor?.name || n.actor?.handle || t('someone', { defaultValue: 'Someone' });
            const actorName = grouped
              ? t('grouped-actors', {
                  name: firstName,
                  count: g.count - 1,
                  defaultValue: '{{name}} and {{count}} others',
                })
              : firstName;
            return (
              <li key={g.key}>
                <button
                  type="button"
                  onClick={() => handleClick(n)}
                  disabled={!clickable}
                  className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors ${
                    clickable ? 'cursor-pointer hover:bg-site-surface-hover' : 'cursor-default'
                  } ${g.read ? '' : 'bg-site-accent-dim/40'}`}
                >
                  {sys ? (
                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${sys.bg}`}>
                      <sys.Icon className={`h-5 w-5 ${sys.tint}`} />
                    </span>
                  ) : grouped ? (
                    <div className="relative flex shrink-0 items-center">
                      {g.actors.slice(0, 3).map((a, i) => (
                        <span key={a.id} className={i > 0 ? '-ml-4' : ''} style={{ zIndex: 3 - i }}>
                          <UserAvatar
                            src={a.image}
                            alt={a.name ?? a.handle ?? ''}
                            size={40}
                            fallbackName={a.name ?? a.handle ?? undefined}
                          />
                        </span>
                      ))}
                      <span className="absolute -bottom-1 -right-1 z-10 flex h-5 w-5 items-center justify-center rounded-full border border-site-border bg-site-bg">
                        <Icon className={`h-3 w-3 ${meta.color}`} />
                      </span>
                    </div>
                  ) : (
                    <div className="relative shrink-0">
                      <UserAvatar src={n.actor?.image} alt={actorName} size={40} fallbackName={actorName} />
                      <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border border-site-border bg-site-bg">
                        <Icon className={`h-3 w-3 ${meta.color}`} />
                      </span>
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    {sys ? (
                      <p className="text-sm font-semibold text-site-text">{n.preview || (sys ? t(`system-label-${n.entityType ?? 'default'}`, { defaultValue: sys.label }) : '')}</p>
                    ) : (
                      <>
                        <p className="text-sm text-site-text">
                          <span className="font-semibold">{actorName}</span>{' '}
                          <span className="text-site-text-muted">{t(`notification-verb-${n.type.toLowerCase()}`, { defaultValue: meta.verb })}</span>
                        </p>
                        {n.preview && (
                          <p className="mt-0.5 line-clamp-2 text-sm text-site-text-muted">{n.preview}</p>
                        )}
                      </>
                    )}
                    <p className="mt-1 text-xs text-site-text-dim">
                      {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                    </p>
                  </div>
                  {!g.read && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-site-accent" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {nextCursor && (
        <div className="flex justify-center py-4">
          <Button variant="secondary" size="sm" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : t('load-more', { defaultValue: 'Load more' })}
          </Button>
        </div>
      )}
    </div>
  );
}
