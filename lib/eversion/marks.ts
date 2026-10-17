/**
 * The `performance.mark` names of the effect and the shape of their `detail`
 * (spec §11.2 preamble, §11.3 test 46).
 *
 * ## Why they are constants
 *
 * The e2e suites do not look at the screen to know what the effect is doing —
 * they read marks. `eversion-session.mjs` (T14) collects them, T34 asserts their
 * order, T35 excludes the crossfade windows by their mark times rather than
 * hard-coding milliseconds, T36 derives navigation delay from `start`. The
 * controller (T31) emits them. If the two sides each spelled `'eversion:gate-open'`
 * by hand, a typo on either would make a test pass vacuously (a mark never
 * found is "no marks in the window"). One definition, imported by both.
 *
 * Marks are emitted on the MAIN thread by the controller, from the `stage`
 * messages the render side posts (spec §3.3), so their timestamps are on the
 * page's own `performance` timeline.
 */

import type {
  FallbackReason,
  FrameStats,
  NavTransition,
  ProjectionId,
  Tier,
  HostMode,
} from './types';

/** The mark names, keyed by the short name the spec uses (`:start`, `:cover`, …). */
export const EVERSION_MARKS = {
  /** The run begins: the timeline starts and `navigate()` is called. */
  start: 'eversion:start',
  /** The first frame is presented and the canvas is opaque (`cover`). */
  cover: 'eversion:cover',
  /** EVERSION begins. */
  evert: 'eversion:evert',
  /** UNWRAP is permitted: AFTER ready, stretch cap, or `after-failed`. */
  gateOpen: 'eversion:gate-open',
  /** UNWRAP begins. */
  unwrap: 'eversion:unwrap',
  /** The controller sent `reveal`. */
  reveal: 'eversion:reveal',
  /** The overlay is unmounted and the run is over. */
  done: 'eversion:done',
  /** The effect did not run; today's path took over. `detail.reason` says why. */
  fallback: 'eversion:fallback',
} as const;
export type EversionMarkName = (typeof EVERSION_MARKS)[keyof typeof EVERSION_MARKS];

/**
 * Names of the `performance.measure`s for the capture budgets (spec §11.3 test
 * 46). Each measures the main-thread time of one capture, from just before the
 * library is called to the bitmap in hand.
 */
export const EVERSION_MEASURES = {
  captureBefore: 'eversion:capture-before',
  captureAfter: 'eversion:capture-after',
} as const;

/** How the visitor confirmed — recorded so the e2e entry-point tests (S#25) can assert it. */
export type EntryPoint = 'release' | 'click' | 'enter' | 'preview';

/** Why the gate opened (the `gate-open` mark's detail). */
export type GateOpenReason = 'after-ready' | 'stretch-cap' | 'after-failed' | 'abort';

/** The `detail` of each mark, keyed like {@link EVERSION_MARKS}. */
export interface EversionMarkDetails {
  start: {
    /** What the visitor's setting asked for. */
    requested: NavTransition;
    /** What was drawn — the projection actually used (spec §11.2 test 37 reads this). */
    projection: ProjectionId;
    tier: Tier;
    host: HostMode;
    href: string;
    entry?: EntryPoint;
  };
  cover: { firstFrameMs: number };
  evert: Record<string, never>;
  gateOpen: { reason: GateOpenReason };
  unwrap: Record<string, never>;
  reveal: Record<string, never>;
  done: FrameStats & { end: 'done' | 'context-lost' | 'abort' };
  fallback: { reason: FallbackReason };
}
