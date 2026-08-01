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
 * The listener is shared at the provider level, writes composited CSS variables,
 * and stands down for reduced-motion users. Pointer depth is fine-pointer only;
 * scroll depth works across the public marketing pages on every device.
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

    const root = document.documentElement;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const finePointer = window.matchMedia('(pointer: fine)');
    let pointerFrame = 0;
    let scrollFrame = 0;

    const resetPointer = () => {
      root.style.removeProperty('--spatial-parallax-x');
      root.style.removeProperty('--spatial-parallax-y');
    };

    const resetScroll = () => {
      root.style.removeProperty('--spatial-scroll-y');
    };

    const onPointerMove = (event: PointerEvent) => {
      if (reduced.matches || !finePointer.matches) {
        resetPointer();
        return;
      }
      if (pointerFrame) cancelAnimationFrame(pointerFrame);
      pointerFrame = requestAnimationFrame(() => {
        const x = (event.clientX / window.innerWidth - 0.5) * 18;
        const y = (event.clientY / window.innerHeight - 0.5) * 18;
        root.style.setProperty('--spatial-parallax-x', `${x.toFixed(2)}px`);
        root.style.setProperty('--spatial-parallax-y', `${y.toFixed(2)}px`);
        pointerFrame = 0;
      });
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
        root.style.setProperty('--spatial-scroll-y', value);
        scrollFrame = 0;
      });
    };

    const onPreferenceChange = () => {
      if (reduced.matches) {
        resetPointer();
        resetScroll();
        return;
      }
      if (!finePointer.matches) resetPointer();
      onScroll();
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true, capture: true });
    reduced.addEventListener('change', onPreferenceChange);
    finePointer.addEventListener('change', onPreferenceChange);
    onScroll();

    return () => {
      if (pointerFrame) cancelAnimationFrame(pointerFrame);
      if (scrollFrame) cancelAnimationFrame(scrollFrame);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('scroll', onScroll, { capture: true });
      reduced.removeEventListener('change', onPreferenceChange);
      finePointer.removeEventListener('change', onPreferenceChange);
      resetPointer();
      resetScroll();
    };
  }, [pathname]);
}
