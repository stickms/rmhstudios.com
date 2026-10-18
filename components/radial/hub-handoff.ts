/**
 * The hub's hand-off to the Globe Eversion, as a state machine with no React in
 * it (review R6 m1, m11).
 *
 * `RadialHub` owns the DOM and the phase; this owns the one question that kept
 * going wrong in review: WHO navigates, and WHEN may the hub react to input. It
 * is a plain module so a unit test can drive it with a fake controller instead of
 * waiting for the slow browser suites. It imports TYPES only (erased), so it adds
 * nothing to the shell's static closure beyond a few hundred bytes of logic.
 *
 * ## The rules
 *
 * - Exactly one hand-off at a time. While one is in flight (`busy`), another
 *   confirm is ignored - checked BEFORE eligibility, so an eligibility flip in
 *   the middle of a run can never turn the second confirm into a second
 *   navigation (m1).
 * - No controller, or an ineligible one, is today's navigation, untouched.
 * - The hub flips to its `everting` look only at the controller's commit
 *   (`onCommit`); every earlier failure leaves it exactly as it was and ends in
 *   today's navigation, so a fallback has nothing to undo and cannot flash.
 * - The run's outcome decides the rest: effect ran and ended (`done`, `abort`,
 *   `context-lost`) -> close, and the orb fades in the ordinary closed-state way
 *   (the effect ends with UNWRAP, so nothing lands on the orb); `traversal`
 *   -> the visitor pressed Back/Forward while priming, just close; any other
 *   fallback, or a rejected promise (never by contract), -> today's navigation.
 * - `busy` is what the hub's close / toggle / Escape consult: the hub is
 *   committed to leaving by the effect's own route and those must not abort it.
 */

import type { EntryPoint } from '@/lib/eversion/marks';
import type { EversionOutcome, GlobeStartState } from '@/lib/eversion/types';

/** The slice of the controller the hand-off needs. */
export interface HandOffController<N> {
  isEligible(): boolean;
  start(
    node: N,
    state: GlobeStartState,
    entry: Exclude<EntryPoint, 'preview'>,
    options: { onCommit: () => void },
  ): Promise<EversionOutcome>;
}

/** What the hand-off asks the hub to do. */
export interface HandOffUi<N> {
  /** Today's path: dismiss the hub for navigation and navigate. */
  navigateToday(node: N): void;
  /** The run reached its point of no return: show the `everting` look. */
  everting(): void;
  /** The run is over (or never was): close the hub; the orb fades back in the ordinary way. */
  closed(): void;
  /** Close the menu the ordinary animated way, without navigating. */
  dismiss(): void;
}

export interface HandOff<N> {
  /** A hand-off is in flight: close / toggle / Escape must do nothing. */
  busy(): boolean;
  /** LiquidGlobe's confirm. */
  confirm(
    controller: HandOffController<N> | null,
    node: N,
    state: GlobeStartState,
    entry: Exclude<EntryPoint, 'preview'>,
  ): void;
}

export function createHandOff<N>(ui: HandOffUi<N>): HandOff<N> {
  let busy = false;

  return {
    busy: () => busy,

    confirm(controller, node, state, entry) {
      // First: a confirm while one is in flight is nothing. Eligibility may have
      // flipped meanwhile; acting on it here would navigate twice.
      if (busy) return;
      if (!controller || !controller.isEligible()) {
        ui.navigateToday(node);
        return;
      }
      busy = true;
      controller.start(node, state, entry, { onCommit: () => ui.everting() }).then(
        (outcome) => {
          busy = false;
          if (outcome.fallback === 'traversal') {
            ui.dismiss();
            return;
          }
          if (outcome.fallback) {
            ui.navigateToday(node);
            return;
          }
          ui.closed();
        },
        () => {
          // `start` never rejects by contract; if it does, the visitor still
          // gets where they asked to go.
          busy = false;
          ui.navigateToday(node);
        },
      );
    },
  };
}
