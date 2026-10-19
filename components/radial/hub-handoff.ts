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
 *   (the effect ends with UNWRAP, so nothing lands on the orb). `abort` is also
 *   a run that navigated but never animated (the destination could not be
 *   captured): the page is already there, so the hub just closes; `traversal`
 *   -> the visitor pressed Back/Forward while priming, just close; any other
 *   fallback, or a rejected promise (never by contract), -> today's navigation.
 * - `busy` is what the hub's close / toggle / Escape consult: the hub is
 *   committed to leaving by the effect's own route and those must not abort it.
 * - No controller YET is not "no controller" (amended 2026-10-18): the bridge
 *   that builds it loads after `load` and an idle slot, so a visitor who picks a
 *   destination in the first seconds of a page-load beat it and never saw the
 *   effect. `confirmWhenReady` takes the controller as a promise (the hub bounds
 *   it), is `busy` while it waits, and then proceeds exactly as `confirm`.
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
    options: { onCommit: () => void; globe?: () => GlobeStartState },
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
  /**
   * LiquidGlobe's confirm. `live` reads the globe's pose at any later moment: the
   * effect starts once the destination is rendered, and starts from the pose then.
   */
  confirm(
    controller: HandOffController<N> | null,
    node: N,
    state: GlobeStartState,
    entry: Exclude<EntryPoint, 'preview'>,
    live?: () => GlobeStartState,
  ): void;
  /**
   * The same confirm for a controller that is still loading: busy from now, and
   * `null` (the hub's bound ran out, or the device turned out to have no effect)
   * is today's navigation. Never rejects by contract; a rejection is `null`.
   */
  confirmWhenReady(
    controller: Promise<HandOffController<N> | null>,
    node: N,
    state: GlobeStartState,
    entry: Exclude<EntryPoint, 'preview'>,
    live?: () => GlobeStartState,
  ): void;
}

export function createHandOff<N>(ui: HandOffUi<N>): HandOff<N> {
  let busy = false;

  const run = (
    controller: HandOffController<N> | null,
    node: N,
    state: GlobeStartState,
    entry: Exclude<EntryPoint, 'preview'>,
    live?: () => GlobeStartState,
  ) => {
    if (!controller || !controller.isEligible()) {
      busy = false;
      ui.navigateToday(node);
      return;
    }
    busy = true;
    const options = live
      ? { onCommit: () => ui.everting(), globe: live }
      : { onCommit: () => ui.everting() };
    controller.start(node, state, entry, options).then(
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
  };

  return {
    busy: () => busy,

    confirm(controller, node, state, entry, live) {
      // First: a confirm while one is in flight is nothing. Eligibility may have
      // flipped meanwhile; acting on it here would navigate twice.
      if (busy) return;
      run(controller, node, state, entry, live);
    },

    confirmWhenReady(controller, node, state, entry, live) {
      if (busy) return;
      busy = true;
      controller.then(
        (c) => run(c, node, state, entry, live),
        () => run(null, node, state, entry, live),
      );
    },
  };
}
