'use client';

/**
 * K1 — the availability grid. One component paints your answers AND shows the
 * group's heat map, for a poll of up to 14 days x 48 slots (672 cells).
 *
 * ## Why this does not use per-cell React state
 *
 * Painting is a drag across dozens of cells. A state update per cell re-renders
 * the grid on every pointer move, which is where the "scheduling grid feels
 * sticky on a phone" feeling comes from. So the answers live in one
 * `Uint8Array`; a drag writes to it and sets `data-a` on the touched DOM nodes
 * directly; React renders the structure once and is told about the result once,
 * on pointer-up (`onCommit`). Pointer events are delegated to the grid element —
 * there is not one handler per cell.
 *
 * ## Rendering in the viewer's timezone
 *
 * Slots are UTC instants; `layoutGrid` places them in a day-by-time grid in the
 * VIEWER's zone, so an organiser's 9–17 in New York is 15:00–23:00 for someone in
 * Berlin and a window that crosses the viewer's midnight splits across columns.
 *
 * ## Input
 *
 * Mouse and pen: press and drag to paint. Touch: tap a cell, or switch on
 * "drag to paint" (which stops the page scrolling under the finger) to sweep.
 * Keyboard: arrow keys move, Space/Enter paints, Shift+arrow paints as it moves.
 */

import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { layoutGrid } from '@/lib/calendar/poll-slots';

export interface SlotHeat {
  yes: number;
  maybe: number;
  /** 0–1, how strong this slot is relative to the best one. */
  frac: number;
}

export interface PollGridProps {
  starts: readonly number[];
  viewerTz: string;
  locale: string;
  mode: 'paint' | 'view';
  /** Initial answers, one char per slot. Read once at mount; remount (key) to reset. */
  initial: string;
  /** 1 = available, 2 = if need be. Read live. */
  brush: 1 | 2;
  /** Touch only: let a drag paint instead of scroll. */
  dragToPaint: boolean;
  disabled?: boolean;
  heat?: readonly SlotHeat[];
  /** Slot indexes of the currently best run, outlined. */
  highlight?: ReadonlySet<number>;
  /** Slot indexes of the locked-in run. */
  lockedSlots?: ReadonlySet<number>;
  /** Called once per gesture with the full answers string. */
  onCommit?: (answers: string) => void;
  /** View mode: a cell was clicked / focused-and-activated. */
  onActivate?: (slotIndex: number) => void;
  slotMin: number;
}

function parse(initial: string, n: number): Uint8Array {
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const c = initial.charCodeAt(i) - 48;
    out[i] = c === 1 || c === 2 ? c : 0;
  }
  return out;
}

