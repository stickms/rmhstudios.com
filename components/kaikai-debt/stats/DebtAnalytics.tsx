'use client';

/**
 * The analytics panel — everything the counter cannot say in one number.
 *
 * ## One fetch, one clock, one filter
 *
 * The whole section runs off a single request (`/api/kaikai-debt/stats`), a
 * single interval (`useChartClock`), and a single set of selected categories.
 * That is not tidiness for its own sake:
 *
 *  - **One fetch** because every chart here is an aggregate over the same table
 *    read behind the same cache, and a panel that fired eight requests would be
 *    eight chances to draw half of itself.
 *  - **One clock** because every figure on this page is `basis · e^(r·t)`, and
 *    two charts ticking on two intervals would visibly disagree about what `t`
 *    is — on a page whose entire subject is that the number never stops.
 *  - **One filter** because the cross-filter is the thing that makes this a
 *    panel rather than a gallery. Click `gambling` in the bar chart and the
 *    treemap dims it, the terrain dims it, the 4D cloud dims it and the globe
 *    dims it, because all five are reading the same `Set`.
 *
 * ## Why the heavy views are behind tabs
 *
 * Three canvas renderers, a dozen SVG charts and a live gauge do not belong on
 * screen simultaneously — not for layout reasons but for work: each spatial view
 * owns a frame loop, and three loops competing for the main thread on a page
 * that also has an infinite scroll under it is a page that stutters. Tabs mean
 * exactly one of them is mounted at a time. (Each also stops itself when off
 * screen or in a background tab, so the tab strip is the coarse control and the
 * observers are the fine one.)
 *
 * The strip is `<LiquidTabs>`, which is the site's only sanctioned tab strip.
 */

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, Box, Globe2, Grid3x3, LineChart, Orbit, Table2 } from 'lucide-react';
import type { DebtSnapshot } from '@/lib/kaikai-debt/debt';
import {
  CATEGORY_ORDER,
  emptyStats,
  valueNow,
  type DebtStats,
} from '@/lib/kaikai-debt/stats';
import type { CreditInputs } from '@/lib/kaikai-debt/credit';
import { LiquidTabs } from '@/components/ui/liquid-tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { Legend, useChartClock, useToggleSet } from './chart-kit';
import { AccrualChart, type HorizonId } from './AccrualChart';
import {
  CategoryBars,
  CategoryTreemap,
  DistributionChart,
  SourceSplit,
  categoryLabel,
} from './CompositionCharts';
import { RhythmHeatmap } from './RhythmHeatmap';
import { PersonLeaderboard } from './Leaderboards';
import { StatTiles } from './StatTiles';
import { StatsTable } from './StatsTable';
import { DebtSurface3D } from './DebtSurface3D';
import { HyperCube4D } from './HyperCube4D';
import { DebtGlobe } from './DebtGlobe';
import { CreditScore } from './CreditScore';

type TabId = 'overview' | 'composition' | 'rhythm' | 'terrain' | 'hyper' | 'globe' | 'table';

