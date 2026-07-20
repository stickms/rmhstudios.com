'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from '@/components/Providers';
import { useIdleReady } from '@/hooks/useIdleReady';
import type { ActiveFriend } from '@/lib/presence-types';

/**
 * Fetches the viewer's online mutuals (§9) from /api/friends/active. The GET is
 * 15s-cached server-side, so a light 60s poll keeps the rail fresh without
 * hammering the DB (socket-driven `presence:changed` updates are the follow-up
 * that replaces the poll). Only runs signed-in and after the browser is idle.
 */
export function useActiveFriends(enabled = true): {
  friends: ActiveFriend[] | null;
  refresh: () => void;
} {
  const { data: session } = useSession();
  const idle = useIdleReady();
  const [friends, setFriends] = useState<ActiveFriend[] | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/friends/active', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setFriends((data.friends as ActiveFriend[]) ?? []);
      }
    } catch {
      // decorative surface — ignore
    }
  }, []);

  useEffect(() => {
    if (!enabled || !session?.user || !idle) return;
    void load();
    const interval = setInterval(load, 60_000);
    return () => clearInterval(interval);
  }, [enabled, session?.user, idle, load]);

  return { friends, refresh: load };
}
