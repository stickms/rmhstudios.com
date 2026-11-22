/**
 * /progress/compare?with=<handle> — the signed-in member's achievements beside another member's: three counts, a
 * filter, rarity, each side's state in words, masked secrets, and Track on what only the other member has.
 *
 * A sibling of `/progress` (`progress_`), not a child: it does not render the progress tabs. `noindex`: it is about
 * two members and needs a session.
 */
import { useMemo, useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import { useSession } from '@/components/Providers';
import { CompareSummary } from '@/components/achievements/CompareSummary';
import { CompareTable } from '@/components/achievements/CompareTable';
import { Select } from '@/components/ui/select';
import { EmptyState } from '@/components/ui/empty-state';
import { SignedOutPrompt } from '@/components/ui/signed-out-prompt';
import { Spinner } from '@/components/ui/spinner';
import { Tabs, type TabItem } from '@/components/ui/tabs';
import { useArrival } from '@/components/ui/arrive';
import { CATEGORY_LABELS, type AchievementCategory } from '@/lib/achievements/catalog';
import { COMPARE_FILTERS, countBuckets, filterCompareRows, type CompareFilter } from '@/lib/achievements/compare';
import { compareAchievementsApi } from '@/lib/achievements/compare.contract';
import { HANDLE_OR_ID } from '@/lib/achievements/compare';
import {
  TRACKED_ACHIEVEMENTS_KEY,
  setAchievementTracked,
  trackedAchievementsQuery,
} from '@/lib/achievements/tracking.queries';
import { contractQuery } from '@/lib/route/route-query';
import { errorField, HttpError } from '@/lib/http';
import { toast } from '@/lib/toast';
import { noindexHead } from '@/lib/seo';

const CATEGORY_ORDER: AchievementCategory[] = ['social', 'games', 'creator', 'economy', 'special'];

export const Route = createFileRoute('/_site/progress_/compare')({
  validateSearch: (search: Record<string, unknown>): { with?: string } =>
    typeof search.with === 'string' && HANDLE_OR_ID.test(search.with.trim()) ? { with: search.with.trim() } : {},
  head: () => noindexHead('Compare achievements'),
  component: ComparePage,
});

function ComparePage() {
  const { t } = useTranslation('achievement-compare');
  const { with: handle } = Route.useSearch();
  const { data: session, isPending: sessionPending } = useSession();
  const title = t('title', { defaultValue: 'Compare achievements' });
  const callback = handle ? `/progress/compare?with=${encodeURIComponent(handle)}` : '/progress/compare';

  if (sessionPending) {
    return (
      <PageLayout title={title} backTo="/progress?tab=achievements">
        <div className="flex min-h-[40dvh] items-center justify-center">
          <Spinner size={32} />
        </div>
      </PageLayout>
    );
  }
  if (!session) {
    return (
      <PageLayout title={title} backTo="/progress?tab=achievements">
        <SignedOutPrompt
          callbackURL={callback}
          title={t('sign-in-title', { defaultValue: 'Sign in to compare achievements' })}
        />
      </PageLayout>
    );
  }
  return (
    <PageLayout title={title} backTo="/progress?tab=achievements">
      {handle ? <Comparison handle={handle} /> : <NoOne />}
    </PageLayout>
  );
}

function NoOne() {
  const { t } = useTranslation('achievement-compare');
  return (
    <EmptyState
      title={t('no-one-title', { defaultValue: 'No one to compare with' })}
      description={t('no-one-description', {
        defaultValue: 'Choose a member from Compare with… on the achievements tab, or check the handle.',
      })}
    />
  );
}

function Comparison({ handle }: { handle: string }) {
  const { t } = useTranslation('achievement-compare');
  const { t: tn } = useTranslation('achievement-tracker');
  const queryClient = useQueryClient();
  const query = useQuery({
    ...contractQuery(
      ['achievements-compare', handle],
      compareAchievementsApi,
      { query: { with: handle } },
      {
        staleTime: 15_000,
        retry: false,
      },
    ),
  });
  const trackedQuery = useQuery(trackedAchievementsQuery());
  const [filter, setFilter] = useState<CompareFilter>('all');
  const [category, setCategory] = useState<AchievementCategory | 'all'>('all');
  const arrival = useArrival(!query.isPending);

  const toggle = useMutation({
    mutationFn: ({ id, tracked }: { id: string; tracked: boolean }) => setAchievementTracked(id, tracked),
    onSuccess: (next) => queryClient.setQueryData(TRACKED_ACHIEVEMENTS_KEY, next),
    onError: (error) => {
      toast.error(
        errorField(error, 'code') === 'limit'
          ? tn('track-limit', {
              count: trackedQuery.data?.max ?? 5,
              defaultValue: 'You can track up to {{count}} achievements. Untrack one first.',
            })
          : tn('track-failed', { defaultValue: 'Could not update your tracked achievements.' }),
      );
    },
  });
  const trackedIds = useMemo(() => new Set(trackedQuery.data?.tracked ?? []), [trackedQuery.data]);

  const rows = query.data?.rows;
  const counts = useMemo(() => (rows ? countBuckets(rows) : null), [rows]);
  const shown = useMemo(() => (rows ? filterCompareRows(rows, filter, category) : []), [rows, filter, category]);

  if (query.isPending) {
    return (
      <div className="flex min-h-[40dvh] items-center justify-center">
        <Spinner size={32} />
      </div>
    );
  }
  if (query.isError || !query.data || !counts) {
    return query.error instanceof HttpError && query.error.status === 404 ? (
      <NoOne />
    ) : (
      <EmptyState
        className={arrival}
        description={t('load-failed', { defaultValue: 'Could not load the comparison.' })}
      />
    );
  }

  const { you, them } = query.data;
  const themName = them.name || them.handle || t('them-fallback', { defaultValue: 'Them' });
  const labels: Record<CompareFilter, string> = {
    all: t('filter-all', { defaultValue: 'All' }),
    both: t('filter-both', { defaultValue: 'Both' }),
    you: t('filter-you', { defaultValue: 'Only you' }),
    them: t('filter-them', { defaultValue: 'Only them' }),
    neither: t('filter-neither', { defaultValue: 'Neither' }),
  };
  const tabs: TabItem[] = COMPARE_FILTERS.map((id) => ({
    id,
    label: labels[id],
    count: id === 'all' ? (rows?.length ?? 0) : counts[id],
  }));

  return (
    <div className={arrival}>
      <CompareSummary you={you} them={them} counts={counts} />
      <div className="flex flex-wrap items-end justify-between gap-3 pt-6">
        <Tabs
          tabs={tabs}
          value={filter}
          onChange={(id) => setFilter(id as CompareFilter)}
          idBase="compare"
          aria-label={t('filter-label', { defaultValue: 'Show' })}
        />
        <Select
          aria-label={t('category-label', { defaultValue: 'Category' })}
          controlSize="sm"
          containerClassName="w-44 max-w-full"
          value={category}
          onChange={(e) => setCategory(e.target.value as AchievementCategory | 'all')}
        >
          <option value="all">{t('category-all', { defaultValue: 'All categories' })}</option>
          {CATEGORY_ORDER.map((id) => (
            <option key={id} value={id}>
              {CATEGORY_LABELS[id]}
            </option>
          ))}
        </Select>
      </div>
      <div
        role="tabpanel"
        id={`compare-panel-${filter}`}
        aria-labelledby={`compare-tab-${filter}`}
        className="pt-2 pb-12"
      >
        {shown.length === 0 ? (
          <EmptyState description={t('no-matches', { defaultValue: 'No achievements match these filters.' })} />
        ) : (
          <CompareTable
            rows={shown}
            themName={themName}
            trackedIds={trackedIds}
            busyId={toggle.isPending ? (toggle.variables?.id ?? null) : null}
            canTrack={trackedQuery.data !== undefined}
            onToggleTrack={(id, tracked) => toggle.mutate({ id, tracked })}
          />
        )}
      </div>
    </div>
  );
}
