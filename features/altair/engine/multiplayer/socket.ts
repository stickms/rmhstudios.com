// =============================================================================
// ALTAIR MULTIPLAYER -- Socket.io Client Wrapper
// =============================================================================
// Manages the WebSocket connection to the unified socket server for Altair
// multiplayer. Uses the same server as all other games (port 7001).
// =============================================================================

import { singleFlight } from '@/lib/shared/realtime/single-flight';
import type { Socket } from 'socket.io-client';
import { createRealtimeClient, type RealtimeClient } from '@/lib/shared/realtime/client';
import type { RealtimeStatus } from '@/lib/shared/realtime/types';
import { authClient } from '@/lib/auth-client';
import { useAltairMultiplayerStore } from './store';
import { C2S, S2C } from './events';

// ── Module-Level Socket Reference ────────────────────────────────

let client: RealtimeClient | null = null;

/** The shared client's six states, folded onto the four the Altair store knows. */
function toStoreStatus(status: RealtimeStatus): AltairMultiplayerStatus {
  if (status === 'connected' || status === 'error') return status;
  // `reconnecting` stays `connecting`: the lobby UI has no separate state for it.
  return status === 'connecting' || status === 'reconnecting' ? 'connecting' : 'disconnected';
}
type AltairMultiplayerStatus = ReturnType<typeof useAltairMultiplayerStore.getState>['connectionStatus'];

// ── Connection ───────────────────────────────────────────────────

/**
 * Connect to the Altair multiplayer WebSocket server.
 * Gets the current auth session token, creates a Socket.io connection through the
 * shared realtime client, and sets up event listeners for state synchronization.
 */
async function connectToAltairInner(): Promise<Socket> {
  if (client) {
    // An existing client re-joins on connect; a second call only nudges a stalled one.
    client.reconnectNow();
    return client.socket;
  }

  const store = useAltairMultiplayerStore.getState();
  store.setConnectionStatus('connecting');

  const session = await authClient.getSession();
  const token = session?.data?.session?.token;
  if (!token) {
    store.setConnectionStatus('error');
    throw new Error('Not authenticated');
  }

  client = createRealtimeClient({
    name: 'Altair',
    url: import.meta.env.VITE_SOCKET_URL,
    path: '/socket/',
    auth: async () => {
      // Per attempt; the token from connect time stands in if the session read fails.
      const current = await authClient.getSession().catch(() => null);
      return { token: current?.data?.session?.token ?? token };
    },
    onStatus: (status) => useAltairMultiplayerStore.getState().setConnectionStatus(toStoreStatus(status)),
    onConnect: (socket, { isReconnect }) => {
      // A RE-connect while we hold a lobby: re-announce ourselves. Inside the hub's 10 s grace
      // this is a no-op reconnect; after it expired the hub already removed us, and this is how a
      // returning guest rejoins the running match (as their old class).
      const lobbyId = useAltairMultiplayerStore.getState().lobby?.lobbyId;
      if (isReconnect && lobbyId) socket.emit(C2S.LOBBY_JOIN, { lobbyId });
    },
    bind: bindHandlers,
  });

  return client.socket;
}

function bindHandlers(socket: Socket): void {
  // ── Lobby state sync ──────────────────────────────────────────

  socket.on(S2C.LOBBY_STATE_SNAPSHOT, (fullState) => {
    useAltairMultiplayerStore.getState().applyFullSync(fullState);
  });

  socket.on(S2C.LOBBY_KICKED, () => {
    useAltairMultiplayerStore.getState().leaveLobby();
  });

  socket.on(S2C.LOBBY_DISBANDED, () => {
    useAltairMultiplayerStore.getState().leaveLobby();
  });

  // ── Class selection ───────────────────────────────────────────

  socket.on(S2C.CLASS_SELECT_STATE, (data: {
    selections: Record<string, string | null>;
    readyStates: Record<string, boolean>;
  }) => {
    useAltairMultiplayerStore.getState().setClassSelections(data.selections, data.readyStates);
  });

  // ── Game lifecycle ────────────────────────────────────────────

  socket.on(S2C.GAME_COUNTDOWN, (data: { seconds: number | null }) => {
    useAltairMultiplayerStore.getState().setCountdown(data.seconds);
  });

  socket.on(S2C.GAME_STARTED, (data: { tick: number }) => {
    useAltairMultiplayerStore.getState().setGameStarted(data.tick);
  });

  // GAME_STATE_SNAPSHOT is deliberately NOT stored: 20 Hz of entity arrays would
  // re-render every store subscriber. The match screen listens to it directly and
  // feeds its own jitter buffer (MultiplayerGameScreen).

  socket.on(S2C.GAME_EVENT, (event) => {
    useAltairMultiplayerStore.getState().addGameEvent(event);
  });

  socket.on(S2C.GAME_PLAYER_JOINED, (data: { player: import('./types').AltairClientPlayer }) => {
    useAltairMultiplayerStore.getState().playerJoined(data.player);
  });

  socket.on(S2C.GAME_PLAYER_LEFT, (data: { userId: string }) => {
    useAltairMultiplayerStore.getState().playerLeft(data.userId);
  });

  socket.on(S2C.GAME_RESULTS, (results) => {
    useAltairMultiplayerStore.getState().setResults(results);
  });

  // ── Communication ─────────────────────────────────────────────

  socket.on(S2C.GAME_PING, (ping) => {
    useAltairMultiplayerStore.getState().addPing(ping);
  });

  socket.on(S2C.GAME_QUICK_CHAT, (chat) => {
    useAltairMultiplayerStore.getState().addQuickChat(chat);
  });

  // ── Errors ────────────────────────────────────────────────────

  socket.on(S2C.ERROR, (error: { code?: string; message?: string }) => {
    console.error(`[Altair] Server error [${error?.code}]: ${error?.message}`);
  });
}


/**
 * Get the current socket instance (may be null if not connected).
 */
export function getSocket(): Socket | null {
  return client?.socket ?? null;
}

/**
 * Disconnect from the Altair multiplayer server.
 */
export function disconnectFromAltair(): void {
  client?.destroy();
  client = null;
  useAltairMultiplayerStore.getState().reset();
}

/**
 * Emit an event to the server.
 */
export function emit(event: string, data?: unknown): void {
  client?.emit(event, data);
}

/** Concurrent callers share one in-flight connect (see single-flight.ts). */
export const connectToAltair = singleFlight(connectToAltairInner);
