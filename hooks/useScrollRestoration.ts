'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';
import { useRouterState } from '@tanstack/react-router';

// useLayoutEffect warns during SSR (it can't run there); fall back to useEffect on
// the server so the render stays quiet. On the client we want layout timing so the
// restore happens before the browser paints (no flash of the wrong position).
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/**
 * Shared scroll restoration for the feed ↔ post flow (and the app generally).
 *
 * The router's built-in scroll restoration only tracks the WINDOW, which leaves
 * two gaps this hook fills:
 *
 *   1. Feed → post with `resetScroll: false` — RMHarkCard opts that navigation
 *      out of the router's reset entirely (so the feed doesn't visibly yank to
 *      the top mid-transition), which makes this hook the ONLY thing that scrolls
 *      the destination to the top. It runs at commit, once the post is rendering.
 *
 *   2. Exact restore despite `content-visibility` — off-screen feed cards
 *      (`.feed-card-cv`) fall back to a size *estimate* on a fresh remount, so a
 *      pixel offset restored against estimated heights lands on the wrong
 *      content (a visible re-scroll). During a back/forward restore we flip
 *      `<html>.nav-restoring` on (CSS forces those cards to real heights) and
 *      re-assert the offset across a few frames so it settles exactly where you
 *      left — no replayed scroll animation.
 *
 * It is additive to the router's restoration (both agree on the target: top on a
 * fresh push, the saved offset on back/forward), so it never fights it — it just
 * covers the mobile container and sharpens the restore.
 */

// Module-level so positions survive route unmounts (the feed store is
// module-scoped for the same reason). Capped so a long session can't grow it
// without bound.
const positions = new Map<string, number>();
const MAX_ENTRIES = 100;

function remember(key: string, y: number) {
  positions.delete(key); // re-insert so iteration order is LRU
  positions.set(key, y);
  if (positions.size > MAX_ENTRIES) {
    const oldest = positions.keys().next().value as string | undefined;
    if (oldest !== undefined) positions.delete(oldest);
  }
}

type Scroller = { el: HTMLElement; win: boolean };

/**
 * One-shot opt-out of the fresh-navigation reset below.
 *
 * A page that mirrors an in-page filter into the URL (the library's category
 * tabs → `?view=`) is not navigating anywhere: the same component stays mounted
 * and it has already decided where the viewport belongs. Without this, the href
 * change alone reads as a fresh navigation and the reset yanks the page to the
 * top a frame after the filter applies — which is exactly the jump such a page
 * is trying to avoid, and no amount of re-asserting the offset afterwards hides
 * it cleanly.
 *
 * Scoped to the pathname and a short window so a suppression that is never
 * followed by its navigation (a rejected `navigate`, a route guard) expires
 * instead of swallowing the next real reset.
 */
let suppressed: { pathname: string; at: number } | null = null;
const SUPPRESS_WINDOW_MS = 1000;

export function suppressNextScrollReset(pathname: string) {
  suppressed = { pathname, at: Date.now() };
}

function claimSuppression(pathname: string): boolean {
  const claim = suppressed;
  suppressed = null;
  return Boolean(
    claim && claim.pathname === pathname && Date.now() - claim.at < SUPPRESS_WINDOW_MS,
  );
}

// The element that actually scrolls right now. In practice this is ALWAYS the
// window today: nothing sets `data-scroll-root` any more (every _site page
// scrolls the document on mobile and desktop alike — which is deliberate, since
// iOS Safari only collapses its floating bottom bar when the DOCUMENT scrolls,
// never an inner overflow container). The probe is kept because it's the
// documented opt-in for a page that needs an inner scroller, and
// PullToRefresh/BackToTop look for the same attribute; it just never matches at
// the moment.
function getScroller(): Scroller {
  const mobile = document.querySelector<HTMLElement>('[data-scroll-root]');
  // `md:hidden` makes the container display:none on desktop → offsetParent null.
  if (mobile && mobile.offsetParent !== null) return { el: mobile, win: false };
  const doc = (document.scrollingElement as HTMLElement | null) ?? document.documentElement;
  return { el: doc, win: true };
}

function topOf(s: Scroller): number {
  return s.win ? window.scrollY : s.el.scrollTop;
}

