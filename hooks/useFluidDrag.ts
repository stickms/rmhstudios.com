'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  VelocityTracker,
  rubberBandClamp,
  shouldDismiss,
  type Spring,
  type SpringState,
} from '@/lib/fluid';
import { prefersReducedMotion } from '@/hooks/useReducedMotion';
import { onJellyPointer } from '@/lib/jelly/pointer';
import { reportJellyDrag } from '@/lib/jelly/physics';
import { createSettle, type Settle } from '@/hooks/fluid-drag-settle';

/**
 * A single-axis drag that behaves the way a native one does — principles 2–5 of
 * *Designing Fluid Interfaces*: it tracks the finger 1:1, resists at its limits
 * instead of stopping dead, hands the gesture's momentum to the spring that
 * settles it, and decides what the gesture MEANT from where it was heading
 * rather than from where it stopped.
 *
 * Position is reported through `onUpdate` as a plain number (px along the axis)
 * so the caller decides what it means — a sheet translating, a drawer opening, a
 * card being swiped away. The hook never touches the DOM's layout.
 *
 * Jelly (docs/plans/plasmatic-jelly/02-soft-body.md §3.3): pass `jellyTarget` and
 * the hook reports the surface's velocity to the soft-body service
 * (`reportJellyDrag` in `lib/jelly/physics.ts`) on every move and at release, so
 * the surface stretches along the motion and wobbles out of it, and `drag:start` /
 * `drag:end` reach the jelly bus. The hook still owns the drag position; jelly only
 * adds the deformation (scale or the slab's rim — never `translate`).
 *
 * ```tsx
 * const drag = useFluidDrag({
 *   dimension: () => sheet.current?.offsetHeight ?? 0,
 *   onUpdate: (y) => { sheet.current.style.translate = `0 ${y}px`; },
 *   onDismiss: () => setOpen(false),
 * });
 * <div {...drag.handleProps} />
 * ```
 */

export interface FluidDragOptions {
  /**
   * The dragged surface's size along the axis, read lazily — it is the scale
   * rubber-band resistance and the dismissal threshold are both derived from, and
   * on a responsive sheet it is not known until it has been laid out.
   */
  dimension: () => number;
  /** Called on every frame the position changes, including during the settle. */
  onUpdate: (position: number) => void;
  /** The gesture resolved as "get rid of this". Fired once, at release. */
  onDismiss?: () => void;
  /** The gesture resolved as "put it back". Fired once the spring has settled. */
  onSettle?: () => void;
  /** 'y' (default) drags down-positive; 'x' drags right-positive. */
  axis?: 'x' | 'y';
  /** Travel bounds. Outside them the drag is rubber-banded, never clipped. */
  min?: number;
  max?: number;
  /**
   * Fraction of `dimension` the gesture must be *projected* to travel to count as
   * a dismissal. 0.5 is the platform convention for a sheet.
   */
  dismissAt?: number;
  spring?: Spring;
  /** Ignore the gesture entirely (e.g. a desktop-only dialog). */
  disabled?: boolean;
  /** The surface jelly should stretch while it is dragged (usually the element `onUpdate` moves). */
  jellyTarget?: () => HTMLElement | null;
}

export interface FluidDragHandle {
  /** Spread onto the element that should receive the gesture. */
  handleProps: {
    onPointerDown: (e: React.PointerEvent) => void;
    style: {
      touchAction: string;
      userSelect: 'none';
      WebkitUserSelect: 'none';
      WebkitTouchCallout: 'none';
    };
  };
  /** Imperatively spring back to rest — e.g. after a cancelled dismissal. */
  reset: () => void;
}

