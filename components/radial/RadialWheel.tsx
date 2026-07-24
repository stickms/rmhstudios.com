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
  /** Degrees of arc between neighbouring slots. Default 26. */
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
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const count = items.length;

  // Visible half-window: cards beyond this arc are parked (opacity 0, inert).
  const halfWindow = useMemo(() => Math.max(2, Math.round(96 / step)), [step]);

  const place = useCallback(
    (el: HTMLDivElement, rel: number) => {
      const phi = rel * step * DEG;
      const c = Math.cos(phi);
      const s = Math.sin(phi);
      const visible = Math.abs(rel) <= halfWindow && c > 0.02;

      if (!visible) {
        el.style.opacity = '0';
        el.style.pointerEvents = 'none';
        el.style.visibility = 'hidden';
        el.setAttribute('aria-hidden', 'true');
        return;
      }

      const radius = 148; // vertical travel radius (px), scaled by CSS on small screens
      const y = s * radius;
      const z = (c - 1) * radius;
      const rotX = -rel * step * 0.62;
      const scale = 0.62 + 0.38 * c;
      const opacity = Math.max(0, c) ** 1.15;
      const focused = Math.abs(rel) < 0.5;

      el.style.visibility = 'visible';
      el.style.transform = `translate3d(-50%, calc(-50% + ${y.toFixed(2)}px), ${z.toFixed(2)}px) rotateX(${rotX.toFixed(2)}deg) scale(${scale.toFixed(3)})`;
      el.style.opacity = opacity.toFixed(3);
      el.style.zIndex = String(200 + Math.round(c * 100));
      el.style.pointerEvents = focused ? 'auto' : 'none';
      el.setAttribute('aria-hidden', focused ? 'false' : 'true');
      el.style.filter = focused ? 'none' : `saturate(0.9) brightness(${(0.9 + 0.1 * c).toFixed(2)})`;
    },
    [step, halfWindow],
  );

  const onRender = useCallback(
    (pos: number) => {
      for (let i = 0; i < itemRefs.current.length; i++) {
        const el = itemRefs.current[i];
        if (el) place(el, i - pos);
      }
    },
    [place],
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
      <div className="radial-wheel__stage">
        {center ? <div className="radial-wheel__hub">{center}</div> : null}
        {items.map((item, i) => (
          <div
            key={item.id}
            role="option"
            aria-selected={false}
            ref={(el) => {
              itemRefs.current[i] = el;
            }}
            className="radial-wheel__slot"
          >
            {item.node}
          </div>
        ))}
      </div>
      {children}
    </div>
  );
}
