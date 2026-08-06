'use client';

/**
 * The table view — every chart's data, as data.
 *
 * This is not a fallback for browsers without SVG; it is a required part of the
 * panel. Two of the accessibility rules the charts are built under end here:
 *
 *  - a categorical mark whose colour clears the CVD separation target but sits
 *    just under 3:1 against a white surface is legal **only** where the reader
 *    has a non-colour route to the same information, and
 *  - a heatmap, a treemap and a 4D projection have no reading order at all, so
 *    a screen reader is given a summary by `<desc>` and the numbers by this.
 *
 * It is also just useful. "What exactly is the gambling row" is a question a
 * table answers in one glance and a treemap never answers precisely.
 */

import { useTranslation } from 'react-i18next';
import { formatDebt } from '@/lib/kaikai-debt/debt';
import { formatShare, valueNow, type DebtStats } from '@/lib/kaikai-debt/stats';
import { CATEGORY_ORDER } from '@/lib/kaikai-debt/stats';
import { Swatch } from './chart-kit';
import { categoryLabel } from './CompositionCharts';

export function StatsTable({ stats, nowMs }: { stats: DebtStats; nowMs: number }) {
  const { t } = useTranslation('c-kaikai-debt');
  const total = Math.max(1, valueNow(stats.totals, nowMs));

  return (
    <div className="glass-fill flex flex-col gap-3 rounded-site p-3 sm:p-4">
      <div className="flex flex-col gap-0.5">
        <h3 className="font-display text-sm font-semibold text-site-text">
          {t('stats.table.title', { defaultValue: 'Every number on this page' })}
        </h3>
        <p className="text-xs text-pretty text-site-text-dim">
          {t('stats.table.hint', {
            defaultValue:
              'The same figures the charts are drawn from. Colour is never the only thing telling you which row is which.',
          })}
        </p>
      </div>

      {/* A wide table scrolls inside its own box; the page body never scrolls
          sideways. */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] border-collapse text-left text-xs">
          <caption className="sr-only">
            {t('stats.table.caption', {
              defaultValue: 'Debt by category: compounded value, face value, line count and share.',
            })}
          </caption>
          <thead>
            <tr className="text-site-text-dim">
              <th scope="col" className="py-1.5 pr-3 font-medium">
                {t('stats.table.category', { defaultValue: 'Category' })}
              </th>
              <th scope="col" className="py-1.5 pr-3 text-right font-medium">
                {t('stats.readout.worthNow', { defaultValue: 'Worth now' })}
              </th>
              <th scope="col" className="py-1.5 pr-3 text-right font-medium">
                {t('stats.readout.faceValue', { defaultValue: 'Face value' })}
              </th>
              <th scope="col" className="py-1.5 pr-3 text-right font-medium">
                {t('stats.readout.lines', { defaultValue: 'Lines' })}
              </th>
              <th scope="col" className="py-1.5 pr-3 text-right font-medium">
                {t('stats.table.biggest', { defaultValue: 'Biggest' })}
              </th>
              <th scope="col" className="py-1.5 text-right font-medium">
                {t('stats.readout.share', { defaultValue: 'Share' })}
              </th>
            </tr>
          </thead>
          <tbody>
            {stats.categories.map((stat) => {
              const value = valueNow(stat, nowMs);
              return (
                <tr key={stat.category} className="border-t border-site-border">
                  <th scope="row" className="py-1.5 pr-3 font-normal text-site-text">
                    <span className="flex items-center gap-1.5">
                      <Swatch seriesIndex={CATEGORY_ORDER.indexOf(stat.category)} />
                      {categoryLabel(stat.category, t)}
                    </span>
                  </th>
                  <td className="py-1.5 pr-3 text-right text-site-text tabular-nums">
                    {formatDebt(value)}
                  </td>
                  <td className="py-1.5 pr-3 text-right text-site-text-muted tabular-nums">
                    {formatDebt(stat.principalCents)}
                  </td>
                  <td className="py-1.5 pr-3 text-right text-site-text-muted tabular-nums">
                    {stat.count.toLocaleString('en-US')}
                  </td>
                  <td className="py-1.5 pr-3 text-right text-site-text-muted tabular-nums">
                    {formatDebt(stat.maxCents)}
                  </td>
                  <td className="py-1.5 text-right text-site-text-muted tabular-nums">
                    {formatShare(value / total)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-site-border font-medium text-site-text">
              <th scope="row" className="py-1.5 pr-3 text-left">
                {t('stats.table.total', { defaultValue: 'Total' })}
              </th>
              <td className="py-1.5 pr-3 text-right tabular-nums">{formatDebt(total)}</td>
              <td className="py-1.5 pr-3 text-right tabular-nums">
                {formatDebt(stats.totals.principalCents)}
              </td>
              <td className="py-1.5 pr-3 text-right tabular-nums">
                {stats.totals.count.toLocaleString('en-US')}
              </td>
              <td className="py-1.5 pr-3 text-right tabular-nums">
                {formatDebt(stats.largest[0]?.amountCents ?? 0)}
              </td>
              <td className="py-1.5 text-right tabular-nums">100%</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
