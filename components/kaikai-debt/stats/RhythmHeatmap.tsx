'use client';

/**
 * When he does it — a 7 × 24 heatmap of every line on the books, by UTC weekday
 * and hour.
 *
 * A heatmap rather than two bar charts (one per weekday, one per hour) because
 * the interesting thing is the *interaction*: "Saturday" and "3am" are each
 * unremarkable, and "Saturday at 3am" is the whole finding. Marginal charts
 * cannot show a cell.
 *
 * ## The ramp, and why it has six steps and not a gradient
 *
 * Magnitude gets a single-hue sequential ramp — one hue, monotone lightness,
 * validated as an ordinal scale (adjacent steps ≥0.06 apart in OKLCH L, the pale
 * end clearing 2:1 against its own surface, in both light and dark). Five live
 * steps plus a distinct "nothing here" step, rather than a continuous gradient,
 * because a reader can match a cell to a legend swatch and cannot match it to a
 * point on a gradient bar.
 *
 * Quantising also fixes the thing that makes most heatmaps unreadable: the
 * counts on this page are heavily skewed, so a linear continuous mapping puts
 * 95% of the grid in the bottom 5% of the ramp. The steps are quantiles of the
 * non-empty cells, so each step carries roughly a fifth of the occupied grid and
 * the pattern is visible instead of being technically present.
 */

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { formatDebt } from '@/lib/kaikai-debt/debt';
import { densifyRhythm, valueNow, type RhythmCell } from '@/lib/kaikai-debt/stats';
import { cn } from '@/lib/utils';
import {
  ChartCard,
  ChartFrame,
  Readout,
  ReadoutRow,
  makePlot,
  pointerInViewBox,
  useHoverIndex,
} from './chart-kit';

const PLOT = makePlot(720, 260, { left: 40, right: 8, top: 22, bottom: 8 });

/** Weekday names, translated. Index 0 is Sunday, matching `Date#getUTCDay`. */
function weekdayLabel(day: number, t: TFunction): string {
  switch (day) {
    case 0:
      return t('stats.weekday.sun', { defaultValue: 'Sun' });
    case 1:
      return t('stats.weekday.mon', { defaultValue: 'Mon' });
    case 2:
      return t('stats.weekday.tue', { defaultValue: 'Tue' });
    case 3:
      return t('stats.weekday.wed', { defaultValue: 'Wed' });
    case 4:
      return t('stats.weekday.thu', { defaultValue: 'Thu' });
    case 5:
      return t('stats.weekday.fri', { defaultValue: 'Fri' });
    default:
      return t('stats.weekday.sat', { defaultValue: 'Sat' });
  }
}

/** How many live steps the ramp has. Step 0 is reserved for an empty cell. */
const STEPS = 5;

