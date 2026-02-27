// =============================================================================
// ALTAIR MULTIPLAYER -- Socket.io Client Wrapper
// =============================================================================
// Manages the WebSocket connection to the unified socket server for Altair
// multiplayer. Uses the same server as all other games (port 7001).
// =============================================================================

'use client';

import { io, Socket } from 'socket.io-client';
import { authClient } from '@/lib/auth-client';
import { useAltairMultiplayerStore } from './store';
import { S2C } from './events';

// ── Module-Level Socket Reference ────────────────────────────────

let socket: Socket | null = null;

// ── Connection ───────────────────────────────────────────────────

/**
 * Connect to the Altair multiplayer WebSocket server.
 * Gets the current auth session token, creates a Socket.io connection,
 * and sets up event listeners for state synchronization.
 */
export async function connectToAltair(): Promise<Socket> {
  if (socket?.connected) return socket;

  // Tear down stale socket
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }

  const store = useAltairMultiplayerStore.getState();
  store.setConnectionStatus('connecting');

  const session = await authClient.getSession();
  const token = session?.data?.session?.token;
  if (!token) {
    store.setConnectionStatus('error');
    throw new Error('Not authenticated');
  }

  const serverUrl = process.env.NEXT_PUBLIC_SOCKET_URL;

  socket = io(serverUrl, {
    path: '/socket/',
    auth: (cb) => {
      authClient
        .getSession()
        .then((s) => cb({ token: s?.data?.session?.token ?? token }))
        .catch(() => cb({ token }));
    },
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
    timeout: 10000,
  });

  // ── Connection lifecycle ──────────────────────────────────────

  socket.on('connect', () => {
    useAltairMultiplayerStore.getState().setConnectionStatus('connected');
  });

  socket.on('disconnect', (reason) => {
    if (reason === 'io server disconnect' || reason === 'io client disconnect') {
      useAltairMultiplayerStore.getState().setConnectionStatus('disconnected');
    } else {
      useAltairMultiplayerStore.getState().setConnectionStatus('connecting');
    }
  });

  socket.on('connect_error', (err) => {
    if (err.message?.includes('auth') || err.message?.includes('token') || err.message?.includes('unauthorized')) {
      useAltairMultiplayerStore.getState().setConnectionStatus('error');
    }
  });

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

  socket.on(S2C.GAME_COUNTDOWN, (data: { seconds: number }) => {
    useAltairMultiplayerStore.getState().setCountdown(data.seconds);
  });

  socket.on(S2C.GAME_STARTED, (data: { tick: number }) => {
    useAltairMultiplayerStore.getState().setGameStarted(data.tick);
  });

  socket.on(S2C.GAME_STATE_SNAPSHOT, (snapshot) => {
    useAltairMultiplayerStore.getState().setGameSnapshot(snapshot);
  });

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

  // ── Visibility change (tab return) ────────────────────────────

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && socket && !socket.connected) {
        socket.connect();
      }
    });
  }

  return socket;
}

/**
 * Get the current socket instance (may be null if not connected).
 */
export function getSocket(): Socket | null {
  return socket;
}

/**
 * Disconnect from the Altair multiplayer server.
 */
export function disconnectFromAltair(): void {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
  useAltairMultiplayerStore.getState().reset();
}

/**
 * Emit an event to the server.
 */
export function emit(event: string, data?: unknown): void {
  if (socket?.connected) {
    socket.emit(event, data);
  }
}
