'use client';

import { useEffect } from 'react';

/**
 * Suppress the per-page enter animation (`.page-root > *`, see globals.css) on
 * back/forward navigations.
 *
 * Forward navigation (clicking a link) should feel like arriving somewhere new,
 * so the subtle slide-in stays. But going *back* should feel like returning to
 * where you were — replaying the slide-in there reads as the page re-animating
 * under you. Paired with the router's scroll restoration and the cached feed,
 * this makes back land you exactly on the timeline position you left.
 *
 * We flag `<html>` with `nav-pop` synchronously on `popstate` (which fires for
 * both back and forward history navigation, before React commits the new route),
 * then clear it after the remount so the next link click animates normally.
 */
export function BackNavAnimation() {
  useEffect(() => {
    const root = document.documentElement;
    let clearTimer: ReturnType<typeof setTimeout> | undefined;
    const onPop = () => {
      root.classList.add('nav-pop');
      if (clearTimer) clearTimeout(clearTimer);
      // Long enough to cover the route remount + first paint, short enough that
      // a link click shortly after still animates.
      clearTimer = setTimeout(() => root.classList.remove('nav-pop'), 400);
    };
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      if (clearTimer) clearTimeout(clearTimer);
    };
  }, []);
  return null;
}
