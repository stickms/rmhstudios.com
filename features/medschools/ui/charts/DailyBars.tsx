import { SOURCE_NAMES, formatUtcDay } from '../../engine/public-read';
import { barsGeometry, fillDays, yTicksTween, type ChartGeometry } from '../../engine/chart-geometry';
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
} from './ChartFrame';
import { useTween } from './useTween';

type ActivitySeries = ActivityTypeDto['sources'][number];

/**
 * Daily reported events for one event type, from the primary source only, as thin bars in the category's colour (O7;
 * `color` is a `--site-chart-*` var from `chartColors.ts`). One series, so there is no legend: the title names the
 * category and the caption the source. The other sources are compared in the cumulative chart below. The y axis
 * starts at 0 and tweens when the data changes.
 */
export function DailyBars(p: {
  primary: ActivitySeries;
  from: string;
  to: string;
  color: string;
  labels: ChartLabels;
  /** Waves of this category (Interview only, D10): a tick under the wave day's bar. */
  waves?: { date: string; count: number }[] | undefined;
}) {
  const { labels } = p;
  const nf = new Intl.NumberFormat(labels.locale);
  const days = fillDays(p.primary.days, p.from, p.to);
  const hasData = p.primary.days.some((d) => d.count > 0);
  const n = days.length;
  const tickIdx = (count: number) => {
    if (n < 2) return n === 1 ? [0] : [];
    return [...new Set(Array.from({ length: count }, (_, i) => Math.round(((n - 1) * i) / (count - 1))))];
  };
  const target = barsGeometry(hasData ? days : [], 0).top;
  const tween = useTween(target);

  const waveOf = new Map((labels.wave ? (p.waves ?? []) : []).map((w) => [w.date, w.count] as const));

  const dates = [...p.primary.days].map((d) => d.date).sort();
  const counts = new Map(p.primary.days.map((d) => [d.date, d.count]));
  const rows = dates.map((date) => [
    formatUtcDay(date, labels.locale, { month: 'short', day: 'numeric', year: 'numeric' }),
    nf.format(counts.get(date) ?? 0),
  ]);
  const name = SOURCE_NAMES[p.primary.source];
  // One geometry per drawing per frame: the probe asks for every bar's x on each pointer move.
  const geos = new Map<string, ReturnType<typeof barsGeometry>>();
  const geoOf = (g: ChartGeometry) => {
    let geo = geos.get(g.id);
    if (!geo) geos.set(g.id, (geo = barsGeometry(hasData ? days : [], 0, g, tween.value)));
    return geo;
  };

  const probe: Probe | undefined = hasData
    ? {
        count: n,
        x: (g, i) => {
          const b = geoOf(g).bars[i]!;
          return b.x + b.w / 2;
        },
        at: (i) => {
          const d = days[i]!;
          const wave = waveOf.get(d.date);
          return {
            label: formatUtcDay(d.date, labels.locale, { month: 'short', day: 'numeric', year: 'numeric' }),
            rows: [
              {
                key: p.primary.source,
                name,
                color: p.color,
                text: nf.format(d.count),
                y: (g) => geoOf(g).bars[i]!.y,
              },
              ...(wave !== undefined && labels.wave
                ? [
                    {
                      key: 'wave',
                      name: labels.wave.probe(wave),
                      color: 'var(--site-text-muted)',
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
      unit={labels.unitDaily}
      sourcesLine={labels.sourcesLine({ primary: name, comparison: [] })}
      legend={waveOf.size > 0 && labels.wave ? <WaveKey label={labels.wave.legend} /> : undefined}
      tableLabel={labels.showData}
      table={<DataTable head={[labels.date, name]} rows={rows} />}
    >
      <ResponsivePlot
        summary={labels.summary({ lines: [{ name, total: p.primary.days.reduce((t, d) => t + d.count, 0) }] })}
        hint={labels.hint}
        probe={probe}
        render={(g, clipId) => {
          const geo = geoOf(g);
          const xs = hasData
            ? tickIdx(g.xTickCount).map((i) => {
                const b = geo.bars[i]!;
                return { x: b.x + b.w / 2, label: formatUtcDay(days[i]!.date, labels.locale) };
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
                  {geo.bars.map((b, i) => (
                    <rect key={days[i]!.date} x={b.x} y={b.y} width={b.w} height={b.h} fill={p.color} />
                  ))}
                </g>
              ) : (
                <EmptyNote g={g} text={labels.empty} />
              )}
              {hasData
                ? days.flatMap((d, i) => {
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
