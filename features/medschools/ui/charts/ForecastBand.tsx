import {
  addUtcDays,
  extendStep,
  linePath,
  niceMax,
  plotX,
  plotY,
  withZeroStart,
  xTicks,
  yTicksTween,
} from '../../engine/chart-geometry';
import { formatUtcDay } from '../../engine/public-read';
import type { MedChartedTypeId } from '../../medschools.contract';
import { CATEGORY_STYLE } from './chartColors';
import {
  ChartFrame,
  ChartLegend,
  DataTable,
  EmptyNote,
  PlotClip,
  ResponsivePlot,
  XAxis,
  YAxis,
  valueAt,
  type ChartLabels,
  type Probe,
} from './ChartFrame';
import { useTween } from './useTween';

/** The dash and weight of each drawn mark: the median is dashed 2px, the range boundaries are dotted 1px (R1). */
const MEDIAN = { dash: '6 3', width: 2 } as const;
const BOUND = { dash: '2 3', width: 1 } as const;

/**
 * The forecast of one event type: the observed cumulative line, then the median path and the 10th and 90th percentile
 * boundaries to the end of the cycle. All in the category's colour; the three forecast marks differ by dash and weight
 * only. The range is two 1px dashed boundaries and nothing filled or translucent (Steel R1). The x axis prints calendar
 * dates (days since the cycle's day zero are converted before anything is drawn), the y axis starts at 0 and tweens.
 */
