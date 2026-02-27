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

console.log('[RMHbox] socket.ts module loaded');

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

  // Fetch auth session for socket authentication
  let token: string | undefined;
  try {
    const url = `${(process.env.NEXT_PUBLIC_BETTER_AUTH_URL || '').replace(/\/$/, '')}/api/auth/get-session`;
    console.log('[RMHbox] Fetching session from:', url);
    const res = await fetch(url, { credentials: 'include' });
    console.log('[RMHbox] Session response status:', res.status);
    if (res.ok) {
      const data = await res.json();
      console.log('[RMHbox] Session data keys:', Object.keys(data));
      token = data?.session?.token ?? data?.token;
      console.log('[RMHbox] Token found:', !!token);
    }
  } catch (err) {
    console.error('[RMHbox] Direct fetch failed, trying authClient:', err);
    const session = await authClient.getSession();
    console.log('[RMHbox] authClient session:', JSON.stringify(session?.data));
    token = session?.data?.session?.token;
  }
  if (!token) {
    store.setConnectionStatus('error');
    throw new Error('Not authenticated');
  }

  const serverUrl = process.env.NEXT_PUBLIC_RMHBOX_SOCKET_URL;

  socket = io(serverUrl, {
    path: '/rmhbox-ws/',
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

  socket.on(S2C.SPECTATOR_TARGET_STATE, (targetInfo: import('./types').SpectatorTargetInfo) => {
    useRMHboxStore.getState().setSpectatorTarget(targetInfo);
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

  // ─── Game Settings listeners (§12A) ───────────────────────────

  socket.on(S2C.GAME_SETTINGS_OPENED, (data: {
    minigameId: string;
    displayName: string;
    schema: import('./types').GameSettingsSchema;
    currentValues: import('./types').GameSettingValues;
    mode: 'direct' | 'post-vote';
  }) => {
    useRMHboxStore.getState().setGameSettingsState({
      minigameId: data.minigameId,
      displayName: data.displayName,
      schema: data.schema,
      currentValues: data.currentValues,
      mode: data.mode === 'post-vote' ? 'post-vote' : 'lobby',
    });
  });

  socket.on(S2C.GAME_SETTINGS_UPDATED, (data: {
    currentValues: import('./types').GameSettingValues;
  }) => {
    useRMHboxStore.getState().updateGameSettingsValues(data.currentValues);
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
