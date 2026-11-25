import { lazy, Suspense, useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { AlarmClock, Bell, BellOff, BellRing, CheckCheck, Settings } from 'lucide-react';
import { IconButton } from '@/components/ui/icon-button';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { EmptyState } from '@/components/ui/empty-state';
import { Spinner } from '@/components/ui/spinner';
import { ARRIVE, useArrival, useArrivingKeys } from '@/components/ui/arrive';
import { NotificationRowMenu } from '@/components/feed/NotificationRowMenu';
import { InboxAvatar } from '@/components/feed/InboxAvatar';
import { NOTIFICATIONS_READ_EVENT } from '@/hooks/useNotificationCount';
import { yieldToMain } from '@/lib/scheduler';
import { usePushSubscription } from '@/hooks/usePushSubscription';
import { SwipeRow } from '@/components/ui/swipe-row';
import type { RemindTarget } from '@/components/reminders/RemindMeDialog';
import { isSiteRelativePath } from '@/lib/reminders/shared';
import {
  listNotificationsApi,
  markNotificationsReadApi,
} from '@/lib/preferences/preferences.contract';
import {
  dismissNotificationsApi,
  setNotificationReadApi,
} from '@/lib/notifications/inbox.contract';
import { MAX_NOTIFICATION_BATCH } from '@/lib/notifications/filters';
import { NOTIFICATION_FILTERS, type NotificationFilter } from '@/lib/notifications/filters';
import { api } from '@/lib/contract/client';
import { cn } from '@/lib/utils';
import { games } from '@/lib/catalog';
import { gameIdOfLink } from '@/lib/arcade/updates';
import { knownLabel } from '@/lib/i18n/known-label';
import { notificationVerbs, systemLabels } from '@/components/feed/notification-labels';
import { inboxPreview } from '@/components/feed/notice-previews';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';

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
  previewKey?: string | null;
  previewParams?: unknown;
  link: string | null;
  read: boolean;
  createdAt: string;
  actor: NotificationActor | null;
}

// A notice's instant, in the reader's format and language: "1 December, 15:30".
const NOTICE_INSTANT: Intl.DateTimeFormatOptions = { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' };

// The label of a system notification (no human actor), keyed by the entity the notification refers to.
// `labels` is `systemLabels(t)`: every entity type has its own literal translation key there.
function systemIdentity(
  labels: Record<string, string>,
  entityType: string | null,
  link: string | null,
): { label: string } {
  // A game's patch note or newly published guide is labelled with the game's name (its link names the game).
  if (entityType === 'game_update' || entityType === 'game_guide') {
    const id = gameIdOfLink(link);
    const game = id ? games.find((g) => g.id === id) : undefined;
    return { label: game?.title ?? labels[entityType]! };
  }
  return { label: (entityType ? knownLabel(labels, entityType) : undefined) ?? labels.default! };
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
  /** Every notification in the group: an action on the row applies to all of them. */
  ids: string[];
}

/** How long a dismissal can be undone before the delete is sent. */
const UNDO_MS = 8000;

/** Split ids into requests the server accepts. */
function chunk(ids: string[]): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < ids.length; i += MAX_NOTIFICATION_BATCH) {
    out.push(ids.slice(i, i + MAX_NOTIFICATION_BATCH));
  }
  return out;
}

/** Remember which rows arrived unread (the Unread view is built from these). */
function rememberUnread(into: Set<string>, rows: NotificationItem[]) {
  for (const n of rows) if (!n.read) into.add(n.id);
}

/** Keep a list newest first after rows are put back. */
function byNewest(a: NotificationItem, b: NotificationItem): number {
  return b.createdAt < a.createdAt ? -1 : b.createdAt > a.createdAt ? 1 : 0;
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
      existing.ids.push(n.id);
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
        ids: [n.id],
      };
      byKey.set(key, group);
      groups.push(group); // items arrive newest-first; group anchors at first sighting
    }
  }
  return groups;
}