export function DebtAnalytics({ snapshot }: { snapshot: DebtSnapshot }) {
  const { t } = useTranslation('c-kaikai-debt');
  const [tab, setTab] = useState<TabId>('overview');
  const [logScaleOn, setLogScaleOn] = useState(true);
  const [logCounts, setLogCounts] = useState(false);
  const [byCount, setByCount] = useState(false);
  const [horizon, setHorizon] = useState<HorizonId>('year');
  const filter = useToggleSet();

  /**
   * The stats read.
   *
   * `staleTime` matches the endpoint's own cache so a tab switch inside the
   * window is free, and `refetchInterval` is long because nothing here needs to
   * be fresher than that — the *movement* on screen comes from compounding the
   * bases against the clock, not from refetching them.
   */
  const query = useQuery<DebtStats>({
    queryKey: ['kaikai-debt', 'stats'],
    queryFn: async () => {
      const response = await fetch('/api/kaikai-debt/stats');
      if (!response.ok) throw new Error(`stats ${response.status}`);
      return (await response.json()) as DebtStats;
    },
    staleTime: 30_000,
    refetchInterval: 120_000,
    refetchOnWindowFocus: false,
  });

  const stats = query.data ?? emptyStats(snapshot.asOfMs);
  const nowMs = useChartClock(stats.asOfMs);

  const inputs: CreditInputs = useMemo(
    () => ({
      basisCents: stats.totals.basisCents || snapshot.basisCents,
      principalCents: stats.totals.principalCents || snapshot.principalCents,
      entryCount: stats.totals.count || snapshot.entryCount,
      memberEntryCount: stats.totals.memberEntryCount || snapshot.memberEntryCount,
      oldestMs: stats.span.oldestMs,
      categoriesUsed: stats.categories.filter((category) => category.count > 0).length,
    }),
    [stats, snapshot],
  );

  const legendItems = useMemo(
    () =>
      stats.categories.map((stat) => ({
        id: stat.category,
        label: categoryLabel(stat.category, t),
        seriesIndex: CATEGORY_ORDER.indexOf(stat.category),
        value: stat.count > 0 ? stat.count.toLocaleString('en-US') : undefined,
      })),
    [stats.categories, t],
  );

  /** The totals the tiles show, narrowed to the filter when one is on. */
  const scoped = useMemo(() => {
    if (filter.selected.size === 0) return stats;
    const categories = stats.categories.filter((stat) => filter.selected.has(stat.category));
    const totals = categories.reduce(
      (sum, stat) => ({
        count: sum.count + stat.count,
        principalCents: sum.principalCents + stat.principalCents,
        basisCents: sum.basisCents + stat.basisCents,
        memberPrincipalCents: sum.memberPrincipalCents + stat.memberPrincipalCents,
        memberEntryCount: sum.memberEntryCount + stat.memberCount,
        contributorCount: stats.totals.contributorCount,
        creditorCount: stats.totals.creditorCount,
      }),
      {
        count: 0,
        principalCents: 0,
        basisCents: 0,
        memberPrincipalCents: 0,
        memberEntryCount: 0,
        contributorCount: stats.totals.contributorCount,
        creditorCount: stats.totals.creditorCount,
      },
    );
    return { ...stats, totals };
  }, [stats, filter.selected]);

  const tabs = [
    { id: 'overview', label: t('stats.tab.overview', { defaultValue: 'Overview' }), icon: LineChart },
    {
      id: 'composition',
      label: t('stats.tab.composition', { defaultValue: 'Composition' }),
      icon: BarChart3,
    },
    { id: 'rhythm', label: t('stats.tab.rhythm', { defaultValue: 'Rhythm' }), icon: Grid3x3 },
    { id: 'terrain', label: t('stats.tab.terrain', { defaultValue: '3D' }), icon: Box },
    { id: 'hyper', label: t('stats.tab.hyper', { defaultValue: '4D' }), icon: Orbit },
    { id: 'globe', label: t('stats.tab.globe', { defaultValue: 'Globe' }), icon: Globe2 },
    { id: 'table', label: t('stats.tab.table', { defaultValue: 'Table' }), icon: Table2 },
  ];

  return (
    <section className="flex flex-col gap-4" aria-labelledby="kd-analytics-title">
      <div className="flex flex-col gap-1">
        <h2 id="kd-analytics-title" className="font-display text-xl font-semibold text-site-text">
          {t('stats.title', { defaultValue: 'The books, in detail' })}
        </h2>
        <p className="max-w-prose text-sm text-pretty text-site-text-muted">
          {t('stats.lede', {
            defaultValue:
              'Every figure below is a basis, not a total — the browser compounds it against the clock, so these charts keep growing while you read them, exactly like the counter at the top. Pick a category to filter everything at once.',
          })}
        </p>
      </div>

      <CreditScore inputs={inputs} asOfMs={snapshot.asOfMs} />

      <StatTiles stats={scoped} nowMs={nowMs} />

      <div className="glass-fill flex flex-col gap-3 rounded-site p-3 sm:p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-xs font-medium text-site-text-muted">
            {t('stats.filter.title', { defaultValue: 'Filter every chart' })}
          </h3>
          {filter.selected.size > 0 && (
            <button
              type="button"
              onClick={filter.clear}
              className="rounded-site-sm px-1.5 py-0.5 text-xs text-site-accent transition-colors hover:underline"
            >
              {t('stats.filter.clear', {
                defaultValue: 'Clear ({{count}} selected)',
                count: filter.selected.size,
              })}
            </button>
          )}
        </div>
        <Legend
          items={legendItems}
          selected={filter.selected}
          onToggle={filter.toggle}
          label={t('stats.filter.legend', { defaultValue: 'Debt categories' })}
        />
        <SourceSplit
          memberCents={valueNow(
            {
              count: 0,
              principalCents: 0,
              basisCents: stats.sources.find((s) => s.source === 'member')?.basisCents ?? 0,
            },
            nowMs,
          )}
          ledgerCents={valueNow(
            {
              count: 0,
              principalCents: 0,
              basisCents: stats.sources.find((s) => s.source === 'ledger')?.basisCents ?? 0,
            },
            nowMs,
          )}
          memberCount={stats.sources.find((s) => s.source === 'member')?.count ?? 0}
          ledgerCount={stats.sources.find((s) => s.source === 'ledger')?.count ?? 0}
        />
      </div>

      <LiquidTabs
        idBase="kd-analytics"
        value={tab}
        onChange={(id) => setTab(id as TabId)}
        aria-label={t('stats.tabsLabel', { defaultValue: 'How to look at the books' })}
        tabs={tabs}
      />

      {query.isPending ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-64 w-full rounded-site" />
          <Skeleton className="h-24 w-full rounded-site" />
        </div>
      ) : (
        <div
          role="tabpanel"
          id={`kd-analytics-panel-${tab}`}
          aria-labelledby={`kd-analytics-tab-${tab}`}
          className="flex flex-col gap-4"
        >
          {tab === 'overview' && (
            <>
              <AccrualChart
                timeline={stats.timeline}
                basisCents={
                  filter.selected.size > 0 ? scoped.totals.basisCents : stats.totals.basisCents
                }
                nowMs={nowMs}
                logScaleOn={logScaleOn}
                onLogScaleChange={setLogScaleOn}
                horizon={horizon}
                onHorizonChange={setHorizon}
              />
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <PersonLeaderboard
                  people={stats.creditors}
                  nowMs={nowMs}
                  seriesIndex={2}
                  title={t('stats.creditors.title', { defaultValue: 'Who he owes the most' })}
                  hint={t('stats.creditors.hint', {
                    defaultValue:
                      'Includes debts he ran up before anyone was counting — a recovered receipt names a real member as its creditor whether or not they ever logged anything.',
                  })}
                  emptyLabel={t('stats.creditors.empty', { defaultValue: 'Nobody yet.' })}
                />
                <PersonLeaderboard
                  people={stats.contributors}
                  nowMs={nowMs}
                  seriesIndex={5}
                  title={t('stats.contributors.title', { defaultValue: 'Who put it there' })}
                  hint={t('stats.contributors.hint', {
                    defaultValue:
                      'Members who have added a line themselves, ranked by what those lines are worth now.',
                  })}
                  emptyLabel={t('stats.contributors.empty', {
                    defaultValue: 'Nobody has added anything yet.',
                  })}
                />
              </div>
            </>
          )}

          {tab === 'composition' && (
            <>
              <CategoryBars
                categories={stats.categories}
                nowMs={nowMs}
                selected={filter.selected}
                onToggle={filter.toggle}
                byCount={byCount}
                onByCountChange={setByCount}
              />
              <CategoryTreemap
                categories={stats.categories}
                nowMs={nowMs}
                selected={filter.selected}
                onToggle={filter.toggle}
              />
              <DistributionChart
                distribution={stats.distribution}
                logY={logCounts}
                onLogYChange={setLogCounts}
              />
            </>
          )}

          {tab === 'rhythm' && <RhythmHeatmap rhythm={stats.rhythm} nowMs={nowMs} />}
          {tab === 'terrain' && (
            <DebtSurface3D grid={stats.grid} nowMs={nowMs} selected={filter.selected} />
          )}
          {tab === 'hyper' && (
            <HyperCube4D grid={stats.grid} nowMs={nowMs} selected={filter.selected} />
          )}
          {tab === 'globe' && (
            <DebtGlobe grid={stats.grid} nowMs={nowMs} selected={filter.selected} />
          )}
          {tab === 'table' && <StatsTable stats={stats} nowMs={nowMs} />}
        </div>
      )}

      {query.isError && (
        <p className={cn('glass-inset rounded-site-sm p-3 text-sm text-site-text-muted')}>
          {t('stats.error', {
            defaultValue:
              'The books would not open just now. The counter and the log are unaffected — try again in a moment.',
          })}
        </p>
      )}
    </section>
  );
}
