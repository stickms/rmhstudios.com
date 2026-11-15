/**
 * Recently-played games/apps, tracked per device in localStorage. Powers the
 * home feed's "Jump back in" rail so returning users have a resume path across
 * ~20 games, the room-based apps, and the daily puzzles. Records are
 * self-contained (title + gradient captured at visit time) so the rail renders
 * without a catalog lookup or icon map.
 */

import { readJson, writeJson } from '@/lib/core/persist';
import { useEffect, useState } from 'react';

const KEY = 'rmh-recents';
const MAX = 8;

export interface RecentEntry {
  href: string;
  title: string;
  gradient: string;
  /** Thumbnail captured at visit time; falls back to `gradient` when absent. */
  image?: string;
  kind: 'game' | 'app';
  at: number;
}

export const RECENTS_EVENT = 'rmh:recents-changed';

function read(): RecentEntry[] {
  return readJson<RecentEntry[]>(KEY, [], { validate: (v) => (Array.isArray(v) ? (v as RecentEntry[]) : undefined) });
}

/** Record a visit (dedupes by href, most-recent first, capped at MAX). */
export function recordRecent(entry: Omit<RecentEntry, 'at'>) {
  const list = read().filter((e) => e.href !== entry.href);
  list.unshift({ ...entry, at: Date.now() });
  writeJson(KEY, list.slice(0, MAX));
  window.dispatchEvent(new Event(RECENTS_EVENT));
}

/** Reactive read of the recents list; refreshes on record + cross-tab writes. */
export function useRecents(): RecentEntry[] {
  const [recents, setRecents] = useState<RecentEntry[]>([]);
  useEffect(() => {
    const refresh = () => setRecents(read());
    refresh();
    window.addEventListener(RECENTS_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(RECENTS_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);
  return recents;
}
