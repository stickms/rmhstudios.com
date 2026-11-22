import { PLOT, extendStep, linePath, niceMax, spreadLabels, xTicks, yTicksFor } from '../../engine/chart-geometry';
import { SOURCE_NAMES } from '../../engine/public-read';
import type { MedChartedTypeId, MedSourceId } from '../../medschools.contract';
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
  points: { day: number; cumulative: number }[];
}

/**
 * One cumulative step line per visible category on one day-of-cycle axis, each with a direct end label placed by
 * `spreadLabels`. Which categories are visible is the caller's (the URL's) business; hidden ones are not drawn and
 * not in the table. `sources` names the sources the series came from (the primary of each type), as the caption.
 */
export function CategoryLines(p: {
  series: CategorySeries[];
  visible: readonly MedChartedTypeId[];
  sources: readonly MedSourceId[];
  labels: ChartLabels;
}) {
  const { labels } = p;
  const nf = new Intl.NumberFormat(labels.locale);
  const shown = p.series.filter((s) => p.visible.includes(s.eventType) && s.points.length > 0);
  const hasData = shown.length > 0;
  const lastDay = Math.max(0, ...p.series.flatMap((s) => s.points.map((q) => q.day)));
  const firstDay = Math.min(0, ...p.series.flatMap((s) => s.points.map((q) => q.day)));
  const yMax = niceMax(Math.max(0, ...shown.map((s) => s.points[s.points.length - 1]!.cumulative)));
  const domain: [number, number] = [firstDay, lastDay];

  const drawn = shown.map((s) => ({
    s,
    style: CATEGORY_STYLE[s.eventType],
    ...linePath(extendStep(s.points.map((q) => ({ x: q.day, y: q.cumulative })), lastDay), domain, yMax, true),
  }));
  const labelYs = spreadLabels(
    drawn.map((l) => l.end?.y ?? PLOT.bottom),
    13,
    [PLOT.top + 4, PLOT.bottom],
  );

  const names = [...new Set(p.sources)].map((s) => SOURCE_NAMES[s]);
  const days = [...new Set(shown.flatMap((s) => s.points.map((q) => q.day)))].sort((a, b) => a - b);
  const rows = days.map((d) => [
    nf.format(d),
    ...shown.map((s) => {
      const v = carried(s.points, d);
      return v === null ? '' : nf.format(v);
    }),
  ]);

  return (
    <ChartFrame
      title={labels.title}
      unit={labels.unit}
      sourcesLine={labels.sourcesLine({ primary: names[0] ?? '', comparison: names.slice(1) })}
      summary={labels.summary({
        lines: shown.map((s) => ({ name: s.label, total: s.points[s.points.length - 1]!.cumulative })),
      })}
      tableLabel={labels.showData}
      table={<DataTable head={[labels.day, ...shown.map((s) => s.label)]} rows={rows} />}
    >
      <PlotSvg>
        <YAxis ticks={yTicksFor(yMax)} format={(v) => nf.format(v)} />
        <XAxis ticks={hasData ? xTicks(domain, 5).map((t) => ({ x: t.x, label: nf.format(t.v) })) : []} />
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
                <EndLabel key={l.s.eventType} x={l.end.x} y={labelYs[i]!} text={l.s.label} ink={l.style.stroke} />
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
