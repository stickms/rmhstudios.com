/**
 * RMHbox — realtime client.
 *
 * Connection lifecycle, reconnect tuning, credential refresh and the wake
 * signals live in `lib/shared/realtime/client`; this file is the RMHbox event
 * map and its two credential paths.
 *
 * Reference: docs/rmhbox/design-spec/core.md §19
 * Implementation: docs/rmhbox/implementation/phase-4.md §5
 */

'use client';

import type { Socket } from 'socket.io-client';
import { authClient } from '@/lib/auth-client';
import { createRealtimeClient, type RealtimeClient } from '@/lib/shared/realtime/client';
import type { PeerWaitState } from '@/lib/shared/realtime/types';
import { useRMHboxStore } from './store';
import { S2C } from './events';
import { toast } from './toast-store';

let client: RealtimeClient | null = null;

const store = () => useRMHboxStore.getState();

export interface DiscordContext {
  channelId: string | null;
  guildId: string | null;
}

/**
 * Connect to the RMHbox server.
 *
 * Two credential paths. A `discordToken` (OAuth2 access token from the Discord
 * Embedded App SDK) authenticates an Activity player with no site login — if
 * the Discord account is linked, the server resolves the site identity itself.
 * Otherwise the Better Auth session token is used, re-read per attempt so a
 * reconnect after a refresh carries the current one.
 *
 * `discordContext` (voice channel + guild) lets the server put everyone in the
 * same voice chat into the same lobby.
 *
 * @throws If no credential is available.
 */
export async function connectToRMHbox(
  discordToken?: string,
  discordContext?: DiscordContext,
): Promise<Socket> {
  if (client) {
    client.reconnectNow();
    return client.socket;
  }

  if (!discordToken) {
    const session = await authClient.getSession();
    if (!session?.data?.session?.token) {
      store().setConnectionStatus('error');
      throw new Error('Not authenticated');
    }
  }

  client = createRealtimeClient({
    name: 'RMHbox',
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore — import.meta.env is Vite-only; this module never runs server-side
    url: import.meta.env.VITE_RMHBOX_SOCKET_URL,
    path: '/rmhbox-ws/',
    auth: async () => {
      if (discordToken) {
        // Stable for the Activity's lifetime, so no refresh to do.
        return {
          discordToken,
          channelId: discordContext?.channelId ?? undefined,
          guildId: discordContext?.guildId ?? undefined,
        };
      }
      const session = await authClient.getSession();
      return { token: session?.data?.session?.token };
    },
    onStatus: (status) => {
      store().setConnectionStatus(status);
      if (status === 'disconnected' || status === 'error') store().setPeersWaiting(null);
    },
    bind: registerHandlers,
  });

  return client.socket;
}

function registerHandlers(socket: Socket) {
  // ─── State sync ───────────────────────────────────────────────────────
  // The server re-associates a returning socket with its lobby slot by userId
  // (see server/rmhbox/reconnection.ts) and pushes a snapshot, so there is no
  // client-side re-join to do here.
  socket.on(S2C.LOBBY_STATE_SNAPSHOT, (fullState) => store().applyFullSync(fullState));
  socket.on(S2C.GAME_ACTION, (action) => store().applyAction(action));
  socket.on(S2C.GAME_STATE_SNAPSHOT, (gameState) => store().setGameState(gameState));

  socket.on(S2C.SPECTATOR_TARGET_STATE, (targetInfo: import('./types').SpectatorTargetInfo) =>
    store().setSpectatorTarget(targetInfo),
  );

  socket.on(S2C.PEERS_WAITING, (waiting: PeerWaitState | null) =>
    store().setPeersWaiting(waiting?.peers?.length ? waiting : null),
  );

  // ─── Errors ───────────────────────────────────────────────────────────
  socket.on(S2C.ERROR, (error: { code?: string; message?: string }) => {
    const code = error?.code ?? 'UNKNOWN';
    const message = error?.message ?? 'An unknown error occurred.';
    console.error(`[RMHbox] Server error [${code}]: ${message}`);
    // Opening the Activity outside a voice channel is an expected outcome of
    // voice auto-join, not something to interrupt the player about.
    if (code === 'NO_VOICE_CHANNEL') return;
    toast.error(message);
  });

  socket.on(S2C.NOT_IN_LOBBY, () => {
    if (store().lobby) {
      console.warn('[RMHbox] Server reports NOT_IN_LOBBY — clearing stale lobby state');
      store().leaveLobby();
    }
  });

  // ─── Game settings (§12A) ─────────────────────────────────────────────
  socket.on(
    S2C.GAME_SETTINGS_OPENED,
    (data: {
      minigameId: string;
      displayName: string;
      schema: import('./types').GameSettingsSchema;
      currentValues: import('./types').GameSettingValues;
      mode: 'direct' | 'post-vote';
    }) =>
      store().setGameSettingsState({
        minigameId: data.minigameId,
        displayName: data.displayName,
        schema: data.schema,
        currentValues: data.currentValues,
        mode: data.mode === 'post-vote' ? 'post-vote' : 'lobby',
      }),
  );

  socket.on(
    S2C.GAME_SETTINGS_UPDATED,
    (data: { currentValues: import('./types').GameSettingValues }) =>
      store().updateGameSettingsValues(data.currentValues),
  );
}

// ─── Access ─────────────────────────────────────────────────────────────────

export function getSocket(): Socket | null {
  return client?.socket ?? null;
}

export function reconnectNow(): void {
  client?.reconnectNow();
}

export function disconnectFromRMHbox(): void {
  client?.destroy();
  client = null;
  store().reset();
}

export function emit(event: string, data?: unknown, options?: { queue?: boolean }): boolean {
  if (!client) {
    console.warn(`[RMHbox] Cannot emit "${event}" — no connection`);
    return false;
  }
  return client.emit(event, data, options);
}
