'use client';

/**
 * The numbers that are not charts.
 *
 * Some of the most useful facts about this ledger are single values — the
 * median debt, the Gini coefficient, when the balance passes a million — and a
 * single value is not a chart. Plotting one is the most common way a dashboard
 * wastes a screen: a bar with nothing to compare itself to conveys exactly the
 * number printed beside it, in ten times the space.
 *
 * So these are tiles: a label, a value, and one line of context. The rule the
 * grid follows is that a tile earns its place by answering a question the charts
 * cannot — "how unequal is it" is not visible in a histogram, and "when does he
 * owe a million dollars" is not visible anywhere until you solve the projection
 * for t, which {@link timeToReachMs} does exactly.
 */

import { useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Activity,
  CalendarClock,
  Coins,
  Gauge,
  Layers,
  Ruler,
  Scale,
  Sigma,
  TrendingUp,
  Users,
} from 'lucide-react';
import { ANNUAL_INTEREST_RATE, formatDebt } from '@/lib/kaikai-debt/debt';
import {
  formatCompactDebt,
  formatShare,
  timeToReachMs,
  valueNow,
  type DebtStats,
} from '@/lib/kaikai-debt/stats';
import { cn } from '@/lib/utils';

/** A round number worth naming a date for — the next power of ten past the total. */
function nextMilestoneCents(currentCents: number): number {
  const dollars = Math.max(1, currentCents / 100);
  return 10 ** Math.ceil(Math.log10(dollars) + 0.0001) * 100;
}

const DATE_LABEL = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

