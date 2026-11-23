import { barsGeometry, type ChartGeometry } from '../../engine/chart-geometry';
import {
  ChartFrame,
  DataTable,
  EmptyNote,
  PlotClip,
  ResponsivePlot,
  XAxis,
  YAxis,
  type ChartLabels,
  type Probe,
} from './ChartFrame';

export interface ArrivalItem {
  key: string;
  /** The full label (tooltip and table): "Monday", "9 AM". */
  label: string;
  /** The short axis label, or null to leave this bar unlabelled. */
  tick: string | null;
  count: number;
}

/**
 * A histogram of arrivals (owner 2026-11-23), drawn the O7 way: one chart card, one series in the category's colour,
 * the `--site-chart-*` var passed in, a probe on hover, touch and the arrow keys, and the native table. One series, so
 * there is no legend; the title names the category and the caption names the zone. Static: it has no tween because it
 * never changes on a toggle (a toggle fetches another category).
 */
export function ArrivalBars(p: {
  items: ArrivalItem[];
  color: string;
  title: string;
  /** "Reported events by weekday, US Eastern" and the like: the unit cue in the caption. */
  unit: string;
  sourcesLine: string;
  head: [string, string];
  labels: ChartLabels;
}) {
  const { labels } = p;
  const nf = new Intl.NumberFormat(labels.locale);
  const days = p.items.map((i) => ({ date: i.key, count: i.count }));
  const total = p.items.reduce((t, i) => t + i.count, 0);
  const hasData = total > 0;
  const geos = new Map<string, ReturnType<typeof barsGeometry>>();
  const geoOf = (g: ChartGeometry) => {
    let geo = geos.get(g.id);
    if (!geo) geos.set(g.id, (geo = barsGeometry(hasData ? days : [], 0, g)));
    return geo;
  };

  const probe: Probe | undefined = hasData
    ? {
        count: p.items.length,
        x: (g, i) => {
          const b = geoOf(g).bars[i]!;
          return b.x + b.w / 2;
        },
        at: (i) => {
          const it = p.items[i]!;
          return {
            label: it.label,
            rows: [
              { key: it.key, name: p.title, color: p.color, text: nf.format(it.count), y: (g) => geoOf(g).bars[i]!.y },
            ],
          };
        },
      }
    : undefined;

  return (
    <ChartFrame
      title={p.title}
      unit={p.unit}
      sourcesLine={p.sourcesLine}
      tableLabel={labels.showData}
      table={<DataTable head={p.head} rows={p.items.map((i) => [i.label, nf.format(i.count)])} />}
    >
      <ResponsivePlot
        summary={labels.summary({ lines: [{ name: p.title, total }] })}
        hint={labels.hint}
        probe={probe}
        render={(g, clipId) => {
          const geo = geoOf(g);
          const xs = hasData
            ? p.items.flatMap((it, i) => {
                const b = geo.bars[i]!;
                return it.tick === null ? [] : [{ x: b.x + b.w / 2, label: it.tick }];
              })
            : [];
          return (
            <>
              <defs>
                <PlotClip id={clipId} g={g} />
              </defs>
              <YAxis g={g} ticks={geo.yTicks} format={(v) => nf.format(v)} />
              <XAxis g={g} ticks={xs} />
              {hasData ? (
                <g clipPath={`url(#${clipId})`}>
                  {geo.bars.map((b, i) => (
                    <rect key={p.items[i]!.key} x={b.x} y={b.y} width={b.w} height={b.h} fill={p.color} />
                  ))}
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
