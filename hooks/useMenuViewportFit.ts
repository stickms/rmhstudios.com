'use client';

import { useEffect, useLayoutEffect, type RefObject } from 'react';

// useLayoutEffect logs a warning when it runs during SSR; fall back to
// useEffect on the server so the component still renders cleanly. The menus
// this hook fits only open from client interaction, so the visual result is
// identical either way.
const useIsoLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;

interface Options {
  /** Gap (px) to keep between the menu and each viewport edge. */
  margin?: number;
}

/**
 * Keep an open dropdown/popover menu inside the visual viewport.
 *
 * Several menus on the site are hand-rolled, edge-anchored, absolutely- or
 * fixed-positioned divs (e.g. `absolute bottom-full right-0 w-40`). Nothing
 * clamps them, so near a screen edge — common on mobile — they spill off-screen.
 * While the menu is open this hook measures the rendered element and applies
 * corrective inline styles: a scrollable `max-height` when it would run past the
 * top/bottom edge, and a horizontal `translateX` when it would run past the
 * left/right edge. It leaves a menu that already fits untouched and clears its
 * own styles on close.
 *
 * It reasons purely in viewport coordinates from `getBoundingClientRect()`, so
 * it works for both `absolute` menus (the composer) and `fixed` menus (the
 * sidebar) without caring about their containing block. Pass any values the
 * menu's size/placement depends on (e.g. the anchor position) via `deps` so the
 * fit recomputes when they change.
 */
export function useMenuViewportFit<T extends HTMLElement>(
  open: boolean,
  menuRef: RefObject<T | null>,
  deps: unknown[] = [],
  { margin = 8 }: Options = {},
) {
  useIsoLayoutEffect(() => {
    if (!open) return;
    const el = menuRef.current;
    if (!el) return;

    const clear = () => {
      el.style.maxHeight = '';
      el.style.overflowY = '';
      el.style.transform = '';
    };

    const fit = () => {
      // Undo any prior corrections so we measure the menu's natural placement.
      clear();
      const vw = window.visualViewport?.width ?? window.innerWidth;
      const vh = window.visualViewport?.height ?? window.innerHeight;

      // Vertical: cap the height (with an internal scroll) to the room available
      // on whichever side the menu grew toward. A menu anchored above its trigger
      // has its bottom on-screen and only its top can overrun; one anchored below
      // is the mirror. Checking top/bottom picks the right side automatically.
      const r = el.getBoundingClientRect();
      if (r.top < margin) {
        el.style.maxHeight = `${Math.max(0, Math.min(r.bottom - margin, vh - margin * 2))}px`;
        el.style.overflowY = 'auto';
      } else if (r.bottom > vh - margin) {
        el.style.maxHeight = `${Math.max(0, Math.min(vh - margin - r.top, vh - margin * 2))}px`;
        el.style.overflowY = 'auto';
      }

      // Horizontal: slide the menu back so both edges sit inside the viewport,
      // favoring the left edge when it is wider than the space available.
      const r2 = el.getBoundingClientRect();
      let dx = 0;
      if (r2.right > vw - margin) dx = vw - margin - r2.right;
      if (r2.left + dx < margin) dx = margin - r2.left;
      if (dx !== 0) el.style.transform = `translateX(${Math.round(dx)}px)`;
    };

    fit();

    // Re-fit if the viewport changes while the menu is open (rotation, the
    // mobile URL bar collapsing, an on-screen keyboard, desktop resize).
    const onViewportChange = () => fit();
    window.addEventListener('resize', onViewportChange);
    window.visualViewport?.addEventListener('resize', onViewportChange);
    window.visualViewport?.addEventListener('scroll', onViewportChange);
    return () => {
      window.removeEventListener('resize', onViewportChange);
      window.visualViewport?.removeEventListener('resize', onViewportChange);
      window.visualViewport?.removeEventListener('scroll', onViewportChange);
      clear();
    };
  }, [open, margin, ...deps]);
}
