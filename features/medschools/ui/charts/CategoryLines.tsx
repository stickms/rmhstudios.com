import type { ReactNode } from 'react';
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
import { SOURCE_NAMES, formatUtcDay } from '../../engine/public-read';
import type { MedChartedTypeId, MedSourceId } from '../../medschools.contract';
import { CATEGORY_STYLE } from './chartColors';
import {
  ChartFrame,
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

export interface CategorySeries {
  eventType: MedChartedTypeId;
  label: string;
  points: { day: number; cumulative: number }[];
}

/**
 * One cumulative step line per visible category on one calendar axis (the cycle's own dates), each in its category's
 * fixed colour (O7) and rising from 0 on the cycle's first day. The legend IS the toggle row (`legend`, from
 * `CategoryToggles`): each toggle carries its swatch. Which categories are visible is the caller's (the URL's)
 * business; hidden ones are not drawn and not in the table or the tooltip. The y scale tweens when the visible set
 * changes. `sources` names the sources of the VISIBLE series (each line is its own type's primary, so none is "the"
 * primary), as a plain caption.
 */
export function CategoryLines(p: {
  series: CategorySeries[];
  visible: readonly MedChartedTypeId[];
  sources: readonly MedSourceId[];
  /** Day 0 of the cycle: the axis prints the calendar date of each day. */
  dayZeroOn: string;
  labels: ChartLabels;
  /** The category legend and toggle row, shown above the plot. */
  legend?: ReactNode;
}) {
  const { labels } = p;
  const nf = new Intl.NumberFormat(labels.locale);
  const dateOf = (day: number) => formatUtcDay(addUtcDays(p.dayZeroOn, day), labels.locale);
  const longDate = (day: number) =>
    formatUtcDay(addUtcDays(p.dayZeroOn, day), labels.locale, { month: 'short', day: 'numeric', year: 'numeric' });
  const shown = p.series
    .filter((s) => p.visible.includes(s.eventType) && s.points.length > 0)
    .map((s) => ({
      ...s,
      line: withZeroStart(
        s.points.map((q) => ({ x: q.day, y: q.cumulative })),
        0,
      ),
    }));
  const hasData = shown.length > 0;
  const lastDay = Math.max(0, ...p.series.flatMap((s) => s.points.map((q) => q.day)));
  const firstDay = Math.min(0, ...p.series.flatMap((s) => s.points.map((q) => q.day)));
  const domain: [number, number] = [firstDay, lastDay];
  const target = niceMax(Math.max(0, ...shown.map((s) => s.line[s.line.length - 1]!.y)));
  const tween = useTween(target);

  const names = [...new Set(p.sources)].map((s) => SOURCE_NAMES[s]);
  const days = [...new Set(shown.flatMap((s) => s.line.map((q) => q.x)))].sort((a, b) => a - b);
  const rows = days.map((d) => [
    formatUtcDay(addUtcDays(p.dayZeroOn, d), labels.locale, { month: 'short', day: 'numeric', year: 'numeric' }),
    ...shown.map((s) => nf.format(valueAt(s.line, d) ?? 0)),
  ]);

  const probe: Probe | undefined = hasData
    ? {
        count: lastDay - firstDay + 1,
        x: (g, i) => plotX(firstDay + i, domain, g),
        at: (i) => {
          const day = firstDay + i;
          return {
            label: longDate(day),
            rows: shown.map((s) => {
              const v = valueAt(s.line, day) ?? 0;
              const st = CATEGORY_STYLE[s.eventType];
              return {
                key: s.eventType,
                name: s.label,
                color: st.color,
                dash: st.dash,
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
      sourcesLine={labels.sourcesPlain(names)}
      legend={p.legend}
      tableLabel={labels.showData}
      table={<DataTable head={[labels.date, ...shown.map((s) => s.label)]} rows={rows} />}
    >
      <ResponsivePlot
        summary={labels.summary({
          lines: shown.map((s) => ({ name: s.label, total: s.line[s.line.length - 1]!.y })),
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
                {shown.map((s) => {
                  const st = CATEGORY_STYLE[s.eventType];
                  const { d } = linePath(extendStep(s.line, lastDay), domain, tween.value, true, g);
                  return d ? (
                    <path
                      key={s.eventType}
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
