'use client';

/**
 * What the pile is made of: three views of the same eight categories, plus the
 * shape of the individual line items underneath them.
 *
 * The three category views answer three different questions and are therefore
 * three different forms rather than one form with a dropdown:
 *
 *  - **Bars** rank. "Which is biggest" is a length comparison against a shared
 *    baseline, which is the one thing bars are unbeatable at.
 *  - **The treemap** shows share. Eight rectangles that tile the whole box make
 *    "food is a third of everything" a thing you see rather than a thing you
 *    compute from two bar lengths.
 *  - **The histogram** is not about categories at all — it is the distribution
 *    of individual debts, which is where the ledger's character actually lives:
 *    a few thousand small ones, not a handful of large ones.
 *
 * All of them share the panel's cross-filter, so clicking `gambling` anywhere
 * dims it everywhere and the numbers above recompute. Colour follows the
 * category, never its rank, so a filtered chart never repaints the survivors.
 */

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { formatDebt, type DebtCategory } from '@/lib/kaikai-debt/debt';
import {
  CATEGORY_ORDER,
  distributionLabel,
  formatCompactDebt,
  formatShare,
  linearScale,
  logScale,
  squarify,
  valueNow,
  type CategoryStat,
  type DistributionBucket,
} from '@/lib/kaikai-debt/stats';
import { cn } from '@/lib/utils';
import {
  AxisLabels,
  ChartCard,
  ChartFrame,
  ChartToggle,
  GridLines,
  Readout,
  ReadoutRow,
  Swatch,
  makePlot,
  pointerInViewBox,
  seriesClass,
  useHoverIndex,
} from './chart-kit';

/**
 * The category names, translated.
 *
 * A lookup rather than an interpolated `{{category}}` key, for the reason
 * `DebtCounter#unitLabel` records: interpolating an English noun into a
 * translated sentence leaves the noun in English in all sixteen locales, and a
 * chart legend is nothing but nouns.
 */
export function categoryLabel(category: DebtCategory, t: TFunction): string {
  switch (category) {
    case 'food':
      return t('stats.category.food', { defaultValue: 'Food' });
    case 'transit':
      return t('stats.category.transit', { defaultValue: 'Transit' });
    case 'rent':
      return t('stats.category.rent', { defaultValue: 'Rent' });
    case 'gear':
      return t('stats.category.gear', { defaultValue: 'Gear' });
    case 'gambling':
      return t('stats.category.gambling', { defaultValue: 'Gambling' });
    case 'emotional':
      return t('stats.category.emotional', { defaultValue: 'Emotional' });
    case 'temporal':
      return t('stats.category.temporal', { defaultValue: 'Temporal' });
    default:
      return t('stats.category.other', { defaultValue: 'Other' });
  }
}

/* -------------------------------------------------------------------------- */
/* Ranked bars                                                                */
/* -------------------------------------------------------------------------- */

const BAR_PLOT = makePlot(720, 300, { left: 96, right: 60, top: 8, bottom: 26 });

interface CategoryBarsProps {
  categories: readonly CategoryStat[];
  nowMs: number;
  selected: ReadonlySet<string>;
  onToggle: (id: string) => void;
  /** Rank by what the debt is worth now, or by how many lines there are. */
  byCount: boolean;
  onByCountChange: (next: boolean) => void;
}

