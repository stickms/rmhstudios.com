'use client';

import { useSyncExternalStore } from 'react';
import { quantiseDisplayScale, readDisplayScale } from '@/lib/display-scale';

/**
 * useDisplayScale — the live device-pixel scale of the page, zoom included.
 *
 * Mount this next to anything that rasterises its own pixels (a WebGL surface, a 2D
 * canvas) and it re-renders whenever the browser magnifies the page, so the drawing
 * buffer can follow. Both kinds of zoom are covered — see `lib/display-scale.ts` for
 * why they need different signals — and the reading is snapped to quarter steps so a
 * continuous pinch doesn't reallocate a buffer per frame.
 *
 * There is no `devicepixelratiochange` event, so page zoom is caught by a media query
 * pinned to the *current* ratio: it stops matching the moment the ratio moves, and is
 * re-armed at the new one. `resize` is a belt-and-braces second source (page zoom
 * reflows the layout viewport), and `visualViewport` carries the pinch.
 *
 * SSR-safe: the server snapshot is 1, which is what an unzoomed 1× display reports, so
 * hydration is quiet and the first client render corrects it.
 */
export function useDisplayScale(): number {
  return useSyncExternalStore(subscribe, getSnapshot, () => 1);
}

function getSnapshot(): number {
  return quantiseDisplayScale(readDisplayScale(window));
}

function subscribe(onChange: () => void): () => void {
  let query: MediaQueryList | null = null;

  // Re-arm at the new ratio, then report: one listener can only watch one ratio.
  const onRatioChange = () => {
    arm();
    onChange();
  };

  const arm = () => {
    query?.removeEventListener('change', onRatioChange);
    const dpr = window.devicePixelRatio || 1;
    query = window.matchMedia(`(resolution: ${dpr}dppx)`);
    query.addEventListener('change', onRatioChange);
  };

  arm();
  window.addEventListener('resize', onChange);
  const visual = window.visualViewport;
  visual?.addEventListener('resize', onChange);
  visual?.addEventListener('scroll', onChange);

  return () => {
    query?.removeEventListener('change', onRatioChange);
    window.removeEventListener('resize', onChange);
    visual?.removeEventListener('resize', onChange);
    visual?.removeEventListener('scroll', onChange);
  };
}
