import { lazy, Suspense, useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { formatDistanceToNow } from 'date-fns';
import { AlarmClock, Bell } from 'lucide-react';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Spinner } from '@/components/ui/spinner';
import { Spine, SpineItem } from '@/components/ui/spine';
import { InboxAvatar } from '@/components/feed/InboxAvatar';
import { useOptimisticAction } from '@/hooks/useOptimisticAction';
import { NOTIFICATIONS_READ_EVENT } from '@/lib/useNotificationCount';
import { yieldToMain } from '@/lib/scheduler';
import { usePushSubscription } from '@/lib/usePushSubscription';
import { SwipeRow } from '@/components/ui/swipe-row';
import type { RemindTarget } from '@/components/reminders/RemindMeDialog';
import { isSiteRelativePath } from '@/lib/reminders/shared';
import {
  getNotificationTogglesApi,
  setNotificationTogglesApi,
  markNotificationsReadApi,
} from '@/lib/preferences/preferences.contract';
import { api } from '@/lib/contract/client';

const RemindMeDialog = lazy(() => import('@/components/reminders/RemindMeDialog'));

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

const TYPE_META: Record<NotificationType, { verb: string }> = {
  LIKE: { verb: 'liked your post' },
  COMMENT: { verb: 'commented on your post' },
  REPLY: { verb: 'replied to you' },
  FOLLOW: { verb: 'followed you' },
  MENTION: { verb: 'mentioned you' },
  REPOST: { verb: 'reposted your post' },
  SYSTEM: { verb: '' },
};