export function CategoryBars({
  categories,
  nowMs,
  selected,
  onToggle,
  byCount,
  onByCountChange,
}: CategoryBarsProps) {
  const { t } = useTranslation('c-kaikai-debt');
  const [hover, setHover] = useHoverIndex();

  const rows = useMemo(() => {
    const measured = categories.map((stat) => ({
      stat,
      // The palette slot is the CANONICAL index, not the row's position: sorting
      // reorders the rows and must not reorder the colours.
      seriesIndex: CATEGORY_ORDER.indexOf(stat.category),
      value: byCount ? stat.count : valueNow(stat, nowMs),
    }));
    measured.sort((a, b) => b.value - a.value);
    const total = measured.reduce((sum, row) => sum + row.value, 0);
    return { measured, total, max: measured[0]?.value ?? 1 };
  }, [categories, nowMs, byCount]);

  const rowHeight = BAR_PLOT.innerHeight / Math.max(1, rows.measured.length);
  const barHeight = Math.min(26, rowHeight - 6);
  const x = linearScale(0, Math.max(1, rows.max), BAR_PLOT.innerLeft, BAR_PLOT.innerRight);

  const active = hover >= 0 ? rows.measured[hover] : null;
  const filtering = selected.size > 0;

  return (
    <ChartCard
      title={t('stats.categories.title', { defaultValue: 'What he owes it on' })}
      hint={t('stats.categories.hint', {
        defaultValue:
          'Every category, ranked. Click a bar to filter the whole panel to it — the numbers, the other charts and the three spatial views all follow.',
      })}
      controls={
        <ChartToggle pressed={byCount} onPressedChange={onByCountChange}>
          {byCount
            ? t('stats.control.byCount', { defaultValue: 'By line count' })
            : t('stats.control.byValue', { defaultValue: 'By value' })}
        </ChartToggle>
      }
    >
      <ChartFrame
        plot={BAR_PLOT}
        title={t('stats.categories.title', { defaultValue: 'What he owes it on' })}
        description={t('stats.categories.desc', {
          defaultValue: 'A ranked bar chart of the debt by category.',
        })}
        onPointerMove={(event) => {
          const point = pointerInViewBox(event, BAR_PLOT);
          const index = Math.floor((point.y - BAR_PLOT.innerTop) / rowHeight);
          setHover(index >= 0 && index < rows.measured.length ? index : -1);
        }}
        onPointerLeave={() => setHover(-1)}
        onPointerDown={(event) => {
          const point = pointerInViewBox(event, BAR_PLOT);
          const index = Math.floor((point.y - BAR_PLOT.innerTop) / rowHeight);
          const row = rows.measured[index];
          if (row) onToggle(row.stat.category);
        }}
      >
        <GridLines plot={BAR_PLOT} ys={[]} />
        {rows.measured.map((row, index) => {
          const cy = BAR_PLOT.innerTop + index * rowHeight + rowHeight / 2;
          const width = Math.max(2, x(row.value) - BAR_PLOT.innerLeft);
          const dimmed = filtering && !selected.has(row.stat.category);
          return (
            <g
              key={row.stat.category}
              className={seriesClass(row.seriesIndex)}
              opacity={dimmed ? 0.28 : 1}
            >
              {/* Direct labels on every bar — eight series is past the point
                  where a legend alone identifies a mark, and the contrast WARN
                  on one palette slot obliges a visible label anyway. */}
              <text
                className="kd-chart__label"
                x={BAR_PLOT.innerLeft - 10}
                y={cy}
                textAnchor="end"
                dominantBaseline="middle"
              >
                {categoryLabel(row.stat.category, t)}
              </text>
              <rect
                className="kd-chart__bar"
                x={BAR_PLOT.innerLeft}
                y={cy - barHeight / 2}
                width={width}
                height={barHeight}
                opacity={hover === index ? 1 : 0.86}
              />
              <text
                className="kd-chart__label"
                x={BAR_PLOT.innerLeft + width + 8}
                y={cy}
                textAnchor="start"
                dominantBaseline="middle"
              >
                {byCount ? row.value.toLocaleString('en-US') : formatCompactDebt(row.value)}
              </text>
            </g>
          );
        })}
        <line
          className="kd-chart__axis"
          x1={BAR_PLOT.innerLeft}
          x2={BAR_PLOT.innerLeft}
          y1={BAR_PLOT.innerTop}
          y2={BAR_PLOT.innerBottom}
        />
      </ChartFrame>

      {active && (
        <Readout x={0.5} y={0.12}>
          <p className="mb-1 flex items-center gap-1.5 font-medium text-site-text">
            <Swatch seriesIndex={active.seriesIndex} />
            {categoryLabel(active.stat.category, t)}
          </p>
          <ReadoutRow
            label={t('stats.readout.worthNow', { defaultValue: 'Worth now' })}
            value={formatDebt(valueNow(active.stat, nowMs))}
          />
          <ReadoutRow
            label={t('stats.readout.faceValue', { defaultValue: 'Face value' })}
            value={formatDebt(active.stat.principalCents)}
          />
          <ReadoutRow
            label={t('stats.readout.lines', { defaultValue: 'Lines' })}
            value={active.stat.count.toLocaleString('en-US')}
          />
          <ReadoutRow
            label={t('stats.readout.share', { defaultValue: 'Share' })}
            value={formatShare(active.value / Math.max(1, rows.total))}
          />
          <ReadoutRow
            label={t('stats.readout.biggest', { defaultValue: 'Biggest single line' })}
            value={formatDebt(active.stat.maxCents)}
          />
        </Readout>
      )}
    </ChartCard>
  );
}

