/**
 * The live lobby for the running game: one `HearthworksConnector` over the real hub and real WebRTC, wired
 * to the game store, created the first time somebody opens multiplayer (so a single-player session never
 * opens a socket). React reads it through `useLobby`.
 *
 * Browser only.
 */

import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';
import { webrtcConnector } from '../../shared/p2p/connector';
import { hearthworksStore } from '../store';
import { HearthworksConnector, type LobbyState } from './connector';
import { bindConnectorToStore } from './driver';

const idle: LobbyState = { phase: 'idle', role: null, code: null, roomName: null, error: null, me: null, players: [], rooms: [] };
const lobbyStore = createStore<{ lobby: LobbyState }>(() => ({ lobby: idle }));

let connector: HearthworksConnector | null = null;
let creating: Promise<HearthworksConnector> | null = null;

/** The connector, created (and the hub socket opened) on first use. */
export function ensureLobby(): Promise<HearthworksConnector> {
  if (connector) return Promise.resolve(connector);
  creating ??= import('./hub-client').then(({ createHubClient }) => {
    const c = new HearthworksConnector({ hub: createHubClient(), peers: webrtcConnector() });
    bindConnectorToStore(c, hearthworksStore);
    c.subscribe(() => lobbyStore.setState({ lobby: c.state }));
    lobbyStore.setState({ lobby: c.state });
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
