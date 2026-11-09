/**
 * Hearthworks multiplayer — the browser's connection to the games hub (`hearthworks:p2p:*` events on the
 * socket server, `/socket/`; contract: ./events.ts).
 *
 * The hub only signals and relays: every command and tick travels peer to peer. This file binds the shared
 * implementation (./hub-client-core.ts) to the site's environment: the Better Auth session for the token and
 * the account, and `VITE_SOCKET_URL` for the origin.
 *
 * Browser only (the auth client). Imported lazily (./lobby.ts) so the page does not pay for a socket until
 * somebody opens multiplayer.
 */

import { authClient } from '@/lib/auth-client';
import type { HubLike } from './connector';
import { createHubClientWith } from './hub-client-core';

export function createHubClient(log?: (msg: string) => void): HubLike {
  return createHubClientWith({
    url: import.meta.env.VITE_SOCKET_URL,
    path: '/socket/',
    token: async () => (await authClient.getSession())?.data?.session?.token,
    account: async () => {
      const current = await authClient.getSession();
      const user = current?.data?.user as { id?: string; name?: string; username?: string } | undefined;
      if (!user?.id) return null;
      return { id: user.id, name: (user.username || user.name || 'Player').slice(0, 64) };
    },
    log,
  });
}
