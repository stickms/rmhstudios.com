/**
 * Compatibility aliases for the component-level motion primitives. The actual
 * timing source of truth is `lib/motion.ts`; keeping these aliases means older
 * Reveal consumers get the same quick cadence as newer surfaces.
 */
import type { Variants } from 'framer-motion';
import { DURATION, EASE } from '@/lib/motion';

/** Ease-out-expo: fast start, long soft settle — the signature Apple curve. */
export const EASE_OUT_EXPO = EASE.emphasized;

/** Durations (seconds). */
export const DUR_FAST = DURATION.fast;
export const DUR_BASE = DURATION.base;
export const DUR_SLOW = DURATION.slow;

/** Stagger gaps between children (seconds). */
export const STAGGER = 0.04;
export const STAGGER_SLOW = 0.06;

/** Fade + rise: opacity 0→1, y 16→0. The default section-reveal motion. */
export const fadeRise: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: DUR_BASE, ease: EASE_OUT_EXPO },
  },
};

/** Plain fade: opacity 0→1, no movement. */
export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: DUR_BASE, ease: EASE_OUT_EXPO },
  },
};

/** Scale in: opacity 0→1 with a subtle scale 0.96→1. */
export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: DUR_BASE, ease: EASE_OUT_EXPO },
  },
};