// The label of a system notification (no human actor), keyed by the entity the notification refers to.
function systemIdentity(entityType: string | null): { label: string } {
  switch (entityType) {
    case 'achievement':
      return { label: 'Achievement' };
    case 'level':
      return { label: 'Level up' };
    case 'membership':
      return { label: 'Membership' };
    case 'ride':
      return { label: 'RMH Rideshare' };
    case 'ride_request':
      return { label: 'New ride request' };
    case 'ride_message':
      return { label: 'Ride message' };
    case 'ladder_job':
      return { label: 'RMH Ladder' };
    default:
      return { label: 'RMH Studios' };
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
    api(getNotificationTogglesApi)
      .then((data) => {
        if (!cancelled) setPrefs(data);
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
      commit: () => api(setNotificationTogglesApi, { body: { [field]: nextValue } }),
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
    <div className="mb-3 border-b border-site-border pb-3">
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
            <label
              key={row.field}
              className="flex cursor-pointer items-center justify-between gap-2 rounded-site-sm px-2 py-1.5 text-sm text-site-text hover:bg-site-surface-hover"
            >
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
      <p className="mt-2 text-xs text-site-text-muted">
        {t('notification-prefs-hint', {
          defaultValue:
            'Applies to in-app and push notifications. Moderation notices are always delivered.',
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
  /** First page prefetched by the route loader; `null`when signed out. */
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
  const [loading, setLoading] = useState(!initialData);
  const [loadingMore, setLoadingMore] = useState(false);
  const [remindTarget, setRemindTarget] = useState<RemindTarget | null>(null);

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
      // stay visually unread (system notifications can't be"clicked"read).
      api(markNotificationsReadApi, { body: { all: true } })
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
    // OPT-34. "Mark all read" rebuilds every notification object in the list and
    // re-renders the whole column — the unread dots and tinted rows all clear at
    // once, and that is the entire visible result of the tap. The POST and the
    // badge-refresh event below change nothing on screen. Yield so the cleared
    // list paints before the request is built rather than after it.
    await yieldToMain();
    await api(markNotificationsReadApi, { body: { all: true } }).catch(() => {});
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
        return `/u/${n.actor?.handle ?? n.entityId}`;
      // System notifications route to the relevant hub.
      case 'achievement':
        return '/achievements';
      case 'level':
        return '/progress';
      case 'membership':
        return '/store?tab=membership';
      case 'ride':
      case 'ride_message':
        return '/rideshare/ride';
      case 'ride_request':
        return '/rideshare/drive';
      case 'ladder_job':
        return n.entityId ? `/rmhladder/jobs/${n.entityId}` : '/rmhladder/jobs';
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
    <div>
      {!embedded && (
        <h1 className="t-title pb-3">
          {t('notifications-heading', { defaultValue: 'Notifications' })}
        </h1>
      )}
      {/* The toolbar: three words, no primary (section 10, Inbox). */}
      <div className="flex flex-wrap items-center gap-1 pb-3">
        {push.supported && (
          <Button
            variant="ghost"
            disabled={push.busy}
            onClick={async () => {
              if (push.subscribed) {
                await push.unsubscribe();
                toast.success(
                  t('push-disabled', {
                    defaultValue: 'Push notifications turned off on this device.',
                  }),
                );
              } else {
                const ok = await push.subscribe();
                if (ok)
                  toast.success(
                    t('push-enabled', {
                      defaultValue: "You'll now get push notifications on this device.",
                    }),
                  );
                else
                  toast.error(
                    t('push-enable-failed', {
                      defaultValue: 'Could not enable push — check browser permissions.',
                    }),
                  );
              }
            }}
            title={
              push.subscribed
                ? t('push-toggle-off', { defaultValue: 'Turn off push notifications' })
                : t('push-toggle-on', { defaultValue: 'Turn on push notifications' })
            }
          >
            {push.subscribed
              ? t('push-off', { defaultValue: 'Disable push' })
              : t('push-on', { defaultValue: 'Enable push' })}
          </Button>
        )}
        <Button variant="ghost" onClick={markAllRead}>
          {t('mark-all-read', { defaultValue: 'Mark all read' })}
        </Button>
        <Button variant="ghost" onClick={() => setPrefsOpen((v) => !v)} aria-expanded={prefsOpen}>
          {t('notification-prefs-toggle', { defaultValue: 'Notification preferences' })}
        </Button>
      </div>

      {prefsOpen && <PreferencesPanel />}

      {loading ? (
        <div className="flex items-center justify-center px-4 pt-4 pb-12">
          <Spinner />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title={t('no-notifications-yet', { defaultValue: 'No notifications yet' })}
          description={t('no-notifications-description', {
            defaultValue:
              "When someone likes, comments on, reposts, or mentions you, it'll show up here.",
          })}
        />
      ) : (
        <Spine>
          {groups.map((g) => {
            const n = g.newest;
            const grouped = g.count > 1;
            const meta = TYPE_META[n.type];
            const clickable = resolveLink(n) !== null;
            // System notifications have no human actor: lead with the message.
            const isSystem = n.type === 'SYSTEM' || !n.actor;
            const sys = isSystem ? systemIdentity(n.entityType) : null;
            const firstName =
              n.actor?.name || n.actor?.handle || t('someone', { defaultValue: 'Someone' });
            const actorName = grouped
              ? t('grouped-actors', {
                  name: firstName,
                  count: g.count - 1,
                  defaultValue: '{{name}} and {{count}} others',
                })
              : firstName;
            const snooze = () =>
              setRemindTarget({
                kind: 'notification',
                targetId: n.id,
                label:
                  n.preview?.slice(0, 120) ||
                  `${actorName} ${t(`notification-verb-${n.type.toLowerCase()}`, { defaultValue: meta.verb })}`,
                // A reminder only ever opens a same-site path (the route enforces it).
                url: (() => {
                  const link = resolveLink(n);
                  return link && isSiteRelativePath(link) ? link : '/notifications';
                })(),
              });
            // One dot per unread item (section 10): a read notification is a plain row.
            return (
              <SpineItem key={g.key} dot={!g.read} className="hover:bg-site-bg-subtle">
                <SwipeRow
                  trailing={{
                    icon: AlarmClock,
                    label: t('snooze', { defaultValue: 'Later' }),
                    onAction: snooze,
                  }}
                >
                  <div className="flex items-start gap-2">
                    <button
                      type="button"
                      onClick={() => handleClick(n)}
                      disabled={!clickable}
                      className={`flex min-w-0 flex-1 items-start gap-3 text-start ${clickable ? 'cursor-pointer' : 'cursor-default'}`}
                    >
                      {/* Who did it; a system notification has no person and shows a bell. A grouped row shows its newest actor. */}
                      {isSystem ? <InboxAvatar icon={Bell} /> : <InboxAvatar person={n.actor} />}
                      <div className="min-w-0 flex-1">
                        {sys ? (
                          <p className="t-body font-semibold text-site-text">
                            {n.preview ||
                              t(`system-label-${n.entityType ?? 'default'}`, {
                                defaultValue: sys.label,
                              })}
                          </p>
                        ) : (
                          <>
                            <p className={`t-body text-site-text ${g.read ? '' : 'font-semibold'}`}>
                              <span className="font-semibold">{actorName}</span>{' '}
                              <span className={g.read ? 'text-site-text-muted' : ''}>
                                {t(`notification-verb-${n.type.toLowerCase()}`, {
                                  defaultValue: meta.verb,
                                })}
                              </span>
                            </p>
                            {n.preview && (
                              <p className="t-body mt-0.5 line-clamp-2 text-site-text-muted">
                                {n.preview}
                              </p>
                            )}
                          </>
                        )}
                        <p className="t-meta mt-1">
                          {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                        </p>
                      </div>
                    </button>
                    <Button variant="ghost" size="xs" onClick={snooze}>
                      {t('snooze', { defaultValue: 'Later' })}
                    </Button>
                  </div>
                </SwipeRow>
              </SpineItem>
            );
          })}
        </Spine>
      )}

      {nextCursor && (
        <div className="flex justify-center py-4">
          <Button variant="default" onClick={loadMore} loading={loadingMore}>
            {t('load-more', { defaultValue: 'Load more' })}
          </Button>
        </div>
      )}
      {remindTarget && (
        <Suspense fallback={null}>
          <RemindMeDialog
            open
            onOpenChange={(open) => {
              if (!open) setRemindTarget(null);
            }}
            target={remindTarget}
          />
        </Suspense>
      )}
    </div>
  );
}
