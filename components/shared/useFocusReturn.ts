'use client';

import { useCallback, useLayoutEffect, useRef } from 'react';

/**
 * Focus return for a dialog opened without a `DialogTrigger`.
 *
 * Radix returns focus on close only to its own trigger; a game dialog opened from game state
 * (a menu button's onClick, a key) has none, so focus would fall to `<body>`. This remembers the
 * element that had focus when the dialog opened (read in a layout effect, before the dialog's
 * focus scope moves focus inside) and hands back an `onCloseAutoFocus` that restores it. It also
 * runs when the dialog unmounts with its parent, because Radix's focus scope fires the same event
 * on unmount.
 */
export function useFocusReturn(open = true) {
  const returnTo = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    if (
      open &&
      document.activeElement instanceof HTMLElement &&
      document.activeElement !== document.body
    ) {
      returnTo.current = document.activeElement;
    }
  }, [open]);

  return useCallback((event: Event) => {
    const el = returnTo.current;
    returnTo.current = null;
    if (el?.isConnected) {
      event.preventDefault();
      el.focus();
    }
  }, []);
}