export function RhythmHeatmap({
  rhythm,
  nowMs,
}: {
  rhythm: readonly RhythmCell[];
  nowMs: number;
}) {
  const { t } = useTranslation('c-kaikai-debt');
  const [hover, setHover] = useHoverIndex();

  const model = useMemo(() => {
    const cells = densifyRhythm(rhythm);
    // Quantile breaks over the OCCUPIED cells only. Including the empties would
    // put every break at zero on a sparse grid and collapse the ramp.
    const occupied = cells
      .map((cell) => cell.count)
      .filter((count) => count > 0)
      .sort((a, b) => a - b);
    const breaks: number[] = [];
    for (let i = 1; i < STEPS; i++) {
      breaks.push(occupied[Math.floor((occupied.length * i) / STEPS)] ?? 0);
    }
    const step = (count: number): number => {
      if (count <= 0) return 0;
      let s = 1;
      for (const boundary of breaks) if (count > boundary) s++;
      return Math.min(STEPS, s);
    };
    const busiest = cells.reduce((best, cell) => (cell.count > best.count ? cell : best), cells[0]);
    return { cells, step, busiest, total: occupied.reduce((sum, n) => sum + n, 0) };
  }, [rhythm]);

  const cellW = PLOT.innerWidth / 24;
  const cellH = PLOT.innerHeight / 7;
  const active = hover >= 0 ? model.cells[hover] : null;

  return (
    <ChartCard
      title={t('stats.rhythm.title', { defaultValue: 'When it happens' })}
      hint={t('stats.rhythm.hint', {
        defaultValue:
          'Every line on the books by UTC weekday and hour. Darker means busier; an untinted cell means nothing has ever been logged in that hour.',
      })}
      footer={
        <div className="flex flex-wrap items-center gap-3 text-xs text-site-text-muted">
          <span className="flex items-center gap-1.5">
            {t('stats.rhythm.less', { defaultValue: 'Fewer' })}
            {Array.from({ length: STEPS + 1 }, (_, i) => (
              <span
                key={i}
                aria-hidden
                className={cn('inline-block size-3 rounded-[3px] bg-current', `kd-heat-${i}`)}
              />
            ))}
            {t('stats.rhythm.more', { defaultValue: 'More' })}
          </span>
          {model.busiest && model.busiest.count > 0 && (
            <span>
              {t('stats.rhythm.peak', {
                defaultValue: 'Busiest: {{day}} at {{hour}}:00 UTC ({{count}} lines)',
                day: weekdayLabel(model.busiest.weekday, t),
                hour: String(model.busiest.hour).padStart(2, '0'),
                count: model.busiest.count,
              })}
            </span>
          )}
        </div>
      }
    >
      <ChartFrame
        plot={PLOT}
        title={t('stats.rhythm.title', { defaultValue: 'When it happens' })}
        description={t('stats.rhythm.desc', {
          defaultValue:
            'A heatmap of debt lines by day of the week and hour of the day, in UTC.',
        })}
        onPointerMove={(event) => {
          const point = pointerInViewBox(event, PLOT);
          const col = Math.floor((point.x - PLOT.innerLeft) / cellW);
          const row = Math.floor((point.y - PLOT.innerTop) / cellH);
          setHover(
            col >= 0 && col < 24 && row >= 0 && row < 7 ? row * 24 + col : -1,
          );
        }}
        onPointerLeave={() => setHover(-1)}
      >
        {/* Hour ruler across the top, every four hours. */}
        <g aria-hidden>
          {[0, 4, 8, 12, 16, 20].map((hour) => (
            <text
              key={hour}
              className="kd-chart__label"
              x={PLOT.innerLeft + hour * cellW + cellW / 2}
              y={PLOT.innerTop - 8}
              textAnchor="middle"
            >
              {String(hour).padStart(2, '0')}
            </text>
          ))}
        </g>

        {model.cells.map((cell, index) => (
          <g key={index} className={`kd-heat-${model.step(cell.count)}`}>
            <rect
              className={cn('kd-heat__cell', hover >= 0 && hover !== index && 'kd-heat__cell--dim')}
              x={PLOT.innerLeft + cell.hour * cellW + 1}
              y={PLOT.innerTop + cell.weekday * cellH + 1}
              width={Math.max(1, cellW - 2)}
              height={Math.max(1, cellH - 2)}
            />
          </g>
        ))}

        <g aria-hidden>
          {Array.from({ length: 7 }, (_, day) => (
            <text
              key={day}
              className="kd-chart__label"
              x={PLOT.innerLeft - 8}
              y={PLOT.innerTop + day * cellH + cellH / 2}
              textAnchor="end"
              dominantBaseline="middle"
            >
              {weekdayLabel(day, t)}
            </text>
          ))}
        </g>
      </ChartFrame>

      {active && (
        <Readout
          x={(PLOT.innerLeft + active.hour * cellW + cellW / 2) / PLOT.width}
          y={(PLOT.innerTop + active.weekday * cellH + cellH / 2) / PLOT.height}
        >
          <p className="mb-1 font-medium text-site-text">
            {t('stats.rhythm.cell', {
              defaultValue: '{{day}}, {{hour}}:00 UTC',
              day: weekdayLabel(active.weekday, t),
              hour: String(active.hour).padStart(2, '0'),
            })}
          </p>
          <ReadoutRow
            label={t('stats.readout.lines', { defaultValue: 'Lines' })}
            value={active.count.toLocaleString('en-US')}
          />
          <ReadoutRow
            label={t('stats.readout.worthNow', { defaultValue: 'Worth now' })}
            value={formatDebt(valueNow(active, nowMs))}
          />
        </Readout>
      )}
    </ChartCard>
  );
}
