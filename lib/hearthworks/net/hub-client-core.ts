/**
 * The browser's connection to the games hub, with its environment injected: the hub URL, how to get the
 * session token, and who the signed-in account is. `./hub-client.ts` supplies the real ones (the auth client,
 * the Vite env); the real-browser e2e (testing/hearthworks-e2e) supplies a fake session lookup — so the code
 * under test is THIS file, the real shared realtime client and the real socket.io, not a stand-in.
 *
 * Lifecycle, backoff, wake signals and per-attempt credentials come from the shared realtime client; this
 * module adds the typed, validated event surface the connector uses (`HubLike`). Every S2C payload is parsed
 * with the shared schema before a listener sees it (a buggy hub is still just data).
 */

import type { Socket } from 'socket.io-client';
import { createRealtimeClient, type RealtimeClient } from '../../shared/realtime/client';
import type { RealtimeStatus } from '../../shared/realtime/types';
import type { HubLike, HubStatus } from './connector';
import { HW_S2C_EVENTS, parseS2C, type HwS2CEvent, type HwS2CPayload } from './events';

type Listener = (d: unknown) => void;

export interface HubClientDeps {
  /** The hub's origin (`VITE_SOCKET_URL`). */
  url: string | undefined;
  /** socket.io mount path; the production default is `/socket/`. */
  path?: string;
  /** The session token sent with every connection attempt (re-read on every retry). */
  token: () => Promise<string | undefined> | string | undefined;
  /** The signed-in account, or null when signed out. */
  account: () => Promise<{ id: string; name: string } | null>;
  log?: (msg: string) => void;
}

function mapStatus(s: RealtimeStatus): HubStatus {
  if (s === 'connected') return 'connected';
  if (s === 'connecting' || s === 'reconnecting') return 'connecting';
  return 'offline';
}

export function createHubClientWith(deps: HubClientDeps): HubLike {
  const { log } = deps;
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
    for (const event of Object.values(HW_S2C_EVENTS)) {
      socket.on(event, (payload: unknown, ack?: unknown) => {
        // The hub's liveness probe is answered by the library, here, with no app code in between: a tab whose
        // JavaScript is frozen answers nothing, which is the whole point.
        if (event === 'hearthworks:p2p:probe' && typeof ack === 'function') (ack as () => void)();
        dispatch(event, payload);
      });
    }
  };

  const client: RealtimeClient = createRealtimeClient({
    name: 'HearthworksMp',
    url: deps.url,
    path: deps.path ?? '/socket/',
    auth: async () => {
      const token = await deps.token();
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
      account = await deps.account();
      return account;
    },
    destroy() {
      listeners.clear();
      statusListeners.clear();
      client.destroy();
    },
  };
}
