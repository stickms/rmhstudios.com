/**
 * Is the coin-risking half of the site hidden from this member (self-excluded)?
 *
 * One tiny query, shared by every menu, list and shortcut that would otherwise link `/predictions` or the wagers
 * (`lib/economy/risk-surfaces.ts`). It is `false` signed out, before the answer arrives and on any failure, so the
 * server render and the first paint use the default lists and the shell never mismatches at hydration (as the layout
 * store's lists already do). Cool-off does not hide anything; only self-exclusion does.
 */
import { useEffect } from 'react';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useSession } from '@/components/session/session-context';
import { apiQuery } from '@/lib/contract/client';
import { getRiskSurfacesApi } from '@/lib/economy/play-limits.contract';

/** The query behind the hook. Its key is `[contract.path, null, null]`, like every `apiQuery`. */
export const riskSurfacesQuery = () => ({
  ...apiQuery(getRiskSurfacesApi),
  staleTime: 60_000,
  retry: false,
});

/**
 * Put the answer in the cache after the member changed a limit. The settings save already returns `surfacesHidden`,
 * so nothing is refetched (the endpoint's private cache header would let the browser answer a refetch with the old
 * value for up to a minute).
 */
export function setRiskSurfacesHidden(queryClient: QueryClient, hidden: boolean): void {
  queryClient.setQueryData(riskSurfacesQuery().queryKey, { hidden });
}

/** The name of the channel tabs of one browser use to tell each other that the member's play limits changed. */
export const PLAY_LIMITS_CHANNEL = 'rmh-play-limits';

type ChannelCtor = new (name: string) => BroadcastChannel;
const channelCtor = (): ChannelCtor | null =>
  typeof BroadcastChannel === 'function' ? (BroadcastChannel as ChannelCtor) : null;

/** One channel per tab, shared by every user of the hook and closed with the last one. */
let shared: { channel: BroadcastChannel; listeners: Set<(hidden: boolean) => void> } | null = null;

function readHidden(data: unknown): boolean | null {
  if (typeof data !== 'object' || data === null) return null;
  const hidden = (data as { hidden?: unknown }).hidden;
  return typeof hidden === 'boolean' ? hidden : null;
}

/**
 * Listen for another tab's save (S14-16). Reference-counted: the first caller opens the channel, the last release
 * closes it. It runs no timer, poll or observer and does nothing until a message arrives. A browser without
 * `BroadcastChannel` gets a no-op, and falls back to the query's stale time.
 */
export function listenForRiskSurfaces(onHidden: (hidden: boolean) => void): () => void {
  const Ctor = channelCtor();
  if (!Ctor) return () => undefined;
  if (!shared) {
    try {
      const channel = new Ctor(PLAY_LIMITS_CHANNEL);
      const listeners = new Set<(hidden: boolean) => void>();
      channel.onmessage = (event: MessageEvent) => {
        const hidden = readHidden(event.data);
        if (hidden !== null) for (const listener of listeners) listener(hidden);
      };
      shared = { channel, listeners };
    } catch {
      return () => undefined;
    }
  }
  const mine = shared;
  mine.listeners.add(onHidden);
  return () => {
    mine.listeners.delete(onHidden);
    if (mine.listeners.size === 0 && shared === mine) {
      shared = null;
      try {
        mine.channel.close();
      } catch {
        // already closed
      }
    }
  };
}

/** Tell the member's other tabs the answer after a successful save. Never throws; no channel, no message. */
export function announceRiskSurfaces(hidden: boolean): void {
  try {
    if (shared) {
      shared.channel.postMessage({ hidden });
      return;
    }
    const Ctor = channelCtor();
    if (!Ctor) return;
    const channel = new Ctor(PLAY_LIMITS_CHANNEL);
    channel.postMessage({ hidden });
    channel.close();
  } catch {
    // the other tabs fall back to the stale time
  }
}

export function useRiskSurfacesHidden(): boolean {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const signedIn = Boolean(session?.user);
  // One listener per tab while signed in; closed on unmount and at sign-out.
  useEffect(() => {
    if (!signedIn) return undefined;
    return listenForRiskSurfaces((hidden) => setRiskSurfacesHidden(queryClient, hidden));
  }, [signedIn, queryClient]);
  const { data } = useQuery({ ...riskSurfacesQuery(), enabled: signedIn });
  return signedIn && data?.hidden === true;
}
