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
import { ensureTrailingSlash } from '@/lib/url';
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
 * Pass a `discordToken` (OAuth2 access token from the Discord Embedded App SDK)
 * to authenticate via Discord Activity without requiring a site login.
 * If the Discord account is linked to a site account, that account's identity
 * is used automatically on the server. Without a discordToken, falls back to
 * the Better Auth session token for users already logged in to the site.
 *
 * If an existing socket is alive but disconnected, it is torn down first
 * to prevent orphaned listeners from overwriting the connection status.
 *
 * Pass `discordContext` (voice channel + guild from the Discord SDK) to enable
 * auto-connecting everyone in the same voice chat to the same lobby.
 *
 * @returns The connected Socket instance
 * @throws If no auth credential is available
 */
export async function connectToRMHbox(
  discordToken?: string,
  discordContext?: { channelId: string | null; guildId: string | null },
): Promise<Socket> {
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

  // Resolve credentials: Discord token takes priority over session token
  let fallbackToken: string | undefined;
  if (!discordToken) {
    const session = await authClient.getSession();
    fallbackToken = session?.data?.session?.token;
    if (!fallbackToken) {
      store.setConnectionStatus('error');
      throw new Error('Not authenticated');
    }
  }

  // @ts-ignore — import.meta.env is Vite-only; this file is never executed server-side
  const serverUrl = ensureTrailingSlash(import.meta.env.VITE_RMHBOX_SOCKET_URL);

  socket = io(serverUrl, {
    path: '/rmhbox-ws/',
    auth: (cb) => {
      if (discordToken) {
        // Discord Activity: token is stable for the session lifetime.
        // Include voice-channel context so the server can auto-connect
        // everyone in the same voice chat to the same lobby.
        cb({
          discordToken,
          channelId: discordContext?.channelId ?? undefined,
          guildId: discordContext?.guildId ?? undefined,
        });
      } else {
        // Site login: refresh the session token on every reconnection attempt
        authClient
          .getSession()
          .then((s) => cb({ token: s?.data?.session?.token ?? fallbackToken }))
          .catch(() => cb({ token: fallbackToken }));
      }
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
    // NO_VOICE_CHANNEL is an expected, silent outcome of voice-channel auto-join
    // (user opened the Activity without a voice channel) — don't toast it.
    if (code === 'NO_VOICE_CHANNEL') return;
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