export function StatTiles({ stats, nowMs }: { stats: DebtStats; nowMs: number }) {
  const { t } = useTranslation('c-kaikai-debt');

  const derived = useMemo(() => {
    const total = valueNow(stats.totals, nowMs);
    const milestoneCents = nextMilestoneCents(total);
    const milestoneAtMs = timeToReachMs(stats.totals.basisCents, milestoneCents);
    const spanDays = Math.max(1, (stats.span.newestMs - stats.span.oldestMs) / 86_400_000);
    const categoriesUsed = stats.categories.filter((c) => c.count > 0).length;
    const interestCents = Math.max(0, total - stats.totals.principalCents);
    return {
      total,
      milestoneCents,
      milestoneAtMs,
      spanDays,
      categoriesUsed,
      interestCents,
      perDay: stats.totals.count / spanDays,
    };
  }, [stats, nowMs]);

  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4">
      <Tile
        icon={Coins}
        label={t('stats.tile.balance', { defaultValue: 'Compounded balance' })}
        value={formatDebt(derived.total)}
        detail={t('stats.tile.balanceDetail', {
          defaultValue: '{{principal}} of it was actually spent',
          principal: formatCompactDebt(stats.totals.principalCents),
        })}
      />
      <Tile
        icon={TrendingUp}
        label={t('stats.tile.interest', { defaultValue: 'Pure interest' })}
        value={formatDebt(derived.interestCents)}
        detail={t('stats.tile.interestDetail', {
          defaultValue: '{{share}} of what he owes never bought anything',
          share: formatShare(derived.interestCents / Math.max(1, derived.total)),
        })}
      />
      <Tile
        icon={Sigma}
        label={t('stats.tile.lines', { defaultValue: 'Lines on the books' })}
        value={stats.totals.count.toLocaleString('en-US')}
        detail={t('stats.tile.linesDetail', {
          defaultValue: '{{rate}} a day across the whole archive',
          rate: derived.perDay.toFixed(1),
        })}
      />
      <Tile
        icon={Users}
        label={t('stats.tile.people', { defaultValue: 'People involved' })}
        value={stats.totals.creditorCount.toLocaleString('en-US')}
        detail={t('stats.tile.peopleDetail', {
          defaultValue: '{{authors}} of them logged something themselves',
          authors: stats.totals.contributorCount,
        })}
      />
      <Tile
        icon={Ruler}
        label={t('stats.tile.median', { defaultValue: 'Median debt' })}
        value={formatDebt(stats.moments.p50Cents)}
        detail={t('stats.tile.medianDetail', {
          defaultValue: 'Mean {{mean}} · 99th {{p99}}',
          mean: formatCompactDebt(stats.moments.meanCents),
          p99: formatCompactDebt(stats.moments.p99Cents),
        })}
      />
      <Tile
        icon={Scale}
        label={t('stats.tile.gini', { defaultValue: 'Gini coefficient' })}
        value={stats.moments.gini.toFixed(3)}
        detail={t('stats.tile.giniDetail', {
          defaultValue: '0 = every debt identical, 1 = one debt is all of it',
        })}
      />
      <Tile
        icon={Activity}
        label={t('stats.tile.spread', { defaultValue: 'Spread' })}
        value={formatCompactDebt(stats.moments.stdevCents)}
        detail={t('stats.tile.spreadDetail', {
          defaultValue: 'Standard deviation · HHI {{hhi}}',
          hhi: stats.moments.hhi.toFixed(4),
        })}
      />
      <Tile
        icon={Layers}
        label={t('stats.tile.categories', { defaultValue: 'Kinds of debt' })}
        value={`${derived.categoriesUsed}/8`}
        detail={t('stats.tile.categoriesDetail', {
          defaultValue: 'Categories he has managed to owe money in',
        })}
      />
      <Tile
        icon={Gauge}
        label={t('stats.tile.rate', { defaultValue: 'Rate' })}
        value={`${Math.round(ANNUAL_INTEREST_RATE * 100)}%`}
        detail={t('stats.tile.rateDetail', {
          defaultValue: 'Compounded continuously, forever, from the moment each line lands',
        })}
      />
      <Tile
        icon={CalendarClock}
        label={t('stats.tile.milestone', {
          defaultValue: 'Passes {{amount}}',
          amount: formatCompactDebt(derived.milestoneCents),
        })}
        value={
          derived.milestoneAtMs
            ? DATE_LABEL.format(new Date(derived.milestoneAtMs))
            : t('stats.tile.milestoneNever', { defaultValue: 'never' })
        }
        detail={t('stats.tile.milestoneDetail', {
          defaultValue: 'Solved from today’s books — nobody has to add a thing',
        })}
      />
      <Tile
        icon={CalendarClock}
        label={t('stats.tile.span', { defaultValue: 'Archive covers' })}
        value={t('stats.tile.spanValue', {
          defaultValue: '{{years}} years',
          years: (derived.spanDays / 365.2425).toFixed(1),
        })}
        detail={t('stats.tile.spanDetail', {
          defaultValue: 'Oldest recovered receipt to the newest line',
        })}
      />
      <Tile
        icon={Coins}
        label={t('stats.tile.largest', { defaultValue: 'Biggest single line' })}
        value={formatDebt(stats.largest[0]?.amountCents ?? 0)}
        detail={stats.largest[0]?.item ?? t('stats.tile.largestNone', { defaultValue: 'Nothing yet' })}
      />
    </dl>
  );
}

function Tile({
  icon: Icon,
  label,
  value,
  detail,
  className,
}: {
  icon: typeof Coins;
  label: string;
  value: ReactNode;
  detail: string;
  className?: string;
}) {
  return (
    <div className={cn('glass-fill flex flex-col gap-1 rounded-site p-2.5 sm:p-3', className)}>
      <dt className="flex items-center gap-1.5 text-xs text-site-text-muted">
        <Icon className="size-3.5 shrink-0" aria-hidden />
        <span className="min-w-0 truncate">{label}</span>
      </dt>
      <dd className="font-display text-lg leading-tight font-semibold text-site-text tabular-nums">
        {value}
      </dd>
      <p className="text-xs text-pretty text-site-text-muted">{detail}</p>
    </div>
  );
}
