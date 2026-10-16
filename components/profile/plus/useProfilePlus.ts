'use client';

import { useEffect, useState } from 'react';
import type { ProfilePlusView } from '@/lib/profile/plus';

/**
 * A member's public identity extras (`/api/profile/$id/plus`), fetched once per
 * page view and shared by everything that needs it — the /now and counter
 * modules and the DM header's local time. `undefined` while loading, `null`
 * when the request failed.
 */
const cache = new Map<string, Promise<ProfilePlusView | null>>();

function load(userId: string): Promise<ProfilePlusView | null> {
  let hit = cache.get(userId);
  if (!hit) {
    hit = fetch(`/api/profile/${encodeURIComponent(userId)}/plus`)
      .then((r) => (r.ok ? (r.json() as Promise<ProfilePlusView>) : null))
      .catch(() => null);
    cache.set(userId, hit);
    // A failed lookup must not stick for the rest of the session.
    void hit.then((v) => {
      if (v === null) cache.delete(userId);
    });
  }
  return hit;
}

/** Drop a cached entry — called after the member saves, so the profile re-reads. */
export function invalidateProfilePlus(userId: string): void {
  cache.delete(userId);
}

export function useProfilePlus(userId: string, enabled = true): ProfilePlusView | null | undefined {
  const [view, setView] = useState<ProfilePlusView | null | undefined>(undefined);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void load(userId).then((v) => {
      if (!cancelled) setView(v);
    });
    return () => {
      cancelled = true;
    };
  }, [userId, enabled]);
  return view;
}
