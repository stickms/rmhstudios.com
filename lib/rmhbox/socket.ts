/**
 * RMHbox — Socket.io Client Wrapper
 *
 * Manages the WebSocket connection to the standalone RMHbox server.
 * Handles authentication, reconnection with exponential backoff,
 * connection state management, and global event routing to the
 * Zustand store.
 *
 * Reference: docs/rmhbox/design-spec/core.md §19
 * Implementation: docs/rmhbox/implementation/phase-4.md §5
 */

'use client';

import { io, Socket } from 'socket.io-client';
import { authClient } from '@/lib/auth-client';
import { useRMHboxStore } from './store';
import { S2C } from './events';
import { toast } from './toast-store';

// ─── Module-Level Socket Reference ──────────────────────────────

let socket: Socket | null = null;

// ─── Connection ─────────────────────────────────────────────────

/**
 * Connect to the RMHbox WebSocket server.
 *
 * Gets the current auth session token, creates a Socket.io connection,
 * and sets up all global event listeners for state synchronization.
 *
 * If an existing socket is alive but disconnected, it is torn down first
 * to prevent orphaned listeners from overwriting the connection status.
 *
 * The `auth` callback is dynamic so the session token is refreshed on
 * every reconnection attempt (handles token expiration during long AFK).
 *
 * @returns The connected Socket instance
 * @throws If no auth session is available
 */
export async function connectToRMHbox(): Promise<Socket> {
  // If already connected, return existing socket
  if (socket?.connected) return socket;

  // ── Tear down stale socket before creating a new one ────────
  // Without this, the old socket's reconnect/disconnect handlers
  // can overwrite the new socket's connection status.
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }

  const store = useRMHboxStore.getState();
  store.setConnectionStatus('connecting');

  // Verify the user is authenticated before attempting to connect
  const session = await authClient.getSession();
  const token = session?.data?.session?.token;
  if (!token) {
    store.setConnectionStatus('error');
    throw new Error('Not authenticated');
  }

  const serverUrl = process.env.NEXT_PUBLIC_RMHBOX_SOCKET_URL || 'http://localhost:7676';

  socket = io(serverUrl, {
    path: '/rmhbox/',
    // Dynamic auth: refreshes the session token on every (re)connection
    // attempt so expired tokens are replaced automatically.
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

  // ─── Connection lifecycle listeners ─────────────────────────
  socket.on('connect', () => {
    useRMHboxStore.getState().setConnectionStatus('connected');
  });

  socket.on('disconnect', (reason) => {
    // If server forced the disconnect, set error; otherwise we're reconnecting
    if (reason === 'io server disconnect' || reason === 'io client disconnect') {
      useRMHboxStore.getState().setConnectionStatus('disconnected');
    } else {
      useRMHboxStore.getState().setConnectionStatus('connecting');
    }
  });

  socket.on('connect_error', (err) => {
    // Auth-related failures won't resolve by retrying with the same session.
    if (err.message?.includes('auth') || err.message?.includes('token') || err.message?.includes('unauthorized')) {
      useRMHboxStore.getState().setConnectionStatus('error');
    }
  });

  // ─── State synchronization listeners ────────────────────────

  socket.on(S2C.LOBBY_STATE_SNAPSHOT, (fullState) => {
    useRMHboxStore.getState().applyFullSync(fullState);
  });

  socket.on(S2C.GAME_ACTION, (action) => {
    useRMHboxStore.getState().applyAction(action);
  });

  socket.on(S2C.GAME_STATE_SNAPSHOT, (gameState) => {
    useRMHboxStore.getState().setGameState(gameState);
  });

  socket.on(S2C.ERROR, (error: { code?: string; message?: string }) => {
    const code = error?.code ?? 'UNKNOWN';
    const message = error?.message ?? 'An unknown error occurred.';
    console.error(`[RMHbox] Server error [${code}]: ${message}`);
    toast.error(message);
  });

  // If the server tells us we're not in a lobby, clear stale local state
  socket.on(S2C.NOT_IN_LOBBY, () => {
    const store = useRMHboxStore.getState();
    if (store.lobby) {
      console.warn('[RMHbox] Server reports NOT_IN_LOBBY — clearing stale lobby state');
      store.leaveLobby();
    }
  });

  return socket;
}

// ─── Socket Access ──────────────────────────────────────────────

/**
 * Get the current socket instance (may be null if not connected).
 */
export function getSocket(): Socket | null {
  return socket;
}

// ─── Disconnect ─────────────────────────────────────────────────

/**
 * Disconnect from the RMHbox server and reset all state.
 */
export function disconnectFromRMHbox(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  useRMHboxStore.getState().reset();
}

// ─── Emit Helper ────────────────────────────────────────────────

/**
 * Emit an event to the server with null-safety check.
 */
export function emit(event: string, data?: unknown): void {
  if (!socket?.connected) {
    console.warn(`[RMHbox] Cannot emit "${event}" — not connected`);
    return;
  }
  socket.emit(event, data);
}
