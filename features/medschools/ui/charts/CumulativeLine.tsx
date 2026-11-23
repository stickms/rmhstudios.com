import { dayOfCycle } from '../../engine/cycle';
import {
  addUtcDays,
  extendStep,
  linePath,
  niceMax,
  spreadLabels,
  xTicks,
  yTicksFor,
} from '../../engine/chart-geometry';
import { SHORT_SOURCE_NAMES, SOURCE_NAMES, formatUtcDay, toCumulativeByDay } from '../../engine/public-read';
import type { ActivityTypeDto } from '../../medschools.contract';
import {
  ChartFrame,
  DataTable,
  EmptyNote,
  EndLabel,
  ResponsivePlot,
  XAxis,
  YAxis,
  carried,
  type ChartLabels,
} from './ChartFrame';

type ActivitySeries = ActivityTypeDto['sources'][number];

/**
 * Cumulative reported events on the cycle's calendar: primary solid ink 2px, each comparison muted and dashed. This is
 * where the other sources are compared (the daily bars show the primary only).
 */
export function CumulativeLine(p: {
  primary: ActivitySeries;
  comparison: ActivitySeries[];
  dayZeroOn: string;
  to: string;
  labels: ChartLabels;
}) {
  const { labels } = p;
  const nf = new Intl.NumberFormat(labels.locale);
  const dateOf = (day: number) => formatUtcDay(addUtcDays(p.dayZeroOn, day), labels.locale);
  const all = [p.primary, ...p.comparison];
  const cum = all.map((s) => toCumulativeByDay(s.days, p.dayZeroOn));
  const hasData = p.primary.days.some((d) => d.count > 0);
  const lastDay = Math.max(dayOfCycle(p.to, p.dayZeroOn), 0, ...cum.flatMap((c) => c.map((q) => q.day)));
  const firstDay = Math.min(0, ...cum.flatMap((c) => c.map((q) => q.day)));
  const yMax = niceMax(Math.max(0, ...cum.map((c) => c[c.length - 1]?.cumulative ?? 0)));
  const domain: [number, number] = [firstDay, lastDay];

  const days = [...new Set(cum.flatMap((c) => c.map((q) => q.day)))].sort((a, b) => a - b);
  const rows = days.map((d) => [
    formatUtcDay(addUtcDays(p.dayZeroOn, d), labels.locale, { month: 'short', day: 'numeric', year: 'numeric' }),
    ...cum.map((c) => {
      const v = carried(c, d);
      return v === null ? '' : nf.format(v);
    }),
  ]);

  return (
    <ChartFrame
      title={labels.title}
      unit={labels.unitCumulative}
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
          head={[labels.date, ...all.map((s) => `${SOURCE_NAMES[s.source]} (${labels.cumulative})`)]}
          rows={rows}
        />
      }
    >
      <ResponsivePlot
        render={(g) => {
          const drawn = hasData
            ? all.map((s, i) => ({
                source: s.source,
                primary: i === 0,
                ...linePath(
                  extendStep(
                    cum[i]!.map((q) => ({ x: q.day, y: q.cumulative })),
                    lastDay,
                  ),
                  domain,
                  yMax,
                  true,
                  g,
                ),
              }))
            : [];
          const labelYs = spreadLabels(
            drawn.map((l) => l.end?.y ?? g.plot.bottom),
            g.labelGap,
            [g.plot.top + 4, g.plot.bottom],
          );
          return (
            <>
              <YAxis g={g} ticks={yTicksFor(yMax, g)} format={(v) => nf.format(v)} />
              <XAxis
                g={g}
                ticks={hasData ? xTicks(domain, g.xTickCount, g).map((t) => ({ x: t.x, label: dateOf(t.v) })) : []}
              />
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
                        g={g}
                        x={l.end.x}
                        y={labelYs[i]!}
                        text={g.shortLabels ? SHORT_SOURCE_NAMES[l.source] : SOURCE_NAMES[l.source]}
                        ink={l.primary ? 'ink' : 'muted'}
                      />
                    ) : null,
                  )}
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
