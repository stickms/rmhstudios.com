'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

/**
 * Radial spin engine — the motion core of the RMH radial UI.
 *
 * A single `requestAnimationFrame` loop integrates a fractional `position`
 * (measured in item-slots) from wheel / drag / keyboard input, applies inertial
 * friction, and settles onto the nearest slot with a critically-damped ease.
 * Every frame it calls `onRender(position)` so the consumer can mutate item
 * transforms *imperatively* — React never re-renders during a spin, which is
 * what keeps it pinned to the display's refresh rate (60/120/144Hz) instead of
 * thrashing the reconciler.
 *
 * Reduced-motion: inertia and the rAF loop are bypassed entirely — input steps
 * the position by whole slots and paints a single frame, so nothing animates.
 */
export interface RadialSpinOptions {
  /** Number of discrete slots; drives snapping and the active-index callback. */
  length: number;
  /** Painted every frame with the current fractional position. Kept in a ref. */
  onRender: (position: number) => void;
  /** Collapse continuous motion to whole-slot steps (prefers-reduced-motion). */
  reduced?: boolean;
  /** Settle onto the nearest slot when the wheel comes to rest. Default true. */
  snap?: boolean;
  /** Slots advanced per 100px of wheel / drag travel. Default 1. */
  sensitivity?: number;
  /** Fires when the settled active slot changes. */
  onActiveChange?: (index: number) => void;
  /** Axis a drag reads from. `y` = vertical rolodex, `x` = horizontal. */
  axis?: 'x' | 'y';
  /** Emit a short Vibration-API tick each time the focused slot changes — the
   *  physical detent feel of a real wheel. No-op where unsupported (e.g. iOS). */
  haptics?: boolean;
}

export interface RadialSpinHandle {
  /** Attach to the interactive surface (receives wheel / pointer / key input). */
  surfaceRef: RefObject<HTMLDivElement | null>;
  /** Nudge the wheel by `delta` slots with a gentle throw. */
  spinBy: (delta: number) => void;
  /** Animate to a specific slot index. */
  spinTo: (index: number) => void;
  /** Force a synchronous re-paint at the current position (e.g. after resize). */
  renderNow: () => void;
}

const FRICTION = 0.9;
const SETTLE = 0.18;
const EPS = 0.0016;