// Always instant. `html { scroll-behavior: smooth }` (globals.css) applies to
// programmatic scrolls too — including a plain `scrollTop =` assignment — so
// without an explicit behavior every reset/restore here animated. That broke
// both paths: the reset raced content mounting and landed short of the top, and
// the restore loop below re-read a mid-animation offset each frame, so it never
// converged and burned all 12 retries. Matches `scrollRestorationBehavior` in
// app/router.tsx, so the hook and the router agree.
function applyScroll(s: Scroller, y: number) {
  if (s.win) window.scrollTo({ top: y, left: 0, behavior: 'instant' });
  else s.el.scrollTo({ top: y, left: 0, behavior: 'instant' });
}

export function useScrollRestoration() {
  const href = useRouterState({ select: (st) => st.location.href });
  // popstate fires only for back/forward — flag it so the next location settle
  // restores the saved offset instead of jumping to the top.
  const isPop = useRef(false);
  // Don't touch scroll on the very first mount — let the router / browser handle
  // the initial (or reloaded-while-scrolled) position. We only drive scroll on
  // subsequent client navigations.
  const firstRun = useRef(true);

  useEffect(() => {
    const onPop = () => {
      isPop.current = true;
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useIsoLayoutEffect(() => {
    const s = getScroller();
    const key = href;
    const pop = isPop.current;
    isPop.current = false;

    const root = document.documentElement;
    const first = firstRun.current;
    firstRun.current = false;
    let raf = 0;
    let clearTimer: ReturnType<typeof setTimeout> | undefined;

    if (pop && positions.has(key)) {
      // Returning: restore exactly. Force feed cards to real heights (see the
      // `nav-restoring` CSS) and re-assert across a few frames so async layout
      // settling can't leave us short of the saved spot.
      const target = positions.get(key) as number;
      root.classList.add('nav-restoring');
      let tries = 0;
      const apply = () => {
        applyScroll(s, target);
        if (++tries < 12 && Math.abs(topOf(s) - target) > 1) {
          raf = requestAnimationFrame(apply);
        } else {
          root.classList.remove('nav-restoring');
        }
      };
      apply();
      // Safety net: never leave the class on if the offset can't be reached
      // (e.g. the content shrank since we saved it).
      clearTimer = setTimeout(() => root.classList.remove('nav-restoring'), 500);
    } else if (!first && !window.location.hash) {
      // Fresh client navigation → land at the top (unless the URL targets an
      // in-page anchor). This runs at commit (layout effect), so paired with
      // `resetScroll: false` on the feed → post link the shared scroller doesn't
      // visibly yank the feed to the top DURING the transition — it only resets
      // once the destination is actually rendering. Covers both the window and
      // the mobile container (which the router doesn't reset). Skipped on first
      // mount so an initial/reloaded position is left to the router/browser, and
      // on a page that claimed this href change as an in-page filter.
      if (!claimSuppression(window.location.pathname)) applyScroll(s, 0);
    }

    // Remember this location's offset as the user scrolls, so leaving in any
    // direction captures the latest position.
    //
    // Read in the scroll EVENT, not in a `requestAnimationFrame` after it.
    // `window.scrollY` forces style and layout up to date, and rAF callbacks run
    // in registration order — so this one landed after the feed's rake pass had
    // written a transform to every card on screen, and paid for a synchronous
    // re-layout of the page on every frame of every scroll. Sampled during a
    // feed scroll it was 40% of all JavaScript time on the page.
    //
    // At scroll-event time the layout is the one the browser just scrolled and
    // nothing has dirtied it yet, so the same read is free. The rAF was never
    // buying throttling either: browsers already coalesce scroll events to one
    // per frame, and all this does with the value is write it to a Map.
    const onScroll = () => {
      remember(key, topOf(s));
    };
    const scrollTarget: Window | HTMLElement = s.win ? window : s.el;
    scrollTarget.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      if (raf) cancelAnimationFrame(raf);
      if (clearTimer) clearTimeout(clearTimer);
      root.classList.remove('nav-restoring');
      scrollTarget.removeEventListener('scroll', onScroll);
      remember(key, topOf(s)); // capture the leave position for the next return
    };
  }, [href]);
}
