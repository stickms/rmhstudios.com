/**
 * Content that replaces a loading placeholder fades in instead of snapping in.
 *
 * The site has ~200 loading states — `isLoading ? <Skeleton/> : <List/>`,
 * Suspense boundaries with a spinner fallback, `<Spinner/>` while a panel
 * fetches. On a fast connection the swap is one frame and nobody sees it. On a
 * slow one the placeholder sits there for seconds and the real content then
 * lands in a single frame — the "pop-in" that makes a page feel janky even when
 * nothing moves. Rewriting 200 call sites would never stay done; this fixes the
 * swap where it happens, in the DOM.
 *
 * One `MutationObserver` on the document. When a mutation batch REMOVES a
 * placeholder — the `Skeleton` and `Spinner`/`RadialLoader` primitives
 * (`[data-slot="skeleton"]`, `.rad-loader`), anything marked `[data-skeleton]`
 * or `[aria-busy="true"]` — the element children ADDED to the same parent in
 * that batch are what replaced it, and they get a short opacity fade through
 * the Web Animations API.
 *
 * Why it is safe to run everywhere:
 *
 *  - **Opacity only, on the compositor.** No transform (it would fight any
 *    transform the element already has) and nothing that touches layout, so it
 *    cannot cause a shift. WAAPI animations clean up after themselves — no class
 *    or style is left behind on the element.
 *  - **Cheap when idle.** The callback's only work for an ordinary mutation is
 *    a `matches` per removed element; a removed subtree is searched once, with
 *    a single selector.
 *  - **Bounded.** At most `MAX_PER_BATCH` elements animate per batch; a swap
 *    bigger than that is a page switch, which the route's own entrance animation
 *    (`.page-root > *`) already covers — and route pending UI
 *    (`[data-route-pending]`) is skipped explicitly for the same reason.
 *  - **Respectful.** Nothing runs under reduced motion (the OS setting or the
 *    site's own), and any subtree can opt out with `data-no-reveal`.
 */

const PLACEHOLDER = '[data-slot="skeleton"],.rad-loader,[data-skeleton],[aria-busy="true"]';
const DURATION_MS = 260;
const EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';
const MAX_PER_BATCH = 24;

function reducedMotion(): boolean {
  if (document.documentElement.classList.contains('reduce-motion')) return true;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** Was this removed node (or anything inside it) a loading placeholder? */
function heldPlaceholder(node: Node): boolean {
  if (!(node instanceof Element)) return false;
  if (node.hasAttribute('data-route-pending')) return false;
  return node.matches(PLACEHOLDER) || node.querySelector(PLACEHOLDER) !== null;
}

/** Is this added node real content worth revealing? */
function revealable(node: Node): node is HTMLElement | SVGElement {
  if (!(node instanceof HTMLElement || node instanceof SVGElement)) return false;
  if (node.closest('[data-no-reveal]')) return false;
  // A placeholder replacing a placeholder (skeleton → spinner) is not content.
  return !node.matches(PLACEHOLDER) && node.querySelector(PLACEHOLDER) === null;
}

export function installSwapReveal(): () => void {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') {
    return () => {};
  }
  if (typeof Element.prototype.animate !== 'function') return () => {};

  const observer = new MutationObserver((records) => {
    let parents: Set<Node> | null = null;
    for (const record of records) {
      for (const removed of record.removedNodes) {
        if (heldPlaceholder(removed)) (parents ??= new Set()).add(record.target);
      }
    }
    if (!parents || reducedMotion()) return;

    let budget = MAX_PER_BATCH;
    for (const record of records) {
      if (!parents.has(record.target)) continue;
      for (const added of record.addedNodes) {
        if (budget === 0) return;
        if (!revealable(added) || !added.isConnected) continue;
        budget -= 1;
        added.animate([{ opacity: 0 }, { opacity: 1 }], {
          duration: DURATION_MS,
          easing: EASING,
        });
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
  return () => observer.disconnect();
}
