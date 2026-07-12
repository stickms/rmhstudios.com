/**
 * Shared motion system — the single source of truth for animation timing and
 * reusable framer-motion variants across the site.
 *
 * Before this module, motion props were written inline in every component
 * (`{ duration: 0.15, ease: "easeOut" }`, `{ duration: 0.3 }`, springs with
 * ad-hoc stiffness, …), which drifted over hundreds of files. Reach for these
 * tokens/variants so enters, exits, dialogs, and lists all feel like one
 * system: **smooth and quick**.
 *
 * Reduced motion is handled globally — `<MotionConfig reducedMotion="user">`
 * wraps the app in `components/Providers.tsx`, so framer-motion automatically
 * neutralises transforms/opacity for users who ask for it. You do not need to
 * branch on `useReducedMotion()` when consuming these variants.
 *
 * Usage:
 * ```tsx
 * import { motion } from "framer-motion";
 * import { fadeRise, transition } from "@/lib/motion";
 *
 * <motion.div variants={fadeRise} initial="initial" animate="animate" exit="exit" />
 * // or inline:
 * <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={transition} />
 * ```
 */
import type { Transition, Variants } from 'framer-motion';

type Bezier = [number, number, number, number];

/**
 * Canonical durations in **seconds**. The site favours quick, responsive
 * motion — nothing here is slower than 0.3s. Prefer these over hand-typed
 * numbers so a global re-tune is a one-line change.
 */
export const DURATION = {
  /** Micro-feedback: hovers, taps, tiny state flips. */
  fast: 0.12,
  /** The default for most enters/exits. */
  base: 0.18,
  /** Larger surfaces (dialogs, sheets) that need a touch more travel. */
  slow: 0.28,
} as const;

/**
 * Easing curves. `standard` is a smooth deceleration (easeOut-family) used for
 * nearly all enters; `emphasized` adds a hair more snap for elements that
 * should feel deliberate; `inOut` is for symmetric moves (a value counting,
 * a bar filling).
 */
export const EASE = {
  standard: [0.22, 1, 0.36, 1] as Bezier,
  emphasized: [0.16, 1, 0.3, 1] as Bezier,
  inOut: [0.65, 0, 0.35, 1] as Bezier,
} as const;

/**
 * Spring presets for physical, interruptible motion (drag, reorder, pop-in).
 * `soft` settles gently; `snappy` is tighter for controls that must feel
 * immediate.
 */
export const SPRING = {
  soft: { type: 'spring', stiffness: 300, damping: 30, mass: 0.8 },
  snappy: { type: 'spring', stiffness: 500, damping: 32, mass: 0.7 },
} as const satisfies Record<string, Transition>;

/** The default tweened transition — smooth, quick, used by the variants below. */
export const transition: Transition = { duration: DURATION.base, ease: EASE.standard };

/** Slightly faster transition for exits so dismissals feel immediate. */
export const exitTransition: Transition = { duration: DURATION.fast, ease: EASE.standard };

/** Simple opacity cross-fade. Good for tab panels, tooltips, overlays. */
export const fade: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition },
  exit: { opacity: 0, transition: exitTransition },
};

/** Fade + a small upward rise. The workhorse enter for cards, rows, sections. */
export const fadeRise: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition },
  exit: { opacity: 0, y: 8, transition: exitTransition },
};

/** Fade + a small downward drop — for things anchored above (banners, toasts). */
export const fadeDown: Variants = {
  initial: { opacity: 0, y: -8 },
  animate: { opacity: 1, y: 0, transition },
  exit: { opacity: 0, y: -8, transition: exitTransition },
};

/** Fade + subtle scale. For popovers, menus, and modal content. */
export const scaleIn: Variants = {
  initial: { opacity: 0, scale: 0.96 },
  animate: { opacity: 1, scale: 1, transition },
  exit: { opacity: 0, scale: 0.96, transition: exitTransition },
};

/** Springy pop for playful, physical elements (badges, reaction bursts). */
export const popIn: Variants = {
  initial: { opacity: 0, scale: 0.85 },
  animate: { opacity: 1, scale: 1, transition: SPRING.snappy },
  exit: { opacity: 0, scale: 0.85, transition: exitTransition },
};

/** Dialog/backdrop overlay — a plain, quick fade behind modal content. */
export const overlay: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: DURATION.fast, ease: EASE.standard } },
  exit: { opacity: 0, transition: exitTransition },
};

/** Modal content: rise + scale for a grounded, quick entrance. */
export const modalContent: Variants = {
  initial: { opacity: 0, scale: 0.97, y: 8 },
  animate: { opacity: 1, scale: 1, y: 0, transition: { duration: DURATION.slow, ease: EASE.emphasized } },
  exit: { opacity: 0, scale: 0.97, y: 8, transition: exitTransition },
};

/**
 * Stagger container — orchestrates children that use {@link staggerItem}.
 * Keep the stagger short (≤ 60ms) so a list of 10 still resolves quickly.
 *
 * ```tsx
 * <motion.ul variants={staggerContainer()} initial="initial" animate="animate">
 *   {rows.map((r) => <motion.li key={r.id} variants={staggerItem} />)}
 * </motion.ul>
 * ```
 */
export const staggerContainer = (stagger = 0.04, delayChildren = 0): Variants => ({
  initial: {},
  animate: { transition: { staggerChildren: stagger, delayChildren } },
  exit: {},
});

/** Item paired with {@link staggerContainer}. Same feel as {@link fadeRise}. */
export const staggerItem: Variants = fadeRise;
