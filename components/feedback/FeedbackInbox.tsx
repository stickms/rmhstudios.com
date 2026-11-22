import { useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Label } from '@/components/ui/label';
import { SearchField } from '@/components/ui/search-field';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs } from '@/components/ui/tabs';
import { useArrival, useArrivingKeys } from '@/components/ui/arrive';
import { api } from '@/lib/contract/client';
import { listAdminFeedbackApi } from '@/lib/feedback/inbox.contract';
import { FEEDBACK_STATUSES, type FeedbackStatus } from '@/lib/feedback/inbox';
import type { FeedbackCategory } from '@/lib/feedback-schema';
import { FeedbackDetailDialog } from '@/components/feedback/FeedbackDetailDialog';
import { useFeedbackLabels } from '@/components/feedback/feedback-labels';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';

/** The admin inbox: New, In progress and Closed segments, a category filter, a text search, and a keyset-paged list. */
export function FeedbackInbox() {
  const { t } = useTranslation('feedback-inbox');
  const fmt = useLocaleFormat();
  const labels = useFeedbackLabels();
  const [status, setStatus] = useState<FeedbackStatus>('new');
  const [category, setCategory] = useState<FeedbackCategory | ''>('');
  const [draft, setDraft] = useState('');
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  const list = useInfiniteQuery({
    queryKey: [listAdminFeedbackApi.path, status, category, q],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      api(listAdminFeedbackApi, {
        query: {
          status,
          ...(category
            ? {
                category,
              }
            : {}),
          ...(q
            ? {
                q,
              }
            : {}),
          ...(pageParam
            ? {
                after: pageParam,
              }
            : {}),
        },
        signal,
      }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const rows = list.data?.pages.flatMap((p) => p.rows) ?? [];
  const counts = list.data?.pages[0]?.counts ?? null;
  const arrival = useArrival(!list.isPending);
  const arrived = useArrivingKeys(rows.map((r) => r.id));

  const tabs = FEEDBACK_STATUSES.map((s) => ({
    id: s,
    label: labels.statusOf(s),
    ...(counts
      ? {
          count: counts[s],
        }
      : {}),
  }));

  return (
    <div className="space-y-4">
      <Tabs
        tabs={tabs}
        value={status}
        onChange={(id) => setStatus(id as FeedbackStatus)}
        aria-label={t('tabs-label', {
          defaultValue: 'Feedback status',
        })}
      />
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setQ(draft.trim());
        }}
      >
        <div className="min-w-48 flex-1 space-y-1.5">
          <Label htmlFor="fb-search">
            {t('search-label', {
              defaultValue: 'Search messages',
            })}
          </Label>
          <SearchField
            id="fb-search"
            value={draft}
            onValueChange={(v) => {
              setDraft(v);
              if (v === '') setQ('');
            }}
            maxLength={100}
            placeholder={t('search-placeholder', {
              defaultValue: 'Words in the message',
            })}
          />
        </div>
        <div className="w-44 space-y-1.5">
          <Label htmlFor="fb-category-filter">
            {t('filter-category', {
              defaultValue: 'Category',
            })}
          </Label>
          <Select
            id="fb-category-filter"
            value={category}
            onChange={(e) => setCategory(e.target.value as FeedbackCategory | '')}
          >
            <option value="">
              {t('filter-any', {
                defaultValue: 'Any category',
              })}
            </option>
            {labels.categoryIds.map((c) => (
              <option key={c} value={c}>
                {labels.categoryOf(c)}
              </option>
            ))}
          </Select>
        </div>
        <Button type="submit">
          {t('search-submit', {
            defaultValue: 'Search',
          })}
        </Button>
      </form>
      {q ? (
        <p className="t-meta">
          {t('search-window', {
            defaultValue: 'Searching the newest 5,000 messages.',
          })}
        </p>
      ) : null}

      {list.isPending ? (
        <div className="space-y-2" aria-busy="true">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : list.isError ? (
        <p role="alert" className="t-body text-site-danger">
          {t('list-error', {
            defaultValue: 'Could not load feedback.',
          })}
        </p>
      ) : rows.length === 0 ? (
        <EmptyState
          className={arrival}
          title={t('list-empty-title', {
            defaultValue: 'Nothing here',
          })}
          description={t('list-empty-description', {
            defaultValue: 'No feedback matches these filters.',
          })}
        />
      ) : (
        <div className={arrival}>
          <ul>
            {rows.map((r) => (
              <li key={r.id} className={`border-b border-site-border ${arrived(r.id) ? 'arrive' : ''}`}>
                <button type="button" onClick={() => setOpenId(r.id)} className="block w-full py-3 text-start">
                  <span className="t-body block break-words font-medium">{r.firstLine}</span>
                  <span className="t-meta mt-1 flex flex-wrap gap-x-3">
                    <span>{r.user.name}</span>
                    <span>{labels.categoryOf(r.category)}</span>
                    {r.status === 'closed' && r.outcome ? <span>{labels.outcomeOf(r.outcome)}</span> : null}
                    <span>{fmt.relative(r.createdAt)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {list.hasNextPage ? (
            <Button className="mt-3" loading={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>
              {t('load-more', {
                defaultValue: 'Load more',
              })}
            </Button>
          ) : null}
        </div>
      )}
      <FeedbackDetailDialog id={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}
