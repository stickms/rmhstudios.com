/**
 * Balatro multiplayer — the browser's connection to the games hub
 * (`balatro:*` events on the socket server, `/socket/`; contract:
 * lib/balatro/net/events.ts).
 *
 * The hub only signals, relays and keeps the seat directory: every game
 * message travels peer to peer. Lifecycle, backoff, wake signals and
 * per-attempt credentials come from the shared realtime client; this module
 * adds the typed, validated event surface the session runtime uses
 * (`HubLike`). Every S2C payload is parsed with the frozen schema before a
 * listener sees it (a buggy hub is still just data).
 *
 * Browser only (socket.io-client, the auth client).
 */

'use client';

import type { Socket } from 'socket.io-client';
import { authClient } from '@/lib/auth-client';
import { createRealtimeClient, type RealtimeClient } from '@/lib/shared/realtime/client';
import type { RealtimeStatus } from '@/lib/shared/realtime/types';
import { BALATRO_S2C, type BalatroS2CEvent, type BalatroS2CPayload } from '../net/events';
import type { HubLike, HubStatus } from './transport/types';

type Listener = (d: unknown) => void;

function mapStatus(s: RealtimeStatus): HubStatus {
  if (s === 'connected') return 'connected';
  if (s === 'connecting' || s === 'reconnecting') return 'connecting';
  return 'offline';
}

export function createHubClient(log?: (msg: string) => void): HubLike {
  const listeners = new Map<string, Set<Listener>>();
  const statusListeners = new Set<(s: HubStatus, info: { reconnect: boolean; reason?: string }) => void>();
  let status: HubStatus = 'connecting';
  let connectedOnce = false;
  let account: { id: string; name: string; avatarUrl: string | null } | null = null;

  const dispatch = (event: string, raw: unknown) => {
    const set = listeners.get(event);
    if (!set || set.size === 0) return;
    const schema = (BALATRO_S2C as Record<string, { safeParse(v: unknown): { success: boolean; data?: unknown } }>)[event];
    const parsed = schema?.safeParse(raw);
    if (!parsed?.success) {
      log?.(`[mp hub] dropped malformed ${event}`);
      return;
    }
    for (const fn of [...set]) {
      try {
        fn(parsed.data);
      } catch (err) {
        log?.(`[mp hub] ${event} listener failed: ${String(err)}`);
      }
    }
  };

  const bind = (socket: Socket) => {
    for (const event of Object.keys(BALATRO_S2C)) socket.on(event, (payload: unknown) => dispatch(event, payload));
  };

  const client: RealtimeClient = createRealtimeClient({
    name: 'BalatroMp',
    url: import.meta.env.VITE_SOCKET_URL,
    path: '/socket/',
    auth: async () => {
      const current = await authClient.getSession();
      const token = current?.data?.session?.token;
      return { token };
    },
    onStatus: (s, meta) => {
      status = mapStatus(s);
      const reconnect = status === 'connected' && connectedOnce;
      if (status === 'connected') connectedOnce = true;
      for (const fn of [...statusListeners]) fn(status, { reconnect, reason: meta.reason });
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
    on<K extends BalatroS2CEvent>(event: K, fn: (d: BalatroS2CPayload<K>) => void) {
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
      const user = current?.data?.user as { id?: string; name?: string; username?: string; image?: string | null } | undefined;
      if (!user?.id) return null;
      account = { id: user.id, name: (user.username || user.name || 'Player').slice(0, 64), avatarUrl: user.image ?? null };
      return account;
    },
    destroy() {
      listeners.clear();
      statusListeners.clear();
      client.destroy();
    },
  };
}
