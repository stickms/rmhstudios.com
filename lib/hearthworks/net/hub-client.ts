/**
 * Hearthworks multiplayer — the browser's connection to the games hub (`hearthworks:p2p:*` events on the
 * socket server, `/socket/`; contract: ./events.ts).
 *
 * The hub only signals and relays: every command and tick travels peer to peer. Lifecycle, backoff, wake
 * signals and per-attempt credentials come from the shared realtime client; this module adds the typed,
 * validated event surface the connector uses (`HubLike`). Every S2C payload is parsed with the shared schema
 * before a listener sees it (a buggy hub is still just data).
 *
 * Browser only (socket.io-client, the auth client). Imported lazily (./lobby.ts) so the page does not pay
 * for a socket until somebody opens multiplayer.
 */

'use client';

import type { Socket } from 'socket.io-client';
import { authClient } from '@/lib/auth-client';
import { createRealtimeClient, type RealtimeClient } from '@/lib/shared/realtime/client';
import type { RealtimeStatus } from '@/lib/shared/realtime/types';
import type { HubLike, HubStatus } from './connector';
import { HW_S2C_EVENTS, parseS2C, type HwS2CEvent, type HwS2CPayload } from './events';

type Listener = (d: unknown) => void;

function mapStatus(s: RealtimeStatus): HubStatus {
  if (s === 'connected') return 'connected';
  if (s === 'connecting' || s === 'reconnecting') return 'connecting';
  return 'offline';
}

export function createHubClient(log?: (msg: string) => void): HubLike {
  const listeners = new Map<string, Set<Listener>>();
  const statusListeners = new Set<(s: HubStatus, info: { reconnect: boolean }) => void>();
  let status: HubStatus = 'connecting';
  let connectedOnce = false;
  let account: { id: string; name: string } | null = null;

  const dispatch = (event: HwS2CEvent, raw: unknown) => {
    const set = listeners.get(event);
    if (!set || set.size === 0) return;
    const parsed = parseS2C(event, raw);
    if (parsed === null) {
      log?.(`[hearthworks hub] dropped malformed ${event}`);
      return;
    }
    for (const fn of [...set]) {
      try {
        fn(parsed);
      } catch (err) {
        log?.(`[hearthworks hub] ${event} listener failed: ${String(err)}`);
      }
    }
  };

  const bind = (socket: Socket) => {
    for (const event of Object.values(HW_S2C_EVENTS)) socket.on(event, (payload: unknown) => dispatch(event, payload));
  };

  const client: RealtimeClient = createRealtimeClient({
    name: 'HearthworksMp',
    url: import.meta.env.VITE_SOCKET_URL,
    path: '/socket/',
    auth: async () => {
      const current = await authClient.getSession();
      const token = current?.data?.session?.token;
      return { token };
    },
    onStatus: (s) => {
      status = mapStatus(s);
      const reconnect = status === 'connected' && connectedOnce;
      if (status === 'connected') connectedOnce = true;
      for (const fn of [...statusListeners]) fn(status, { reconnect });
    },
    bind,
  });

  return {
    get status() {
      return status;
    },
    emit(event, data) {
      client.emit(event, data);
    },
    on<K extends HwS2CEvent>(event: K, fn: (d: HwS2CPayload<K>) => void) {
      let set = listeners.get(event);
      if (!set) listeners.set(event, (set = new Set()));
      set.add(fn as Listener);
      return () => void set.delete(fn as Listener);
    },
    onStatus(fn) {
      statusListeners.add(fn);
      return () => void statusListeners.delete(fn);
    },
    async account() {
      if (account) return account;
      const current = await authClient.getSession();
      const user = current?.data?.user as { id?: string; name?: string; username?: string } | undefined;
      if (!user?.id) return null;
      account = { id: user.id, name: (user.username || user.name || 'Player').slice(0, 64) };
      return account;
    },
    destroy() {
      listeners.clear();
      statusListeners.clear();
      client.destroy();
    },
  };
}
