import { dayOfCycle } from '../../engine/cycle';
import { PLOT, extendStep, linePath, niceMax, spreadLabels, xTicks, yTicksFor } from '../../engine/chart-geometry';
import { SOURCE_NAMES, toCumulativeByDay } from '../../engine/public-read';
import type { ActivityTypeDto } from '../../medschools.contract';
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

type ActivitySeries = ActivityTypeDto['sources'][number];

/** Cumulative reported events by day of the cycle: primary solid ink 2px, each comparison muted and dashed. */
export function CumulativeLine(p: {
  primary: ActivitySeries;
  comparison: ActivitySeries[];
  dayZeroOn: string;
  to: string;
  labels: ChartLabels;
}) {
  const { labels } = p;
  const nf = new Intl.NumberFormat(labels.locale);
  const all = [p.primary, ...p.comparison];
  const cum = all.map((s) => toCumulativeByDay(s.days, p.dayZeroOn));
  const hasData = p.primary.days.some((d) => d.count > 0);
  const lastDay = Math.max(dayOfCycle(p.to, p.dayZeroOn), 0, ...cum.flatMap((c) => c.map((q) => q.day)));
  const firstDay = Math.min(0, ...cum.flatMap((c) => c.map((q) => q.day)));
  const yMax = niceMax(Math.max(0, ...cum.map((c) => c[c.length - 1]?.cumulative ?? 0)));
  const domain: [number, number] = [firstDay, lastDay];

  const drawn = hasData
    ? all.map((s, i) => ({
        source: s.source,
        primary: i === 0,
        ...linePath(extendStep(cum[i]!.map((q) => ({ x: q.day, y: q.cumulative })), lastDay), domain, yMax, true),
      }))
    : [];
  const labelYs = spreadLabels(
    drawn.map((l) => l.end?.y ?? PLOT.bottom),
    13,
    [PLOT.top + 4, PLOT.bottom],
  );

  const days = [...new Set(cum.flatMap((c) => c.map((q) => q.day)))].sort((a, b) => a - b);
  const rows = days.map((d) => [
    nf.format(d),
    ...cum.map((c) => {
      const v = carried(c, d);
      return v === null ? '' : nf.format(v);
    }),
  ]);

  return (
    <ChartFrame
      title={labels.title}
      unit={labels.unit}
      sourcesLine={labels.sourcesLine({
        primary: SOURCE_NAMES[p.primary.source],
        comparison: p.comparison.map((c) => SOURCE_NAMES[c.source]),
      })}
      summary={labels.summary({
        lines: all.map((s) => ({ name: SOURCE_NAMES[s.source], total: s.days.reduce((t, d) => t + d.count, 0) })),
      })}
      tableLabel={labels.showData}
      table={
        <DataTable
          head={[labels.day, ...all.map((s) => `${SOURCE_NAMES[s.source]} (${labels.cumulative})`)]}
          rows={rows}
        />
      }
    >
      <PlotSvg>
        <YAxis ticks={yTicksFor(yMax)} format={(v) => nf.format(v)} />
        <XAxis ticks={hasData ? xTicks(domain, 5).map((t) => ({ x: t.x, label: nf.format(t.v) })) : []} />
        {hasData ? (
          <g>
            {drawn.map((l) =>
              l.d ? (
                <path
                  key={l.source}
                  d={l.d}
                  fill="none"
                  stroke={l.primary ? 'var(--site-text)' : 'var(--site-text-muted)'}
                  strokeWidth={l.primary ? 2 : 1}
                  strokeDasharray={l.primary ? undefined : '4 3'}
                />
              ) : null,
            )}
            {drawn.map((l, i) =>
              l.end ? (
                <EndLabel
                  key={l.source}
                  x={l.end.x}
                  y={labelYs[i]!}
                  text={SOURCE_NAMES[l.source]}
                  ink={l.primary ? 'ink' : 'muted'}
                />
              ) : null,
            )}
          </g>
        ) : (
          <EmptyNote text={labels.empty} />
        )}
      </PlotSvg>
    </ChartFrame>
  );
}
