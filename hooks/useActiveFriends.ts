'use client';

import { useEffect, useState } from 'react';
import { useSession } from '@/components/Providers';
import { useIdleReady } from '@/hooks/useIdleReady';
import { pulseSnapshot, requestPulse, subscribePulse } from '@/lib/pulse';
import type { ActiveFriend } from '@/lib/presence-types';

/**
 * The viewer's online mutuals (§9).
 *
 * This used to run its own 60s poll against `/api/friends/active`. It now reads
 * the `activeFriends` section of the shared pulse (`lib/pulse.ts`) — same
 * server-side 15s cache behind it, but no request of its own, and the section is
 * only computed while a consumer is actually mounted. Still gated on signed-in +
 * browser-idle.
 */
export function useActiveFriends(enabled = true): {
  friends: ActiveFriend[] | null;
  refresh: () => void;
} {
  const { data: session } = useSession();
  const idle = useIdleReady();
  const [friends, setFriends] = useState<ActiveFriend[] | null>(
    () => pulseSnapshot().activeFriends as ActiveFriend[] | null,
  );

  useEffect(() => {
    if (!enabled || !session?.user || !idle) return;
    return subscribePulse(['activeFriends'], (data) =>
      setFriends(data.activeFriends as ActiveFriend[] | null),
    );
  }, [enabled, session?.user, idle]);

  return { friends, refresh: requestPulse };
}
