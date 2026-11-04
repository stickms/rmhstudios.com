/**
 * The seam between a multiplayer session and the game store: `MultiplayerDriver`s (store.ts) for each role,
 * and the binding that keeps the store attached to whichever session the connector currently has.
 *
 * A host drives `HostSession.step()` from the frame loop at the world's fixed 50 ms tick (the store's
 * `advance` hands it frame time; leftover time carries over) and its authoritative world IS the store's
 * world. A peer has nothing to step — it runs on the host's ticks as they arrive — and shows
 * `PeerSession.view`: the host-confirmed replica with the peer's own unacknowledged commands replayed on top.
 */

import type { HearthworksStore, LocalCommand, MultiplayerDriver } from '../store';
import { TICK_MS, type World, type WorldEvent } from '../world';
import type { HearthworksConnector, LobbySession } from './connector';
import type { HostSession } from './host';
import type { PeerSession } from './peer';

/** Frames longer than this many ticks (a hidden tab) drop the backlog instead of running a burst. */
const MAX_TICKS_PER_ADVANCE = 6;

export function hostDriver(host: HostSession): MultiplayerDriver {
  let acc = 0;
  return {
    playerId: host.hostId,
    world: () => host.world,
    send: (cmd: LocalCommand) => host.submit(cmd),
    advance(dtMs) {
      acc += Math.max(0, dtMs);
      const events: WorldEvent[] = [];
      let steps = 0;
      while (acc >= TICK_MS && steps < MAX_TICKS_PER_ADVANCE) {
        events.push(...host.step());
        acc -= TICK_MS;
        steps++;
      }
      if (steps === MAX_TICKS_PER_ADVANCE) acc = 0;
      return events;
    },
  };
}

export function peerDriver(peer: PeerSession): MultiplayerDriver {
  return {
    playerId: peer.myId,
    world: (): World | null => peer.view,
    send: (cmd: LocalCommand) => peer.send(cmd),
    advance: () => [],
  };
}

/** Keep the store on the connector's session: attach on start and on promotion, detach when it ends. */
export function bindConnectorToStore(connector: HearthworksConnector, store: HearthworksStore): () => void {
  const apply = (s: LobbySession) => {
    const st = store.getState();
    if (!s) st.detachDriver();
    else if (s.kind === 'host') st.attachDriver(hostDriver(s.host));
    else st.attachDriver(peerDriver(s.peer), { stash: true });
  };
  apply(connector.session);
  return connector.onSession(apply);
}
