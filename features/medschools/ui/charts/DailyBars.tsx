import { SHORT_SOURCE_NAMES, SOURCE_NAMES, formatUtcDay } from '../../engine/public-read';
import { barsGeometry, fillDays, spreadLabels } from '../../engine/chart-geometry';
import type { ActivityTypeDto } from '../../medschools.contract';
import {
  ChartFrame,
  DataTable,
  EmptyNote,
  EndLabel,
  ResponsivePlot,
  XAxis,
  YAxis,
  type ChartLabels,
} from './ChartFrame';

type ActivitySeries = ActivityTypeDto['sources'][number];

/**
 * Daily reported events for one event type, from the primary source only, as thin ink bars. The other sources are
 * compared in the cumulative chart below; drawing them here as well put a dashed spike on every day. The y axis
 * starts at 0.
 */
export function DailyBars(p: { primary: ActivitySeries; from: string; to: string; labels: ChartLabels }) {
  const { labels } = p;
  const nf = new Intl.NumberFormat(labels.locale);
  const days = fillDays(p.primary.days, p.from, p.to);
  const hasData = p.primary.days.some((d) => d.count > 0);
  const n = days.length;
  const tickIdx = (count: number) => {
    if (n < 2) return n === 1 ? [0] : [];
    return [...new Set(Array.from({ length: count }, (_, i) => Math.round(((n - 1) * i) / (count - 1))))];
  };

  const dates = [...p.primary.days].map((d) => d.date).sort();
  const counts = new Map(p.primary.days.map((d) => [d.date, d.count]));
  const rows = dates.map((date) => [
    formatUtcDay(date, labels.locale, { month: 'short', day: 'numeric', year: 'numeric' }),
    nf.format(counts.get(date) ?? 0),
  ]);

  return (
    <ChartFrame
      title={labels.title}
      unit={labels.unitDaily}
      sourcesLine={labels.sourcesLine({ primary: SOURCE_NAMES[p.primary.source], comparison: [] })}
      summary={labels.summary({
        lines: [{ name: SOURCE_NAMES[p.primary.source], total: p.primary.days.reduce((t, d) => t + d.count, 0) }],
      })}
      tableLabel={labels.showData}
      table={<DataTable head={[labels.date, SOURCE_NAMES[p.primary.source]]} rows={rows} />}
    >
      <ResponsivePlot
        render={(g) => {
          const geo = barsGeometry(hasData ? days : [], 0, g);
          const lastBar = geo.bars[geo.bars.length - 1];
          const [labelY] = spreadLabels(lastBar ? [lastBar.y] : [], g.labelGap, [g.plot.top + 4, g.plot.bottom]);
          const xs = hasData
            ? tickIdx(g.xTickCount).map((i) => {
                const b = geo.bars[i]!;
                return { x: b.x + b.w / 2, label: formatUtcDay(days[i]!.date, labels.locale) };
              })
            : [];
          return (
            <>
              <YAxis g={g} ticks={geo.yTicks} format={(v) => nf.format(v)} />
              <XAxis g={g} ticks={xs} />
              {hasData ? (
                <g>
                  {geo.bars.map((b, i) => (
                    <rect key={days[i]!.date} x={b.x} y={b.y} width={b.w} height={b.h} fill="var(--site-text)" />
                  ))}
                  {lastBar && labelY !== undefined ? (
                    <EndLabel
                      g={g}
                      x={lastBar.x + lastBar.w}
                      y={labelY}
                      text={g.shortLabels ? SHORT_SOURCE_NAMES[p.primary.source] : SOURCE_NAMES[p.primary.source]}
                      ink="ink"
                    />
                  ) : null}
                </g>
              ) : (
                <EmptyNote g={g} text={labels.empty} />
              )}
            </>
          );
        }}
      />
    </ChartFrame>
  );
}
