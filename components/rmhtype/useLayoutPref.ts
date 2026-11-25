/**
 * The remembered keyboard layout as a hook. The server and the first client render use QWERTY and the stored layout
 * arrives right after, so hydration agrees (`useSyncExternalStore`'s server snapshot).
 */
import { useCallback, useSyncExternalStore } from 'react';
import { DEFAULT_LAYOUT, type TypingLayout } from '@/lib/rmhtype/keystats';
import { readLayoutPref, subscribeLayoutPref, writeLayoutPref } from '@/lib/rmhtype/layout-pref';

export function useLayoutPref(): [TypingLayout, (layout: TypingLayout) => void] {
  const layout = useSyncExternalStore(subscribeLayoutPref, readLayoutPref, () => DEFAULT_LAYOUT);
  const set = useCallback((next: TypingLayout) => writeLayoutPref(next), []);
  return [layout, set];
}
