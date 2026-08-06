'use client';

/**
 * The two sides of the ledger, as people.
 *
 * **Creditors** — who he owes the most to. **Contributors** — who has put the
 * most on his tab. They are not the same list and the difference is the point:
 * a generated receipt names a real member as its creditor without that member
 * ever having touched the page, so somebody can be owed a great deal by a debt
 * they never logged.
 *
 * Ranked bars against a shared baseline, because "who is highest" is a length
 * comparison. One series, so no legend — the heading names it. The bar is one
 * colour rather than eight, because the identity here is carried by the name
 * beside it and colouring twelve people twelve ways would spend the categorical
 * palette on a dimension that does not have categories.
 */

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { formatDebt } from '@/lib/kaikai-debt/debt';
import { valueNow, type PersonStat } from '@/lib/kaikai-debt/stats';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { cn } from '@/lib/utils';
import { seriesClass } from './chart-kit';

function displayName(stat: PersonStat): string {
  return stat.person.name ?? (stat.person.handle ? `@${stat.person.handle}` : 'Someone');
}

export function PersonLeaderboard({
  people,
  nowMs,
  title,
  hint,
  seriesIndex,
  emptyLabel,
}: {
  people: readonly PersonStat[];
  nowMs: number;
  title: string;
  hint: string;
  /** Which palette slot the bars take. Constant across the list, by design. */
  seriesIndex: number;
  emptyLabel: string;
}) {
  const { t } = useTranslation('c-kaikai-debt');

  const rows = useMemo(() => {
    const measured = people.map((stat) => ({ stat, value: valueNow(stat, nowMs) }));
    const max = measured.reduce((m, row) => Math.max(m, row.value), 1);
    return { measured, max };
  }, [people, nowMs]);

  return (
    <section className="glass-fill flex flex-col gap-3 rounded-site p-2.5 sm:p-4">
      <div className="flex flex-col gap-0.5">
        <h3 className="font-display text-sm font-semibold text-site-text">{title}</h3>
        <p className="text-xs text-pretty text-site-text-muted">{hint}</p>
      </div>

      {rows.measured.length === 0 ? (
        <p className="py-6 text-center text-sm text-site-text-muted">{emptyLabel}</p>
      ) : (
        <ol className="flex flex-col gap-1.5">
          {rows.measured.map((row, index) => {
            const name = displayName(row.stat);
            const width = Math.max(2, (row.value / rows.max) * 100);
            return (
              <li key={row.stat.person.id} className="flex flex-col gap-1">
                <div className="flex items-center gap-2 text-xs">
                  <span className="w-4 shrink-0 text-site-text-muted tabular-nums">{index + 1}</span>
                  <UserAvatar
                    src={row.stat.person.image}
                    alt=""
                    size={20}
                    fallbackName={name}
                    className="shrink-0"
                  />
                  {row.stat.person.handle ? (
                    <Link
                      to={`/u/${row.stat.person.handle}` as string}
                      className="min-w-0 truncate text-site-text underline-offset-4 hover:underline"
                    >
                      {name}
                    </Link>
                  ) : (
                    <span className="min-w-0 truncate text-site-text">{name}</span>
                  )}
                  <span className="ml-auto shrink-0 font-medium text-site-text tabular-nums">
                    {formatDebt(row.value)}
                  </span>
                  <span className="w-14 shrink-0 text-right text-site-text-muted tabular-nums">
                    {t('stats.readout.linesShort', {
                      defaultValue: '{{count}} lines',
                      count: row.stat.count,
                    })}
                  </span>
                </div>
                {/* The bar is a `div`, not an SVG: twelve rows of one rectangle
                    each do not need a coordinate system, and a flow-laid bar
                    reflows correctly next to text at any width. */}
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-site-surface-active" aria-hidden>
                  <div
                    className={cn('h-full rounded-full bg-current', seriesClass(seriesIndex))}
                    style={{ width: `${width}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
