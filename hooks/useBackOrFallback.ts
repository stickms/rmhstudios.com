'use client';

import { useCallback } from 'react';
import { useRouter } from '@tanstack/react-router';
import { previousEntryHref } from '@/lib/router/history-trail';

/**
 * "Back" that actually goes back, falling through to the link's own href when
 * there is nowhere to go back to.
 *
 * Every full-screen game and app corner control was a plain `<Link>` to a
 * catalog page wearing an ArrowLeft. So the arrow lied: arriving at a game from
 * `/explore`, a profile, or the game's own sub-screen and pressing back dropped
 * you at `/games` — past the page you came from, and in the sub-screen case out
 * of the game entirely rather than up one level to its menu. "Back" was really
 * "leave, and go to the catalog while you're at it".
 *
 * The reason those were links and not `history.back()` is that history-back is
 * only correct when there IS somewhere of ours to go back to. On a cold load — a
 * shared link, a new tab, a bookmark, a search result — the previous entry
 * belongs to another site (or does not exist), and `back()` would either leave
 * the site or do nothing at all.
 *
 * TanStack Router stamps `__TSR_index` into `history.state` on every navigation
 * it makes, so a non-zero index means this SPA session has its own prior entry
 * and back is safe. Index 0 (or no state at all) means we are the first entry —
 * this returns without preventing the default, so the `<Link>` it is attached to
 * navigates to its `to` as before.
 *
 * Usage is always `<Link to={somewhereSensible} onClick={goBack}>`: the href
 * stays the cold-load destination AND keeps the control a real, right-clickable
 * link. There is no fallback parameter here for that reason — the link carries
 * it.
 *
 * The check happens at CLICK time, not render time: it depends on `window`, and
 * the index changes as the visitor moves around without the control
 * re-rendering.
 */
export function useBackOrFallback() {
  const router = useRouter();

  return useCallback(
    (event?: { preventDefault: () => void }) => {
      const index = (window.history.state as { __TSR_index?: number } | null)?.__TSR_index ?? 0;
      if (index <= 0) return; // first entry — let the <Link> navigate normally
      event?.preventDefault();
      router.history.back();
    },
    [router],
  );
}

/**
 * "Back to <named page>": steps back through history only when the previous entry IS
 * that page, and otherwise follows the link to it.
 *
 * {@link useBackOrFallback} is right for a corner arrow that just says "back". A control
 * that names its destination ("TF2 Hub", "Workshop") is an up link, and stepping back
 * from it can contradict its label: open a HUD from the workshop, then the HUD editor,
 * and the editor's "TF2 Hub" arrow took you back to the HUD. Stepping back when it does
 * land on the named page keeps that page's scroll position and doesn't grow the
 * history; when it doesn't, the `<Link>` navigates to `to`.
 *
 * Usage: `<Link to={href} onClick={useBackTo(href)}>`. `href` is compared as path +
 * search, so pass it the same way the link does.
 */
export function useBackTo(href: string) {
  const router = useRouter();

  return useCallback(
    (event?: { preventDefault: () => void }) => {
      if (previousEntryHref() !== href) return; // not the named page — let the <Link> navigate
      event?.preventDefault();
      router.history.back();
    },
    [router, href],
  );
}
