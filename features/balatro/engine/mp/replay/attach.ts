/**
 * WS13's extension of the session runtime: replays and spectating.
 *
 * index.ts loads this module through `import.meta.glob` (like WS12's
 * queue/attach.ts) and calls `attach(runtime)`; the returned function detaches
 * it when the session stops. It creates the session's `ReplayService` on the
 * IndexedDB store (in-memory where IndexedDB is unavailable) and installs it as
 * the runtime's `replayTap`, which the lobby roles call for relayed `log`
 * frames, a spectator's catch-up and the watched match.
 *
 * Browser-free apart from the default store (MP chunk, zod-free).
 */

import type { MpRuntime } from '../lobby/runtime';
import type { PeerKind } from '../wire';
import { ReplayService } from './service';
import { idbReplayStore, memoryReplayStore, type ReplayStore } from './store';

export function attach(runtime: MpRuntime, store?: ReplayStore): () => void {
  const { deps } = runtime;
  const service = new ReplayService({
    bridge: deps.bridge,
    hub: deps.hub,
    sched: deps.sched,
    store: store ?? idbReplayStore() ?? memoryReplayStore(),
    me: () => runtime.me,
    current: () => {
      if (runtime.client) return { match: runtime.client.match, practice: false };
      if (runtime.practice) return { match: runtime.practice.client.match, practice: true };
      return null;
    },
    sendOwn: (d) => runtime.role?.sendPeer('log' as PeerKind, d as never, '*'),
    log: (m, e) => deps.log(m, e),
  });
  runtime.replayTap = service;
  return () => {
    if (runtime.replayTap === service) runtime.replayTap = null;
    service.stop();
  };
}
