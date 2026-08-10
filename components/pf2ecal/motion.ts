/**
 * One curve, three springs, three durations — the whole motion vocabulary of
 * `/pf2ecal`.
 *
 * It exists because the alternative had already happened: the same easing array
 * was declared verbatim in five files, four different springs were tuned by eye
 * in four more, and the CSS `--pf2e-ease` was a fifth curve that nothing in
 * JavaScript matched. Every one of those was individually reasonable and
 * together they meant a sheet, a card and a toggle on the same screen each
 * decelerated differently — which is precisely what makes an interface feel
 * assembled rather than designed.
 *
 * The values mirror `--pf2e-ease` / `--pf2e-fast` / `--pf2e-base` in
 * `pf2ecal.css`, so a CSS transition and a framer-motion animation on adjacent
 * elements are the same movement. **Change them together.**
 *
 * (This page keeps its own set rather than importing `lib/motion.ts` for the
 * same reason it keeps its own tokens: it is a registered separate design tier,
 * and its timings are tuned to iOS rather than to the site's glass. The rule
 * being followed is "one source per tier", not "one source per repo".)
 */

import type { Transition } from 'framer-motion';

/** The page's easing curve. Matches `--pf2e-ease`. */
export const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

/** Durations in seconds, matching `--pf2e-fast` / `--pf2e-base` in the CSS. */
export const DURATION = {
  /** 130ms — a state change on something already on screen. */
  fast: 0.13,
  /** 220ms — something entering or leaving. */
  base: 0.22,
  /** 300ms — a whole section expanding. */
  slow: 0.3,
} as const;

/** Press feedback: stiff enough that the finger never outruns it. */
export const SPRING_PRESS: Transition = { type: 'spring', stiffness: 500, damping: 30 };

/** A sheet or panel arriving. Slightly softer, with a hint of settle. */
export const SPRING_PANEL: Transition = {
  type: 'spring',
  stiffness: 420,
  damping: 38,
  mass: 0.9,
};

/** A list reordering under its own content — no overshoot, nothing to read past. */
export const SPRING_LIST: Transition = { type: 'spring', stiffness: 380, damping: 38 };

/** The standard enter/leave transition for anything that fades or rises. */
export const TRANSITION: Transition = { duration: DURATION.base, ease: EASE };

/** The quicker one, for something leaving or swapping in place. */
export const TRANSITION_FAST: Transition = { duration: DURATION.fast, ease: EASE };

/** Fade in, rise slightly. The page's default entrance. */
export const FADE_RISE = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 6 },
} as const;
