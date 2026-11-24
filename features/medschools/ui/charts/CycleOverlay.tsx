import {
  calendarDate,
  type ChartGeometry,
  cycleCalendarPoints,
  linePath,
  niceMax,
  plotX,
  plotY,
  xTicks,
  yTicksTween,
} from '../../engine/chart-geometry';
import { cycleLabelIsolated } from '../../engine/cycle';
import { formatUtcDay } from '../../engine/public-read';
import { cycleColor, cycleDash } from './chartColors';
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

/**
 * Cumulative reported events by calendar date, one line per cycle, from ONE source (D4: never cross-source). Owner O7:
 * the cycles are aligned by month and day, so June 1 of every cycle lines up and the axis reads "Jun 1", "Aug 15"
 * (no year, never "days since cycle start"); a series is named by its cycle ("2026–2027"). `cycles` are newest
 * first: the newest is the solid 2px line (blue), earlier cycles are 2px too (a dash reads too faint thinner) with their own dash and colour, in fixed
 * order. Every line rises from 0 on its own first day.
 */
export function CycleOverlay(p: {
  cycles: { cycleYear: number; dayZeroOn: string; points: { day: number; cumulative: number }[] }[];
  sourceName: string;
  labels: ChartLabels;
}) {
  const { labels } = p;
  const nf = new Intl.NumberFormat(labels.locale);
  const dateLabel = (x: number) => formatUtcDay(calendarDate(x), labels.locale);
  const lines = p.cycles.map((c, rank) => ({
    c,
    rank,
    name: cycleLabelIsolated(c.cycleYear),
    color: cycleColor(rank),
    dash: cycleDash(rank),
    width: 2,
    pts: cycleCalendarPoints(c.points, c.dayZeroOn, c.cycleYear),
  }));
  const withData = lines.filter((l) => l.pts.length > 0);
  const hasData = withData.length > 0;
  const allX = withData.flatMap((l) => l.pts.map((q) => q.x));
  const domain: [number, number] = [Math.min(0, ...allX), Math.max(0, ...allX)];
  const target = niceMax(Math.max(0, ...withData.map((l) => l.pts[l.pts.length - 1]!.y)));
  const tween = useTween(target);

  const xs = [...new Set(allX)].sort((a, b) => a - b);
  // Blank where a cycle has no report to read: before it starts or after its last one (it may still be running).
  const cell = (pts: { x: number; y: number }[], x: number) => {
    const last = pts[pts.length - 1];
    return last && x <= last.x ? nf.format(valueAt(pts, x) ?? 0) : '';
  };
  const rows = xs.map((x) => [dateLabel(x), ...lines.map((l) => cell(l.pts, x))]);

  const probe: Probe | undefined = hasData
    ? {
        count: domain[1] - domain[0] + 1,
        x: (g, i, view) => plotX(domain[0] + i, view ?? domain, g),
        at: (i) => {
          const x = domain[0] + i;
          return {
            label: dateLabel(x),
            rows: withData.map((l) => {
              // A line ends at its last report: past it there is no value to read (the cycle may still be running).
              const over = x > l.pts[l.pts.length - 1]!.x;
              const v = over ? null : (valueAt(l.pts, x) ?? 0);
              return {
                key: String(l.c.cycleYear),
                name: l.name,
                color: l.color,
                dash: l.dash,
                text: v === null ? '\u2013' : nf.format(v),
                y: (g: ChartGeometry) => (v === null ? null : plotY(v, tween.value, g)),
              };
            }),
          };
        },
      }
    : undefined;

  return (
    <ChartFrame
      title={labels.title}
      unit={labels.unitCumulative}
      sourcesLine={labels.sourcesLine({ primary: p.sourceName, comparison: [] })}
      legend={
        <ChartLegend
          items={lines.map((l) => ({ key: String(l.c.cycleYear), label: l.name, color: l.color, dash: l.dash }))}
        />
      }
      tableLabel={labels.showData}
      table={<DataTable head={[labels.date, ...lines.map((l) => l.name)]} rows={rows} />}
    >
      <ResponsivePlot
        summary={labels.summary({
          lines: withData.map((l) => ({ name: l.name, total: l.pts[l.pts.length - 1]!.y })),
        })}
        hint={labels.hint}
        probe={probe}
        domain={hasData ? domain : undefined}
        render={(g, clipId, view) => (
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
              ticks={
                hasData ? xTicks(view ?? domain, g.xTickCount, g).map((t) => ({ x: t.x, label: dateLabel(t.v) })) : []
              }
            />
            {hasData ? (
              <g clipPath={`url(#${clipId})`}>
                {/* Oldest first, so the newest cycle is drawn on top. */}
                {[...withData].reverse().map((l) => {
                  const { d } = linePath(l.pts, view ?? domain, tween.value, true, g);
                  return d ? (
                    <path
                      key={l.c.cycleYear}
                      d={d}
                      fill="none"
                      stroke={l.color}
                      strokeWidth={l.width}
                      strokeDasharray={l.dash}
                      strokeLinejoin="round"
                    />
                  ) : null;
                })}
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