function PollGridImpl(props: PollGridProps) {
  const { t } = useTranslation('f-calendar');
  const { starts, viewerTz, locale, mode, heat, highlight, lockedSlots, slotMin } = props;

  // Everything the handlers read lives in refs so they can be created once.
  const live = useRef(props);
  live.current = props;
  const answers = useRef<Uint8Array>(parse(props.initial, starts.length));
  const containerRef = useRef<HTMLDivElement>(null);
  const nodes = useRef<(HTMLElement | null)[]>([]);
  const kbValue = useRef<0 | 1 | 2>(1);
  const drag = useRef<{
    value: 0 | 1 | 2;
    tap: boolean;
    idx: number;
    x: number;
    y: number;
    painted: boolean;
  } | null>(null);

  const layout = useMemo(() => layoutGrid(starts, viewerTz), [starts, viewerTz]);
  const R = layout.rows.length;

  const { slotDay, slotRow } = useMemo(() => {
    const sd = new Int16Array(starts.length);
    const sr = new Int16Array(starts.length);
    for (let d = 0; d < layout.days.length; d++) {
      for (let r = 0; r < R; r++) {
        const i = layout.cells[d * R + r];
        if (i >= 0) {
          sd[i] = d;
          sr[i] = r;
        }
      }
    }
    return { slotDay: sd, slotRow: sr };
  }, [layout, R, starts.length]);

  const fmt = useMemo(() => {
    const day = new Intl.DateTimeFormat(locale, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      timeZone: viewerTz,
    });
    const time = new Intl.DateTimeFormat(locale, {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'UTC',
    });
    const full = new Intl.DateTimeFormat(locale, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: viewerTz,
    });
    return { day, time, full };
  }, [locale, viewerTz]);

  const words = useMemo(
    () => [
      t('grid-answer-none', { defaultValue: 'not available' }),
      t('grid-answer-yes', { defaultValue: 'available' }),
      t('grid-answer-maybe', { defaultValue: 'if need be' }),
    ],
    [t],
  );
  const wordsRef = useRef(words);
  wordsRef.current = words;

  const paintNode = useCallback((i: number, v: number) => {
    const el = nodes.current[i];
    if (!el) return;
    el.dataset.a = String(v);
    const sr = el.lastElementChild;
    if (sr) sr.textContent = wordsRef.current[v];
  }, []);

  // Keep the screen-reader text in the active language if it changes.
  useEffect(() => {
    for (let i = 0; i < starts.length; i++) paintNode(i, answers.current[i]);
  }, [words, starts.length, paintNode]);

  const commit = useCallback(() => {
    const a = answers.current;
    let s = '';
    for (let i = 0; i < a.length; i++) s += a[i];
    live.current.onCommit?.(s);
  }, []);

  const apply = useCallback(
    (i: number, v: number): boolean => {
      if (answers.current[i] === v) return false;
      answers.current[i] = v;
      paintNode(i, v);
      return true;
    },
    [paintNode],
  );

  const cellOf = (target: EventTarget | null): HTMLElement | null =>
    target instanceof Element ? target.closest<HTMLElement>('[data-i]') : null;

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const p = live.current;
      if (p.mode !== 'paint' || p.disabled) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const cell = cellOf(e.target);
      if (!cell) return;
      const i = Number(cell.dataset.i);
      const value: 0 | 1 | 2 = answers.current[i] === p.brush ? 0 : p.brush;
      kbValue.current = value || p.brush;
      if (e.pointerType === 'touch' && !p.dragToPaint) {
        drag.current = { value, tap: true, idx: i, x: e.clientX, y: e.clientY, painted: false };
        return;
      }
      e.currentTarget.setPointerCapture(e.pointerId);
      drag.current = { value, tap: false, idx: i, x: e.clientX, y: e.clientY, painted: true };
      apply(i, value);
    },
    [apply],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const d = drag.current;
      if (!d) return;
      if (d.tap) {
        // The finger moved: that is a scroll, not a tap.
        if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 8) drag.current = null;
        return;
      }
      const cell = cellOf(document.elementFromPoint(e.clientX, e.clientY));
      if (cell) apply(Number(cell.dataset.i), d.value);
    },
    [apply],
  );

  const finish = useCallback(
    (e: React.PointerEvent<HTMLDivElement>, cancelled: boolean) => {
      const d = drag.current;
      drag.current = null;
      if (!d) return;
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      if (d.tap) {
        if (!cancelled) {
          apply(d.idx, d.value);
          commit();
        }
        return;
      }
      commit();
    },
    [apply, commit],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const cell = cellOf(e.target);
      if (!cell) return;
      const p = live.current;
      const i = Number(cell.dataset.i);
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        if (p.mode === 'view') {
          p.onActivate?.(i);
          return;
        }
        if (p.disabled) return;
        const value: 0 | 1 | 2 = answers.current[i] === p.brush ? 0 : p.brush;
        kbValue.current = value || p.brush;
        apply(i, value);
        commit();
        return;
      }
      const delta: Record<string, [number, number]> = {
        ArrowRight: [1, 0],
        ArrowLeft: [-1, 0],
        ArrowDown: [0, 1],
        ArrowUp: [0, -1],
      };
      let target = -1;
      if (e.key in delta) {
        const [dd, dr] = delta[e.key];
        let d = slotDay[i] + dd;
        let r = slotRow[i] + dr;
        // Skip blank cells (hours with no slot on that day) in the direction of travel.
        while (d >= 0 && d < layout.days.length && r >= 0 && r < R) {
          const idx = layout.cells[d * R + r];
          if (idx >= 0) {
            target = idx;
            break;
          }
          d += dd;
          r += dr;
        }
      } else if (e.key === 'Home' || e.key === 'End') {
        const d = slotDay[i];
        const rs = e.key === 'Home' ? [...Array(R).keys()] : [...Array(R).keys()].reverse();
        for (const r of rs) {
          const idx = layout.cells[d * R + r];
          if (idx >= 0) {
            target = idx;
            break;
          }
        }
      }
      if (target < 0) return;
      e.preventDefault();
      nodes.current[target]?.focus();
      if (e.shiftKey && p.mode === 'paint' && !p.disabled) {
        apply(target, kbValue.current);
        commit();
      }
    },
    [apply, commit, layout, R, slotDay, slotRow],
  );

  const onFocus = useCallback((e: React.FocusEvent<HTMLDivElement>) => {
    const cell = cellOf(e.target);
    if (!cell) return;
    for (const n of nodes.current) if (n && n !== cell && n.tabIndex === 0) n.tabIndex = -1;
    cell.tabIndex = 0;
  }, []);

  const onClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const p = live.current;
    if (p.mode !== 'view') return;
    const cell = cellOf(e.target);
    if (cell) p.onActivate?.(Number(cell.dataset.i));
  }, []);

  const firstCell = useMemo(() => layout.cells.findIndex((c) => c >= 0), [layout]);
  const firstIndex = firstCell >= 0 ? layout.cells[firstCell] : -1;

  // The static structure. Re-rendered only when the layout, heat or highlight change,
  // never while painting.
  const body = useMemo(() => {
    const rows: React.ReactNode[] = [];
    for (let r = 0; r < R; r++) {
      const tod = layout.rows[r];
      const onHour = tod % 60 === 0;
      const cells: React.ReactNode[] = [
        <div
          key="label"
          role="rowheader"
          className="sticky left-0 z-10 flex items-start justify-end bg-site-surface pr-2 text-[0.65rem] leading-none text-site-text-muted tabular-nums"
        >
          {onHour || slotMin >= 60 ? fmt.time.format(new Date(Date.UTC(2000, 0, 1, 0, tod))) : ''}
        </div>,
      ];
      for (let d = 0; d < layout.days.length; d++) {
        const i = layout.cells[d * R + r];
        if (i < 0) {
          cells.push(<div key={d} role="gridcell" aria-hidden className="bg-site-bg-subtle/40" />);
          continue;
        }
        const h = heat?.[i];
        const label = fmt.full.format(new Date(starts[i] * 60_000));
        cells.push(
          <div
            key={d}
            role="gridcell"
            data-i={i}
            data-a={answers.current[i]}
            tabIndex={i === firstIndex ? 0 : -1}
            aria-label={
              h
                ? t('grid-cell-label-heat', {
                    defaultValue: '{{time}}: {{yes}} available, {{maybe}} if need be',
                    time: label,
                    yes: h.yes,
                    maybe: h.maybe,
                  })
                : label
            }
            ref={(el) => {
              nodes.current[i] = el;
            }}
            className={cn(
              'group relative flex h-7 min-w-11 cursor-pointer select-none items-center justify-center rounded-site-sm border border-site-border/60 bg-site-bg text-[0.65rem] tabular-nums text-site-text outline-none',
              'focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-site-accent',
              "data-[a='1']:border-site-success data-[a='2']:border-site-warning",
              mode === 'paint' &&
                "data-[a='1']:after:content-['✓'] data-[a='2']:after:content-['?'] after:absolute after:right-0.5 after:top-0 after:text-[0.6rem] after:font-bold",
              highlight?.has(i) && 'outline outline-2 -outline-offset-2 outline-site-accent',
              lockedSlots?.has(i) && 'bg-site-accent-dim',
            )}
          >
            {h && h.frac > 0 ? (
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 rounded-site-sm bg-site-accent"
                style={{ opacity: 0.12 + h.frac * 0.78 }}
              />
            ) : null}
            {mode === 'view' && h && h.yes + h.maybe > 0 ? (
              <span className="relative z-[1] font-semibold text-site-text">{h.yes + h.maybe}</span>
            ) : null}
            <span className="sr-only" />
          </div>,
        );
      }
      rows.push(
        <div key={r} role="row" className="contents">
          {cells}
        </div>,
      );
    }
    return rows;
    // t is stable per language; answers are read once for the initial paint.
  }, [layout, R, heat, highlight, lockedSlots, mode, fmt, starts, firstIndex, slotMin, t]);

  // After React (re)renders the structure, re-apply the sr-only text.
  useEffect(() => {
    for (let i = 0; i < starts.length; i++) paintNode(i, answers.current[i]);
  }, [body, starts.length, paintNode]);

  return (
    <div
      ref={containerRef}
      role="grid"
      aria-label={t('grid-label', { defaultValue: 'Availability grid' })}
      aria-rowcount={R + 1}
      aria-colcount={layout.days.length + 1}
      aria-readonly={mode === 'view' || props.disabled ? true : undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => finish(e, false)}
      onPointerCancel={(e) => finish(e, true)}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
      onClick={onClick}
      className="grid max-h-[70vh] gap-px overflow-auto rounded-site border border-site-border bg-site-border/40"
      style={{
        gridTemplateColumns: `3.5rem repeat(${layout.days.length}, minmax(2.75rem, 1fr))`,
        touchAction: props.dragToPaint && mode === 'paint' ? 'none' : undefined,
      }}
    >
      <div role="row" className="contents">
        <div role="columnheader" className="sticky left-0 top-0 z-20 bg-site-surface" />
        {layout.days.map((d) => (
          <div
            key={d.day}
            role="columnheader"
            className="sticky top-0 z-10 bg-site-surface px-1 py-1.5 text-center text-xs font-semibold text-site-text"
          >
            {fmt.day.format(new Date(d.startMs))}
          </div>
        ))}
      </div>
      {body}
    </div>
  );
}

export const PollGrid = memo(PollGridImpl);
