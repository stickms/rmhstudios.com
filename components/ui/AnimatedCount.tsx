'use client';

import { useEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from '@/hooks/useReducedMotion';

interface AnimatedCountProps {
 /** The target number. `undefined` is treated as 0. */
 value: number | undefined;
 /** Format the (rounded) number for display. Defaults to `String`. */
 format?: (n: number) => string;
 /**
 * Render nothing when the value rounds to 0. Preserves the "hide the count at
 * zero" behavior of the feed/comment engagement bars.
 */
 hideZero?: boolean;
 className?: string;
 /** Tween duration in ms (default 280). */
 durationMs?: number;
}

/**
 * A count that rolls smoothly from its old value to its new one instead of
 * snapping — so an optimistic like/follow reads as "it happened" rather than a
 * jarring flip. Interruptible (a second change mid-roll continues from wherever
 * the number currently is) and snaps instantly under `prefers-reduced-motion`.
 *
 * Counts formatted with K/M collapse (via `format`) only visibly roll while
 * they're small; that's exactly where the motion matters (4 → 5 likes).
 */
export function AnimatedCount({
 value,
 format = String,
 hideZero = false,
 className,
 durationMs = 280,
}: AnimatedCountProps) {
 const target = value ?? 0;
 const [display, setDisplay] = useState(target);
 // The last painted (possibly fractional) value, so an interrupted tween
 // resumes from where the eye currently is rather than jumping.
 const displayRef = useRef(target);

 useEffect(() => {
 if (prefersReducedMotion()) {
 displayRef.current = target;
 setDisplay(target);
 return;
 }
 const from = displayRef.current;
 if (from === target) return;

 let raf = 0;
 let startTs: number | null = null;
 const step = (ts: number) => {
 if (startTs === null) startTs = ts;
 const t = Math.min(1, (ts - startTs) / durationMs);
 const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
 const current = from + (target - from) * eased;
 displayRef.current = current;
 setDisplay(current);
 if (t < 1) {
 raf = requestAnimationFrame(step);
 } else {
 displayRef.current = target;
 setDisplay(target);
 }
 };
 raf = requestAnimationFrame(step);
 return () => cancelAnimationFrame(raf);
 }, [target, durationMs]);

 const rounded = Math.round(display);
 if (hideZero && rounded === 0) return null;
 return <span className={className}>{format(rounded)}</span>;
}
