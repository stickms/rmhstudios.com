'use client';

/**
 * Feed / motion performance rules (read before adding animation to any list):
 *
 * - Animate transform/opacity ONLY. Never animate height/width/top/left — that
 *   thrashes layout on every frame.
 * - In feeds, `viewport.once: true` always; never put scroll-linked (useScroll)
 *   values inside feed cards.
 * - Do NOT wrap every FeedItem in Reveal. `.feed-card-cv` (content-visibility)
 *   plus the `feed-item-enter` CSS animation already handle feed entrance.
 *   Reveal is for section-level content and at most the first screen of a
 *   static list.
 * - ScrollScene is forbidden inside infinite-scroll columns.
 * - No new scroll listeners — rely on framer's IntersectionObserver / rAF
 *   batching only.
 * - Don't double-animate elements already animated by the `.page-root > *`
 *   page-enter CSS. Apply Reveal one level deeper than route roots.
 * - For reduced-motion users, `useReducedMotion` returns false on the server and
 *   first client render, so Reveal/RevealGroup briefly mount a motion node on
 *   first paint before settling (post-mount, via effect) to plain elements —
 *   benign, and it introduces no hydration mismatch.
 */
import type { ElementType, ReactNode } from 'react';
import { m as motion } from 'framer-motion';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { DUR_BASE, EASE_OUT_EXPO } from './motionTokens';

export interface RevealProps {
  /** Element/tag to render (defaults to a div). */
  as?: ElementType;
  /** Animation delay in seconds. */
  delay?: number;
  /** Starting vertical offset in px (rises to 0). */
  y?: number;
  /** Animation duration in seconds. */
  duration?: number;
  className?: string;
  children?: ReactNode;
}

/**
 * Scroll-triggered reveal wrapper. Fades + rises its children into view once,
 * when they scroll near the viewport. The motion element stays mounted when a
 * reduced-motion preference resolves after hydration, so its children never
 * restart merely because accessibility state finished loading.
 */
export function Reveal({
  as = 'div',
  delay = 0,
  y = 16,
  duration = DUR_BASE,
  className,
  children,
}: RevealProps) {
  const reduced = useReducedMotion();
  const MotionTag = motion[as as keyof typeof motion] as typeof motion.div;

  return (
    <MotionTag
      className={className}
      initial={reduced ? false : { opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-10% 0px' }}
      transition={reduced ? { duration: 0 } : { duration, delay, ease: EASE_OUT_EXPO }}
    >
      {children}
    </MotionTag>
  );
}
