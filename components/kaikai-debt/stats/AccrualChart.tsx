'use client';

/**
 * The accrual chart — what he has owed, and what he is about to owe.
 *
 * One line, two halves. The solid half is history: everything logged up to each
 * month, compounded to that month and no further, which is the odometer's own
 * function evaluated backwards. The dashed half is the projection: the same
 * function evaluated forwards from today's basis, under the one assumption that
 * is certainly wrong and is the only one that can be stated honestly — that
 * nobody adds anything else.
 *
 * ## Why it is one line and not two
 *
 * Because a second y-axis is the most common way a chart lies, and this chart
 * had an obvious excuse for one: face value and compounded value are different
 * measures, and on a young ledger they differ by very little. Plotting them
 * against two scales would let the reader "see" the interest overtake the
 * principal at whatever moment the axes were chosen to make it happen. Both
 * series are money, both are cents, so both go on the one axis, and the gap
 * between them is a real gap.
 *
 * ## Why the log toggle is on by default
 *
 * The subject of the page is continuous compounding at 249% a year. On a linear
 * axis that is a flat line followed by a wall, and every month before the last
 * few is unreadable. On a log axis constant exponential growth is a straight
 * line, so the shape of the curve *is* the information: a kink means the rate
 * of new debt changed, which is the only thing in this chart a viewer can
 * actually learn. The toggle is there because the wall is the joke, and
 * sometimes you want to see the wall.
 */

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDebt } from '@/lib/kaikai-debt/debt';
import {
  areaPath,
  formatCompactDebt,
  formatMonth,
  linePath,
  linearScale,
  logScale,
  logTicks,
  nearestIndex,
  niceTicks,
  projectSeries,
  withCumulative,
  type TimelineBucket,
} from '@/lib/kaikai-debt/stats';
import { LiquidTabs } from '@/components/ui/liquid-tabs';
import {
  AxisLabels,
  ChartCard,
  ChartFrame,
  ChartToggle,
  GridLines,
  Readout,
  ReadoutRow,
  makePlot,
  pointerInViewBox,
  useHoverIndex,
  type Plot,
} from './chart-kit';

/**
 * The plot's geometry.
 *
 * A fixed viewBox rather than a measured one: the SVG is `width: 100%; height:
 * auto` inside a `relative` box, so its rendered box IS this viewBox scaled
 * uniformly. That means a viewBox coordinate divided by the viewBox extent is
 * the fraction across the container — which is how the readout is positioned,
 * with no measurement pass, no ResizeObserver and no layout read in an event.
 */
const PLOT: Plot = makePlot(720, 300, { left: 58, right: 14, top: 14, bottom: 30 });

/** How far ahead the dashed half runs, keyed by the horizon control. */
const HORIZONS = [
  { id: 'month', days: 30 },
  { id: 'year', days: 365 },
  { id: 'decade', days: 3_652 },
] as const;
type HorizonId = (typeof HORIZONS)[number]['id'];

interface AccrualChartProps {
  timeline: readonly TimelineBucket[];
  /** The counter's basis — the forward half is evaluated from exactly this. */
  basisCents: number;
  /** The panel's shared clock. */
  nowMs: number;
  logScaleOn: boolean;
  onLogScaleChange: (next: boolean) => void;
  horizon: HorizonId;
  onHorizonChange: (next: HorizonId) => void;
}

