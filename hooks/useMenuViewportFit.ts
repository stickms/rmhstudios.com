'use client';

import { useEffect, useLayoutEffect, type RefObject } from 'react';
import { viewportFitTranslation, type ViewportBounds } from '@/lib/viewport-fit';

// useLayoutEffect logs a warning when it runs during SSR; fall back to
// useEffect on the server so the component still renders cleanly. The menus
// this hook fits only open from client interaction, so the visual result is
// identical either way.
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/**
 * How much shorter the visual viewport has to get before we call it a keyboard
 * rather than a browser bar. Mobile URL/tab bars collapse by roughly 45–100px;
 * the shortest on-screen keyboard (a landscape phone) still takes well over 160.
 */
const KEYBOARD_MIN_INSET_PX = 150;
/** Width wobble tolerated before a visual-viewport shrink counts as a zoom. */
const ZOOM_WIDTH_SLACK_PX = 2;

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
 *
 * It deliberately ignores the on-screen keyboard — see the note in `fit()`. The
 * keyboard covers a fixed menu; it does not move it, and re-fitting to the
 * viewport it leaves behind is what made tapping a field inside one of these
 * panels resize the screen on a phone.
 */
export function useMenuViewportFit<T extends HTMLElement>(
  /**
   * Truthy while the menu is on screen. Deliberately not `boolean`: the caller
   * is usually `usePopPresence`'s `present`, which is the caller's own open
   * VALUE (a pointer position, which item's menu is showing) held through the
   * close — and the clamp has to stay applied for that window or the panel
   * snaps back to its unclamped position mid-exit. Only truthiness is read.
   */
  open: unknown,
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
      // The `translate` LONGHAND, so it composes with the bloom's animated
      // `transform` (globals.css §7.1) instead of replacing it.
      el.style.removeProperty('translate');
    };

    const fit = () => {
      // Undo any prior corrections so we measure the menu's natural placement.
      clear();
      const rootStyle = getComputedStyle(document.documentElement);
      const cssPx = (name: string) => parseFloat(rootStyle.getPropertyValue(name)) || 0;
      // An on-screen keyboard shrinks the VISUAL viewport and leaves the LAYOUT
      // viewport alone — and the layout viewport is what these menus are actually
      // placed against (they are all position:fixed). Clamping to the shrunken box
      // is therefore wrong twice over: it shoves a correctly-placed panel upward
      // and squeezes a max-height onto it the moment a field inside it takes
      // focus, and then re-does it on every keyboard-driven resize/scroll tick —
      // which, from the thumb that just tapped the top bar's search box, reads as
      // the whole screen resizing under it. Keep the keyboard out of the maths and
      // treat it as what it is here: an overlay in front of a panel that has not
      // moved. A pinch-zoom shrinks the visual viewport too, but it shrinks BOTH
      // axes, so the width check tells the two apart and zoom still gets clamped.
      const live = window.visualViewport;
      const keyboardInset = live ? window.innerHeight - live.height : 0;
      const keyboardUp =
        !!live &&
        keyboardInset > KEYBOARD_MIN_INSET_PX &&
        live.width > window.innerWidth - ZOOM_WIDTH_SLACK_PX;
      const viewport = keyboardUp ? null : live;
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
    // The bloom settles at `--motion-bloom` (300ms). Re-measure once afterward,
    // because getBoundingClientRect includes its temporary scale and rotation —
    // a menu measured mid-open is measured 6% short and gets no clamp it needed.
    const settleTimer = window.setTimeout(fit, 360);

    // Re-fit if the viewport changes while the menu is open (rotation, the
    // mobile URL bar collapsing, a pinch-zoom, desktop resize). Keyboard-driven
    // changes still land here — `fit()` is what recognises and ignores them, so
    // they recompute to the same bounds and nothing moves.
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
