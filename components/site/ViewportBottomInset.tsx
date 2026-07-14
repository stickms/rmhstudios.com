'use client';

import { useEffect } from 'react';

/**
 * Publishes the height of the browser's OWN dynamic bottom chrome as the CSS
 * custom property `--browser-bottom-bar` on <html>, so the floating mobile dock,
 * the compose FAB, the mini-player, and content padding (`.pb-dock`) can all
 * clear it. The motivating case is iOS 26 Safari's floating bottom tab bar,
 * which floats OVER the page and is not reported by `env(safe-area-inset-*)`.
 *
 * How it's measured: the visual viewport is the region actually visible to the
 * user; the layout viewport (`window.innerHeight`) includes the space occupied
 * by collapsible browser chrome. The bottom chrome is therefore
 *   innerHeight − visualViewport.height − visualViewport.offsetTop
 * (subtracting offsetTop isolates the BOTTOM bar from any TOP bar, so Android
 * Chrome's top URL bar correctly yields 0). It resolves to 0 on desktop,
 * standalone PWAs, and whenever there is no bottom bar — so `--safe-bottom`
 * collapses to plain `env(safe-area-inset-bottom)` and nothing changes there.
 *
 * The soft on-screen keyboard also shrinks the visual viewport, by far more than
 * any toolbar; we treat insets above BAR_MAX as "not a browser bar" and report
 * 0 so the dock doesn't leap upward while typing.
 */
const BAR_MAX = 120; // px — real browser bottom bars are well under this

export function ViewportBottomInset() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;

    let raf = 0;
    const measure = () => {
      raf = 0;
      const bottom = window.innerHeight - vv.height - vv.offsetTop;
      const bar = bottom > 0 && bottom <= BAR_MAX ? Math.round(bottom) : 0;
      root.style.setProperty('--browser-bottom-bar', `${bar}px`);
    };
    const schedule = () => {
      if (raf) return;
      raf = requestAnimationFrame(measure);
    };

    measure();
    vv.addEventListener('resize', schedule);
    vv.addEventListener('scroll', schedule);
    window.addEventListener('orientationchange', schedule);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      vv.removeEventListener('resize', schedule);
      vv.removeEventListener('scroll', schedule);
      window.removeEventListener('orientationchange', schedule);
      root.style.removeProperty('--browser-bottom-bar');
    };
  }, []);

  return null;
}
