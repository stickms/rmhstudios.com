'use client';

import { useEffect } from 'react';

/**
 * Mirrors an unread count onto the installed-app icon via the Badging API
 * (`navigator.setAppBadge` / `clearAppBadge`). On an installed PWA this paints a
 * numeric dot on the home-screen/taskbar/dock icon; in a normal browser tab the
 * API is absent and this is a no-op.
 *
 * Pass the total you want reflected (e.g. unread DMs + notifications). Zero — or
 * an unsupported browser — clears the badge. Errors (permission/policy) are
 * swallowed so a badge failure never breaks the app.
 */
export function useAppBadge(count: number): void {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('setAppBadge' in navigator)) return;
    const nav = navigator as Navigator & {
      setAppBadge?: (n?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    const safe = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
    try {
      if (safe > 0) nav.setAppBadge?.(safe)?.catch(() => {});
      else nav.clearAppBadge?.()?.catch(() => {});
    } catch {
      // Badging blocked by policy / not installed — ignore.
    }
    // Clear the badge when this component unmounts (e.g. sign-out unmounts the layout).
    return () => {
      try {
        nav.clearAppBadge?.()?.catch(() => {});
      } catch {
        /* ignore */
      }
    };
  }, [count]);
}
