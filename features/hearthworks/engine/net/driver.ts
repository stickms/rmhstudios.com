/**
 * The seam between a multiplayer session and the game store: `MultiplayerDriver`s (store.ts) for each role,
 * and the binding that keeps the store attached to whichever session the connector currently has.
 *
 * A host drives `HostSession.step()` from the frame loop at the world's fixed 50 ms tick (the store's
 * `advance` hands it frame time; leftover time carries over) and its authoritative world IS the store's
 * world. A peer has nothing to step — it runs on the host's ticks as they arrive — and shows
 * `PeerSession.view`: the host-confirmed replica with the peer's own unacknowledged commands replayed on top.
 */

import type {
  HearthworksStore,
  LocalCommand,
  MultiplayerDriver,
} from '../store';
import {
  TICK_MS,
  type World,
  type WorldEvent,
} from '../world';
import type {
  HearthworksConnector,
  LobbySession,
} from './connector';
import type { HostSession } from './host';
import type { PeerSession } from './peer';
import { RemotePoses } from './poses';

const frameClock =
  () =>
    typeof performance !==
    'undefined'
      ? performance.now()
      : Date.now();

/** Frames longer than this many ticks (a hidden tab) drop the backlog instead of running a burst. */
const MAX_TICKS_PER_ADVANCE = 6;

export function hostDriver(
  host: HostSession,
  now: () => number = frameClock,
): MultiplayerDriver {
  let acc = 0;
  const poses =
    new RemotePoses(
      () =>
        host.hostId,
    );
  return {
    playerId:
      host.hostId,
    poses,
    world:
      () =>
        host.world,
    send: (
      cmd: LocalCommand,
    ) =>
      host.submit(
        cmd,
      ),
    advance(
      dtMs,
    ) {
      acc +=
        Math.max(
          0,
          dtMs,
        );
      const events: WorldEvent[] =
        [];
      let steps = 0;
      while (
        acc >=
          TICK_MS &&
        steps <
          MAX_TICKS_PER_ADVANCE
      ) {
        events.push(
          ...host.step(),
        );
        acc -=
          TICK_MS;
        steps++;
      }
      if (
        steps ===
        MAX_TICKS_PER_ADVANCE
      )
        acc = 0;
      poses.observe(
        host.world,
        now(),
      );
      // The world reports every player's refusals; this player's screen shows only its own (a peer's refused
      // command is told to that peer, not toasted at the host).
      return events.filter(
        (
          e,
        ) =>
          e.type !==
            'rejected' ||
          e.playerId ===
            host.hostId,
      );
    },
  };
}

export function peerDriver(
  peer: PeerSession,
  now: () => number = frameClock,
): MultiplayerDriver {
  const poses =
    new RemotePoses(
      () =>
        peer.myId,
    );
  return {
    playerId:
      peer.myId,
    poses,
    world:
      (): World | null =>
        peer.view,
    send: (
      cmd: LocalCommand,
    ) =>
      void peer.send(
        cmd,
      ),
    advance() {
      const view =
        peer.view;
      if (
        view
      )
        poses.observe(
          view,
          now(),
        );
      // The host's answers to this player's refused commands, as the same events the single-player sim emits.
      return peer.drainEvents();
    },
  };
}

/** Keep the store on the connector's session: attach on start and on promotion, detach when it ends. */
export function bindConnectorToStore(
  connector: HearthworksConnector,
  store: HearthworksStore,
): () => void {
  const apply =
    (
      s: LobbySession,
    ) => {
      const st =
        store.getState();
      if (
        !s
      )
        st.detachDriver();
      else if (
        s.kind ===
        'host'
      )
        st.attachDriver(
          hostDriver(
            s.host,
          ),
        );
      else
        st.attachDriver(
          peerDriver(
            s.peer,
          ),
          {
            stash: true,
          },
        );
    };
  apply(
    connector.session,
  );
  return connector.onSession(
    apply,
  );
}