export function NotificationsColumn({
  embedded = false,
  initialData,
}: {
  embedded?: boolean;
  /** First page prefetched by the route loader; `null`when signed out. */
  initialData?: { items: NotificationItem[]; nextCursor: string | null } | null;
} = {}) { const fmt = useLocaleFormat(); 
  const { t } = useTranslation('feed');
  const { t: tn } = useTranslation('notifications-inbox');
  // The notice catalogue (`notice-previews.ts`) holds the literal keys; this only hands it the language.
  const { t: tNotice } = useTranslation('notice-language');
  const verbs = notificationVerbs(t);
  const sysLabels = systemLabels(t);
  const navigate = useNavigate();
  const push = usePushSubscription(true);
  // Seed from the loader when provided so the list paints immediately.
  const seeded = useRef(initialData !== undefined && initialData !== null);
  const firstPage = useRef(initialData);
  const [items, setItems] = useState<NotificationItem[]>(initialData?.items ?? []);
  const [nextCursor, setNextCursor] = useState<string | null>(initialData?.nextCursor ?? null);
  const [loading, setLoading] = useState(!initialData);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [remindTarget, setRemindTarget] = useState<RemindTarget | null>(null);
  const [filter, setFilter] = useState<NotificationFilter>('all');
  const [unreadOnly, setUnreadOnly] = useState(false);
  // The ids that were unread among the rows shown when the page opened (taken before the mark-read-on-open below).
  // The Unread view is these plus every row unread on the server now, so it survives the auto mark-read.
  const unreadSnapshot = useRef<Set<string>>(new Set());
  // Bumped per list request so a slow answer for an old filter never replaces a newer one.
  const requestId = useRef(0);
  // Dismissals waiting out their undo window, keyed by toast.
  const pending = useRef(new Map<string, { ids: string[]; removed: NotificationItem[] }>());

  const fetchPage = useCallback(
    (view: { filter: NotificationFilter; unreadOnly: boolean }, cursor?: string) =>
      api(listNotificationsApi, {
        query: {
          ...(cursor ? { cursor } : {}),
          ...(view.filter !== 'all' ? { filter: view.filter } : {}),
          ...(view.unreadOnly
            ? {
                unread: 'true' as const,
                ...(unreadSnapshot.current.size > 0
                  ? { unreadIds: [...unreadSnapshot.current].slice(0, 100).join(',') }
                  : {}),
              }
            : {}),
        },
      }),
    [],
  );

  // A row dismissed while its page was loading (or still in its undo window) must not reappear.
  const withoutPending = (rows: NotificationItem[]) => {
    const waiting = new Set([...pending.current.values()].flatMap((p) => p.ids));
    return waiting.size === 0 ? rows : rows.filter((n) => !waiting.has(n.id));
  };

  // Initial load, then mark everything read so the badge clears. When the route
  // loader already seeded the list, skip the fetch and go straight to marking
  // read.
  useEffect(() => {
    let active = true;
    (async () => {
      if (seeded.current) {
        rememberUnread(unreadSnapshot.current, firstPage.current?.items ?? []);
      } else {
        try {
          const data = await fetchPage({ filter: 'all', unreadOnly: false });
          if (!active) return;
          rememberUnread(unreadSnapshot.current, data.items);
          setItems(data.items);
          setNextCursor(data.nextCursor ?? null);
        } catch {
          if (!active) return;
          setLoadError(true);
        }
        setLoading(false);
      }
      // Opening the inbox marks read the rows that were actually shown, so the badge clears for what the member
      // saw. Unread rows past the first page stay unread (and in the Unread view) until the member marks
      // them ("Mark all as read" or per row). System notifications can't be "clicked" read, hence marking here.
      const shown = [...unreadSnapshot.current];
      const marking = shown.length
        ? api(markNotificationsReadApi, { body: { ids: shown } })
        : Promise.resolve(null);
      marking
        .then(() => {
          if (active) setItems((prev) => prev.map((n) => (unreadSnapshot.current.has(n.id) ? { ...n, read: true } : n)));
          // Tell the nav badge to refresh now instead of waiting for its poll.
          window.dispatchEvent(new Event(NOTIFICATIONS_READ_EVENT));
        })
        .catch(() => {});
    })();
    return () => {
      active = false;
    };
  }, [fetchPage]);

  // Show a different slice of the inbox: refetch from the first page. Focus stays on whichever control changed.
  const showView = async (next: { filter: NotificationFilter; unreadOnly: boolean }) => {
    setFilter(next.filter);
    setUnreadOnly(next.unreadOnly);
    setLoadError(false);
    setLoading(true);
    const id = ++requestId.current;
    try {
      const data = await fetchPage(next);
      if (id !== requestId.current) return;
      setItems(withoutPending(data.items));
      setNextCursor(data.nextCursor ?? null);
    } catch {
      if (id === requestId.current) setLoadError(true);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  };

  // One literal t() call per label, so the extractor finds every key.
  const filterLabel = (id: NotificationFilter): string => {
    switch (id) {
      case 'mentions':
        return tn('filter-mentions', { defaultValue: 'Mentions and replies' });
      case 'follows':
        return tn('filter-follows', { defaultValue: 'Follows' });
      case 'likes':
        return tn('filter-likes', { defaultValue: 'Likes and reposts' });
      case 'system':
        return tn('filter-system', { defaultValue: 'System' });
      default:
        return tn('filter-all', { defaultValue: 'All' });
    }
  };

  const refreshBadge = () => window.dispatchEvent(new Event(NOTIFICATIONS_READ_EVENT));

  const markAllRead = async () => {
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    // OPT-34. "Mark all read" rebuilds every notification object in the list and
    // re-renders the whole column — the unread dots and tinted rows all clear at
    // once, and that is the entire visible result of the tap. The POST and the
    // badge-refresh event below change nothing on screen. Yield so the cleared
    // list paints before the request is built rather than after it.
    await yieldToMain();
    // Scoped to the current filter: marking Follows read leaves mentions unread.
    await api(markNotificationsReadApi, {
      body: { all: true, ...(filter !== 'all' ? { filter } : {}) },
    }).catch(() => {});
    // Refresh the nav badge immediately rather than on its next poll.
    refreshBadge();
  };

  // Mark a row (every notification in its group) read or unread. Optimistic; put back if the server refuses.
  const setGroupRead = async (g: DisplayGroup, read: boolean) => {
    const ids = new Set(g.ids);
    const apply = (value: (n: NotificationItem) => boolean) =>
      setItems((prev) => prev.map((n) => (ids.has(n.id) ? { ...n, read: value(n) } : n)));
    const before = new Map(items.filter((n) => ids.has(n.id)).map((n) => [n.id, n.read]));
    apply(() => read);
    if (!read) for (const id of g.ids) unreadSnapshot.current.add(id);
    try {
      if (g.ids.length === 1) {
        await api(setNotificationReadApi, { params: { id: g.ids[0]! }, body: { read } });
      } else {
        for (const part of chunk(g.ids)) {
          await api(markNotificationsReadApi, { body: { ids: part, read } });
        }
      }
    } catch {
      apply((n) => before.get(n.id) ?? n.read);
      toast.error(tn('update-failed', { defaultValue: 'Could not update the notification.' }));
    }
    refreshBadge();
  };

  // Send a waiting dismissal now (undo window over, or the page is leaving). Rows that fail to delete come back.
  const sendDismiss = useCallback((key: string, keepalive: boolean) => {
    const entry = pending.current.get(key);
    if (!entry) return;
    pending.current.delete(key);
    (async () => {
      try {
        for (const part of chunk(entry.ids)) {
          await api(dismissNotificationsApi, { body: { ids: part }, keepalive });
        }
      } catch {
        setItems((prev) => {
          const have = new Set(prev.map((n) => n.id));
          return [...prev, ...entry.removed.filter((n) => !have.has(n.id))].sort(byNewest);
        });
        toast.error(tn('dismiss-failed', { defaultValue: 'Could not dismiss the notification.' }));
      }
      refreshBadge();
    })();
  }, [tn]);

  // Dismiss a row (every notification in its group): hide it now, delete it when the undo toast closes.
  const dismissGroup = (g: DisplayGroup) => {
    const ids = new Set(g.ids);
    const removed = items.filter((n) => ids.has(n.id));
    // Load more continues after the last loaded row; if that row is going, continue after the one before it.
    if (nextCursor && ids.has(nextCursor)) {
      const lastKept = [...items].reverse().find((n) => !ids.has(n.id));
      if (lastKept) setNextCursor(lastKept.id);
    }
    setItems((prev) => prev.filter((n) => !ids.has(n.id)));
    const key = `dismiss-${g.key}-${Date.now()}`;
    pending.current.set(key, { ids: g.ids, removed });
    toast(tn('dismissed', { defaultValue: 'Notification dismissed' }), {
      id: key,
      duration: UNDO_MS,
      action: {
        label: tn('undo', { defaultValue: 'Undo' }),
        onClick: () => {
          if (!pending.current.delete(key)) return;
          setItems((prev) => {
            const have = new Set(prev.map((n) => n.id));
            return [...prev, ...removed.filter((n) => !have.has(n.id))].sort(byNewest);
          });
        },
      },
      onDismiss: () => sendDismiss(key, false),
      onAutoClose: () => sendDismiss(key, false),
    });
  };

  // Leaving the page (or this tab) sends whatever dismissal is still waiting.
  useEffect(() => {
    const flush = (keepalive: boolean) => {
      for (const key of [...pending.current.keys()]) sendDismiss(key, keepalive);
    };
    const onHide = () => flush(true);
    window.addEventListener('pagehide', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      flush(false);
    };
  }, [sendDismiss]);

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
        return '/progress?tab=achievements';
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
      case 'moderation':
      case 'strike':
        return '/settings/account-status';
      default:
        return null;
    }
  };

  const handleClick = (n: NotificationItem) => {
    const link = resolveLink(n);
    if (!link) return;
    // A stored link may point at a section of the page (`/settings/security#your-reports`).
    const at = link.indexOf('#');
    if (at === -1) navigate({ to: link });
    else navigate({ to: link.slice(0, at), hash: link.slice(at + 1) });
  };

  const loadMore = async () => {
    if (!nextCursor) return;
    setLoadingMore(true);
    const id = requestId.current;
    try {
      const data = await fetchPage({ filter, unreadOnly }, nextCursor);
      if (id === requestId.current) {
        setItems((prev) => [...prev, ...withoutPending(data.items)]);
        setNextCursor(data.nextCursor ?? null);
      }
    } catch {
      toast.error(tn('load-failed', { defaultValue: 'Could not load more notifications.' }));
    }
    setLoadingMore(false);
  };

  const groups = useMemo(() => groupNotifications(items), [items]);
  // Steel M9: the list replaces the spinner when fetched here; "Load more" appends rows that fade one by one.
  const arrival = useArrival(!loading);
  const isNew = useArrivingKeys(groups.map((g) => g.key));

  return (
    <div>
      {!embedded && (
        <h1 className="t-title pb-3">
          {t('notifications-heading', { defaultValue: 'Notifications' })}
        </h1>
      )}
      {/* The toolbar: three icons with hover labels, no primary (section 10, Inbox). */}
      <div className="flex flex-wrap items-center gap-1 pb-3">
        {push.supported && (
          <IconButton
            icon={push.subscribed ? BellOff : BellRing}
            label={
              push.subscribed
                ? t('push-off', { defaultValue: 'Disable push' })
                : t('push-on', { defaultValue: 'Enable push' })
            }
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
          />
        )}
        <IconButton
          icon={CheckCheck}
          label={
            filter === 'all'
              ? t('mark-all-read', { defaultValue: 'Mark all read' })
              : tn('mark-filter-read', { defaultValue: 'Mark these read' })
          }
          onClick={markAllRead}
        />
        <IconButton
          asChild
          label={t('notification-prefs-toggle', { defaultValue: 'Notification preferences' })}
        >
          <Link to="/settings/notifications">
            <Settings aria-hidden />
          </Link>
        </IconButton>
      </div>

      {/* Filter and Unread: the inbox tab strip is above, so the filter is a select, not a second strip. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-site-border pb-3">
        <Select
          aria-label={tn('filter-label', { defaultValue: 'Show' })}
          value={filter}
          onChange={(e) =>
            void showView({ filter: e.target.value as NotificationFilter, unreadOnly })
          }
          containerClassName="w-56 max-w-full"
        >
          {NOTIFICATION_FILTERS.map((f) => (
            <option key={f.id} value={f.id}>
              {filterLabel(f.id)}
            </option>
          ))}
        </Select>
        <label className="t-body flex cursor-pointer items-center gap-2 text-site-text">
          <Switch
            checked={unreadOnly}
            onCheckedChange={(checked) => void showView({ filter, unreadOnly: checked })}
          />
          {tn('unread-only', { defaultValue: 'Unread' })}
        </label>
      </div>
      {/* Announce the result of a filter change without moving focus off the select. */}
      <p className="sr-only" role="status" aria-live="polite">
        {loading
          ? ''
          : tn('result-count', {
              count: items.length,
              defaultValue_one: '{{count}} notification shown',
              defaultValue_other: '{{count}} notifications shown',
            })}
      </p>

      {loading ? (
        <div className="flex items-center justify-center px-4 pt-4 pb-12">
          <Spinner />
        </div>
      ) : loadError ? (
        <EmptyState
          title={tn('load-error-title', { defaultValue: 'Could not load notifications' })}
          description={tn('load-error-description', { defaultValue: 'Check your connection and try again.' })}
          action={
            <Button variant="default" onClick={() => void showView({ filter, unreadOnly })}>
              {tn('retry', { defaultValue: 'Try again' })}
            </Button>
          }
        />
      ) : items.length === 0 ? (
        <EmptyState
          className={arrival}
          title={
            filter === 'all' && !unreadOnly
              ? t('no-notifications-yet', { defaultValue: 'No notifications yet' })
              : tn('no-matches-title', { defaultValue: 'Nothing here' })
          }
          description={
            filter === 'all' && !unreadOnly
              ? t('no-notifications-description', {
                  defaultValue:
                    "When someone likes, comments on, reposts, or mentions you, it'll show up here.",
                })
              : tn('no-matches-description', {
                  defaultValue: 'No notifications match this view. Change the filter or turn off Unread.',
                })
          }
        />
      ) : (
        <div className={arrival}>
          {groups.map((g) => {
            const n = g.newest;
            const grouped = g.count > 1;
            const verb = n.type === 'SYSTEM' ? '' : verbs[n.type];
            const clickable = resolveLink(n) !== null;
            // System notifications have no human actor: lead with the message.
            const isSystem = n.type === 'SYSTEM' || !n.actor;
            const sys = isSystem ? systemIdentity(sysLabels, n.entityType, n.link) : null;
            // A site-written notice reads in the reader's language, its instants in their format; an old row keeps its
            // English preview.
            const previewText = inboxPreview(tNotice, n, (iso) => fmt.dateTime(iso, NOTICE_INSTANT));
            const firstName =
              n.actor?.name || n.actor?.handle || t('someone', { defaultValue: 'Someone' });
            const actorName = grouped
              ? t('grouped-actors', {
                  name: firstName,
                  count: g.count - 1,
                  defaultValue_one: '{{name}} and {{count}} other', defaultValue: '{{name}} and {{count}} others',
                })
              : firstName;
            const snooze = () =>
              setRemindTarget({
                kind: 'notification',
                targetId: n.id,
                label:
                  previewText?.slice(0, 120) ||
                  `${actorName} ${verb}`,
                // A reminder only ever opens a same-site path (the route enforces it).
                url: (() => {
                  const link = resolveLink(n);
                  return link && isSiteRelativePath(link) ? link : '/notifications';
                })(),
              });
            // A thread reply carries its own sentence ("Dana replied in X"): it leads the row instead of repeating the verb.
            const noticeLed = Boolean(sys) || (n.previewKey === 'game-thread-reply' && Boolean(previewText));
            const rowSummary =
              previewText && noticeLed
                ? previewText
                : `${actorName} ${verb}`.trim();
            // An unread notification is bold; a read one is a plain row.
            return (
              <div key={g.key} className={cn('rule-row row-hover py-3.5', isNew(g.key) && ARRIVE)}>
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
                        {noticeLed ? (
                          <p className="t-body font-semibold text-site-text">
                            {previewText || sys?.label}
                          </p>
                        ) : (
                          <>
                            <p className={`t-body text-site-text ${g.read ? '' : 'font-semibold'}`}>
                              <bdi className="font-semibold">{actorName}</bdi>{' '}
                              <span className={g.read ? 'text-site-text-muted' : ''}>
                                {verb}
                              </span>
                            </p>
                            {previewText && (
                              <p className="t-body mt-0.5 line-clamp-2 text-site-text-muted">
                                {previewText}
                              </p>
                            )}
                          </>
                        )}
                        {!g.read && (
                          <span className="sr-only">{tn('unread-sr', { defaultValue: 'Unread' })}</span>
                        )}
                        <p className="t-meta mt-1">
                          {fmt.relative(new Date(n.createdAt))}
                        </p>
                      </div>
                    </button>
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={snooze}
                      aria-label={t('snooze', { defaultValue: 'Later' })}
                      title={t('snooze', { defaultValue: 'Later' })}
                    >
                      <Bell className="h-4 w-4" aria-hidden />
                    </Button>
                    <NotificationRowMenu
                      summary={rowSummary}
                      read={g.read}
                      onToggleRead={() => void setGroupRead(g, !g.read)}
                      onDismiss={() => dismissGroup(g)}
                    />
                  </div>
                </SwipeRow>
              </div>
            );
          })}
        </div>
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
