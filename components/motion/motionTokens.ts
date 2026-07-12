/**
 * Motion design tokens — the shared vocabulary for the Apple-style UI overhaul.
 *
 * Every value here is transform/opacity only. Durations are in seconds
 * (framer-motion's unit). These freeze once Phase 2 lands; the seven
 * restyling tracks build against them, so keep additions minimal.
 */
import type { Variants } from 'framer-motion';

/** Ease-out-expo: fast start, long soft settle — the signature Apple curve. */
export const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const;

/** Durations (seconds). */
export const DUR_FAST = 0.5;
export const DUR_BASE = 0.7;
export const DUR_SLOW = 0.9;

/** Stagger gaps between children (seconds). */
export const STAGGER = 0.08;
export const STAGGER_SLOW = 0.12;

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
