'use client';

import { useEffect } from 'react';

/**
 * The Badging API — the unread count on the installed app's icon (OPT-65).
 *
 * Two halves, and both are needed for the number to ever be right:
 *
 *  - **here**, while the app is open: whatever the app knows the count to be;
 *  - **`public/sw.js`**, while it is closed: the `push` handler moves the badge
 *    as notifications arrive, because a badge that only updates when the app is
 *    open is wrong at exactly the moment someone looks at their home screen.
 *
 * The worker keeps its own baseline in IndexedDB, so every count published here
 * is also posted to it (`RMH_BADGE_SET`). Without that the worker would keep
 * incrementing from a number the user has already read past.
 */

/** Past this the number is illegible on every platform; the OS caps it anyway. */
const BADGE_MAX = 999;

type BadgeNavigator = Navigator & {
  setAppBadge?: (n?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

function normalize(count: number): number {
  if (!Number.isFinite(count) || count <= 0) return 0;
  return Math.min(Math.floor(count), BADGE_MAX);
}

/** Keep the worker's baseline in step with what the app just displayed. */
function publishToWorker(count: number): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  // `controller` rather than `ready`: no worker (dev, first load, unsupported)
  // means nothing to tell, and `ready` never settles when none is registered.
  navigator.serviceWorker.controller?.postMessage({ type: 'RMH_BADGE_SET', count });
}

/**
 * Paint (or clear) the badge, outside React.
 *
 * Zero clears — and clearing is the half that matters. A badge that survives
 * reading everything stops meaning anything, which is worse than no badge at
 * all. Unsupported browsers (Firefox, any non-installed context) are a silent
 * no-op, so callers never branch on support, and a rejected promise
 * (permission/policy) is swallowed rather than surfaced as an app error.
 */
export function setAppBadgeCount(count: number): void {
  if (typeof navigator === 'undefined' || !('setAppBadge' in navigator)) return;
  const nav = navigator as BadgeNavigator;
  const safe = normalize(count);
  try {
    if (safe > 0) nav.setAppBadge?.(safe)?.catch(() => {});
    else nav.clearAppBadge?.()?.catch(() => {});
  } catch {
    // Badging blocked by policy / not installed — ignore.
  }
  publishToWorker(safe);
}

/** Clear the badge. Separated so unmount cannot race a pending `setAppBadge`. */
function clearAppBadge(): void {
  if (typeof navigator === 'undefined' || !('clearAppBadge' in navigator)) return;
  const nav = navigator as BadgeNavigator;
  try {
    nav.clearAppBadge?.()?.catch(() => {});
  } catch {
    /* ignore */
  }
  publishToWorker(0);
}

/**
 * Mirror an unread count onto the installed-app icon.
 *
 * Pass the total you want reflected (e.g. unread DMs + notifications).
 *
 * The two effects are deliberately separate. Clearing in the cleanup of the
 * count effect would fire a `clearAppBadge()` before every `setAppBadge()` on
 * each change, and those are unordered promises — the clear can land last and
 * leave the icon blank while the app says there are three unread. The clear
 * belongs to unmount (sign-out unmounts the layout), and only to unmount.
 */
export function useAppBadge(count: number): void {
  useEffect(() => {
    setAppBadgeCount(count);
  }, [count]);

  useEffect(() => clearAppBadge, []);
}
