import { useEffect, useRef, useState } from 'react';

import { prefersReducedMotion } from '@/hooks/useReducedMotion';

/** Jump the page (or its opted-in scroller, `[data-scroll-root]`) to the top. */
export function scrollPageToTop() {
  const behavior: ScrollBehavior = prefersReducedMotion() ? 'auto' : 'smooth';
  // Resolved here rather than kept live: one query per click is free, and a
  // click is the only moment the answer is needed.
  const scroller = document.querySelector<HTMLElement>('[data-scroll-root]');
  if (scroller && scroller.offsetParent !== null)
    scroller.scrollTo({
      top: 0,
      behavior,
    });
  else
    window.scrollTo({
      top: 0,
      behavior,
    });
}

/**
 * Whether the page is scrolled past `threshold`: what the phone's back-to-top
 * button (`components/shell/FabLane.tsx`, owner exception L1a) shows on.
 * `scrollPageToTop` above is what it does when pressed.
 *
 * Scrolls the window, unless a page has opted into an inner scroller by marking
 * it `[data-scroll-root]` — the same opt-in `useScrollRestoration` honours. No
 * page sets that today (every `_site` page scrolls the document on mobile and
 * desktop alike), so this resolves to the window; the attribute remains the
 * documented escape hatch.
 *
 * ## "Am I scrolled down?" is answered without a scroll listener
 *
 * The button used to run a scroll listener over the whole session that
 * asked "which box is scrolling?" with `document.querySelector` plus an
 * `offsetParent` read, then asked "how far?" with `window.scrollY`. Sampled
 * during a feed scroll, that handler was **41% of all JavaScript time on the
 * page** — the largest scripting cost of scrolling anywhere on the site.
 *
 * The query was the obvious half of the waste (a document-wide attribute
 * selector, per event, to discover the null every shipped page returns). The
 * expensive half was subtler: `window.scrollY` forces style and layout to be
 * brought up to date, and this ran in a `requestAnimationFrame` **after** the
 * feed's rake pass had just written a transform to every card on screen. Every
 * scroll frame therefore paid for a synchronous re-layout of the page, to learn
 * a number that only matters when it crosses one threshold.
 *
 * So there is no scroll listener any more. A 1px sentinel sits `threshold`
 * pixels down the page and an `IntersectionObserver` reports when it leaves —
 * observers run off the main thread's critical path, deliver the geometry they
 * already computed (`boundingClientRect`, so `top < 0` distinguishes "scrolled
 * past it" from "the viewport is shorter than the threshold"), and read
 * nothing. Scrolling now costs this hook exactly nothing until the
 * threshold is actually crossed.
 *
 * This also keeps the escape hatch working, and for free: the default root is
 * the VIEWPORT, and intersection accounts for every clipping ancestor along the
 * way — so a shell nested inside an opted-in `[data-scroll-root]` reports
 * correctly without this hook having to know the scroller exists. Only the
 * click target still needs to, and that is resolved once, on click.
 */

export function useScrolledPast(threshold = 600) {
  const [past, setPast] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      // Gone off the TOP, not merely out of view: on a viewport shorter than the
      // threshold the sentinel starts out below the fold, and "not intersecting"
      // there would show the button on an unscrolled page.
      setPast(!entry.isIntersecting && entry.boundingClientRect.top < 0);
    });
    io.observe(sentinel);
    return () => {
      io.disconnect();
    };
  }, [threshold]);

  return {
    past,
    /** Render as `<div ref={sentinelRef} className="back-to-top-sentinel" style={{ top: threshold }} aria-hidden />`. */
    sentinelRef,
  };
}
