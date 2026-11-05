/**
 * The live lobby for the running game: one `HearthworksConnector` over the real hub and real WebRTC, wired
 * to the game store, created the first time somebody opens multiplayer (so a single-player session never
 * opens a socket). React reads it through `useLobby`.
 *
 * Browser only.
 */

import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';
import { realScheduler, webrtcConnector } from '../../shared/p2p/connector';
import { hearthworksStore } from '../store';
import { HearthworksConnector, type LobbyState } from './connector';
import { createBackgroundPump } from './background';
import { bindConnectorToStore } from './driver';

const idle: LobbyState = { phase: 'idle', role: null, code: null, roomName: null, locked: false, error: null, me: null, players: [], rooms: [] };
const lobbyStore = createStore<{ lobby: LobbyState }>(() => ({ lobby: idle }));

let connector: HearthworksConnector | null = null;
let creating: Promise<HearthworksConnector> | null = null;

/**
 * A hosted world must not freeze for everyone when the host switches tabs (a hidden tab gets no animation
 * frames): while hosting and hidden, step it from a timer (./background.ts).
 */
function keepHostedWorldRunning(c: HearthworksConnector): void {
  if (typeof document === 'undefined') return;
  const sched = realScheduler();
  const pump = createBackgroundPump({
    advance: (dtMs) => hearthworksStore.getState().advance(dtMs),
    now: () => sched.mono(),
    every: (ms, fn) => sched.every(ms, fn),
  });
  const sync = () => {
    if (document.hidden && c.state.role === 'host' && c.session?.kind === 'host') pump.start();
    else pump.stop();
  };
  document.addEventListener('visibilitychange', sync);
  c.subscribe(sync);
}

/** The connector, created (and the hub socket opened) on first use. */
export function ensureLobby(): Promise<HearthworksConnector> {
  if (connector) return Promise.resolve(connector);
  creating ??= import('./hub-client').then(({ createHubClient }) => {
    const c = new HearthworksConnector({ hub: createHubClient(), peers: webrtcConnector() });
    bindConnectorToStore(c, hearthworksStore);
    c.subscribe(() => lobbyStore.setState({ lobby: c.state }));
    lobbyStore.setState({ lobby: c.state });
    keepHostedWorldRunning(c);
    connector = c;
    return c;
  });
  return creating;
}

/** Leave whatever session there is (a host hands the world to its successor). A no-op when never opened. */
export function leaveLobby(): void {
  connector?.leave();
}

export function useLobby(): LobbyState {
  return useStore(lobbyStore, (s) => s.lobby);
}
