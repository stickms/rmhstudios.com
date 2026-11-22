import type { ReactNode } from 'react';
import { CHART_H, CHART_W, PLOT } from '../../engine/chart-geometry';

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
  /** "Sources: CycleTrack (primary), Admit.org", built from the sources the chart was given. */
  sourcesLine: (v: { primary: string; comparison: string[] }) => string;
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

export function PlotSvg({ children }: { children: ReactNode }) {
  return (
    <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="block h-auto w-full" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

const TEXT = { fontSize: 11, fill: 'var(--site-text-muted)' } as const;

export function YAxis({ ticks, format }: { ticks: { v: number; y: number }[]; format: (n: number) => string }) {
  return (
    <g>
      {ticks.map((t) => (
        <g key={t.v}>
          <line
            x1={PLOT.left}
            x2={PLOT.right}
            y1={t.y}
            y2={t.y}
            stroke="var(--site-border)"
            strokeWidth={1}
          />
          <text x={PLOT.left - 6} y={t.y} dy="0.32em" textAnchor="end" {...TEXT}>
            {format(t.v)}
          </text>
        </g>
      ))}
    </g>
  );
}

export function XAxis({ ticks }: { ticks: { x: number; label: string }[] }) {
  return (
    <g>
      {ticks.map((t) => (
        <text key={`${t.x}-${t.label}`} x={t.x} y={PLOT.bottom + 16} textAnchor="middle" {...TEXT}>
          {t.label}
        </text>
      ))}
    </g>
  );
}

export function EndLabel({ x, y, text, ink }: { x: number; y: number; text: string; ink: 'ink' | 'muted' }) {
  return (
    <text
      x={x + 6}
      y={y}
      dy="0.32em"
      fontSize={11}
      fill={ink === 'ink' ? 'var(--site-text)' : 'var(--site-text-muted)'}
    >
      {text}
    </text>
  );
}

export function EmptyNote({ text }: { text: string }) {
  return (
    <text
      x={(PLOT.left + PLOT.right) / 2}
      y={(PLOT.top + PLOT.bottom) / 2}
      textAnchor="middle"
      dy="0.32em"
      {...TEXT}
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