/* -------------------------------------------------------------------------- */
/* Treemap                                                                    */
/* -------------------------------------------------------------------------- */

const TREE_PLOT = makePlot(720, 360, { left: 0, right: 0, top: 0, bottom: 0 });

export function CategoryTreemap({
  categories,
  nowMs,
  selected,
  onToggle,
}: {
  categories: readonly CategoryStat[];
  nowMs: number;
  selected: ReadonlySet<string>;
  onToggle: (id: string) => void;
}) {
  const { t } = useTranslation('c-kaikai-debt');
  const [hover, setHover] = useHoverIndex();

  const layout = useMemo(() => {
    const values = categories.map((stat) => valueNow(stat, nowMs));
    const total = values.reduce((sum, value) => sum + value, 0);
    const tiles = squarify(values, TREE_PLOT.width, TREE_PLOT.height);
    return { tiles, values, total };
  }, [categories, nowMs]);

  const filtering = selected.size > 0;
  const activeTile = hover >= 0 ? layout.tiles[hover] : null;
  const activeStat = activeTile ? categories[activeTile.index] : null;

  return (
    <ChartCard
      title={t('stats.treemap.title', { defaultValue: 'The pile, to scale' })}
      hint={t('stats.treemap.hint', {
        defaultValue:
          'Area is share of the compounded balance. Every tile is the same eight colours as everywhere else on this page; click one to filter.',
      })}
    >
      <ChartFrame
        plot={TREE_PLOT}
        title={t('stats.treemap.title', { defaultValue: 'The pile, to scale' })}
        description={t('stats.treemap.desc', {
          defaultValue: 'A treemap where each category’s area is its share of the total debt.',
        })}
        className="rounded-site-sm"
        onPointerMove={(event) => {
          const point = pointerInViewBox(event, TREE_PLOT);
          setHover(
            layout.tiles.findIndex(
              (tile) =>
                point.x >= tile.x &&
                point.x <= tile.x + tile.width &&
                point.y >= tile.y &&
                point.y <= tile.y + tile.height,
            ),
          );
        }}
        onPointerLeave={() => setHover(-1)}
        onPointerDown={(event) => {
          const point = pointerInViewBox(event, TREE_PLOT);
          const tile = layout.tiles.find(
            (candidate) =>
              point.x >= candidate.x &&
              point.x <= candidate.x + candidate.width &&
              point.y >= candidate.y &&
              point.y <= candidate.y + candidate.height,
          );
          if (tile) onToggle(categories[tile.index]!.category);
        }}
      >
        {layout.tiles.map((tile, index) => {
          const stat = categories[tile.index]!;
          const dimmed = filtering && !selected.has(stat.category);
          const label = categoryLabel(stat.category, t);
          // A tile only gets its label when the label fits. Clipped text in a
          // treemap reads as a different, shorter category name.
          const roomy = tile.width > 76 && tile.height > 34;
          return (
            <g key={stat.category} className={seriesClass(tile.index)} opacity={dimmed ? 0.3 : 1}>
              {/* The 2px inset IS the gap between tiles — a stroke would add its
                  own weight to each tile's apparent area. */}
              <rect
                x={tile.x + 1}
                y={tile.y + 1}
                width={Math.max(0, tile.width - 2)}
                height={Math.max(0, tile.height - 2)}
                fill="currentColor"
                rx={4}
                opacity={hover === index ? 1 : 0.9}
              />
              {roomy && (
                <>
                  <text x={tile.x + 10} y={tile.y + 20} className="kd-tile__label" textAnchor="start">
                    {label}
                  </text>
                  <text x={tile.x + 10} y={tile.y + 35} className="kd-tile__label" textAnchor="start">
                    {formatShare(layout.values[tile.index]! / Math.max(1, layout.total))}
                  </text>
                </>
              )}
            </g>
          );
        })}
      </ChartFrame>

      {activeStat && activeTile && (
        <Readout
          x={(activeTile.x + activeTile.width / 2) / TREE_PLOT.width}
          y={(activeTile.y + activeTile.height / 2) / TREE_PLOT.height}
        >
          <p className="mb-1 flex items-center gap-1.5 font-medium text-site-text">
            <Swatch seriesIndex={activeTile.index} />
            {categoryLabel(activeStat.category, t)}
          </p>
          <ReadoutRow
            label={t('stats.readout.worthNow', { defaultValue: 'Worth now' })}
            value={formatDebt(valueNow(activeStat, nowMs))}
          />
          <ReadoutRow
            label={t('stats.readout.share', { defaultValue: 'Share' })}
            value={formatShare(layout.values[activeTile.index]! / Math.max(1, layout.total))}
          />
          <ReadoutRow
            label={t('stats.readout.lines', { defaultValue: 'Lines' })}
            value={activeStat.count.toLocaleString('en-US')}
          />
        </Readout>
      )}
    </ChartCard>
  );
}

