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
 * viewport height. The DOM structure stays identical while that preference is
 * resolving, so loaded media and child entrances are not restarted.
 *
 * REDUCED-MOTION FALLBACK CONTRACT (intended, load-bearing — read before use):
 *   (a) The reduced-motion fallback renders children statically stacked in
 *       natural flow with `progress` fixed at 1 (the animation's end state) —
 *       no sticky pin, no forced viewport height.
 *   (b) `useReducedMotion` returns false on the server and first client render.
 *       When it resolves, only the existing wrappers' styles and MotionValue
 *       change; descendants keep their React identity.
 *   (c) There is no hydration mismatch: the first client render matches SSR.
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

  const progress = reduced ? staticProgress : scrollYProgress;

  return (
    <ScrollSceneCtx.Provider value={progress}>
      <div
        ref={ref}
        className={className}
        style={reduced ? undefined : { height: `${screens * 100}vh` }}
      >
        <motion.div
          style={
            reduced
              ? undefined
              : {
                  position: 'sticky',
                  top: 0,
                  height: '100svh',
                  overflow: 'hidden',
                }
          }
        >
          {children(progress)}
        </motion.div>
      </div>
    </ScrollSceneCtx.Provider>
  );
}
