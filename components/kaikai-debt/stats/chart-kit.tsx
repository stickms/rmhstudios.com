'use client';

/**
 * The pieces every chart in the debt analytics panel is built from.
 *
 * There is no chart library here on purpose. What these charts need is a
 * viewBox, a scale, a crosshair and a legend — and what a chart library brings
 * with it is its own colour system, its own type scale and its own idea of what
 * a tooltip looks like, none of which match the `--site-*` contract this page
 * renders in. So the shared parts live here, once, and every chart is plain SVG
 * underneath.
 *
 * ## Two rules the whole panel inherits from these primitives
 *
 * 1. **Marks carry colour through `currentColor`.** A series is wrapped in a
 *    `.kd-series-n` class (kaikai-debt.css) and every mark inside it is
 *    `fill: currentColor`. Nothing in this directory writes a colour literal, so
 *    the legend swatch, the bar, the globe pin and the table row for one
 *    category are incapable of disagreeing about what colour it is.
 * 2. **Hover is a data readout, never a decorative effect.** The site retired
 *    pointer-position *styling* on 2026-08-01 (§5.1.1) — gradients that follow
 *    the cursor, per-card sheen, tilt. A crosshair is the opposite kind of
 *    thing: the pointer's position IS the query, the response is a number, and
 *    nothing repaints except one line and one label. The hover state is stored
 *    as an integer index rather than as coordinates, so moving the pointer
 *    inside one band re-renders nothing at all.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/utils';
import { useReducedMotion } from '@/hooks/useReducedMotion';

/* -------------------------------------------------------------------------- */
/* The clock                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * How often the charts re-evaluate their compounded values, in ms.
 *
 * Two seconds, not the odometer's 70ms. The counter's job is to look alive at
 * the resolution of a blur; a chart's job is to be readable, and a bar chart
 * whose bars twitch fourteen times a second is a chart you cannot read a value
 * off. Two seconds is fast enough that a viewer who watches sees the bars creep,
 * and slow enough that the panel is idle almost all of the time.
 */
export const CHART_TICK_MS = 2_000;

/**
 * A clock that starts at the server's instant and only goes live after mount.
 *
 * The first render — server and client — evaluates every chart at `asOfMs`, the
 * timestamp that came down with the data, so SSR and hydration produce identical
 * markup by construction. This is the same contract `DebtCounter` holds, and it
 * matters more here: a hydration mismatch inside an SVG makes React throw away
 * and re-render the whole subtree, which for this panel is every chart on the
 * page.
 *
 * It stops when the tab is hidden. It is not gated on visibility of any one
 * chart, because the panel is a tab strip — the chart you are looking at and the
 * ones you are not share this single interval either way.
 */
