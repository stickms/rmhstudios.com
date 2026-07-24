'use client';

import { useCallback, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useRadialSpin } from './useRadialSpin';

// Prism radius (px). Facet spacing on the surface is ~R·stepRadians; at R=320,
// step=36° that is ~200px, so cards sit edge-to-edge. MUST match the compensating
// `translateZ(-320px)` on `.radial-wheel__drum` in radial.css (front facet → z0).
const PRISM_RADIUS = 320;

export interface RadialWheelItem {
  id: string;
  node: ReactNode;
}

interface RadialWheelProps {
  items: RadialWheelItem[];
  /** The persistent hub rendered at the pivot — the "RMH" mark. */
  center?: ReactNode;
  /** Degrees of arc between neighbouring facets on the cylinder. Default 36. */
  step?: number;
  /** Fires when the focused (front) slot settles on a new index. */
  onActiveChange?: (index: number) => void;
  ariaLabel?: string;
  className?: string;
  children?: ReactNode;
}

const DEG = Math.PI / 180;

/**
 * A 3D prism carousel. Each RMHark sits on a facet of a vertical prism pivoting
 * off the central RMH hub — rotated to its own angle (`rotateX · translateZ`),
 * not billboarded — so neighbours meet edge-to-edge instead of overlapping and
 * occlusion stays continuous (no z-index, no pop as depths cross). Cards enter
 * and leave the visible arc past the 90° fold, where they are already invisible
 * (backface-hidden + faded), so there is no pop-in. Spin it with the wheel, a
 * drag, or the arrow keys — every frame the spin engine writes each facet's
 * `transform`/`opacity` straight to the DOM, so motion tracks the display
 * refresh rate with zero React churn.
 */
export function RadialWheel({
  items,
  center,
  step = 36,
  onActiveChange,
  ariaLabel,
  className,
  children,
}: RadialWheelProps) {
  const reduced = useReducedMotion();
  const stageRef = useRef<HTMLDivElement | null>(null);
  const slotsRef = useRef<HTMLDivElement[]>([]);
  const count = items.length;

  const place = useCallback(
    (el: HTMLDivElement, rel: number) => {
      // Each facet's angle around the prism. The drum's own rotation is baked in
      // by feeding `rel = index - position`, so the focused facet sits at 0°.
      const deg = rel * step;

      // Past the 90° fold the facet has turned away — hide it there (it is already
      // invisible via backface + fade), which is what removes the pop-in when
      // cards enter/leave the window.
      if (Math.abs(deg) >= 95) {
        el.style.visibility = 'hidden';
        el.style.pointerEvents = 'none';
        el.style.willChange = 'auto'; // off-window: drop the compositor layer
        el.setAttribute('aria-hidden', 'true');
        return;
      }

      const c = Math.cos(deg * DEG);
      const focused = Math.abs(deg) < step * 0.5;
      // The rotation itself carries the depth (foreshortening); a gentle cos-fade
      // keeps the read continuous as a facet approaches the fold. No z-index — the
      // preserve-3d cylinder sorts occlusion by real depth, continuously.
      const opacity = Math.max(0, c) ** 0.6;

      el.style.visibility = 'visible';
      el.style.willChange = 'transform, opacity'; // only the ~5 on-screen facets

      el.style.transform = `translate(-50%, -50%) rotateX(${(-deg).toFixed(2)}deg) translateZ(${PRISM_RADIUS}px)`;
      el.style.opacity = opacity.toFixed(3);
      el.style.pointerEvents = focused ? 'auto' : 'none';
      el.setAttribute('aria-hidden', focused ? 'false' : 'true');
    },
    [step],
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
    haptics: true,
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
        <div className="radial-wheel__drum">
          {items.map((item) => (
            <div key={item.id} role="option" aria-selected={false} className="radial-wheel__slot">
              {item.node}
            </div>
          ))}
        </div>
      </div>
      {children}
    </div>
  );
}
