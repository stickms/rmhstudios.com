import type { ReactNode } from 'react';
import { SOURCE_NAMES, formatUtcDay } from '../../engine/public-read';
import { barsGeometry, fillDays, yTicksTween, type ChartGeometry } from '../../engine/chart-geometry';
import type { Domain } from '../../engine/chart-zoom';
import type { ActivityTypeDto } from '../../medschools.contract';
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
  type ChartLabels,
  type Probe,
  type ProbeRow,
} from './ChartFrame';
import { useTween } from './useTween';

type ActivitySeries = ActivityTypeDto['sources'][number];

/** One category of the daily chart: its primary source's days, in the category's colour (`CATEGORY_COLOR`). */
export interface DailySeries {
  key: string;
  name: string;
  color: string;
  primary: ActivitySeries;
}

/**
 * Daily reported events for one or more categories (owner 2026-11-24), each from its own primary source, as stacked
 * bars per day in the categories' colours (O7; `color` is a status token from `chartColors.ts`). Series stack in the
 * order given (the caller passes canonical order), the first at the bottom. Sources are never summed within a category
 * (each category draws its primary only); the stack adds different categories, which is what a day's total is. The
 * other sources are compared in the cumulative chart below. The y axis starts at 0 and tweens when the data changes.
 */
export function DailyBars(p: {
  series: DailySeries[];
  from: string;
  to: string;
  labels: ChartLabels;
  /** The category toggle row (`CategoryToggles`), which is the legend, shown above the plot. */
  legend?: ReactNode;
  /** Waves of Interview (D10): a tick under the wave day's bar. The caller passes them only while Interview is on. */
  waves?: { date: string; count: number }[] | undefined;
}) {
  const { labels } = p;
  const nf = new Intl.NumberFormat(labels.locale);
  const perSeries = p.series.map((s) => fillDays(s.primary.days, p.from, p.to));
  const totals = fillDays(
    p.series.flatMap((s) => s.primary.days),
    p.from,
    p.to,
  );
  const hasData = totals.some((d) => d.count > 0);
  const n = totals.length;
  const tickIdx = (count: number, m = n) => {
    if (m < 2) return m === 1 ? [0] : [];
    return [...new Set(Array.from({ length: count }, (_, i) => Math.round(((m - 1) * i) / (count - 1))))];
  };
  /** The days a zoomed view shows (the axis is the day's index), or every day. */
  const sliceOf = (view?: Domain): [number, number] =>
    view ? [Math.max(0, Math.ceil(view[0])), Math.min(n - 1, Math.floor(view[1]))] : [0, n - 1];
  const target = barsGeometry(hasData ? totals : [], 0).top;
  const tween = useTween(target);

  const waveOf = new Map((labels.wave ? (p.waves ?? []) : []).map((w) => [w.date, w.count] as const));
  const fmtDay = (date: string) =>
    formatUtcDay(date, labels.locale, { month: 'short', day: 'numeric', year: 'numeric' });

  const many = p.series.length > 1;
  const dates = [...new Set(p.series.flatMap((s) => s.primary.days.map((d) => d.date)))].sort();
  const countOf = p.series.map((s) => new Map(s.primary.days.map((d) => [d.date, d.count] as const)));
  const totalLabel = labels.total ?? labels.count;
  const rows = dates.map((date) => {
    const cells = countOf.map((m) => m.get(date) ?? 0);
    return [
      fmtDay(date),
      ...cells.map((c) => nf.format(c)),
      ...(many ? [nf.format(cells.reduce((a, b) => a + b, 0))] : []),
    ];
  });
  const sourceNames = [...new Set(p.series.map((s) => SOURCE_NAMES[s.primary.source]))];
  const sourcesLine =
    sourceNames.length === 1
      ? labels.sourcesLine({ primary: sourceNames[0]!, comparison: [] })
      : labels.sourcesPlain(sourceNames);

  // One geometry per drawing per frame: the probe asks for every bar's x on each pointer move.
  const geos = new Map<string, ReturnType<typeof barsGeometry>>();
  const geoOf = (g: ChartGeometry, view?: Domain) => {
    const [a, b] = sliceOf(view);
    const key = `${g.id}:${a}:${b}`;
    let geo = geos.get(key);
    if (!geo) geos.set(key, (geo = barsGeometry(hasData ? totals.slice(a, b + 1) : [], 0, g, tween.value)));
    return geo;
  };
  /** The stacked segments of day `i` (index into the shown slice `a..`), bottom first, in plot pixels. */
  const segmentsOf = (bar: { y: number; h: number }, day: number) => {
    const total = totals[day]!.count;
    let bottom = bar.y + bar.h;
    return perSeries.map((days) => {
      const h = total > 0 ? (bar.h * days[day]!.count) / total : 0;
      const seg = { y: Math.round((bottom - h) * 100) / 100, h: Math.round(h * 100) / 100 };
      bottom -= h;
      return seg;
    });
  };

  const probe: Probe | undefined = hasData
    ? {
        count: n,
        x: (g, i, view) => {
          const [a, last] = sliceOf(view);
          // A day outside the zoomed view is off the plot, so the probe never lands on it.
          if (i < a || i > last) return -1e6;
          const b = geoOf(g, view).bars[i - a]!;
          return b.x + b.w / 2;
        },
        at: (i) => {
          const d = totals[i]!;
          const wave = waveOf.get(d.date);
          const rows: ProbeRow[] = p.series.map((s, k) => ({
            key: s.key,
            name: many ? s.name : SOURCE_NAMES[s.primary.source],
            color: s.color,
            text: nf.format(perSeries[k]![i]!.count),
            y: (g) => {
              const bar = geoOf(g).bars[i];
              if (!bar || perSeries[k]![i]!.count === 0) return null;
              return segmentsOf(bar, i)[k]!.y;
            },
          }));
          if (many) {
            rows.push({
              key: 'total',
              name: totalLabel,
              color: 'var(--app-text)',
              text: nf.format(d.count),
              y: () => null,
            });
          }
          if (wave !== undefined && labels.wave) {
            rows.push({
              key: 'wave',
              name: labels.wave.probe(wave),
              color: 'var(--app-text-muted)',
              text: '',
              y: () => null,
            });
          }
          return { label: fmtDay(d.date), rows };
        },
      }
    : undefined;

  return (
    <ChartFrame
      title={labels.title}
      unit={labels.unitDaily}
      sourcesLine={sourcesLine}
      legend={
        p.legend || (waveOf.size > 0 && labels.wave) ? (
          <>
            {p.legend}
            {waveOf.size > 0 && labels.wave ? (
              <div className={p.legend ? 'mt-2' : undefined}>
                <WaveKey label={labels.wave.legend} />
              </div>
            ) : null}
          </>
        ) : undefined
      }
      tableLabel={labels.showData}
      table={
        <DataTable
          head={[
            labels.date,
            ...p.series.map((s) => (many ? s.name : SOURCE_NAMES[s.primary.source])),
            ...(many ? [totalLabel] : []),
          ]}
          rows={rows}
        />
      }
    >
      <ResponsivePlot
        summary={labels.summary({
          lines: p.series.map((s) => ({
            name: many ? s.name : SOURCE_NAMES[s.primary.source],
            total: s.primary.days.reduce((t, d) => t + d.count, 0),
          })),
        })}
        hint={labels.hint}
        probe={probe}
        domain={n > 1 ? [0, n - 1] : undefined}
        render={(g, clipId, view) => {
          const geo = geoOf(g, view);
          const [a] = sliceOf(view);
          const shownDays = totals.slice(a, a + geo.bars.length);
          const xs = hasData
            ? tickIdx(g.xTickCount, shownDays.length).map((i) => {
                const b = geo.bars[i]!;
                return { x: b.x + b.w / 2, label: formatUtcDay(shownDays[i]!.date, labels.locale) };
              })
            : [];
          return (
            <>
              <defs>
                <PlotClip id={clipId} g={g} />
              </defs>
              <YAxis
                g={g}
                ticks={yTicksTween(tween.from, tween.to, tween.p, tween.value, g)}
                format={(v) => nf.format(v)}
              />
              <XAxis g={g} ticks={xs} />
              {hasData ? (
                <g clipPath={`url(#${clipId})`}>
                  {geo.bars.flatMap((b, i) =>
                    b.h > 0
                      ? segmentsOf(b, a + i).flatMap((seg, k) =>
                          seg.h > 0
                            ? [
                                <rect
                                  key={`${shownDays[i]!.date}-${p.series[k]!.key}`}
                                  x={b.x}
                                  y={seg.y}
                                  width={b.w}
                                  height={seg.h}
                                  fill={p.series[k]!.color}
                                />,
                              ]
                            : [],
                        )
                      : [],
                  )}
                </g>
              ) : (
                <EmptyNote g={g} text={labels.empty} />
              )}
              {hasData
                ? shownDays.flatMap((d, i) => {
                    const b = geo.bars[i];
                    return b && waveOf.has(d.date) ? [<WaveTick key={d.date} x={b.x + b.w / 2} g={g} />] : [];
                  })
                : null}
            </>
          );
        }}
      />
    </ChartFrame>
  );
}