export function useChartClock(asOfMs: number): number {
  const [now, setNow] = useState(asOfMs);
  const reduced = useReducedMotion();

  useEffect(() => {
    // Reduced motion still advances — a compounding chart that has stopped
    // compounding is wrong, not calm — it just does so slowly enough that
    // nothing on screen appears to move.
    const period = reduced ? 10_000 : CHART_TICK_MS;
    let timer: ReturnType<typeof setInterval> | null = null;

    const tick = () => setNow(Date.now());
    const start = () => {
      if (timer) return;
      tick();
      timer = setInterval(tick, period);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const sync = () => (document.visibilityState === 'visible' ? start() : stop());

    document.addEventListener('visibilitychange', sync);
    sync();
    return () => {
      stop();
      document.removeEventListener('visibilitychange', sync);
    };
  }, [reduced]);

  return now;
}

/* -------------------------------------------------------------------------- */
/* Pointer → band index                                                       */
/* -------------------------------------------------------------------------- */

/** The plot's inner box, in viewBox units. Every chart shares this geometry. */
export interface Plot {
  width: number;
  height: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
  /** Derived: the drawable area inside the padding. */
  innerLeft: number;
  innerRight: number;
  innerTop: number;
  innerBottom: number;
  innerWidth: number;
  innerHeight: number;
}

export function makePlot(
  width: number,
  height: number,
  padding: { left: number; right: number; top: number; bottom: number },
): Plot {
  const innerLeft = padding.left;
  const innerRight = width - padding.right;
  const innerTop = padding.top;
  const innerBottom = height - padding.bottom;
  return {
    width,
    height,
    ...padding,
    innerLeft,
    innerRight,
    innerTop,
    innerBottom,
    innerWidth: Math.max(1, innerRight - innerLeft),
    innerHeight: Math.max(1, innerBottom - innerTop),
  };
}

/**
 * Pointer position in viewBox units.
 *
 * The SVG scales uniformly (default `preserveAspectRatio`), so mapping a client
 * coordinate back into the viewBox is one ratio per axis — no matrix, no
 * `getScreenCTM`, and nothing that forces a style flush inside an event.
 */
export function pointerInViewBox(
  event: ReactPointerEvent<SVGSVGElement>,
  plot: Plot,
): { x: number; y: number } {
  const rect = event.currentTarget.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return { x: -1, y: -1 };
  return {
    x: ((event.clientX - rect.left) / rect.width) * plot.width,
    y: ((event.clientY - rect.top) / rect.height) * plot.height,
  };
}

/* -------------------------------------------------------------------------- */
/* Frame                                                                      */
/* -------------------------------------------------------------------------- */

interface ChartFrameProps {
  plot: Plot;
  /** Already-translated accessible name — an SVG with no name is a decoration. */
  title: string;
  /** Longer accessible description; the sentence a screen reader gets instead. */
  description?: string;
  className?: string;
  children: ReactNode;
  onPointerMove?: (event: ReactPointerEvent<SVGSVGElement>) => void;
  onPointerLeave?: () => void;
  onPointerDown?: (event: ReactPointerEvent<SVGSVGElement>) => void;
}

/**
 * The `<svg>` every chart lives in.
 *
 * `role="img"` plus a `<title>`/`<desc>` pair rather than `aria-label` on a bare
 * SVG: assistive technology reads the title element reliably in every engine,
 * and the description is where the chart says what it is showing. Every chart in
 * this panel additionally has a table view, because a description is a summary
 * and a table is the data.
 */
export function ChartFrame({
  plot,
  title,
  description,
  className,
  children,
  onPointerMove,
  onPointerLeave,
  onPointerDown,
}: ChartFrameProps) {
  return (
    <svg
      viewBox={`0 0 ${plot.width} ${plot.height}`}
      className={cn('kd-chart', className)}
      role="img"
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      onPointerDown={onPointerDown}
    >
      <title>{title}</title>
      {description && <desc>{description}</desc>}
      {children}
    </svg>
  );
}

/** Horizontal gridlines at the given y positions, plus the baseline. */
export function GridLines({ plot, ys }: { plot: Plot; ys: readonly number[] }) {
  return (
    <g aria-hidden>
      {ys.map((y) => (
        <line
          key={y}
          className="kd-chart__grid"
          x1={plot.innerLeft}
          x2={plot.innerRight}
          y1={y}
          y2={y}
        />
      ))}
      <line
        className="kd-chart__axis"
        x1={plot.innerLeft}
        x2={plot.innerRight}
        y1={plot.innerBottom}
        y2={plot.innerBottom}
      />
    </g>
  );
}

/** Axis tick labels. `anchor` decides which side of the plot they sit on. */
export function AxisLabels({
  items,
  anchor = 'end',
}: {
  items: readonly { key: string; x: number; y: number; text: string }[];
  anchor?: 'start' | 'middle' | 'end';
}) {
  return (
    <g aria-hidden>
      {items.map((item) => (
        <text
          key={item.key}
          className="kd-chart__label"
          x={item.x}
          y={item.y}
          textAnchor={anchor}
          dominantBaseline="middle"
        >
          {item.text}
        </text>
      ))}
    </g>
  );
}

/* -------------------------------------------------------------------------- */
/* Readout                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The floating readout a hover produces.
 *
 * `.glass-overlay` because it floats: the L4 tier is the only one with a blur
 * under it, and floating UI below L4 ghosts over whatever it covers — a rule CI
 * enforces. `.kd-readout` only positions it.
 *
 * `left`/`top` are fractions of the container so the caller can compute them in
 * chart space without knowing the rendered size. The transform flips the box to
 * the other side of the pointer past the midline, which is what stops it being
 * clipped at the right-hand edge of a chart.
 */
export function Readout({
  x,
  y,
  children,
}: {
  /** 0–1 across the container. */
  x: number;
  /** 0–1 down the container. */
  y: number;
  children: ReactNode;
}) {
  const flip = x > 0.6;
  return (
    <div
      className="kd-readout glass-overlay rounded-site-sm px-2.5 py-2 text-xs shadow-site"
      style={{
        left: `${x * 100}%`,
        top: `${y * 100}%`,
        transform: `translate(${flip ? 'calc(-100% - 12px)' : '12px'}, -50%)`,
      }}
      role="status"
      aria-live="off"
    >
      {children}
    </div>
  );
}

/** One labelled row inside a readout: a swatch, a name, a value. */
export function ReadoutRow({
  seriesIndex,
  label,
  value,
}: {
  seriesIndex?: number;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex min-w-0 items-center gap-1.5 text-site-text-muted">
        {seriesIndex !== undefined && <Swatch seriesIndex={seriesIndex} />}
        <span className="truncate">{label}</span>
      </span>
      <span className="shrink-0 font-medium text-site-text tabular-nums">{value}</span>
    </div>
  );
}

/** The colour chip. Its own component so no call site can invent a second one. */
export function Swatch({ seriesIndex }: { seriesIndex: number }) {
  return (
    <span
      aria-hidden
      className={cn('inline-block size-2.5 shrink-0 rounded-full bg-current', seriesClass(seriesIndex))}
    />
  );
}

/** `.kd-series-n`, wrapped so the modulo lives in exactly one place. */
export function seriesClass(index: number): string {
  return `kd-series-${((index % 8) + 8) % 8}`;
}

/* -------------------------------------------------------------------------- */
/* Legend                                                                     */
/* -------------------------------------------------------------------------- */

export interface LegendItem {
  id: string;
  label: string;
  seriesIndex: number;
  value?: string;
}

/**
 * The legend, which is also the panel's cross-filter.
 *
 * Present whenever there are two or more series — colour is never the only
 * channel identifying a mark, and with eight categories a legend is the only
 * place all eight names appear at once.
 *
 * Clicking an entry toggles it. `aria-pressed` rather than a checkbox because
 * these are toggle buttons over a chart, not a form; and the pressed state is
 * carried by opacity *and* by the ring, so it does not depend on seeing the
 * colour change.
 */
export function Legend({
  items,
  selected,
  onToggle,
  label,
}: {
  items: readonly LegendItem[];
  /** Empty set = nothing filtered, i.e. everything shown. */
  selected: ReadonlySet<string>;
  onToggle?: (id: string) => void;
  label: string;
}) {
  const filtering = selected.size > 0;
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1.5" aria-label={label}>
      {items.map((item) => {
        const active = !filtering || selected.has(item.id);
        const content = (
          <>
            <Swatch seriesIndex={item.seriesIndex} />
            <span className="truncate">{item.label}</span>
            {item.value && (
              <span className="text-site-text-muted tabular-nums">{item.value}</span>
            )}
          </>
        );
        return (
          <li key={item.id} className="min-w-0">
            {onToggle ? (
              <button
                type="button"
                onClick={() => onToggle(item.id)}
                aria-pressed={filtering && selected.has(item.id)}
                className={cn(
                  'flex min-w-0 items-center gap-1.5 rounded-site-sm px-1.5 py-1 text-xs transition-colors',
                  'hover:bg-site-surface-active focus-visible:bg-site-surface-active',
                  active ? 'text-site-text' : 'text-site-text-muted opacity-45',
                )}
              >
                {content}
              </button>
            ) : (
              <span className="flex min-w-0 items-center gap-1.5 px-1.5 py-1 text-xs text-site-text">
                {content}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/* -------------------------------------------------------------------------- */
/* Card                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The frame one chart sits in: a heading, an optional control row, the plot, and
 * the readout layer.
 *
 * `.glass-fill` rather than `.glass-pane` — these are repeated content (there
 * are a dozen of them), and L2 has no backdrop blur, which is what keeps the
 * panel inside the ≤8-blurred-surfaces budget no matter how many charts get
 * added to it.
 */
export function ChartCard({
  title,
  hint,
  controls,
  footer,
  children,
  className,
}: {
  title: string;
  hint?: string;
  controls?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('glass-fill flex flex-col gap-3 rounded-site p-2.5 sm:p-4', className)}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 className="font-display text-sm font-semibold text-site-text">{title}</h3>
          {hint && <p className="text-xs text-pretty text-site-text-muted">{hint}</p>}
        </div>
        {controls && <div className="flex shrink-0 flex-wrap items-center gap-2">{controls}</div>}
      </div>
      <div className="relative">{children}</div>
      {footer}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Small controls                                                             */
/* -------------------------------------------------------------------------- */

/**
 * A compact toggle for a chart option (log scale, cumulative, labels).
 *
 * Deliberately NOT a two-option pill row: a segmented control with two segments
 * is a tab strip, and tab strips on this site are `<LiquidTabs>` and nothing
 * else. This is a single button with a pressed state, which is a different
 * control expressing a different thing — "this option is on" rather than "you
 * are looking at this one of several panels".
 */
export function ChartToggle({
  pressed,
  onPressedChange,
  children,
  title,
}: {
  pressed: boolean;
  onPressedChange: (next: boolean) => void;
  children: ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      title={title}
      onClick={() => onPressedChange(!pressed)}
      className={cn(
        'flex min-h-8 items-center gap-1.5 rounded-site-sm border px-2 py-1 text-xs transition-colors pointer-coarse:min-h-11',
        pressed
          ? 'border-site-accent bg-site-accent text-site-accent-fg'
          : 'border-site-border bg-site-surface text-site-text-muted hover:text-site-text',
      )}
    >
      {children}
    </button>
  );
}

/**
 * Remember a hovered index without re-rendering on every pointer move.
 *
 * The setter is stable and bails when the index has not changed, so a pointer
 * travelling across one bar produces exactly one render — the one where it
 * entered the bar. Returned as a tuple so a chart reads like `const [hover,
 * setHover] = useHoverIndex()`.
 */
export function useHoverIndex(): [number, (next: number) => void] {
  const [index, setIndex] = useState(-1);
  const ref = useRef(-1);
  const set = useCallback((next: number) => {
    if (ref.current === next) return;
    ref.current = next;
    setIndex(next);
  }, []);
  return [index, set];
}

/**
 * A stable set of ids, toggled one at a time — the cross-filter's state.
 *
 * An empty set means "no filter", not "nothing selected". That is the only
 * sensible default for a filter that starts off, and it is why every consumer
 * asks `selected.size === 0 || selected.has(id)` rather than `selected.has(id)`.
 */
export function useToggleSet(): {
  selected: ReadonlySet<string>;
  toggle: (id: string) => void;
  clear: () => void;
  isOn: (id: string) => boolean;
} {
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clear = useCallback(() => setSelected(new Set()), []);

  const isOn = useCallback(
    (id: string) => selected.size === 0 || selected.has(id),
    [selected],
  );

  return useMemo(() => ({ selected, toggle, clear, isOn }), [selected, toggle, clear, isOn]);
}
