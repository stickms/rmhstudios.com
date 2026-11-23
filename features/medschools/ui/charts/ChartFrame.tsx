import type { ReactNode } from 'react';
import { GEOMETRIES, TICK_ROOM, heightOf, type ChartGeometry } from '../../engine/chart-geometry';

/**
 * The shared frame for the RMH Med Schools charts (Phase 3 Task 5). Presentational and static: no state, no effect,
 * no measurement (R5). The caller passes every word already translated, as `components/ui/line-chart.tsx` does.
 *
 * Ink is `--site-text` (marks), `--site-text-muted` (text, secondary marks) and `--site-border` (axes, zero line).
 * Series are told apart by width and dash and named by direct end labels, never by a colour legend (D3, O2).
 */

export interface ChartLabels {
  /** The figure caption. */
  title: string;
  /** "Reported events". */
  unit: string;
  /** Short axis cues: "Reported events per day", "Reported events, running total", "Days since cycle start". */
  unitDaily: string;
  unitCumulative: string;
  daysSinceStart: string;
  /** "Sources: CycleTrack (primary), Admit.org", built from the sources the chart was given. */
  sourcesLine: (v: { primary: string; comparison: string[] }) => string;
  /** "Sources: A, B" for a chart whose lines each have their own primary (no one source is the primary). */
  sourcesPlain: (names: string[]) => string;
  primary: string;
  comparison: string;
  date: string;
  day: string;
  count: string;
  cumulative: string;
  /** Shown instead of a line or bars when there is nothing to draw. */
  empty: string;
  /** Summary of the native table, e.g. "Show data". */
  showData: string;
  /** The accessible name of the drawing; numbers already formatted by the caller. */
  summary: (v: { lines: { name: string; total: number }[] }) => string;
  /** BCP 47 locale for dates and numbers. */
  locale: string;
}

export function ChartFrame(p: {
  title: string;
  unit: string;
  sourcesLine: string;
  summary: string;
  table: ReactNode;
  tableLabel: string;
  /** The drawing, from `ResponsivePlot`. */
  children: ReactNode;
}) {
  return (
    <figure className="m-0">
      <figcaption>
        <span className="t-label block">{p.title}</span>
        <span className="t-meta block">{`${p.unit} · ${p.sourcesLine}`}</span>
      </figcaption>
      {/* The time axis reads left to right in every language (D13). */}
      <div dir="ltr" role="img" aria-label={p.summary} className="mt-2">
        {p.children}
      </div>
      <details className="mt-2">
        <summary className="t-meta cursor-pointer">{p.tableLabel}</summary>
        {p.table}
      </details>
    </figure>
  );
}

/** Which viewport widths show which drawing: exactly one is displayed, the others are `display: none`. */
const SHOWN_AT: Record<ChartGeometry['id'], string> = {
  phone: 'block min-[30rem]:hidden',
  mid: 'hidden min-[30rem]:block sm:hidden',
  wide: 'hidden sm:block',
};

/**
 * The drawing in every geometry (phone, mid, wide), server-rendered, one shown by CSS. No measuring and no script:
 * the markup is the same on the server and the client. `xTitle` is the short axis cue under the tick labels.
 */
export function ResponsivePlot({ render, xTitle }: { render: (g: ChartGeometry) => ReactNode; xTitle?: string }) {
  return (
    <>
      {GEOMETRIES.map((g) => (
        <svg
          key={g.id}
          viewBox={`0 0 ${g.w} ${heightOf(g, !!xTitle)}`}
          className={`${SHOWN_AT[g.id]} h-auto w-full`}
          aria-hidden="true"
          focusable="false"
        >
          {render(g)}
          {xTitle ? (
            <text
              x={(g.plot.left + g.plot.right) / 2}
              y={g.plot.bottom + TICK_ROOM + 12}
              textAnchor="middle"
              fontSize={g.font}
              fill="var(--site-text-muted)"
            >
              {xTitle}
            </text>
          ) : null}
        </svg>
      ))}
    </>
  );
}

const textProps = (g: ChartGeometry) => ({ fontSize: g.font, fill: 'var(--site-text-muted)' }) as const;

export function YAxis({
  ticks,
  format,
  g,
}: {
  ticks: { v: number; y: number }[];
  format: (n: number) => string;
  g: ChartGeometry;
}) {
  return (
    <g>
      {ticks.map((t) => (
        <g key={t.v}>
          <line x1={g.plot.left} x2={g.plot.right} y1={t.y} y2={t.y} stroke="var(--site-border)" strokeWidth={1} />
          <text x={g.plot.left - 6} y={t.y} dy="0.32em" textAnchor="end" {...textProps(g)}>
            {format(t.v)}
          </text>
        </g>
      ))}
    </g>
  );
}

export function XAxis({ ticks, g }: { ticks: { x: number; label: string }[]; g: ChartGeometry }) {
  return (
    <g>
      {ticks.map((t) => (
        <text
          key={`${t.x}-${t.label}`}
          x={t.x}
          y={g.plot.bottom + 17}
          // Labels near an edge hang inward so they stay inside the drawing and off the y axis numbers.
          textAnchor={t.x - g.plot.left < 18 ? 'start' : g.plot.right - t.x < 18 ? 'end' : 'middle'}
          {...textProps(g)}
        >
          {t.label}
        </text>
      ))}
    </g>
  );
}

export function EndLabel({
  x,
  y,
  text,
  ink,
  g,
}: {
  x: number;
  y: number;
  text: string;
  ink: 'ink' | 'muted';
  g: ChartGeometry;
}) {
  return (
    <text
      x={x + 6}
      y={y}
      dy="0.32em"
      fontSize={g.font}
      fill={ink === 'ink' ? 'var(--site-text)' : 'var(--site-text-muted)'}
    >
      {text}
    </text>
  );
}

export function EmptyNote({ text, g }: { text: string; g: ChartGeometry }) {
  return (
    <text
      x={(g.plot.left + g.plot.right) / 2}
      y={(g.plot.top + g.plot.bottom) / 2}
      textAnchor="middle"
      dy="0.32em"
      {...textProps(g)}
    >
      {text}
    </text>
  );
}

/** The native text alternative: every number the drawing shows, in rows on rules. */
export function DataTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <table className="t-meta mt-2 w-full border-collapse">
      <thead>
        <tr>
          {head.map((h, i) => (
            <th
              key={`${i}-${h}`}
              scope="col"
              className="border-b border-site-border py-1 pe-3 text-start font-normal text-site-text-muted"
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={String(r[0])}>
            {r.map((c, i) => (
              <td key={`${String(r[0])}-${i}`} className="border-b border-site-border py-1 pe-3 text-site-text">
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Cumulative value of a step series on `day` (the last point at or before it), or null before its first point. */
export function carried(points: { day: number; cumulative: number }[], day: number): number | null {
  let v: number | null = null;
  for (const p of points) {
    if (p.day > day) break;
    v = p.cumulative;
  }
  return v;
}
