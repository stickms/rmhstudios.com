'use client';

import { useEffect } from 'react';

/**
 * How many rows a keyed panel showed last time, so the next open can reserve
 * that much space before its data arrives.
 *
 * ## The problem this solves
 *
 * A menu that fetches on open renders a one-line "Loading…" note, animates
 * itself to that height, and then jumps to six rows when the response lands.
 * The animation is not at fault — the BOX changed under it. Waiting for the
 * data before opening would fix it and is not an option: that is a menu that
 * doesn't respond to being clicked.
 *
 * So the size has to be predicted, and there are two good sources for the
 * guess, in order:
 *
 * 1. **What it was last time.** Exact, from the second open onward, and it
 *    self-corrects: an inbox that empties reserves less next time.
 * 2. **The cap the panel already declares.** Every one of these previews is
 *    bounded — `?limit=6`, `.slice(0, 6)` — so the first open has a real number
 *    to use rather than a guess, and it is the same number the panel will be
 *    showing a moment later.
 *
 * Zero is remembered like any other count: an empty inbox reserves the empty
 * note's height instead of rows, so that case is stable too.
 *
 * ## Why a module-level Map and not state
 *
 * The value must NOT change during an open — a reservation that re-rendered
 * itself smaller the instant the data arrived would be the jump it exists to
 * prevent. So it is read once per mount, plain, and written back in an effect;
 * the panel unmounts on close, and the next open reads the new number. It is
 * deliberately per-session rather than persisted: a stale count from a previous
 * visit is a worse guess than the declared cap, and this costs one integer.
 *
 * ```tsx
 * const rows = useReservedRows('notifications', data ? items.length : null, 6);
 * …
 * {!data ? <QuickPanelSkeleton rows={rows} label={t('loading', …)} /> : items.map(…)}
 * ```
 *
 * @param key      Stable id for the panel — one entry per menu.
 * @param loaded   The real row count once it is known, or `null` while loading.
 * @param fallback What to reserve on the first open. Use the panel's own cap.
 */
export function useReservedRows(key: string, loaded: number | null, fallback: number): number {
  useEffect(() => {
    if (loaded !== null) lastSeen.set(key, loaded);
  }, [key, loaded]);

  return lastSeen.get(key) ?? fallback;
}

const lastSeen = new Map<string, number>();
