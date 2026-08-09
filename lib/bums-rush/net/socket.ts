/**
 * Bum's Rush — the client connection singleton.
 *
 * Follows the repo convention (`lib/<app>/socket.ts`,
 * `connect…/get…Socket/disconnect…`) and builds on
 * `lib/shared/realtime/client`, which owns reconnect tuning, wake signals and
 * per-attempt credentials. What is Bum's Rush-specific lives here: a listener
 * registry other `net/` modules subscribe to before the socket exists, and the
 * stable per-tab client key that a held seat is re-attached to (§9.6).
 *
 * **Soft auth on purpose.** The hub allows anonymous sockets and §10.4 makes
 * signed-out play a first-class path — a party game that demands an account
 * before the first level is a party game most visitors never see. A session
 * token is sent when there is one, and the seat gets a `userId` then.
 *
 * SSR-safe: nothing here touches `window` at module scope. `connectBumsRush()`
 * is the first line that assumes a browser, and it is only ever called from an
 * effect.
 */

'use client';

import type { Socket } from 'socket.io-client';
import { authClient } from '@/lib/auth-client';
import { createRealtimeClient, type RealtimeClient } from '@/lib/shared/realtime/client';
import type { RealtimeStatus } from '@/lib/shared/realtime/types';
import { BR_S2C } from '../constants';

type Listener = (payload: never) => void;

let client: RealtimeClient | null = null;
let clientKey: string | null = null;

const listeners = new Map<string, Set<Listener>>();
const statusListeners = new Set<(status: RealtimeStatus) => void>();
let status: RealtimeStatus = 'idle';

/** Every server→client event, so `bind` can install one dispatcher per name. */
const S2C_EVENTS = Object.values(BR_S2C);

/**
 * A stable id for this tab, minted once and kept in `sessionStorage`.
 *
 * Socket ids change on every reconnect, so a held seat cannot be keyed to one
 * (§9.6's 90-second grace would never match anybody). `sessionStorage` rather
 * than `localStorage` deliberately: two tabs are two players at the same couch,
 * and sharing a key between them would have the second tab steal the first
 * one's seats.
 */
export function getClientKey(): string {
  if (clientKey) return clientKey;
  if (typeof window === 'undefined') return '';
  const KEY = 'rmh.bums-rush.clientKey';
  try {
    const existing = window.sessionStorage.getItem(KEY);
    if (existing) {
      clientKey = existing;
      return existing;
    }
  } catch {
    // Private mode / storage disabled. A per-load key still works for
    // everything except a reload mid-level, which is the rarer loss.
  }
  const bytes = new Uint8Array(12);
  const webCrypto = (globalThis as { crypto?: Crypto }).crypto;
  if (webCrypto?.getRandomValues) webCrypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  const key = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  clientKey = key;
  try {
    window.sessionStorage.setItem(KEY, key);
  } catch {
    /* see above */
  }
  return key;
}

/**
 * What the client tells the hub about this machine.
 *
 * Only ever used to break a tie in host election (§9.6) — a phone that claims
 * to be a desktop wins a coin flip it was already close to winning, so this
 * needs no verification. `pointer: coarse` with no fine pointer is the same
 * signal §12.1 uses to hide the couch-join prompt.
 */
export function detectDevice(): 'desktop' | 'mobile' | 'unknown' {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'unknown';
  try {
    if (window.matchMedia('(pointer: fine)').matches) return 'desktop';
    if (window.matchMedia('(pointer: coarse)').matches) return 'mobile';
  } catch {
    return 'unknown';
  }
  return 'unknown';
}

export async function connectBumsRush(): Promise<Socket> {
  if (client) {
    client.reconnectNow();
    return client.socket;
  }

  client = createRealtimeClient({
    name: 'BumsRush',
    url: import.meta.env.VITE_SOCKET_URL,
    path: '/socket/',
    auth: async () => {
      // Anonymous is a supported state; a missing session is not an error.
      try {
        const session = await authClient.getSession();
        const token = session?.data?.session?.token;
        return token ? { token } : {};
      } catch {
        return {};
      }
    },
    onStatus: (next) => {
      status = next;
      for (const listener of statusListeners) listener(next);
    },
    bind: (socket) => {
      for (const event of S2C_EVENTS) {
        socket.on(event, (...args: unknown[]) => {
          // Acknowledge immediately when the hub asked for one. `br:pong`
          // does: the round trip of that ack is how the SERVER measures this
          // client's RTT, and host election (§9.6) has to read a number the
          // client cannot choose for itself. Acking first also means a slow
          // listener never inflates the measurement.
          const last = args[args.length - 1];
          if (typeof last === 'function') (last as () => void)();

          const set = listeners.get(event);
          if (!set) return;
          const payload = args[0] as never;
          for (const listener of set) listener(payload);
        });
      }
    },
  });

  return client.socket;
}

/**
 * Subscribe to a server→client event. Safe before `connectBumsRush()`: the
 * registry outlives the socket, which is what lets `lobby.ts` wire itself up
 * during render and survive a reconnect without re-binding.
 */
export function onBumsRush<T>(event: string, listener: (payload: T) => void): () => void {
  let set = listeners.get(event);
  if (!set) {
    set = new Set();
    listeners.set(event, set);
  }
  const typed = listener as Listener;
  set.add(typed);
  return () => {
    set?.delete(typed);
  };
}

export function onBumsRushStatus(listener: (status: RealtimeStatus) => void): () => void {
  statusListeners.add(listener);
  listener(status);
  return () => {
    statusListeners.delete(listener);
  };
}

export function getBumsRushStatus(): RealtimeStatus {
  return status;
}

export function getBumsRushSocket(): Socket | null {
  return client?.socket ?? null;
}

/**
 * Send.
 *
 * `queue` holds an emit across a blip and is for intents that still mean the
 * same thing two seconds later — ready, a cosmetic change, a leave. **Never**
 * for `br:input` or `br:snapshot`: a stale frame delivered late is worse than
 * no frame, because the host de-duplicates by frame number and a guest
 * interpolates over the gap anyway.
 */
export function emitBumsRush(event: string, payload?: unknown, queue = false): boolean {
  if (!client) return false;
  return client.emit(event, payload, { queue });
}

export function reconnectBumsRushNow(): void {
  client?.reconnectNow();
}

export function disconnectBumsRush(): void {
  client?.destroy();
  client = null;
  listeners.clear();
  status = 'idle';
}