export function useFluidDrag(options: FluidDragOptions): FluidDragHandle {
  const opts = useRef(options);
  opts.current = options;

  const state = useRef<SpringState>({ value: 0, velocity: 0 });
  const target = useRef(0);
  const pointerId = useRef<number | null>(null);
  const origin = useRef(0);
  const startValue = useRef(0);
  const tracker = useRef(new VelocityTracker());
  const settler = useRef<Settle | null>(null);
  const dismissing = useRef(false);

  const stop = useCallback(() => {
    settler.current?.cancel();
  }, []);

  const settle = useCallback(() => {
    settler.current ??= createSettle();
    settler.current.start(
      state.current.value,
      state.current.velocity,
      target.current,
      (value, velocity) => {
        state.current = { value, velocity };
        opts.current.onUpdate(value);
      },
      () => {
        if (!dismissing.current) opts.current.onSettle?.();
      },
      opts.current.spring,
    );
  }, []);

  const reset = useCallback(() => {
    dismissing.current = false;
    target.current = 0;
    settle();
  }, [settle]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      const o = opts.current;
      if (o.disabled || e.button > 0 || pointerId.current !== null) return;
      // Interrupting a settle is the point: take over from wherever it is, with
      // whatever velocity it has, rather than letting it finish first.
      stop();
      pointerId.current = e.pointerId;
      const axis = o.axis ?? 'y';
      origin.current = axis === 'y' ? e.clientY : e.clientX;
      startValue.current = state.current.value;
      dismissing.current = false;
      tracker.current.reset();
      tracker.current.add(state.current.value, e.timeStamp);
    },
    [stop],
  );

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (pointerId.current !== e.pointerId) return;
      const o = opts.current;
      const axis = o.axis ?? 'y';
      const raw = startValue.current + ((axis === 'y' ? e.clientY : e.clientX) - origin.current);
      const dimension = Math.max(1, o.dimension());
      // 1:1 with the finger inside the bounds; asymptotic resistance outside, so
      // the surface stays alive under the finger at its limit instead of freezing.
      const next = rubberBandClamp(
        raw,
        o.min ?? Number.NEGATIVE_INFINITY,
        o.max ?? Number.POSITIVE_INFINITY,
        dimension,
      );
      state.current = { value: next, velocity: 0 };
      tracker.current.add(next, e.timeStamp);
      o.onUpdate(next);
      const jelly = o.jellyTarget?.();
      if (jelly) {
        const v = tracker.current.get();
        reportJellyDrag(jelly, axis === 'x' ? v : 0, axis === 'y' ? v : 0, 'move');
      }
    };

    const finish = (e: PointerEvent, commit: boolean) => {
      if (pointerId.current !== e.pointerId) return;
      pointerId.current = null;
      const o = opts.current;
      const velocity = tracker.current.get();
      // Hand the gesture's velocity to the spring — this is the seam where most
      // web sheets give themselves away, by starting their exit animation from
      // rest no matter how hard they were thrown.
      state.current = { value: state.current.value, velocity };
      const jelly = o.jellyTarget?.();
      if (jelly) {
        const axis = o.axis ?? 'y';
        reportJellyDrag(jelly, axis === 'x' ? velocity : 0, axis === 'y' ? velocity : 0, 'end');
      }

      const dimension = Math.max(1, o.dimension());
      const threshold = dimension * (o.dismissAt ?? 0.5);
      const dismiss =
        commit &&
        !!o.onDismiss &&
        shouldDismiss({ position: state.current.value, velocity, threshold });

      if (dismiss) {
        dismissing.current = true;
        // Continue the throw rather than cutting to a fade: the surface leaves
        // in the direction and at the speed it was sent.
        target.current = dimension * 1.15;
        settle();
        o.onDismiss?.();
      } else {
        target.current = 0;
        settle();
      }
    };

    const onUp = (e: PointerEvent) => finish(e, true);
    const onCancel = (e: PointerEvent) => finish(e, false);

    const offs = [
      onJellyPointer('pointermove', onMove),
      onJellyPointer('pointerup', onUp),
      onJellyPointer('pointercancel', onCancel),
    ];
    return () => {
      for (const off of offs) off();
    };
  }, [settle]);

  // Unmount: stop the settle's frame driver (the pointer subscriptions are released above).
  useEffect(
    () => () => {
      settler.current?.dispose();
      settler.current = null;
    },
    [],
  );

  return {
    handleProps: {
      onPointerDown,
      // The handle owns its axis; the browser must not also try to scroll with
      // it. Reduced motion keeps the gesture (it is direct manipulation, not
      // decoration) but the spring settle collapses to a snap via the tokens.
      //
      // The other three say the same thing about the OTHER default the browser
      // would apply to a slow press on this element. A drag that starts gently
      // — a sheet eased down rather than flicked — spends its first moments
      // stationary under the finger, which is precisely the gesture iOS reads
      // as "select this" and desktop reads as "drag this text". Both leave a
      // highlight stuck across the handle for the rest of the gesture. Set
      // inline rather than in CSS because the handle is whatever element the
      // caller spreads these onto, and there is no class to hang them off.
      style: {
        touchAction: (options.axis ?? 'y') === 'y' ? 'pan-x' : 'pan-y',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        WebkitTouchCallout: 'none',
      },
    },
    reset,
  };
}

/**
 * Whether a drag-to-dismiss handle should exist at all here. Touch only by
 * default — on a mouse the affordance is a close button, and a draggable sheet a
 * pointer cannot comfortably throw is decoration rather than a gesture.
 *
 * SSR-safe: false until after mount, so the server render and the first client
 * render agree and the handle appears rather than hydration-mismatching.
 *
 * @param query media query the surface must match, e.g. narrow-and-touch.
 */
export function useFluidDragEnabled(query = '(pointer: coarse)'): boolean {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia(query);
    const sync = () => setEnabled(mq.matches && !prefersReducedMotion());
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, [query]);
  return enabled;
}
