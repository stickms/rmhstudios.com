'use client';

/**
 * ScrollScene — the pinned scroll-narrative primitive (the design's signature
 * element for pricing / wrapped-style pages). A tall outer wrapper scrolls
 * `screens * 100vh`; an inner stage sticks to the top and pins for that
 * duration while `progress` (a 0..1 MotionValue) scrubs with scroll. Drive
 * transforms/opacity off `progress` via `useTransform`.
 *
 * Consume `progress` two ways:
 *   - render-prop:  <ScrollScene>{(progress) => ...}</ScrollScene>
 *   - context hook: const progress = useScrollScene() inside a child element
 *
 * Under reduced motion the stage is NOT pinned: children render stacked in
 * natural flow with `progress` fixed at 1 (end state), no sticky, no forced
 * viewport height. ScrollScene is forbidden inside infinite-scroll columns.
 *
 * REDUCED-MOTION FALLBACK CONTRACT (intended, load-bearing — read before use):
 *   (a) The reduced-motion fallback renders children statically stacked in
 *       natural flow with `progress` fixed at 1 (the animation's end state) —
 *       no sticky pin, no forced viewport height.
 *   (b) `useReducedMotion` returns false on the server AND on the first client
 *       render, so ScrollScene SSR-renders the pinned tree and only swaps to
 *       the static stacked tree AFTER mount (the hook resolves client-side via
 *       effect). Reduced-motion users therefore see a ONE-TIME layout settle on
 *       first paint as the pinned tree is replaced by the stacked one. Pages
 *       using ScrollScene MUST tolerate this post-mount swap/layout settle.
 *   (c) There is NO React hydration mismatch: the first client render matches
 *       the SSR output exactly (both render the pinned tree). The swap to the
 *       static tree happens post-hydration inside an effect, not during it.
 */
import type { ReactNode } from 'react';
import { createContext, useContext, useRef } from 'react';
import { m as motion, useScroll, useMotionValue } from 'framer-motion';
import type { MotionValue } from 'framer-motion';
import { useReducedMotion } from '@/hooks/useReducedMotion';

const ScrollSceneCtx = createContext<MotionValue<number> | null>(null);

/**
 * Read the enclosing ScrollScene's scroll progress (0..1) from any descendant.
 * Throws if called outside a ScrollScene.
 */
export function useScrollScene(): MotionValue<number> {
  const ctx = useContext(ScrollSceneCtx);
  if (!ctx) {
    throw new Error('useScrollScene must be used within a <ScrollScene>');
  }
  return ctx;
}

export interface ScrollSceneProps {
  /** How many viewport heights the scene scrolls through. */
  screens?: number;
  className?: string;
  /** Render-prop receiving scroll progress (0..1). */
  children: (progress: MotionValue<number>) => ReactNode;
}

export function ScrollScene({ screens = 3, className, children }: ScrollSceneProps) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start start', 'end end'],
  });

  // A static MotionValue used only in the reduced-motion path (end state).
  const staticProgress = useMotionValue(1);

  if (reduced) {
    return (
      <ScrollSceneCtx.Provider value={staticProgress}>
        <div className={className}>{children(staticProgress)}</div>
      </ScrollSceneCtx.Provider>
    );
  }

  return (
    <ScrollSceneCtx.Provider value={scrollYProgress}>
      <div ref={ref} className={className} style={{ height: `${screens * 100}vh` }}>
        <motion.div
          style={{
            position: 'sticky',
            top: 0,
            height: '100svh',
            overflow: 'hidden',
          }}
        >
          {children(scrollYProgress)}
        </motion.div>
      </div>
    </ScrollSceneCtx.Provider>
  );
}
