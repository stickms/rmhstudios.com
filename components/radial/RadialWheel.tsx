'use client';

import { useCallback, useMemo, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useRadialSpin } from './useRadialSpin';

export interface RadialWheelItem {
  id: string;
  node: ReactNode;
}

interface RadialWheelProps {
  items: RadialWheelItem[];
  /** The persistent hub rendered at the pivot — the "RMH" mark. */
  center?: ReactNode;
  /** Degrees of arc between neighbouring slots. Default 34. */
  step?: number;
  /** Fires when the focused (front) slot settles on a new index. */
  onActiveChange?: (index: number) => void;
  ariaLabel?: string;
  className?: string;
  children?: ReactNode;
}

const DEG = Math.PI / 180;

/**
 * A 3D radial rolodex. Items ride a vertical cylinder pivoting off the central
 * RMH hub: the focused slot faces front and upright, its neighbours roll up and
 * back into depth. Spin it with the wheel, a drag, or the arrow keys — every
 * frame each card's `transform`/`opacity` is written directly to the DOM by the
 * spin engine, so motion tracks the display refresh rate with zero React churn.
 */
export function RadialWheel({
  items,
  center,
  step = 26,
  onActiveChange,
  ariaLabel,
  className,
  children,
}: RadialWheelProps) {
  const reduced = useReducedMotion();
  const stageRef = useRef<HTMLDivElement | null>(null);
  const slotsRef = useRef<HTMLDivElement[]>([]);
  const count = items.length;

  // Visible half-window: cards beyond this arc are parked (opacity 0, inert).
  const halfWindow = useMemo(() => Math.max(2, Math.round(96 / step)), [step]);

  const place = useCallback(
    (el: HTMLDivElement, rel: number) => {
      const phi = rel * step * DEG;
      const c = Math.cos(phi);
      const s = Math.sin(phi);
      // Hide cards more than ~78° around the arc so only ~5 ever paint; keeps the
      // stack clean and cheap.
      const visible = Math.abs(rel) <= halfWindow && c > 0.2;

      if (!visible) {
        el.style.opacity = '0';
        el.style.pointerEvents = 'none';
        el.style.visibility = 'hidden';
        el.setAttribute('aria-hidden', 'true');
        return;
      }

      // Separate vertical-travel and depth radii. The travel radius is large
      // relative to a card so neighbours clear the focused card instead of piling
      // on top of it; the depth radius pushes them firmly behind it (paint order
      // in a preserve-3d context is decided by translateZ, not z-index).
      const travel = 232;
      const depth = 340;
      const y = s * travel;
      const z = (c - 1) * depth;
      const rotX = -rel * step * 0.5;
      const scale = 0.5 + 0.5 * c;
      const focused = Math.abs(rel) < 0.5;
      // Focused card is fully opaque and occludes its neighbours; the rest fade
      // off quickly so the stack never looks muddy.
      const opacity = focused ? 1 : Math.max(0, c) ** 1.7;

      el.style.visibility = 'visible';
      el.style.transform = `translate3d(-50%, calc(-50% + ${y.toFixed(2)}px), ${z.toFixed(2)}px) rotateX(${rotX.toFixed(2)}deg) scale(${scale.toFixed(3)})`;
      el.style.opacity = opacity.toFixed(3);
      el.style.zIndex = String(200 + Math.round(c * 100));
      el.style.pointerEvents = focused ? 'auto' : 'none';
      el.setAttribute('aria-hidden', focused ? 'false' : 'true');
    },
    [step, halfWindow],
  );

  // Resolve slot nodes from the stage in DOM order rather than per-item refs, so
  // pagination appends and live-SSE re-renders never churn a ref (which would
  // drop a frame's transform). The cache refreshes only when the count changes.
  const onRender = useCallback(
    (pos: number) => {
      const stage = stageRef.current;
      if (!stage) return;
      let slots = slotsRef.current;
      if (slots.length !== count) {
        slots = Array.from(stage.querySelectorAll<HTMLDivElement>('.radial-wheel__slot'));
        slotsRef.current = slots;
      }
      for (let i = 0; i < slots.length; i++) place(slots[i], i - pos);
    },
    [count, place],
  );

  const { surfaceRef } = useRadialSpin({
    length: count,
    onRender,
    reduced,
    snap: true,
    sensitivity: 1,
    onActiveChange,
    axis: 'y',
  });

  return (
    <div
      ref={surfaceRef}
      className={cn('radial-wheel', className)}
      role="listbox"
      aria-label={ariaLabel}
      tabIndex={0}
    >
      <div className="radial-wheel__stage" ref={stageRef}>
        {center ? <div className="radial-wheel__hub">{center}</div> : null}
        {items.map((item) => (
          <div key={item.id} role="option" aria-selected={false} className="radial-wheel__slot">
            {item.node}
          </div>
        ))}
      </div>
      {children}
    </div>
  );
}
