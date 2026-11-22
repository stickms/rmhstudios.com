import { SOURCE_NAMES, formatUtcDay } from '../../engine/public-read';
import { PLOT, barsGeometry, fillDays, linePath, niceMax, spreadLabels } from '../../engine/chart-geometry';
import type { ActivityTypeDto } from '../../medschools.contract';
import { ChartFrame, DataTable, EmptyNote, EndLabel, PlotSvg, XAxis, YAxis, type ChartLabels } from './ChartFrame';

type ActivitySeries = ActivityTypeDto['sources'][number];

/**
 * Daily reported events for one event type: the primary source as thin ink bars, each comparison source as a muted
 * dashed step line on the same scale. Sources are never summed (spec §10). The y axis starts at 0.
 */
export function DailyBars(p: {
  primary: ActivitySeries;
  comparison: ActivitySeries[];
  from: string;
  to: string;
  labels: ChartLabels;
}) {
  const { labels } = p;
  const nf = new Intl.NumberFormat(labels.locale);
  const days = fillDays(p.primary.days, p.from, p.to);
  const hasData = p.primary.days.some((d) => d.count > 0);
  const compDays = p.comparison.map((c) => fillDays(c.days, p.from, p.to));
  const extra = compDays.reduce((m, ds) => ds.reduce((mm, d) => Math.max(mm, d.count), m), 0);
  const geo = barsGeometry(hasData ? days : [], extra);
  const top = niceMax(Math.max(geo.max, extra));
  const n = days.length;

  const lines = hasData
    ? compDays.map((ds, i) => ({
        source: p.comparison[i]!.source,
        ...linePath(
          ds.map((d, k) => ({ x: k, y: d.count })),
          [-0.5, n - 0.5],
          top,
          true,
        ),
      }))
    : [];

  const lastBar = geo.bars[geo.bars.length - 1];
  const ends = [
    ...(lastBar ? [{ x: lastBar.x + lastBar.w, y: lastBar.y, text: SOURCE_NAMES[p.primary.source], ink: 'ink' as const }] : []),
    ...lines.flatMap((l) =>
      l.end ? [{ x: l.end.x, y: l.end.y, text: SOURCE_NAMES[l.source], ink: 'muted' as const }] : [],
    ),
  ];
  const labelYs = spreadLabels(
    ends.map((e) => e.y),
    13,
    [PLOT.top + 4, PLOT.bottom],
  );

  const tickIdx = n > 1 ? [...new Set([0, Math.round((n - 1) / 3), Math.round(((n - 1) * 2) / 3), n - 1])] : n === 1 ? [0] : [];
  const xTickList = hasData
    ? tickIdx.map((i) => {
        const b = geo.bars[i]!;
        return { x: b.x + b.w / 2, label: formatUtcDay(days[i]!.date, labels.locale) };
      })
    : [];

  const names = [p.primary, ...p.comparison].map((s) => SOURCE_NAMES[s.source]);
  const dates = [...new Set([p.primary, ...p.comparison].flatMap((s) => s.days.map((d) => d.date)))].sort();
  const counts = [p.primary, ...p.comparison].map((s) => new Map(s.days.map((d) => [d.date, d.count])));
  const rows = dates.map((date) => [
    formatUtcDay(date, labels.locale, { month: 'short', day: 'numeric', year: 'numeric' }),
    ...counts.map((m) => nf.format(m.get(date) ?? 0)),
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
        lines: [p.primary, ...p.comparison].map((s) => ({
          name: SOURCE_NAMES[s.source],
          total: s.days.reduce((t, d) => t + d.count, 0),
        })),
      })}
      tableLabel={labels.showData}
      table={<DataTable head={[labels.date, ...names]} rows={rows} />}
    >
      <PlotSvg>
        <YAxis ticks={geo.yTicks} format={(v) => nf.format(v)} />
        <XAxis ticks={xTickList} />
        {hasData ? (
          <g>
            {geo.bars.map((b, i) => (
              <rect key={days[i]!.date} x={b.x} y={b.y} width={b.w} height={b.h} fill="var(--site-text)" />
            ))}
            {lines.map((l) =>
              l.d ? (
                <path
                  key={l.source}
                  d={l.d}
                  fill="none"
                  stroke="var(--site-text-muted)"
                  strokeWidth={1}
                  strokeDasharray="4 3"
                />
              ) : null,
            )}
            {ends.map((e, i) => (
              <EndLabel key={e.text} x={e.x} y={labelYs[i]!} text={e.text} ink={e.ink} />
            ))}
          </g>
        ) : (
          <EmptyNote text={labels.empty} />
        )}
      </PlotSvg>
    </ChartFrame>
  );
}