/* -------------------------------------------------------------------------- */
/* Distribution                                                               */
/* -------------------------------------------------------------------------- */

const HIST_PLOT = makePlot(720, 260, { left: 52, right: 12, top: 12, bottom: 44 });

export function DistributionChart({
  distribution,
  logY,
  onLogYChange,
}: {
  distribution: readonly DistributionBucket[];
  logY: boolean;
  onLogYChange: (next: boolean) => void;
}) {
  const { t } = useTranslation('c-kaikai-debt');
  const [hover, setHover] = useHoverIndex();

  const max = useMemo(
    () => distribution.reduce((m, bucket) => Math.max(m, bucket.count), 1),
    [distribution],
  );
  const total = useMemo(
    () => distribution.reduce((sum, bucket) => sum + bucket.count, 0),
    [distribution],
  );

  const bandWidth = HIST_PLOT.innerWidth / Math.max(1, distribution.length);
  const barWidth = Math.max(2, bandWidth - 4);
  const y = logY
    ? logScale(1, max, HIST_PLOT.innerBottom, HIST_PLOT.innerTop, 1)
    : linearScale(0, max, HIST_PLOT.innerBottom, HIST_PLOT.innerTop);

  const active = hover >= 0 ? distribution[hover] : null;

  return (
    <ChartCard
      title={t('stats.distribution.title', { defaultValue: 'How big a debt usually is' })}
      hint={t('stats.distribution.hint', {
        defaultValue:
          'Buckets are log-spaced, because the amounts are: the median line is a few dollars and the tail runs to whatever the appraiser felt like that day.',
      })}
      controls={
        <ChartToggle pressed={logY} onPressedChange={onLogYChange}>
          {t('stats.control.logCount', { defaultValue: 'Log counts' })}
        </ChartToggle>
      }
    >
      <ChartFrame
        plot={HIST_PLOT}
        title={t('stats.distribution.title', { defaultValue: 'How big a debt usually is' })}
        description={t('stats.distribution.desc', {
          defaultValue: 'A histogram of individual debt amounts in log-spaced buckets.',
        })}
        onPointerMove={(event) => {
          const point = pointerInViewBox(event, HIST_PLOT);
          const index = Math.floor((point.x - HIST_PLOT.innerLeft) / bandWidth);
          setHover(index >= 0 && index < distribution.length ? index : -1);
        }}
        onPointerLeave={() => setHover(-1)}
      >
        <GridLines
          plot={HIST_PLOT}
          ys={(logY ? [1, 10, 100, 1_000, 10_000] : [max * 0.25, max * 0.5, max * 0.75, max])
            .filter((value) => value <= max)
            .map((value) => y(value))}
        />
        <g className="kd-series-1">
          {distribution.map((bucket, index) => {
            const height = Math.max(0, HIST_PLOT.innerBottom - y(Math.max(bucket.count, logY ? 1 : 0)));
            return (
              <rect
                key={bucket.index}
                className="kd-chart__bar"
                x={HIST_PLOT.innerLeft + index * bandWidth + 2}
                y={HIST_PLOT.innerBottom - height}
                width={barWidth}
                height={bucket.count === 0 ? 0 : Math.max(2, height)}
                opacity={hover === index ? 1 : 0.85}
              />
            );
          })}
        </g>
        <AxisLabels
          anchor="middle"
          items={distribution
            // Every other bucket's lower edge, staggered onto two rows.
            // Fourteen labels reading "$2.5k–$5k" will not fit side by side, and
            // a rotated axis is harder to read than a sparser one. The stagger
            // is keyed off the BUCKET index, not the filtered position — off the
            // latter it is always even and every label lands on the same row,
            // which is the collision it exists to prevent.
            .filter((bucket) => bucket.index % 2 === 0)
            .map((bucket) => ({
              key: String(bucket.index),
              x: HIST_PLOT.innerLeft + bucket.index * bandWidth + bandWidth / 2,
              y: HIST_PLOT.innerBottom + 14 + (bucket.index % 4 === 0 ? 0 : 13),
              text: formatCompactDebt(bucket.loCents),
            }))}
        />
      </ChartFrame>

      {active && (
        <Readout
          x={(HIST_PLOT.innerLeft + hover * bandWidth + bandWidth / 2) / HIST_PLOT.width}
          y={0.2}
        >
          <p className="mb-1 font-medium text-site-text">{distributionLabel(active.index)}</p>
          <ReadoutRow
            label={t('stats.readout.lines', { defaultValue: 'Lines' })}
            value={active.count.toLocaleString('en-US')}
          />
          <ReadoutRow
            label={t('stats.readout.share', { defaultValue: 'Share' })}
            value={formatShare(active.count / Math.max(1, total))}
          />
          <ReadoutRow
            label={t('stats.readout.faceValue', { defaultValue: 'Face value' })}
            value={formatDebt(active.principalCents)}
          />
        </Readout>
      )}
    </ChartCard>
  );
}

