import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { GEOMETRIES, TICK_ROOM, heightOf, nearestIndex, type ChartGeometry } from '../../engine/chart-geometry';

/**
 * The shared frame for the RMH Med Schools charts. A chart is a card (owner O7, 2026-11-23): `--site-surface`, 1px
 * `--site-border`, 8px radius, a legend above the plot, then the drawing, then the native table. The drawing is
 * server-rendered in three geometries (CSS shows one) and is the same markup on the server and the client; the only
 * client behaviour is the hover / touch / keyboard probe (a crosshair and a tooltip) and the y-scale tween the chart
 * itself runs (`tween.ts`). The caller passes every word already translated, as `components/ui/line-chart.tsx` does.
 *
 * Text is `--site-text` / `--site-text-muted`, never a series colour; series colours are the `--site-chart-*` tokens
 * (`chartColors.ts`). Axes and gridlines are `--site-border`.
 */

export interface ChartLabels {
  /** The figure caption. */
  title: string;
  /** "Reported events". */
  unit: string;
  /** Short axis cues: "Reported events per day", "Reported events, running total". */
  unitDaily: string;
  unitCumulative: string;
  /** "Sources: CycleTrack (primary), Admit.org", built from the sources the chart was given. */
  sourcesLine: (v: { primary: string; comparison: string[] }) => string;
  /** "Sources: A, B" for a chart whose lines each have their own primary (no one source is the primary). */
  sourcesPlain: (names: string[]) => string;
  primary: string;
  comparison: string;
  date: string;
  count: string;
  cumulative: string;
  /** Shown instead of a line or bars when there is nothing to draw. */
  empty: string;
  /** Summary of the native table, e.g. "Show data". */
  showData: string;
  /** What the keyboard does on the plot: "Use the left and right arrow keys to read the values by date." */
  hint: string;
  /** The accessible name of the drawing; numbers already formatted by the caller. */
  summary: (v: { lines: { name: string; total: number }[] }) => string;
  /** BCP 47 locale for dates and numbers. */
  locale: string;
  /** The wave mark's words (phase 5, D10): the legend entry, and the probe row for a wave day. Optional: not every chart marks waves. */
  wave?: { legend: string; probe: (count: number) => string };
}

export interface LegendItem {
  key: string;
  label: string;
  color: string;
  dash?: string | undefined;
  width?: number | undefined;
}

/** A short stroke of the series colour with its dash: a line key, never a box (the marks are lines). */
export function Swatch({
  color,
  dash,
  width = 2,
  dim = false,
}: {
  color: string;
  dash?: string | undefined;
  width?: number;
  dim?: boolean;
}) {
  return (
    <svg
      width="22"
      height="8"
      viewBox="0 0 22 8"
      aria-hidden="true"
      focusable="false"
      className="shrink-0"
      opacity={dim ? 0.45 : 1}
    >
      <line
        x1="1"
        x2="21"
        y1="4"
        y2="4"
        stroke={color}
        strokeWidth={width}
        strokeDasharray={dash}
        strokeLinecap="butt"
      />
    </svg>
  );
}

/** The wave mark's key: a short vertical tick in the muted ink, as drawn on the plot. */
export function WaveKey({ label }: { label: string }) {
  return (
    <span className="t-meta flex items-center gap-2">
      <svg width="22" height="8" viewBox="0 0 22 8" aria-hidden="true" focusable="false" className="shrink-0">
        <line x1="11" x2="11" y1="0" y2="8" stroke="var(--site-text-muted)" strokeWidth={1} />
      </svg>
      <span>{label}</span>
    </span>
  );
}

/** The tick drawn at a wave day: 1px, `--site-text-muted`, rising 8 units from the x axis, no fill. */
export function WaveTick({ x, g }: { x: number; g: ChartGeometry }) {
  return (
    <line
      x1={x}
      x2={x}
      y1={g.plot.bottom}
      y2={g.plot.bottom - 8}
      stroke="var(--site-text-muted)"
      strokeWidth={1}
      fill="none"
      data-wave=""
    />
  );
}

/** Colour key above the plot. Present for two or more series; one series is named by the title. */
export function ChartLegend({ items }: { items: LegendItem[] }) {
  if (items.length < 2) return null;
  return (
    <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0">
      {items.map((i) => (
        <li key={i.key} className="t-meta flex items-center gap-2">
          <Swatch color={i.color} dash={i.dash} width={i.width ?? 2} />
          <span>{i.label}</span>
        </li>
      ))}
    </ul>
  );
}

