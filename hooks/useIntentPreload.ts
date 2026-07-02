'use client';

import { useEffect, useMemo, useRef } from 'react';

/**
 * A resource to warm ahead of a navigation. A bare string is treated as an
 * image; pass `{ url, as: 'fetch' }` for non-image assets (PDFs, EPUBs, JSON)
 * that should be prefetched into the HTTP cache instead.
 */
export type PreloadResource = string | { url: string; as?: 'image' | 'fetch' };

// Warmed URLs are remembered process-wide so hovering the same card twice (or two
// cards that share an asset) never kicks off a second download.
const warmed = new Set<string>();

/** Skip preloading when the user (or their network) has asked us to conserve data. */
function shouldSkip(): boolean {
  if (typeof navigator === 'undefined') return true;
  const conn = (navigator as { connection?: { saveData?: boolean } }).connection;
  return Boolean(conn?.saveData);
}

function warmImage(url: string) {
  const img = new Image();
  // Hint the browser this is a speculative, low-urgency fetch so it never
  // competes with resources the current page actually needs to paint.
  (img as { fetchPriority?: string }).fetchPriority = 'low';
  img.decoding = 'async';
  img.src = url;
}

function warmFetch(url: string) {
  // `<link rel="prefetch">` is the lowest-priority hint there is: browsers fetch
  // it while idle and are free to drop it under memory/data pressure — exactly
  // right for speculatively warming a file we're not sure the user will open.
  const link = document.createElement('link');
  link.rel = 'prefetch';
  link.as = 'fetch';
  link.href = url;
  link.crossOrigin = 'anonymous';
  document.head.appendChild(link);
}

function warm(resource: PreloadResource) {
  const url = typeof resource === 'string' ? resource : resource.url;
  if (!url || warmed.has(url)) return;
  warmed.add(url);
  const as = typeof resource === 'string' ? 'image' : resource.as ?? 'image';
  if (as === 'fetch') warmFetch(url);
  else warmImage(url);
}

/**
 * Warm a destination's heavy media on hover/focus *intent*, so clicking a link
 * feels instant. TanStack Router already prefetches route *data* on intent
 * (`defaultPreload: "intent"`); this covers the images and files that route will
 * render, which the data prefetch doesn't touch.
 *
 * Spread the returned handlers onto a `<Link>` (or any element). Warming waits a
 * short beat (matching the router's 50ms `defaultPreloadDelay`) so brushing past
 * a link doesn't trigger downloads, cancels if the pointer leaves first, and only
 * ever fetches each URL once. No-ops on the server and when Save-Data is on.
 *
 * @param resources The asset(s) to warm — image URLs by default; wrap non-image
 *   files as `{ url, as: 'fetch' }`.
 * @param delay Intent debounce in ms (default 50, matching the router).
 */
export function useIntentPreload(resources: PreloadResource[], delay = 50) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Snapshot by URL so the handlers stay stable across renders unless the actual
  // targets change (avoids re-warming just because a parent re-rendered).
  const key = resources
    .map((r) => (typeof r === 'string' ? r : r.url))
    .join('|');

  const clear = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };

  // Cancel any pending warm if the component unmounts mid-hover.
  useEffect(() => clear, []);

  return useMemo(() => {
    const start = () => {
      if (timer.current || shouldSkip()) return;
      timer.current = setTimeout(() => {
        timer.current = null;
        resources.forEach(warm);
      }, delay);
    };

    return {
      onPointerEnter: start,
      onFocus: start,
      // A tap is already committed intent — warm immediately, no debounce.
      onTouchStart: () => {
        if (shouldSkip()) return;
        resources.forEach(warm);
      },
      onPointerLeave: clear,
      onBlur: clear,
    };
    // `key` captures the meaningful identity of `resources`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, delay]);
}
