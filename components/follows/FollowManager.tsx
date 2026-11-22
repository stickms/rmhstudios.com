import { useCallback, useEffect, useMemo, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Select } from '@/components/ui/select';
import { SearchField } from '@/components/ui/search-field';
import { SelectionBar } from '@/components/ui/selection-bar';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs } from '@/components/ui/tabs';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { ARRIVE, useArrival, useArrivingKeys } from '@/components/ui/arrive';
import { toast } from '@/lib/toast';
import { notifyFollowChanged } from '@/lib/discovery/margin-query';
import {
  followBack as followBackRequest,
  followsQuery,
  removeFollowers,
  undoUnfollow as undoUnfollowRequest,
  unfollowAccounts,
} from '@/lib/social/follow-manager.queries';
import {
  FOLLOW_FILTERS,
  FOLLOW_SORTS,
  INACTIVE_DAYS,
  type FollowFilter,
  type FollowQuery,
  type FollowRowData,
  type FollowSort,
  type FollowTab,
} from '@/lib/social/follow-filters';
import { FollowRow } from './FollowRow';

interface FollowManagerProps {
  query: FollowQuery;
  onQueryChange: (next: Partial<FollowQuery>) => void;
}

const UNDO_TOAST_MS = 8000;
const SEARCH_DEBOUNCE_MS = 300;

type Counts = { following: number; followers: number };