export function ChartFrame(p: {
  title: string;
  unit: string;
  sourcesLine: string;
  /** The legend, or the toggle row that is the legend (`CategoryToggles`). */
  legend?: ReactNode;
  table: ReactNode;
  tableLabel: string;
  /** The drawing, from `ResponsivePlot`. */
  children: ReactNode;
}) {
  return (
    <figure className="m-0 rounded-site border border-site-border bg-site-surface p-3 sm:p-4">
      <figcaption>
        <span className="t-label block">{p.title}</span>
        <span className="t-meta block">{`${p.unit} · ${p.sourcesLine}`}</span>
      </figcaption>
      {p.legend ? <div className="mt-3 empty:hidden">{p.legend}</div> : null}
      {/* The time axis reads left to right in every language (D13). */}
      <div dir="ltr" className="mt-3">
        {p.children}
      </div>
      <details className="mt-3">
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

export interface ProbeRow {
  key: string;
  name: string;
  color: string;
  dash?: string | undefined;
  /** The formatted value. */
  text: string;
  /** Where the series is at this stop, in plot pixels, or null when it has no mark there. */
  y: (g: ChartGeometry) => number | null;
}

/** What the crosshair can land on: `count` stops, each with an x in plot pixels and the readout at that stop. */
export interface Probe {
  count: number;
  x: (g: ChartGeometry, i: number) => number;
  at: (i: number) => { label: string; rows: ProbeRow[] };
  /** The stop to show when the plot gets keyboard focus. */
  initial?: number;
}

/**
 * The drawing in every geometry (phone, mid, wide), server-rendered, one shown by CSS. No measuring and no script:
 * the markup is the same on the server and the client until a probe is active. `xTitle` is the short axis cue under
 * the tick labels. `probe` adds the crosshair and tooltip (pointer, touch, and the arrow keys on the focused plot).
 */
export function ResponsivePlot({
  render,
  xTitle,
  probe,
  summary,
  hint,
}: {
  render: (g: ChartGeometry, clipId: string) => ReactNode;
  xTitle?: string;
  probe?: Probe;
  summary: string;
  hint: string;
}) {
  const uid = useId().replace(/[^\w-]/g, '');
  return (
    <>
      {GEOMETRIES.map((g) => (
        <PlotSvg
          key={g.id}
          g={g}
          clipId={`${uid}-${g.id}`}
          xTitle={xTitle}
          render={render}
          probe={probe}
          summary={summary}
          hint={hint}
        />
      ))}
    </>
  );
}

function PlotSvg({
  g,
  clipId,
  xTitle,
  render,
  probe,
  summary,
  hint,
}: {
  g: ChartGeometry;
  clipId: string;
  xTitle: string | undefined;
  render: (g: ChartGeometry, clipId: string) => ReactNode;
  probe: Probe | undefined;
  summary: string;
  hint: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const [byKey, setByKey] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const hintId = `${clipId}-hint`;
  const h = heightOf(g, !!xTitle);
  const count = probe?.count ?? 0;
  const stop = active !== null && probe && active < count ? active : null;
  const at = stop !== null && probe ? probe.at(stop) : null;
  const crossX = stop !== null && probe ? probe.x(g, stop) : 0;

  // The tooltip follows the crosshair and flips to its other side (and stays inside the card) once it would overflow.
  useLayoutEffect(() => {
    const t = tip.current;
    const w = wrap.current;
    if (!t || !w || stop === null) return;
    const cw = w.clientWidth;
    const cross = (crossX / g.w) * cw;
    let left = cross + 12;
    if (left + t.offsetWidth > cw) left = cross - 12 - t.offsetWidth;
    t.style.left = `${Math.max(0, left)}px`;
  }, [stop, crossX, g.w]);

  const pick = (e: PointerEvent<HTMLDivElement>) => {
    const el = wrap.current;
    if (!probe || !el || count === 0) return;
    const r = el.getBoundingClientRect();
    if (r.width === 0) return;
    const vx = ((e.clientX - r.left) / r.width) * g.w;
    const xs = Array.from({ length: count }, (_, i) => probe.x(g, i));
    const i = nearestIndex(xs, vx);
    if (i >= 0) {
      setByKey(false);
      setActive(i);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!probe || count === 0) return;
    const at0 = active ?? probe.initial ?? count - 1;
    let next: number | null = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = Math.min(at0 + 1, count - 1);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = Math.max(at0 - 1, 0);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = count - 1;
    else if (e.key === 'PageUp') next = Math.min(at0 + 7, count - 1);
    else if (e.key === 'PageDown') next = Math.max(at0 - 7, 0);
    else if (e.key === 'Escape') {
      setActive(null);
      return;
    }
    if (next === null) return;
    e.preventDefault();
    setByKey(true);
    setActive(next);
  };

  return (
    // The plot is one keyboard-operable composite (arrow keys move the crosshair), a focusable named group.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div
      ref={wrap}
      role={probe ? 'group' : undefined}
      aria-label={probe ? summary : undefined}
      aria-describedby={probe ? hintId : undefined}
      tabIndex={probe ? 0 : undefined}
      className={`${SHOWN_AT[g.id]} relative touch-pan-y rounded-site`}
      onPointerMove={probe ? pick : undefined}
      onPointerDown={probe ? pick : undefined}
      onPointerLeave={
        probe
          ? (e) => {
              if (e.pointerType === 'mouse' && document.activeElement !== wrap.current) setActive(null);
            }
          : undefined
      }
      onFocus={probe ? () => setActive((a) => a ?? probe.initial ?? count - 1) : undefined}
      onBlur={probe ? () => setActive(null) : undefined}
      onKeyDown={probe ? onKeyDown : undefined}
    >
      <svg
        viewBox={`0 0 ${g.w} ${h}`}
        className="block h-auto w-full"
        role={probe ? undefined : 'img'}
        aria-label={probe ? undefined : summary}
        aria-hidden={probe ? true : undefined}
        focusable="false"
      >
        {render(g, clipId)}
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
        {at ? (
          <g pointerEvents="none">
            <line
              x1={crossX}
              x2={crossX}
              y1={g.plot.top}
              y2={g.plot.bottom}
              stroke="var(--site-text-muted)"
              strokeWidth={1}
            />
            {at.rows.map((r) => {
              const y = r.y(g);
              return y === null ? null : (
                <circle
                  key={r.key}
                  cx={crossX}
                  cy={y}
                  r={4}
                  fill={r.color}
                  stroke="var(--site-surface)"
                  strokeWidth={2}
                />
              );
            })}
          </g>
        ) : null}
      </svg>
      {probe ? (
        <span id={hintId} className="sr-only">
          {hint}
        </span>
      ) : null}
      {at ? (
        <div
          ref={tip}
          role={byKey ? 'status' : undefined}
          className="surface-overlay pointer-events-none absolute z-10 w-max max-w-full px-3 py-2"
          style={{ top: `${(g.plot.top / h) * 100}%`, left: 0 }}
        >
          <div className="t-label m-0 text-site-text">{at.label}</div>
          <ul className="m-0 mt-1 flex list-none flex-col gap-1 p-0">
            {at.rows.map((r) => (
              <li key={r.key} className="t-meta flex items-center gap-2">
                <Swatch color={r.color} dash={r.dash} />
                <span className="me-auto">{r.name}</span>
                <span className="font-semibold text-site-text tabular-nums">{r.text}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

const textProps = (g: ChartGeometry) => ({ fontSize: g.font, fill: 'var(--site-text-muted)' }) as const;

/** The plot rectangle as a clip, so a scale mid-tween never draws a line or bar above the plot. */
export function PlotClip({ id, g }: { id: string; g: ChartGeometry }) {
  return (
    <clipPath id={id}>
      <rect
        x={g.plot.left - 2}
        y={g.plot.top - 2}
        width={g.plot.right - g.plot.left + 4}
        height={g.plot.bottom - g.plot.top + 4}
      />
    </clipPath>
  );
}

export function YAxis({
  ticks,
  format,
  g,
}: {
  ticks: { v: number; y: number; opacity?: number }[];
  format: (n: number) => string;
  g: ChartGeometry;
}) {
  return (
    <g>
      {ticks.map((t) => (
        <g key={t.v} opacity={t.opacity ?? 1}>
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

/** Value of a step series at `x` (the last point at or before it), or null before its first point. */
export function valueAt(points: { x: number; y: number }[], x: number): number | null {
  let v: number | null = null;
  for (const p of points) {
    if (p.x > x) break;
    v = p.y;
  }
  return v;
}