export function AccrualChart({
  timeline,
  basisCents,
  nowMs,
  logScaleOn,
  onLogScaleChange,
  horizon,
  onHorizonChange,
}: AccrualChartProps) {
  const { t } = useTranslation('c-kaikai-debt');
  const [hover, setHover] = useHoverIndex();

  const model = useMemo(() => {
    const history = withCumulative(timeline);
    const horizonDays = HORIZONS.find((h) => h.id === horizon)?.days ?? 365;
    const toMs = nowMs + horizonDays * 86_400_000;
    const forward = projectSeries(basisCents, nowMs, toMs, 60);

    // One merged series so the crosshair is continuous across the seam. A
    // reader dragging along the line should not find a dead zone at "now".
    const points = [
      ...history.map((bucket) => ({
        atMs: bucket.startMs,
        cents: bucket.valueAtCents,
        principalCents: bucket.cumulativePrincipalCents,
        count: bucket.count,
        projected: false,
      })),
      ...forward.map((point) => ({
        atMs: point.atMs,
        cents: point.cents,
        principalCents: history[history.length - 1]?.cumulativePrincipalCents ?? 0,
        count: 0,
        projected: true,
      })),
    ];

    const fromMs = points[0]?.atMs ?? nowMs;
    const maxCents = points.reduce((max, p) => Math.max(max, p.cents), 1);
    // The log axis starts at the smallest value actually on the line, not at one
    // cent. Flooring at a cent is defensible and wastes half the plot: the
    // earliest month is already thousands of cents, so five of the ten decades
    // on the axis were empty and the curve was squashed into the top third.
    const minCents = points.reduce((min, p) => (p.cents > 0 ? Math.min(min, p.cents) : min), Infinity);
    return {
      history,
      points,
      fromMs,
      toMs,
      maxCents,
      minCents: Number.isFinite(minCents) ? minCents : 1,
      splitIndex: history.length,
    };
  }, [timeline, basisCents, nowMs, horizon]);

  const x = useMemo(
    () => linearScale(model.fromMs, model.toMs, PLOT.innerLeft, PLOT.innerRight),
    [model.fromMs, model.toMs],
  );
  const y = useMemo(
    () =>
      logScaleOn
        ? logScale(model.minCents, model.maxCents, PLOT.innerBottom, PLOT.innerTop, 1)
        : linearScale(0, model.maxCents, PLOT.innerBottom, PLOT.innerTop),
    [logScaleOn, model.minCents, model.maxCents],
  );

  const xs = useMemo(() => model.points.map((p) => x(p.atMs)), [model.points, x]);

  const paths = useMemo(() => {
    const projected = model.points.map((p) => ({ x: x(p.atMs), y: y(p.cents) }));
    // The solid half includes the seam point so the two halves meet rather than
    // leaving a one-pixel gap at "now".
    const past = projected.slice(0, model.splitIndex + 1);
    const future = projected.slice(Math.max(0, model.splitIndex - 1));
    return {
      past: linePath(past),
      future: linePath(future),
      area: areaPath(past, PLOT.innerBottom),
    };
  }, [model.points, model.splitIndex, x, y]);

  const ticks = useMemo(
    () =>
      logScaleOn ? logTicks(model.minCents, model.maxCents) : niceTicks(0, model.maxCents, 5),
    [logScaleOn, model.minCents, model.maxCents],
  );

  const active = hover >= 0 ? model.points[hover] : null;

  const empty = model.history.length === 0;

  return (
    <ChartCard
      title={t('stats.accrual.title', { defaultValue: 'What he has owed, and what he will' })}
      hint={t('stats.accrual.hint', {
        defaultValue:
          'Solid is history — everything logged by that month, compounded to that month. Dashed is the same curve run forward from today’s books, assuming nobody adds another thing.',
      })}
      controls={
        <ChartToggle pressed={logScaleOn} onPressedChange={onLogScaleChange}>
          {t('stats.control.log', { defaultValue: 'Log scale' })}
        </ChartToggle>
      }
      footer={
        /* Three mutually exclusive options with one active is a tab strip
           whatever it is called, so it is <LiquidTabs> and not a row of pills —
           the rule the design gate cannot see and reviewers must. It goes in the
           footer rather than the header's control corner because a segmented
           control's track spans its container: squeezed into a corner beside
           another button it wrapped onto two rows and read as a floating box. */
        <LiquidTabs
          size="sm"
          value={horizon}
          onChange={(id) => onHorizonChange(id as HorizonId)}
          aria-label={t('stats.horizon.label', { defaultValue: 'How far ahead to project' })}
          tabs={[
            { id: 'month', label: t('stats.horizon.month', { defaultValue: 'Next 30 days' }) },
            { id: 'year', label: t('stats.horizon.year', { defaultValue: 'Next year' }) },
            { id: 'decade', label: t('stats.horizon.decade', { defaultValue: 'Next decade' }) },
          ]}
        />
      }
    >
      {empty ? (
        <p className="py-10 text-center text-sm text-site-text-dim">
          {t('stats.empty', { defaultValue: 'Nothing on the books yet — add a line and it appears here.' })}
        </p>
      ) : (
        <>
          <ChartFrame
            plot={PLOT}
            title={t('stats.accrual.title', { defaultValue: 'What he has owed, and what he will' })}
            description={t('stats.accrual.desc', {
              defaultValue:
                'A line chart of the total debt over time, compounding continuously, with a dashed forward projection from the current balance.',
            })}
            onPointerMove={(event) => {
              const point = pointerInViewBox(event, PLOT);
              setHover(point.x < 0 ? -1 : nearestIndex(xs, point.x));
            }}
            onPointerLeave={() => setHover(-1)}
          >
            <GridLines plot={PLOT} ys={ticks.map((value) => y(value))} />
            <AxisLabels
              items={ticks.map((value) => ({
                key: String(value),
                x: PLOT.innerLeft - 8,
                y: y(value),
                text: formatCompactDebt(value),
              }))}
            />
            <AxisLabels
              anchor="middle"
              items={[
                { key: 'from', x: PLOT.innerLeft + 18, y: PLOT.innerBottom + 16, text: formatMonth(model.fromMs) },
                { key: 'now', x: x(nowMs), y: PLOT.innerBottom + 16, text: t('stats.now', { defaultValue: 'now' }) },
                { key: 'to', x: PLOT.innerRight - 22, y: PLOT.innerBottom + 16, text: formatMonth(model.toMs) },
              ]}
            />

            {/* The "now" divider: the boundary between a record and a claim. */}
            <line
              className="kd-chart__crosshair"
              x1={x(nowMs)}
              x2={x(nowMs)}
              y1={PLOT.innerTop}
              y2={PLOT.innerBottom}
              aria-hidden
            />

            {/* One series, so no legend box — the title names it (the ≥2-series
                rule). Colour comes from the series class, not from a literal. */}
            <g className="kd-series-0">
              <path className="kd-chart__area" d={paths.area} />
              <path className="kd-chart__line" d={paths.past} />
              <path className="kd-chart__line kd-chart__line--projected" d={paths.future} />
              {active && (
                <>
                  <line
                    className="kd-chart__crosshair"
                    x1={x(active.atMs)}
                    x2={x(active.atMs)}
                    y1={PLOT.innerTop}
                    y2={PLOT.innerBottom}
                  />
                  <circle className="kd-chart__marker" cx={x(active.atMs)} cy={y(active.cents)} r={5} />
                </>
              )}
            </g>
          </ChartFrame>

          {active && (
            <Readout x={x(active.atMs) / PLOT.width} y={y(active.cents) / PLOT.height}>
              <p className="mb-1 font-medium text-site-text">{formatMonth(active.atMs)}</p>
              <ReadoutRow
                label={
                  active.projected
                    ? t('stats.accrual.projected', { defaultValue: 'Projected balance' })
                    : t('stats.accrual.balance', { defaultValue: 'Balance' })
                }
                value={formatDebt(active.cents)}
              />
              {!active.projected && (
                <>
                  <ReadoutRow
                    label={t('stats.accrual.principal', { defaultValue: 'Face value logged' })}
                    value={formatDebt(active.principalCents)}
                  />
                  <ReadoutRow
                    label={t('stats.accrual.added', { defaultValue: 'Lines that month' })}
                    value={String(active.count)}
                  />
                </>
              )}
            </Readout>
          )}
        </>
      )}
    </ChartCard>
  );
}

export type { HorizonId };