export function useRadialSpin(options: RadialSpinOptions): RadialSpinHandle {
  const { length, reduced = false, snap = true, sensitivity = 1, axis = 'y' } = options;

  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const posRef = useRef(0);
  const velRef = useRef(0);
  const targetRef = useRef<number | null>(null);
  const draggingRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const runningRef = useRef(false);
  const activeRef = useRef(-1);

  // Keep the latest callbacks/config in refs so the rAF loop and event listeners
  // never close over stale values (and never need re-subscribing).
  const onRenderRef = useRef(options.onRender);
  const onActiveRef = useRef(options.onActiveChange);
  const lenRef = useRef(length);
  const reducedRef = useRef(reduced);
  const snapRef = useRef(snap);
  const sensRef = useRef(sensitivity);
  const hapticsRef = useRef(options.haptics);
  onRenderRef.current = options.onRender;
  onActiveRef.current = options.onActiveChange;
  lenRef.current = length;
  reducedRef.current = reduced;
  snapRef.current = snap;
  sensRef.current = sensitivity;
  hapticsRef.current = options.haptics;

  const emitActive = useCallback((pos: number) => {
    const len = lenRef.current;
    if (len <= 0) return;
    const idx = ((Math.round(pos) % len) + len) % len;
    const prev = activeRef.current;
    if (idx !== prev) {
      activeRef.current = idx;
      // A crisp detent tick as each card clicks into focus — but never on the
      // initial paint (prev === -1), only on real transitions.
      if (
        prev !== -1 &&
        hapticsRef.current &&
        typeof navigator !== 'undefined' &&
        typeof navigator.vibrate === 'function'
      ) {
        navigator.vibrate(5);
      }
      onActiveRef.current?.(idx);
    }
  }, []);

  const renderNow = useCallback(() => {
    onRenderRef.current(posRef.current);
    emitActive(posRef.current);
  }, [emitActive]);

  const stop = useCallback(() => {
    runningRef.current = false;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const frame = useCallback(() => {
    if (!draggingRef.current) {
      if (targetRef.current !== null) {
        const diff = targetRef.current - posRef.current;
        if (Math.abs(diff) < EPS) {
          posRef.current = targetRef.current;
          targetRef.current = null;
          velRef.current = 0;
        } else {
          posRef.current += diff * SETTLE;
        }
      } else {
        posRef.current += velRef.current;
        velRef.current *= FRICTION;
        if (Math.abs(velRef.current) < EPS) {
          velRef.current = 0;
          if (snapRef.current) {
            const t = Math.round(posRef.current);
            const d = t - posRef.current;
            posRef.current += Math.abs(d) < EPS ? d : d * SETTLE;
          }
        }
      }
    }

    onRenderRef.current(posRef.current);
    emitActive(posRef.current);

    const settled =
      !draggingRef.current &&
      targetRef.current === null &&
      velRef.current === 0 &&
      (!snapRef.current || Math.abs(posRef.current - Math.round(posRef.current)) < EPS);

    if (settled) {
      stop();
    } else {
      rafRef.current = requestAnimationFrame(frame);
    }
  }, [emitActive, stop]);

  const ensureLoop = useCallback(() => {
    if (runningRef.current) return;
    runningRef.current = true;
    rafRef.current = requestAnimationFrame(frame);
  }, [frame]);

  const spinBy = useCallback(
    (delta: number) => {
      targetRef.current = null;
      if (reducedRef.current) {
        posRef.current = Math.round(posRef.current) + delta;
        renderNow();
        return;
      }
      velRef.current += delta * 0.55;
      ensureLoop();
    },
    [ensureLoop, renderNow],
  );

  const spinTo = useCallback(
    (index: number) => {
      if (reducedRef.current) {
        posRef.current = index;
        renderNow();
        return;
      }
      velRef.current = 0;
      targetRef.current = index;
      ensureLoop();
    },
    [ensureLoop, renderNow],
  );

  // Wire pointer / wheel / keyboard listeners to the interactive surface. Wheel
  // is registered non-passive so we can preventDefault the page scroll the wheel
  // "consumes" while the pointer is over it.
  useEffect(() => {
    const el = surfaceRef.current;
    if (!el) return;

    const unit = () => 100 / Math.max(0.001, sensRef.current);

    const onWheel = (e: WheelEvent) => {
      const primary = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      if (primary === 0) return;
      e.preventDefault();
      if (reducedRef.current) {
        spinBy(primary > 0 ? 1 : -1);
        return;
      }
      targetRef.current = null;
      velRef.current += (primary / unit()) * 0.5;
      ensureLoop();
    };

    let startPos = 0;
    let startCoord = 0;
    let lastMove = 0;
    let pointerId: number | null = null;

    const coordOf = (e: PointerEvent) => (axis === 'y' ? e.clientY : e.clientX);

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      pointerId = e.pointerId;
      draggingRef.current = true;
      targetRef.current = null;
      velRef.current = 0;
      startPos = posRef.current;
      startCoord = coordOf(e);
      lastMove = 0;
      el.setPointerCapture?.(e.pointerId);
      ensureLoop();
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!draggingRef.current || e.pointerId !== pointerId) return;
      // Dragging "against" the axis (up / left) spins the wheel forward.
      const travel = startCoord - coordOf(e);
      const next = startPos + travel / unit();
      lastMove = next - posRef.current;
      posRef.current = next;
    };

    const endDrag = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      draggingRef.current = false;
      pointerId = null;
      if (!reducedRef.current) velRef.current = lastMove; // hand off to inertia
      ensureLoop();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const forward = e.key === 'ArrowDown' || e.key === 'ArrowRight' || e.key === 'PageDown';
      const back = e.key === 'ArrowUp' || e.key === 'ArrowLeft' || e.key === 'PageUp';
      if (!forward && !back) return;
      e.preventDefault();
      spinBy(forward ? 1 : -1);
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', endDrag);
    el.addEventListener('pointercancel', endDrag);
    el.addEventListener('keydown', onKeyDown);

    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', endDrag);
      el.removeEventListener('pointercancel', endDrag);
      el.removeEventListener('keydown', onKeyDown);
    };
  }, [axis, ensureLoop, spinBy]);

  // Paint once on mount and whenever the slot count changes so freshly added
  // items get a correct transform before their first frame (no stacked flash).
  useLayoutEffect(() => {
    renderNow();
  }, [length, renderNow]);

  useEffect(() => stop, [stop]);

  return { surfaceRef, spinBy, spinTo, renderNow };
}
