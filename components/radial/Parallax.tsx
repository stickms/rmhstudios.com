'use client';

import { useRef, type ReactNode } from 'react';
// `m as motion`, not `motion`: `Providers` wraps the app in `LazyMotion`, and `m`
// is the component that honours it — `motion` bundles its own full feature
// implementation, which lands in the SHARED ENTRY CHUNK when the module is
// reachable from a route's top level.
import { m as motion, useScroll, useTransform } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useReducedMotion } from '@/hooks/useReducedMotion';

interface ParallaxProps {
  children: ReactNode;
  /** Fraction of scroll travel applied as counter-translation. −1…1. */
  speed?: number;
  className?: string;
  /** Optional opacity fade as the element leaves the viewport. */
  fade?: boolean;
}

/**
 * Scroll-linked parallax layer. Drives a GPU `transform`/`opacity` off a
 * framer-motion scroll MotionValue — no per-frame React renders — and collapses
 * to a static layer under `prefers-reduced-motion`.
 */
export function Parallax({ children, speed = 0.2, className, fade = false }: ParallaxProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start'],
  });

  const distance = 220 * speed;
  const y = useTransform(scrollYProgress, [0, 1], reduced ? [0, 0] : [distance, -distance]);
  const opacity = useTransform(
    scrollYProgress,
    [0, 0.15, 0.85, 1],
    fade && !reduced ? [0.2, 1, 1, 0.2] : [1, 1, 1, 1],
  );

  return (
    <motion.div
      ref={ref}
      className={cn('radial-parallax', className)}
      style={{ y, opacity, willChange: 'transform' }}
    >
      {children}
    </motion.div>
  );
}