export function ForecastBand(p: {
  eventType: MedChartedTypeId;
  sourceName: string;
  dayZeroOn: string;
  observed: { day: number; cumulative: number }[];
  band: { day: number; p10: number; p50: number; p90: number }[];
  labels: ChartLabels;
  legendLabels: { observed: string; median: string; range: string; low: string; high: string };
}) {
  const { labels, legendLabels } = p;
  const nf = new Intl.NumberFormat(labels.locale);
  const color = CATEGORY_STYLE[p.eventType].color;
  const dateOf = (day: number) => formatUtcDay(addUtcDays(p.dayZeroOn, day), labels.locale);
  const longDate = (day: number) =>
    formatUtcDay(addUtcDays(p.dayZeroOn, day), labels.locale, { month: 'short', day: 'numeric', year: 'numeric' });

  const hasBand = p.band.length > 0;
  const hasObserved = p.observed.length > 0;
  const hasData = hasObserved || hasBand;
  const obs = hasObserved
    ? withZeroStart(
        p.observed.map((q) => ({ x: q.day, y: q.cumulative })),
        0,
      )
    : [];
  const bandStart = hasBand ? p.band[0]!.day : null;
  const lastObserved = hasObserved ? p.observed[p.observed.length - 1]!.day : 0;
  const lastDay = Math.max(0, lastObserved, ...p.band.map((b) => b.day));
  const firstDay = Math.min(0, ...p.observed.map((q) => q.day), ...p.band.map((b) => b.day));
  const domain: [number, number] = [firstDay, lastDay];
  const med = p.band.map((b) => ({ x: b.day, y: b.p50 }));
  const low = p.band.map((b) => ({ x: b.day, y: b.p10 }));
  const high = p.band.map((b) => ({ x: b.day, y: b.p90 }));
  const target = niceMax(Math.max(0, ...p.band.map((b) => b.p90), ...(hasObserved ? [obs[obs.length - 1]!.y] : [])));
  const tween = useTween(target);

  // The observed line runs on to where the band starts, so the two read as one path.
  const obsLine = bandStart === null ? obs : extendStep(obs, bandStart);

  // The table: one row a week from the cycle start, and the last day.
  const tableDays: number[] = [];
  for (let d = firstDay; d <= lastDay; d += 7) tableDays.push(d);
  if (tableDays[tableDays.length - 1] !== lastDay && hasData) tableDays.push(lastDay);
  const bandAt = (day: number) =>
    bandStart !== null && day >= bandStart ? p.band.find((b) => b.day === day) : undefined;
  const rows = hasData
    ? tableDays.map((d) => {
        const b = bandAt(d);
        const o = d <= lastObserved && hasObserved ? nf.format(valueAt(obs, d) ?? 0) : '';
        return [longDate(d), o, b ? nf.format(b.p50) : '', b ? nf.format(b.p10) : '', b ? nf.format(b.p90) : ''];
      })
    : [];

  const probe: Probe | undefined = hasData
    ? {
        count: lastDay - firstDay + 1,
        x: (g, i) => plotX(firstDay + i, domain, g),
        initial: Math.max(0, Math.min(lastDay, bandStart ?? lastObserved) - firstDay),
        at: (i) => {
          const day = firstDay + i;
          const b = bandAt(day);
          if (!b || (hasObserved && day <= lastObserved)) {
            const v = valueAt(obs, day) ?? 0;
            return {
              label: longDate(day),
              rows: [
                {
                  key: 'observed',
                  name: legendLabels.observed,
                  color,
                  text: nf.format(v),
                  y: (g) => plotY(v, tween.value, g),
                },
              ],
            };
          }
          return {
            label: longDate(day),
            rows: [
              {
                key: 'median',
                name: legendLabels.median,
                color,
                dash: MEDIAN.dash,
                text: nf.format(b.p50),
                y: (g) => plotY(b.p50, tween.value, g),
              },
              {
                key: 'high',
                name: legendLabels.high,
                color,
                dash: BOUND.dash,
                text: nf.format(b.p90),
                y: (g) => plotY(b.p90, tween.value, g),
              },
              {
                key: 'low',
                name: legendLabels.low,
                color,
                dash: BOUND.dash,
                text: nf.format(b.p10),
                y: (g) => plotY(b.p10, tween.value, g),
              },
            ],
          };
        },
      }
    : undefined;

  const finalMedian = hasBand ? p.band[p.band.length - 1]!.p50 : null;
  const lines = [
    ...(hasObserved ? [{ name: legendLabels.observed, total: obs[obs.length - 1]!.y }] : []),
    ...(finalMedian !== null ? [{ name: legendLabels.median, total: finalMedian }] : []),
  ];

  const path = (pts: { x: number; y: number }[], g: Parameters<typeof linePath>[4], step: boolean) =>
    linePath(pts, domain, tween.value, step, g).d;

  return (
    <ChartFrame
      title={labels.title}
      unit={labels.unitCumulative}
      sourcesLine={labels.sourcesLine({ primary: p.sourceName, comparison: [] })}
      legend={
        <ChartLegend
          items={[
            ...(hasObserved ? [{ key: 'observed', label: legendLabels.observed, color }] : []),
            ...(hasBand
              ? [
                  { key: 'median', label: legendLabels.median, color, dash: MEDIAN.dash },
                  { key: 'range', label: legendLabels.range, color, dash: BOUND.dash, width: BOUND.width },
                ]
              : []),
          ]}
        />
      }
      tableLabel={labels.showData}
      table={
        <DataTable
          head={[labels.date, legendLabels.observed, legendLabels.median, legendLabels.low, legendLabels.high]}
          rows={rows}
        />
      }
    >
      <ResponsivePlot
        summary={labels.summary({ lines })}
        hint={labels.hint}
        probe={probe}
        render={(g, clipId) => (
          <>
            <defs>
              <PlotClip id={clipId} g={g} />
            </defs>
            <YAxis
              g={g}
              ticks={yTicksTween(tween.from, tween.to, tween.p, tween.value, g)}
              format={(v) => nf.format(v)}
            />
            <XAxis
              g={g}
              ticks={hasData ? xTicks(domain, g.xTickCount, g).map((t) => ({ x: t.x, label: dateOf(t.v) })) : []}
            />
            {hasData ? (
              <g clipPath={`url(#${clipId})`}>
                {hasBand ? (
                  <>
                    <path
                      d={path(high, g, false)}
                      fill="none"
                      stroke={color}
                      strokeWidth={BOUND.width}
                      strokeDasharray={BOUND.dash}
                      strokeLinejoin="round"
                    />
                    <path
                      d={path(low, g, false)}
                      fill="none"
                      stroke={color}
                      strokeWidth={BOUND.width}
                      strokeDasharray={BOUND.dash}
                      strokeLinejoin="round"
                    />
                    <path
                      d={path(med, g, false)}
                      fill="none"
                      stroke={color}
                      strokeWidth={MEDIAN.width}
                      strokeDasharray={MEDIAN.dash}
                      strokeLinejoin="round"
                    />
                  </>
                ) : null}
                {hasObserved ? (
                  <path d={path(obsLine, g, true)} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
                ) : null}
              </g>
            ) : (
              <EmptyNote g={g} text={labels.empty} />
            )}
          </>
        )}
      />
    </ChartFrame>
  );
}
