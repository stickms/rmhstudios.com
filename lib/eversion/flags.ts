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
 * Read a query-string key off the current URL. Never throws: `location` is
 * missing on the server and in node tests, and can throw in sandboxed frames.
 */
function hasQueryKey(key: string): boolean {
  try {
    if (typeof location === 'undefined') return false;
    return new URLSearchParams(location.search).has(key);
  } catch {
    return false;
  }
}

/**
 * Whether the eversion may run this page-load: the production flag, or the
 * `?eversion` override. `false` on the server and whenever `location` throws.
 *
 * This answers only "is the feature on". Whether a particular navigation is
 * ELIGIBLE (reduced motion, WebGL2, capture ready) is the controller's
 * `isEligible()`.
 */
export function isEversionEnabled(): boolean {
  return EVERSION_ENABLED || hasQueryKey('eversion');
}

/**
 * Whether the debug surface is requested (`?eversion-debug=1`, spec §11.3
 * device lab). The debug module is imported dynamically only when this is true,
 * so it appears in no static closure.
 */
export function isEversionDebugEnabled(): boolean {
  return hasQueryKey('eversion-debug');
}
