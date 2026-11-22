import { PLOT, linePath, niceMax, spreadLabels, xTicks, yTicksFor } from '../../engine/chart-geometry';
import {
  ChartFrame,
  DataTable,
  EmptyNote,
  EndLabel,
  PlotSvg,
  XAxis,
  YAxis,
  carried,
  type ChartLabels,
} from './ChartFrame';

/** Prior cycles are muted with their own dash, so no two lines are told apart by colour. */
const PRIOR_DASH: (string | undefined)[] = [undefined, '6 3', '2 3'];

/**
 * Cumulative reported events by day of the cycle, one line per cycle, from ONE source (D4: never cross-source). The
 * first cycle is the current one (solid ink 2px); the rest are muted 1.5px. Each line ends in its cycle year.
 */
export function CycleOverlay(p: {
  cycles: { cycleYear: number; points: { day: number; cumulative: number }[] }[];
  sourceName: string;
  labels: ChartLabels;
}) {
  const { labels } = p;
  const nf = new Intl.NumberFormat(labels.locale);
  const year = new Intl.NumberFormat(labels.locale, { useGrouping: false });
  const withData = p.cycles.filter((c) => c.points.length > 0);
  const hasData = withData.length > 0;
  const allDays = p.cycles.flatMap((c) => c.points.map((q) => q.day));
  const domain: [number, number] = [Math.min(0, ...allDays), Math.max(0, ...allDays)];
  const yMax = niceMax(Math.max(0, ...withData.map((c) => c.points[c.points.length - 1]!.cumulative)));

  const drawn = p.cycles.map((c, i) => ({
    c,
    current: i === 0,
    dash: i === 0 ? undefined : PRIOR_DASH[(i - 1) % PRIOR_DASH.length],
    ...linePath(
      c.points.map((q) => ({ x: q.day, y: q.cumulative })),
      domain,
      yMax,
      true,
    ),
  }));
  const ends = drawn.filter((l) => l.end);
  const labelYs = spreadLabels(
    ends.map((l) => l.end!.y),
    13,
    [PLOT.top + 4, PLOT.bottom],
  );

  const days = [...new Set(allDays)].sort((a, b) => a - b);
  const rows = days.map((d) => [
    nf.format(d),
    ...p.cycles.map((c) => {
      const v = carried(c.points, d);
      return v === null ? '' : nf.format(v);
    }),
  ]);

  return (
    <ChartFrame
      title={labels.title}
      unit={labels.unit}
      sourcesLine={labels.sourcesLine({ primary: p.sourceName, comparison: [] })}
      summary={labels.summary({
        lines: withData.map((c) => ({
          name: year.format(c.cycleYear),
          total: c.points[c.points.length - 1]!.cumulative,
        })),
      })}
      tableLabel={labels.showData}
      table={<DataTable head={[labels.day, ...p.cycles.map((c) => year.format(c.cycleYear))]} rows={rows} />}
    >
      <PlotSvg>
        <YAxis ticks={yTicksFor(yMax)} format={(v) => nf.format(v)} />
        <XAxis ticks={hasData ? xTicks(domain, 5).map((t) => ({ x: t.x, label: nf.format(t.v) })) : []} />
        {hasData ? (
          <g>
            {drawn.map((l) =>
              l.d ? (
                <path
                  key={l.c.cycleYear}
                  d={l.d}
                  fill="none"
                  stroke={l.current ? 'var(--site-text)' : 'var(--site-text-muted)'}
                  strokeWidth={l.current ? 2 : 1.5}
                  strokeDasharray={l.dash}
                />
              ) : null,
            )}
            {ends.map((l, i) => (
              <EndLabel
                key={l.c.cycleYear}
                x={l.end!.x}
                y={labelYs[i]!}
                text={year.format(l.c.cycleYear)}
                ink={l.current ? 'ink' : 'muted'}
              />
            ))}
          </g>
        ) : (
          <EmptyNote text={labels.empty} />
        )}
      </PlotSvg>
    </ChartFrame>
  );
}
