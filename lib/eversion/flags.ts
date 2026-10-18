/**
 * The rollout switch (tasks §0 rule 5, T39).
 *
 * {@link EVERSION_ENABLED} is on for every visitor: the owner enabled it ahead of
 * the device lab (T38) and visual sign-off (T28), to judge it in production.
 * Setting it back to `false` restores today's navigation exactly, with
 * `?eversion` still forcing the effect on for a page load.
 *
 * The answer is the same on the server (no `location`, so the query adds
 * nothing): SSR and hydration agree. Whether a particular navigation may run it
 * (reduced motion, WebGL2, capture ready) is decided client-side by the
 * controller.
 */

/** Production default: on. Flip to `false` to turn the effect off site-wide. */
export const EVERSION_ENABLED = true;

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
 * `?eversion` override (latched at first read, see above). Without `location`
 * (the server, or when it throws) only the production flag counts.
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
