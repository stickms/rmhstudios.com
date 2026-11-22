import {
  addUtcDays,
  extendStep,
  linePath,
  niceMax,
  spreadLabels,
  xTicks,
  yTicksFor,
} from '../../engine/chart-geometry';
import { SOURCE_NAMES, formatUtcDay } from '../../engine/public-read';
import type { MedChartedTypeId, MedSourceId } from '../../medschools.contract';
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

/**
 * O4 (owner, 2026-11-22): categories are told apart without colour. Interview is the solid ink line, Acceptance a
 * thinner solid ink, and the three muted ones differ by dash. The toggle row (Task 6) draws its samples from this.
 */
export const CATEGORY_STYLE: Record<MedChartedTypeId, { stroke: 'ink' | 'muted'; width: number; dash?: string }> = {
  INTERVIEW: { stroke: 'ink', width: 2 },
  ACCEPTANCE: { stroke: 'ink', width: 1.25 },
  SECONDARY: { stroke: 'muted', width: 1.5, dash: '1 3' },
  WAITLIST: { stroke: 'muted', width: 1.5, dash: '6 3' },
  REJECTION: { stroke: 'muted', width: 1.5, dash: '8 3 2 3' },
};

interface CategorySeries {
  eventType: MedChartedTypeId;
  label: string;
  /** What the end label says where the full label does not fit (phones). */
  shortLabel?: string;
  points: { day: number; cumulative: number }[];
}

/**
 * One cumulative step line per visible category on one calendar axis (the cycle's own dates), each with a direct end
 * label placed by `spreadLabels` per geometry. Which categories are visible is the caller's (the URL's) business;
 * hidden ones are not drawn and not in the table. `sources` names the sources the series came from (the primary of
 * each type), as the caption.
 */
export function CategoryLines(p: {
  series: CategorySeries[];
  visible: readonly MedChartedTypeId[];
  sources: readonly MedSourceId[];
  /** Day 0 of the cycle: the axis prints the calendar date of each day. */
  dayZeroOn: string;
  labels: ChartLabels;
}) {
  const { labels } = p;
  const nf = new Intl.NumberFormat(labels.locale);
  const dateOf = (day: number) => formatUtcDay(addUtcDays(p.dayZeroOn, day), labels.locale);
  const shown = p.series.filter((s) => p.visible.includes(s.eventType) && s.points.length > 0);
  const hasData = shown.length > 0;
  const lastDay = Math.max(0, ...p.series.flatMap((s) => s.points.map((q) => q.day)));
  const firstDay = Math.min(0, ...p.series.flatMap((s) => s.points.map((q) => q.day)));
  const yMax = niceMax(Math.max(0, ...shown.map((s) => s.points[s.points.length - 1]!.cumulative)));
  const domain: [number, number] = [firstDay, lastDay];

  const names = [...new Set(p.sources)].map((s) => SOURCE_NAMES[s]);
  const days = [...new Set(shown.flatMap((s) => s.points.map((q) => q.day)))].sort((a, b) => a - b);
  const rows = days.map((d) => [
    formatUtcDay(addUtcDays(p.dayZeroOn, d), labels.locale, { month: 'short', day: 'numeric', year: 'numeric' }),
    ...shown.map((s) => {
      const v = carried(s.points, d);
      return v === null ? '' : nf.format(v);
    }),
  ]);

  return (
    <ChartFrame
      title={labels.title}
      unit={labels.unitCumulative}
      sourcesLine={labels.sourcesLine({ primary: names[0] ?? '', comparison: names.slice(1) })}
      summary={labels.summary({
        lines: shown.map((s) => ({ name: s.label, total: s.points[s.points.length - 1]!.cumulative })),
      })}
      tableLabel={labels.showData}
      table={<DataTable head={[labels.date, ...shown.map((s) => s.label)]} rows={rows} />}
    >
      <ResponsivePlot
        render={(g) => {
          const drawn = shown.map((s) => ({
            s,
            style: CATEGORY_STYLE[s.eventType],
            ...linePath(
              extendStep(
                s.points.map((q) => ({ x: q.day, y: q.cumulative })),
                lastDay,
              ),
              domain,
              yMax,
              true,
              g,
            ),
          }));
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
                        key={l.s.eventType}
                        d={l.d}
                        fill="none"
                        stroke={l.style.stroke === 'ink' ? 'var(--site-text)' : 'var(--site-text-muted)'}
                        strokeWidth={l.style.width}
                        strokeDasharray={l.style.dash}
                      />
                    ) : null,
                  )}
                  {drawn.map((l, i) =>
                    l.end ? (
                      <EndLabel
                        key={l.s.eventType}
                        g={g}
                        x={l.end.x}
                        y={labelYs[i]!}
                        text={g.shortLabels ? (l.s.shortLabel ?? l.s.label) : l.s.label}
                        ink={l.style.stroke}
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
