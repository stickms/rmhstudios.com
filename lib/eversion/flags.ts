/**
 * The rollout switch (tasks §0 rule 5, T39).
 *
 * Every eversion task merges to `main` behind {@link isEversionEnabled}, which
 * is `false` for visitors until the device lab signs off (T38) and T39 flips
 * {@link EVERSION_ENABLED} in a commit of its own. Reverting that one line
 * restores today's navigation exactly. Until then the e2e suites force the
 * effect on with `?eversion` in the URL, so the work is testable in the built
 * app and invisible to everyone else.
 *
 * Client-only in effect: on the server there is no `location`, so the answer is
 * always `false` — the effect has no server-rendered form and the SSR output
 * must not depend on it.
 */

/** Production default. Flipped to `true` by T39, alone, after the device lab (T38). */
export const EVERSION_ENABLED = false;

/**
 * The query overrides, read ONCE per page load.
 *
 * The router rewrites the URL on client navigation, dropping `?eversion`. A
 * per-call read would therefore turn the effect off after the first in-app
 * navigation (and the hub's bridge, built while it was on, would be left with an
 * ineligible controller). So the first call that can see a readable `location`
 * latches the answer for the life of the page. A call with no `location` (the
 * server, node tests) latches nothing, so SSR never poisons the client's read.
 */
interface QueryFlags {
  eversion: boolean;
  debug: boolean;
}

let latched: QueryFlags | null = null;

/** Test-only: forget the latch so a test can stub a different `location`. */
export function resetEversionFlagsForTests(): void {
  latched = null;
}

function queryFlags(): QueryFlags {
  if (latched) return latched;
  try {
    if (typeof location === 'undefined') return { eversion: false, debug: false };
    const params = new URLSearchParams(location.search);
    latched = { eversion: params.has('eversion'), debug: params.has('eversion-debug') };
    return latched;
  } catch {
    return { eversion: false, debug: false };
  }
}

/**
 * Whether the eversion may run this page-load: the production flag, or the
 * `?eversion` override (latched at first read, see above). `false` on the server
 * and whenever `location` throws.
 *
 * This answers only "is the feature on". Whether a particular navigation is
 * ELIGIBLE (reduced motion, WebGL2, capture ready) is the controller's
 * `isEligible()`.
 */
export function isEversionEnabled(): boolean {
  return EVERSION_ENABLED || queryFlags().eversion;
}

/**
 * Whether the debug surface is requested (`?eversion-debug=1`, spec §11.3
 * device lab). The debug module is imported dynamically only when this is true,
 * so it appears in no static closure.
 */
export function isEversionDebugEnabled(): boolean {
  return queryFlags().debug;
}
