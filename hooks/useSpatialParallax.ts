import { useEffect } from 'react';

/**
 * Every selector that reads the variables this hook publishes. Kept next to the
 * writer on purpose: they are consumed by a handful of page roots (the marketing
 * pages and the `.spatial-design-hero` story page) and by nothing else, and the
 * hook has to know whether the page it is on is one of them — see the gate below.
 *
 * `.spatial-feed-intro` used to be in this list. Nothing ever carried the class —
 * it was the CSS half of a feed redesign that did not land — so the hook was
 * querying for an element that could not exist. Its rules are deleted; so is the
 * gate entry, because a selector that never matches is a slower `querySelector`
 * and a false suggestion that the surface exists.
 */
const CONSUMERS = '.rmhp-root, .rmhc-root, .rmht, .spatial-design-hero';

/**
 * Drives the restrained background parallax used by the spatial-minimal shell.
 * The listener is shared at the provider level, writes a composited CSS variable
 * to the consumer element, and stands down for reduced-motion users.
 *
 * **Scroll depth only.** There was a `pointermove` half, and it was a live
 * violation of two of this codebase's own laws at once (design.md §3 and §4):
 * nothing on this site tracks the cursor — the whole class was retired
 * 2026-08-01 — and nothing writes an inherited custom property in a frame loop.
 * It also never worked: its consumers spell the fallback
 * `calc(var(--spatial-parallax-x, 0) * 0.9)`, and a unitless `0` makes that a
 * `<number>` rather than a `<length>`, so the entire `translate3d()` was invalid
 * and the declaration was dropped — before the first pointer move, and on every
 * coarse-pointer device forever. Deleted on both counts, along with the two
 * variables it published.
 *
 * ## Two reasons this is gated, and both are about the pages that DON'T use it
 *
 * It is mounted once, globally, in `Providers` — so it also ran on the feed, on
 * every profile, on every settings page. There it did real work for an effect
 * nothing on screen could show, and the work was the expensive kind:
 *
 *  1. **It writes an inherited custom property to `<html>`.** A custom property
 *     on the root is inherited by the entire document, so rewriting it on every
 *     frame of every scroll invalidates the computed style of every element on
 *     the page — the most expensive way there is to publish a number to CSS. On
 *     a page with a consumer that is simply the price of the effect; on a page
 *     without one it is pure loss, and it was a large part of why style
 *     recalculation dominated the profile of a feed scroll.
 *  2. **It read `window.scrollY` inside a `requestAnimationFrame`.** That read
 *     forces style and layout up to date, and rAF callbacks run in registration
 *     order — so it landed after the feed's rake pass had written a transform to
 *     every card on screen, and bought a synchronous re-layout every frame. The
 *     scroll event already carries the answer, at a moment when layout is clean.
 *
 * So: nothing is attached unless the page actually renders a consumer, and the
 * offset is read in the event rather than a frame later. `pathname` is what
 * re-runs the check when the visitor navigates.
 */
export function useSpatialParallax(pathname?: string) {
  useEffect(() => {
    // No consumer on this page → no listeners, no writes, nothing to stand down.
    if (!document.querySelector(CONSUMERS)) return;

    // The CONSUMER, not `<html>`. A custom property on the root is inherited by
    // the whole document, so writing one per scroll frame invalidates the
    // computed style of every element on the page — the most expensive way there
    // is to publish a number to CSS, and the single largest cost this site ever
    // measured (design.md §4). Every selector that reads this variable is a
    // descendant of the element `CONSUMERS` just matched, so it inherits from
    // here and nothing outside these pages is touched at all. `useLiquidBackground`
    // was rewritten to write to `.site-aurora` for the same reason.
    const host = document.querySelector<HTMLElement>(CONSUMERS);
    if (!host) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let scrollFrame = 0;

    const resetScroll = () => {
      host.style.removeProperty('--spatial-scroll-y');
    };

    const onScroll = (event?: Event) => {
      if (reduced.matches) {
        resetScroll();
        return;
      }
      // Measured HERE, while the layout the browser has just scrolled is still
      // clean. The frame below only writes.
      const target = event?.target;
      const scrollTop =
        target instanceof HTMLElement && target.scrollTop > 0 ? target.scrollTop : window.scrollY;
      const value = `${Math.min(scrollTop, 2400).toFixed(1)}px`;
      if (scrollFrame) cancelAnimationFrame(scrollFrame);
      scrollFrame = requestAnimationFrame(() => {
        host.style.setProperty('--spatial-scroll-y', value);
        scrollFrame = 0;
      });
    };

    const onPreferenceChange = () => {
      if (reduced.matches) {
        resetScroll();
        return;
      }
      onScroll();
    };

    window.addEventListener('scroll', onScroll, { passive: true, capture: true });
    reduced.addEventListener('change', onPreferenceChange);
    onScroll();

    return () => {
      if (scrollFrame) cancelAnimationFrame(scrollFrame);
      window.removeEventListener('scroll', onScroll, { capture: true });
      reduced.removeEventListener('change', onPreferenceChange);
      resetScroll();
    };
  }, [pathname]);
}
