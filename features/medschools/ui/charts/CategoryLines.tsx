import type { ReactNode } from 'react';
import {
  addUtcDays,
  type ChartGeometry,
  extendStep,
  linePath,
  niceMax,
  plotX,
  plotY,
  withZeroStart,
  xTicks,
  yTicksTween,
} from '../../engine/chart-geometry';
import { dayOfCycle } from '../../engine/cycle';
import { SOURCE_NAMES, formatUtcDay } from '../../engine/public-read';
import type { MedChartedTypeId, MedSourceId } from '../../medschools.contract';
import { inView } from '../../engine/chart-zoom';
import { CATEGORY_STYLE } from './chartColors';
import {
  ChartFrame,
  DataTable,
  EmptyNote,
  PlotClip,
  ResponsivePlot,
  WaveKey,
  WaveTick,
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
  /** Waves of the INTERVIEW series (D10): a tick on the axis at each date, only while Interview is switched on. */
  waves?: { date: string; count: number }[] | undefined;
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

  const marks =
    labels.wave && shown.some((s) => s.eventType === 'INTERVIEW')
      ? (p.waves ?? [])
          .map((w) => ({ day: dayOfCycle(w.date, p.dayZeroOn), count: w.count }))
          .filter((w) => w.day >= firstDay && w.day <= lastDay)
      : [];

  const names = [...new Set(p.sources)].map((s) => SOURCE_NAMES[s]);
  const days = [...new Set(shown.flatMap((s) => s.line.map((q) => q.x)))].sort((a, b) => a - b);
  const rows = days.map((d) => [
    formatUtcDay(addUtcDays(p.dayZeroOn, d), labels.locale, { month: 'short', day: 'numeric', year: 'numeric' }),
    ...shown.map((s) => nf.format(valueAt(s.line, d) ?? 0)),
  ]);

  const probe: Probe | undefined = hasData
    ? {
        count: lastDay - firstDay + 1,
        x: (g, i, view) => plotX(firstDay + i, view ?? domain, g),
        at: (i) => {
          const day = firstDay + i;
          const wave = marks.find((w) => w.day === day);
          return {
            label: longDate(day),
            rows: [
              ...shown.map((s) => {
                const v = valueAt(s.line, day) ?? 0;
                const st = CATEGORY_STYLE[s.eventType];
                return {
                  key: s.eventType,
                  name: s.label,
                  color: st.color,
                  dash: st.dash,
                  text: nf.format(v),
                  y: (g: ChartGeometry) => plotY(v, tween.value, g),
                };
              }),
              ...(wave && labels.wave
                ? [
                    {
                      key: 'wave',
                      name: labels.wave.probe(wave.count),
                      color: 'var(--app-text-muted)',
                      text: '',
                      y: () => null,
                    },
                  ]
                : []),
            ],
          };
        },
      }
    : undefined;

  return (
    <ChartFrame
      title={labels.title}
      unit={labels.unitCumulative}
      sourcesLine={labels.sourcesPlain(names)}
      legend={
        <>
          {p.legend}
          {marks.length > 0 && labels.wave ? (
            <div className="mt-2">
              <WaveKey label={labels.wave.legend} />
            </div>
          ) : null}
        </>
      }
      tableLabel={labels.showData}
      table={<DataTable head={[labels.date, ...shown.map((s) => s.label)]} rows={rows} />}
    >
      <ResponsivePlot
        summary={labels.summary({
          lines: shown.map((s) => ({ name: s.label, total: s.line[s.line.length - 1]!.y })),
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
                hasData ? xTicks(view ?? domain, g.xTickCount, g).map((t) => ({ x: t.x, label: dateOf(t.v) })) : []
              }
            />
            {hasData ? (
              <g clipPath={`url(#${clipId})`}>
                {shown.map((s) => {
                  const st = CATEGORY_STYLE[s.eventType];
                  const { d } = linePath(extendStep(s.line, lastDay), view ?? domain, tween.value, true, g);
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
            {marks
              .filter((w) => !view || inView(w.day, view))
              .map((w) => (
                <WaveTick key={w.day} x={plotX(w.day, view ?? domain, g)} g={g} />
              ))}
          </>
        )}
      />
    </ChartFrame>
  );
}
