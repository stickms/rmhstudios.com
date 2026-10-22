'use client';

import { useEffect } from 'react';
import { installLiquidInteractions } from '@/lib/liquid/runtime';

/**
 * Mount once at the provider boundary, including full-screen app routes.
 *
 * Two independent services share the document: the interaction field (a translate-only push on neighbouring surfaces,
 * tiny, installed immediately) and the glass engine (shader slabs, cursor light, surface ripples). The engine and its
 * shaders are loaded after the browser is idle, so they cost nothing on the first paint; surfaces simply keep their CSS
 * material until it arrives, which is the same material the engine falls back to.
 */
export function useLiquidInteractions(): void {
  useEffect(() => {
    const stopInteractions = installLiquidInteractions();
    let stopGlass: (() => void) | null = null;
    let cancelled = false;
    const start = () => {
      void import('@/lib/liquid/glass/engine')
        .then((m) => {
          if (!cancelled) stopGlass = m.installLiquidGlass();
        })
        .catch(() => {
          /* The CSS material is the complete fallback if the optional chunk fails. */
        });
    };
    // Safari has no requestIdleCallback (the DOM typings say every browser does), so feature-detect it.
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
      cancelIdleCallback?: (h: number) => void;
    };
    const idle = typeof w.requestIdleCallback === 'function';
    const handle = idle
      ? w.requestIdleCallback!(start, { timeout: 2500 })
      : window.setTimeout(start, 600);
    return () => {
      cancelled = true;
      if (idle) w.cancelIdleCallback?.(handle);
      else window.clearTimeout(handle);
      stopInteractions();
      stopGlass?.();
    };
  }, []);
}