/** /follows: the member's following and followers, with search, filters, sorting and bulk actions. */
export function FollowManager({ query, onQueryChange }: FollowManagerProps) {
  const { t } = useTranslation('follows');
  const confirm = useConfirm();
  const { tab, filter, sort, q } = query;

  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [search, setSearch] = useState(q);
  // What this visit changed on top of the fetched pages: rows unfollowed or removed, people followed
  // back, and the matching count deltas. Cleared whenever the list is fetched again from the top.
  const [dropped, setDropped] = useState<ReadonlySet<string>>(new Set());
  const [followedBack, setFollowedBack] = useState<ReadonlySet<string>>(new Set());
  const [countDelta, setCountDelta] = useState<Counts>({ following: 0, followers: 0 });

  const list = useInfiniteQuery(followsQuery({ tab, filter, q, sort }));
  const { refetch } = list;
  const loading = list.isPending;
  const loadingMore = list.isFetchingNextPage;
  const failed = list.isError || list.isFetchNextPageError;
  const cursor = list.hasNextPage ? 'more' : null;

  const resetOverlay = useCallback(() => {
    setSelected(new Set());
    setDropped(new Set());
    setFollowedBack(new Set());
    setCountDelta({ following: 0, followers: 0 });
  }, []);

  // A new tab, filter, search or sort is a new list: what was selected or changed on the old one goes.
  useEffect(() => {
    resetOverlay();
  }, [tab, filter, q, sort, resetOverlay]);

  const rows = useMemo<FollowRowData[]>(
    () =>
      (list.data?.pages ?? [])
        .flatMap((page) => page.rows)
        .filter((r) => !dropped.has(r.id))
        .map((r) => (followedBack.has(r.id) ? { ...r, youFollow: true } : r)),
    [list.data, dropped, followedBack],
  );

  const fetchedCounts = list.data?.pages[0]?.counts ?? null;
  const counts = useMemo<Counts | null>(
    () =>
      fetchedCounts
        ? {
            following: Math.max(0, fetchedCounts.following + countDelta.following),
            followers: Math.max(0, fetchedCounts.followers + countDelta.followers),
          }
        : null,
    [fetchedCounts, countDelta],
  );

  // The search box is local until the member pauses, then it becomes the URL's `q`.
  useEffect(() => {
    if (search === q) return;
    const timer = setTimeout(() => onQueryChange({ q: search }), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search, q, onQueryChange]);

  const reload = useCallback(() => {
    resetOverlay();
    void refetch();
  }, [refetch, resetOverlay]);

  const loadMore = () => {
    if (!list.hasNextPage || loadingMore) return;
    void list.fetchNextPage();
  };

  const withBusy = async (id: string, run: () => Promise<void>) => {
    setBusy((prev) => new Set(prev).add(id));
    try {
      await run();
    } finally {
      setBusy((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const dropRows = (ids: ReadonlySet<string>) => {
    setDropped((prev) => new Set([...prev, ...ids]));
    setSelected((prev) => new Set([...prev].filter((id) => !ids.has(id))));
  };

  const adjustCounts = (delta: Partial<Counts>) =>
    setCountDelta((prev) => ({
      following: prev.following + (delta.following ?? 0),
      followers: prev.followers + (delta.followers ?? 0),
    }));

  const undoUnfollow = async (row: FollowRowData) => {
    try {
      await undoUnfollowRequest(row.id);
      notifyFollowChanged();
      toast.success(t('undo-done', { name: displayName(row), defaultValue: 'Following {{name}} again' }));
      reload();
    } catch {
      toast.error(t('undo-failed', { defaultValue: "Couldn't undo. Follow them again from their profile." }));
    }
  };

  const unfollowOne = (row: FollowRowData) =>
    withBusy(row.id, async () => {
      try {
        await unfollowAccounts([row.id]);
      } catch {
        toast.error(t('unfollow-failed', { defaultValue: "Couldn't unfollow. Try again." }));
        return;
      }
      notifyFollowChanged();
      dropRows(new Set([row.id]));
      adjustCounts({ following: -1 });
      toast(t('unfollowed', { name: displayName(row), defaultValue: 'Unfollowed {{name}}' }), {
        duration: UNDO_TOAST_MS,
        action: {
          label: t('undo', { defaultValue: 'Undo' }),
          onClick: () => void undoUnfollow(row),
        },
      });
    });

  const followBack = (row: FollowRowData) =>
    withBusy(row.id, async () => {
      try {
        await followBackRequest(row.id);
      } catch {
        toast.error(t('follow-failed', { defaultValue: "Couldn't follow. Try again." }));
        return;
      }
      notifyFollowChanged();
      setFollowedBack((prev) => new Set(prev).add(row.id));
      adjustCounts({ following: 1 });
    });

  const removeOne = async (row: FollowRowData) => {
    const ok = await confirm({
      title: t('remove-one-title', { name: displayName(row), defaultValue: 'Remove {{name}} as a follower?' }),
      description: t('remove-description', {
        defaultValue: 'They stop following you and are not told. They can follow you again.',
      }),
      confirmLabel: t('remove-follower', { defaultValue: 'Remove follower' }),
      danger: true,
    });
    if (!ok) return;
    await withBusy(row.id, async () => {
      try {
        const result = await removeFollowers([row.id]);
        if (result.done > 0) adjustCounts({ followers: -result.done });
      } catch {
        toast.error(t('remove-failed', { defaultValue: "Couldn't remove the follower. Try again." }));
        return;
      }
      dropRows(new Set([row.id]));
    });
  };

  const bulk = async () => {
    const ids = [...selected];
    if (ids.length === 0 || bulkBusy) return;
    const unfollowing = tab === 'following';
    const ok = await confirm(
      unfollowing
        ? {
            title: t('bulk-unfollow-title', {
              count: ids.length,
              defaultValue_one: 'Unfollow {{count}} account?',
              defaultValue_other: 'Unfollow {{count}} accounts?',
              defaultValue: 'Unfollow {{count}} accounts?',
            }),
            description: t('bulk-unfollow-description', {
              defaultValue: 'Their posts leave your Following feed. You can follow them again at any time.',
            }),
            confirmLabel: t('unfollow', { defaultValue: 'Unfollow' }),
            danger: true,
          }
        : {
            title: t('bulk-remove-title', {
              count: ids.length,
              defaultValue_one: 'Remove {{count}} follower?',
              defaultValue_other: 'Remove {{count}} followers?',
              defaultValue: 'Remove {{count}} followers?',
            }),
            description: t('remove-description', {
              defaultValue: 'They stop following you and are not told. They can follow you again.',
            }),
            confirmLabel: t('remove-follower', { defaultValue: 'Remove follower' }),
            danger: true,
          },
    );
    if (!ok) return;
    setBulkBusy(true);
    try {
      const result = unfollowing ? await unfollowAccounts(ids) : await removeFollowers(ids);
      if (unfollowing) notifyFollowChanged();
      toast.success(
        unfollowing
          ? t('bulk-unfollowed', {
              count: result.done,
              defaultValue_one: 'Unfollowed {{count}} account',
              defaultValue_other: 'Unfollowed {{count}} accounts',
              defaultValue: 'Unfollowed {{count}} accounts',
            })
          : t('bulk-removed', {
              count: result.done,
              defaultValue_one: 'Removed {{count}} follower',
              defaultValue_other: 'Removed {{count}} followers',
              defaultValue: 'Removed {{count}} followers',
            }),
      );
      reload();
    } catch {
      toast.error(t('bulk-failed', { defaultValue: "Couldn't finish. Nothing more was changed; try again." }));
    } finally {
      setBulkBusy(false);
    }
  };

  const onSelect = useCallback((id: string, on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const isNew = useArrivingKeys(rows.map((r) => r.id));
  const arrival = useArrival(!loading);

  const tabs = useMemo(
    () => [
      {
        id: 'following',
        label: t('tab-following', { defaultValue: 'Following' }),
        ...(counts ? { count: counts.following } : {}),
      },
      {
        id: 'followers',
        label: t('tab-followers', { defaultValue: 'Followers' }),
        ...(counts ? { count: counts.followers } : {}),
      },
    ],
    [t, counts],
  );

  const filterLabel = (id: FollowFilter) => {
    if (id === 'not-mutual') {
      return tab === 'following'
        ? t('filter-not-following-back', { defaultValue: 'Not following you back' })
        : t('filter-not-followed-back', { defaultValue: "You don't follow back" });
    }
    if (id === 'inactive') {
      return t('filter-inactive', { days: INACTIVE_DAYS, defaultValue: 'Inactive {{days}} days' });
    }
    return t('filter-all', { defaultValue: 'Everyone' });
  };
  const sortLabel = (id: FollowSort) => {
    if (id === 'name') return t('sort-name', { defaultValue: 'Name' });
    if (id === 'active') return t('sort-active', { defaultValue: 'Last active' });
    return t('sort-recent', { defaultValue: 'Most recent' });
  };

  const filtered = filter !== 'all' || q !== '';

  return (
    <div className="flex flex-col gap-4">
      <p className="t-meta">
        {t('not-block', {
          defaultValue:
            'Removing a follower is not blocking. They can follow you again; to stop that, block them from their profile.',
        })}{' '}
        <Link to="/help" className="underline">
          {t('how-to-block', { defaultValue: 'How to block' })}
        </Link>
      </p>

      <Tabs
        tabs={tabs}
        value={tab}
        onChange={(id) => onQueryChange({ tab: id as FollowTab, filter: 'all' })}
        idBase="follows"
        aria-label={t('tabs-label', { defaultValue: 'Follow lists' })}
      />

      <div
        role="tabpanel"
        id={`follows-panel-${tab}`}
        aria-labelledby={`follows-tab-${tab}`}
        className="flex flex-col gap-4"
      >
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-48 flex-1">
            <SearchField
              value={search}
              onValueChange={setSearch}
              placeholder={t('search-placeholder', { defaultValue: 'Search by name or handle' })}
              aria-label={t('search-label', { defaultValue: 'Search by name or handle' })}
            />
          </div>
          <Select
            controlSize="sm"
            value={filter}
            onChange={(e) => onQueryChange({ filter: e.target.value as FollowFilter })}
            aria-label={t('filter-label', { defaultValue: 'Filter' })}
          >
            {FOLLOW_FILTERS.map((id) => (
              <option key={id} value={id}>
                {filterLabel(id)}
              </option>
            ))}
          </Select>
          <Select
            controlSize="sm"
            value={sort}
            onChange={(e) => onQueryChange({ sort: e.target.value as FollowSort })}
            aria-label={t('sort-label', { defaultValue: 'Sort by' })}
          >
            {FOLLOW_SORTS.map((id) => (
              <option key={id} value={id}>
                {sortLabel(id)}
              </option>
            ))}
          </Select>
        </div>

        {loading ? (
          <div className="flex flex-col gap-3" aria-hidden>
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : failed && rows.length === 0 ? (
          <EmptyState
            className={arrival}
            title={t('load-failed', { defaultValue: "Couldn't load this list" })}
            action={<Button onClick={reload}>{t('retry', { defaultValue: 'Try again' })}</Button>}
          />
        ) : rows.length === 0 ? (
          <EmptyState
            className={arrival}
            title={
              filtered
                ? t('empty-filtered', { defaultValue: 'Nobody matches' })
                : tab === 'following'
                  ? t('empty-following', { defaultValue: "You aren't following anyone yet" })
                  : t('empty-followers', { defaultValue: 'Nobody follows you yet' })
            }
            description={
              filtered
                ? t('empty-filtered-description', { defaultValue: 'Change the search or the filter to see more.' })
                : undefined
            }
          />
        ) : (
          <div className={arrival}>
            <label className="t-label mb-1 flex items-center gap-3 border-b border-site-border pb-2">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={(e) => setSelected(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())}
                className="size-4 shrink-0 accent-site-text pointer-coarse:size-5"
              />
              {t('select-page', { defaultValue: 'Select all on this page' })}
            </label>
            <ul>
              {rows.map((row) => (
                <FollowRow
                  key={row.id}
                  row={row}
                  tab={tab}
                  selected={selected.has(row.id)}
                  busy={busy.has(row.id) || bulkBusy}
                  className={isNew(row.id) ? ARRIVE : undefined}
                  onSelect={onSelect}
                  onUnfollow={unfollowOne}
                  onFollowBack={followBack}
                  onRemove={removeOne}
                />
              ))}
            </ul>
            {failed && (
              <p role="alert" className="t-meta py-2 text-site-danger">
                {t('load-more-failed', { defaultValue: "Couldn't load more." })}
              </p>
            )}
            {cursor && (
              <div className="py-4">
                <Button disabled={loadingMore} onClick={loadMore}>
                  {t('load-more', { defaultValue: 'Load more' })}
                </Button>
              </div>
            )}
          </div>
        )}

        <SelectionBar
          count={selected.size}
          onClear={() => setSelected(new Set())}
          allSelected={allSelected}
          onSelectAll={() => setSelected(new Set(rows.map((r) => r.id)))}
          actions={[
            {
              id: 'bulk',
              variant: 'primary',
              disabled: bulkBusy,
              label:
                tab === 'following'
                  ? t('bulk-unfollow', { defaultValue: 'Unfollow selected' })
                  : t('bulk-remove', { defaultValue: 'Remove selected' }),
              onClick: () => void bulk(),
            },
          ]}
        />
      </div>
    </div>
  );
}

function displayName(row: FollowRowData): string {
  return row.name || row.username || row.handle || row.id;
}
