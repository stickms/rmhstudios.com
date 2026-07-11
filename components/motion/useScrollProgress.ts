'use client';

/**
 * useScrollProgress — thin wrapper over framer-motion's `useScroll` for
 * parallax / progress bars OUTSIDE a ScrollScene. Attach `ref` to the element
 * whose scroll you want to track; `progress` is a 0..1 MotionValue from when
 * its start hits the viewport start to when its end hits the viewport end.
 *
 * Feed pages: don't use this inside feed cards (no scroll-linked values in
 * feeds — see Reveal.tsx performance rules).
 */
import { useRef } from 'react';
import { useScroll } from 'framer-motion';
import type { MotionValue } from 'framer-motion';

export interface ScrollProgress {
  ref: React.RefObject<HTMLDivElement | null>;
  progress: MotionValue<number>;
}

export function useScrollProgress(): ScrollProgress {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start'],
  });
  return { ref, progress: scrollYProgress };
}