/* -------------------------------------------------------------------------- */
/* Source split                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Member-added versus recovered-from-the-archive, as one stacked bar.
 *
 * Two segments, so it is a bar and not a pie: a pie of two things asks the
 * reader to compare angles when they could have compared lengths. The 2px gap
 * between the segments is a real gap in the surface, so neither segment's
 * boundary is doing double duty as the other's edge.
 */
export function SourceSplit({
  memberCents,
  ledgerCents,
  memberCount,
  ledgerCount,
}: {
  memberCents: number;
  ledgerCents: number;
  memberCount: number;
  ledgerCount: number;
}) {
  const { t } = useTranslation('c-kaikai-debt');
  const total = Math.max(1, memberCents + ledgerCents);
  const memberShare = memberCents / total;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full" aria-hidden>
        <span
          className={cn('h-full rounded-full bg-current', seriesClass(4))}
          style={{ width: `${Math.max(1, memberShare * 100)}%` }}
        />
        <span
          className={cn('h-full flex-1 rounded-full bg-current', seriesClass(1))}
        />
      </div>
      <dl className="grid grid-cols-2 gap-2 text-xs">
        <div className="flex flex-col gap-0.5">
          <dt className="flex items-center gap-1.5 text-site-text-muted">
            <Swatch seriesIndex={4} />
            {t('stats.source.member', { defaultValue: 'Put there by people' })}
          </dt>
          <dd className="font-medium text-site-text tabular-nums">
            {formatDebt(memberCents)} · {memberCount.toLocaleString('en-US')}
          </dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="flex items-center gap-1.5 text-site-text-muted">
            <Swatch seriesIndex={1} />
            {t('stats.source.ledger', { defaultValue: 'Recovered from his history' })}
          </dt>
          <dd className="font-medium text-site-text tabular-nums">
            {formatDebt(ledgerCents)} · {ledgerCount.toLocaleString('en-US')}
          </dd>
        </div>
      </dl>
    </div>
  );
}
