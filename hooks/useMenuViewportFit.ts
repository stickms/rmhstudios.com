'use client';

import { useEffect, useLayoutEffect, type RefObject } from 'react';
import { viewportFitTranslation, type ViewportBounds } from '@/lib/viewport-fit';

// useLayoutEffect logs a warning when it runs during SSR; fall back to
// useEffect on the server so the component still renders cleanly. The menus
// this hook fits only open from client interaction, so the visual result is
// identical either way.
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

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
 * corrective inline styles: maximum dimensions with internal scrolling when the
 * panel is larger than the viewport, then an x/y translation that keeps every
 * edge visible. It leaves a panel that already fits untouched and clears its own
 * styles on close.
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
      el.style.removeProperty('max-height');
      el.style.removeProperty('max-width');
      el.style.removeProperty('overflow-y');
      el.style.removeProperty('overscroll-behavior');
      // Individual translate composes with liquid-pop's animated `transform`.
      el.style.removeProperty('translate');
    };

    const fit = () => {
      // Undo any prior corrections so we measure the menu's natural placement.
      clear();
      const rootStyle = getComputedStyle(document.documentElement);
      const cssPx = (name: string) => parseFloat(rootStyle.getPropertyValue(name)) || 0;
      const viewport = window.visualViewport;
      const viewportLeft = viewport?.offsetLeft ?? 0;
      const viewportTop = viewport?.offsetTop ?? 0;
      const viewportWidth = viewport?.width ?? window.innerWidth;
      const viewportHeight = viewport?.height ?? window.innerHeight;
      const bounds: ViewportBounds = {
        left: viewportLeft + margin + cssPx('--safe-left'),
        top: viewportTop + margin + cssPx('--safe-top'),
        right: viewportLeft + viewportWidth - margin - cssPx('--safe-right'),
        bottom: viewportTop + viewportHeight - margin - cssPx('--safe-bottom'),
      };
      const availableWidth = Math.max(0, bounds.right - bounds.left);
      const availableHeight = Math.max(0, bounds.bottom - bounds.top);

      const natural = el.getBoundingClientRect();
      if (natural.width > availableWidth) el.style.maxWidth = `${availableWidth}px`;
      if (natural.height > availableHeight) {
        el.style.maxHeight = `${availableHeight}px`;
        el.style.overflowY = 'auto';
        el.style.overscrollBehavior = 'contain';
      }

      // Re-measure after maximum dimensions take effect, then correct both axes.
      const resized = el.getBoundingClientRect();
      const shift = viewportFitTranslation(resized, bounds);
      if (shift.x !== 0 || shift.y !== 0) {
        el.style.translate = `${Math.round(shift.x)}px ${Math.round(shift.y)}px`;
      }
    };

    fit();
    // liquid-pop's longest entrance settles at 460ms. Re-measure once afterward
    // because getBoundingClientRect includes its temporary scale/rotation.
    const settleTimer = window.setTimeout(fit, 520);

    // Re-fit if the viewport changes while the menu is open (rotation, the
    // mobile URL bar collapsing, an on-screen keyboard, desktop resize).
    const onViewportChange = () => fit();
    window.addEventListener('resize', onViewportChange);
    window.visualViewport?.addEventListener('resize', onViewportChange);
    window.visualViewport?.addEventListener('scroll', onViewportChange);
    // Async menu contents (search results, notifications, lazy pickers) can grow
    // after the opening frame. Re-fit on DOM changes without observing our styles.
    const contentObserver = new MutationObserver(fit);
    contentObserver.observe(el, { childList: true, characterData: true, subtree: true });
    return () => {
      window.removeEventListener('resize', onViewportChange);
      window.visualViewport?.removeEventListener('resize', onViewportChange);
      window.visualViewport?.removeEventListener('scroll', onViewportChange);
      window.clearTimeout(settleTimer);
      contentObserver.disconnect();
      clear();
    };
  }, [open, margin, ...deps]);
}
