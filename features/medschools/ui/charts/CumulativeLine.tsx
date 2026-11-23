import { dayOfCycle } from '../../engine/cycle';
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
import { SOURCE_NAMES, formatUtcDay, toCumulativeByDay } from '../../engine/public-read';
import type { ActivityTypeDto } from '../../medschools.contract';
import { SOURCE_COLOR, SOURCE_DASH } from './chartColors';
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

type ActivitySeries = ActivityTypeDto['sources'][number];

/**
 * Cumulative reported events on the cycle's calendar, one line per source in that source's fixed colour (O7), the
 * primary solid and each comparison dashed. Every line rises from 0 on the cycle's first day. This is where the other
 * sources are compared (the daily bars show the primary only). The legend names the sources; there are no end labels.
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
  const cum = all.map((s) =>
    withZeroStart(
      toCumulativeByDay(s.days, p.dayZeroOn).map((q) => ({ x: q.day, y: q.cumulative })),
      0,
    ),
  );
  const hasData = p.primary.days.some((d) => d.count > 0);
  const lastDay = Math.max(dayOfCycle(p.to, p.dayZeroOn), 0, ...cum.flatMap((c) => c.map((q) => q.x)));
  const firstDay = Math.min(0, ...cum.flatMap((c) => c.map((q) => q.x)));
  const domain: [number, number] = [firstDay, lastDay];
  const target = niceMax(Math.max(0, ...cum.map((c) => c[c.length - 1]?.y ?? 0)));
  const tween = useTween(target);
  const style = (s: ActivitySeries) => ({
    color: SOURCE_COLOR[s.source],
    dash: SOURCE_DASH[s.source],
    width: 2,
  });

  const days = [...new Set(cum.flatMap((c) => c.map((q) => q.x)))].sort((a, b) => a - b);
  const rows = days.map((d) => [
    formatUtcDay(addUtcDays(p.dayZeroOn, d), labels.locale, { month: 'short', day: 'numeric', year: 'numeric' }),
    ...cum.map((c) => nf.format(valueAt(c, d) ?? 0)),
  ]);

  const probe: Probe | undefined = hasData
    ? {
        count: lastDay - firstDay + 1,
        x: (g, i) => plotX(firstDay + i, domain, g),
        at: (i) => {
          const day = firstDay + i;
          return {
            label: formatUtcDay(addUtcDays(p.dayZeroOn, day), labels.locale, {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            }),
            rows: all.map((s, k) => {
              const v = valueAt(cum[k]!, day) ?? 0;
              return {
                key: s.source,
                name: SOURCE_NAMES[s.source],
                color: SOURCE_COLOR[s.source],
                dash: SOURCE_DASH[s.source],
                text: nf.format(v),
                y: (g) => plotY(v, tween.value, g),
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
      sourcesLine={labels.sourcesLine({
        primary: SOURCE_NAMES[p.primary.source],
        comparison: p.comparison.map((c) => SOURCE_NAMES[c.source]),
      })}
      legend={
        <ChartLegend
          items={all.map((s) => ({
            key: s.source,
            label: SOURCE_NAMES[s.source],
            color: SOURCE_COLOR[s.source],
            dash: SOURCE_DASH[s.source],
          }))}
        />
      }
      tableLabel={labels.showData}
      table={
        <DataTable
          head={[labels.date, ...all.map((s) => `${SOURCE_NAMES[s.source]} (${labels.cumulative})`)]}
          rows={rows}
        />
      }
    >
      <ResponsivePlot
        summary={labels.summary({
          lines: all.map((s) => ({ name: SOURCE_NAMES[s.source], total: s.days.reduce((t, d) => t + d.count, 0) })),
        })}
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
                {all.map((s, i) => {
                  const st = style(s);
                  const { d } = linePath(extendStep(cum[i]!, lastDay), domain, tween.value, true, g);
                  return d ? (
                    <path
                      key={s.source}
                      d={d}
                      fill="none"
                      stroke={st.color}
                      strokeWidth={st.width}
                      strokeDasharray={st.dash}
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
