'use client';

import { useEffect, useRef, useState } from 'react';
import { setAppBadgeCount } from '@/lib/useAppBadge';
import {
  badgedTitle,
  readTabBadgePref,
  setFaviconDot,
  TAB_BADGE_PREF_EVENT,
} from '@/lib/tab-badge';

/**
 * Mirrors the shell's unread total onto the tab title, the favicon and the
 * installed-app icon. Renders nothing.
 *
 * The count is passed in by the shell, which already subscribes to both
 * sources — so this adds no request and no subscription of its own.
 *
 * TanStack's `head()` owns `<title>` and rewrites it on every navigation, so
 * instead of fighting it this re-applies the prefix whenever `<head>` changes.
 * The observer callback is a string compare in the common case; it only
 * writes when the title is missing the right prefix, so its own write is the
 * end of the chain, not a loop.
 */
export function TabBadge({ count }: { count: number }) {
  const [enabled, setEnabled] = useState(true);
  const countRef = useRef(0);
  const effective = enabled ? count : 0;
  countRef.current = effective;

  useEffect(() => {
    setEnabled(readTabBadgePref());
    const onPref = () => setEnabled(readTabBadgePref());
    window.addEventListener(TAB_BADGE_PREF_EVENT, onPref);
    return () => window.removeEventListener(TAB_BADGE_PREF_EVENT, onPref);
  }, []);

  // Title: apply now, and again after any navigation rewrites it.
  useEffect(() => {
    const apply = () => {
      const next = badgedTitle(document.title, countRef.current);
      if (next !== document.title) document.title = next;
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => {
      observer.disconnect();
      document.title = badgedTitle(document.title, 0);
    };
  }, []);

  useEffect(() => {
    const next = badgedTitle(document.title, effective);
    if (next !== document.title) document.title = next;
    setAppBadgeCount(effective);
  }, [effective]);

  // Favicon: redraw only on the 0 ↔ non-zero edge.
  const hasUnread = effective > 0;
  useEffect(() => {
    void setFaviconDot(hasUnread);
  }, [hasUnread]);
  useEffect(() => () => void setFaviconDot(false), []);

  return null;
}
