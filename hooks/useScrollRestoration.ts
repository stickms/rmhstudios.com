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
 *   1. Mobile — the scroller isn't the window but MobileSidebarShell's inner
 *      container (marked `data-scroll-root`). The router never restores it, so
 *      back-nav lost the feed position and forward-nav left a post scrolled to
 *      wherever the feed was. We save/restore that element ourselves.
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

// The element that actually scrolls right now: the mobile shell's container when
// it's the live scroller (visible on mobile), otherwise the window/document.
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

function applyScroll(s: Scroller, y: number) {
  if (s.win) window.scrollTo(0, y);
  else s.el.scrollTop = y;
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
      // mount so an initial/reloaded position is left to the router/browser.
      applyScroll(s, 0);
    }

    // Remember this location's offset as the user scrolls, so leaving in any
    // direction captures the latest position.
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        remember(key, topOf(s));
        ticking = false;
      });
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
