'use client';

/**
 * GlobeSet — realtime client.
 *
 * Connection lifecycle, reconnect tuning and per-attempt credentials all
 * live in `lib/shared/realtime/client`; this module is only the event map
 * plus the store writes each message implies, and the outgoing verb list.
 *
 * The hub uses soft auth and GlobeSet plays along: a race is a synchronised
 * deal, not an owned save, so an anonymous racer is a first-class player
 * rather than one the socket refuses to open for. A session token is sent
 * when there is one and the server attaches a real `userId`; otherwise the
 * server races them under a per-connection guest id (see
 * `server/socket-server/handlers/globeset.ts`).
 */

import type { Socket } from 'socket.io-client';
import { toast } from 'sonner';
import { authClient } from '@/lib/auth-client';
import { createRealtimeClient, type RealtimeClient } from '@/lib/shared/realtime/client';
import { useGlobeSetRaceStore } from './race-store';
import { C2S, S2C } from './net/events';
import type {
  BoardPayload,
  FinalStanding,
  LiveStanding,
  LobbySnapshot,
  PublicLobbyInfo,
  RaceSettings,
  RaceSettingsPatch,
  RaceStartPayload,
  RejectReason,
} from './net/events';

let client: RealtimeClient | null = null;

const store = () => useGlobeSetRaceStore.getState();

/** Idempotent: a second call while already connected just nudges a reconnect. */
export async function connectToGlobeSetRace(): Promise<void> {
  if (client) {
    client.reconnectNow();
    return;
  }

  client = createRealtimeClient({
    name: 'GlobeSet',
    url: import.meta.env.VITE_SOCKET_URL,
    path: '/socket/',
    auth: async () => {
      // Anonymous is a supported state here, not an error — never throw.
      try {
        const session = await authClient.getSession();
        const token = session?.data?.session?.token;
        return token ? { token } : {};
      } catch {
        return {};
      }
    },
    onStatus: (status) => store().setStatus(status),
    bind: registerHandlers,
  });
}

export function disconnectFromGlobeSetRace(): void {
  client?.destroy();
  client = null;
  store().reset();
}

function registerHandlers(socket: Socket): void {
  socket.on(S2C.LOBBY, (lobby: LobbySnapshot) => store().setLobby(lobby));

  socket.on(S2C.BROWSE_RESULT, (payload: { lobbies: PublicLobbyInfo[] }) =>
    store().setBrowse(Array.isArray(payload?.lobbies) ? payload.lobbies : []),
  );

  socket.on(S2C.JOINED, (payload: { code: string; socketId: string }) =>
    store().setSelfId(payload.socketId),
  );

  socket.on(S2C.COUNTDOWN, (payload: RaceStartPayload) => store().setStart(payload));

  socket.on(S2C.BOARD, (payload: BoardPayload) => store().setBoard(payload));

  socket.on(S2C.REJECT, (payload: { reason: RejectReason }) => store().setReject(payload.reason));

  socket.on(S2C.STANDINGS, (payload: { standings: LiveStanding[] }) =>
    store().setStandings(Array.isArray(payload?.standings) ? payload.standings : []),
  );

  socket.on(S2C.RESULTS, (payload: { standings: FinalStanding[] }) =>
    store().setResults(Array.isArray(payload?.standings) ? payload.standings : []),
  );

  socket.on(S2C.KICKED, (payload: { reason: string }) => {
    store().reset();
    toast.error(payload?.reason || 'Removed from the race.');
  });

  socket.on(S2C.ERROR, (payload: { message: string }) => {
    const message = payload?.message || 'Something went wrong.';
    store().setError(message);
    toast.error(message);
  });
}

/**
 * Send. `queue` holds an emit across a blip, for intents that still mean
 * the same thing a few seconds later (ready, settings, a lobby action) —
 * never for `globeset:submit`, which is timed against the server's own clock
 * and should simply be retried by the player if it never lands.
 */
function emit(event: string, data?: unknown, queue = false): boolean {
  if (!client) return false;
  return client.emit(event, data, { queue });
}

export function createRoom(settings: Partial<RaceSettings> = {}): void {
  emit(C2S.CREATE, settings, true);
}

export function joinRoom(code: string): void {
  emit(C2S.JOIN, { code }, true);
}

export function quickplay(): void {
  emit(C2S.QUICKPLAY, {}, true);
}

export function browseRooms(): void {
  store().setBrowsing(true);
  emit(C2S.BROWSE, {});
}

export function leaveRoom(): void {
  emit(C2S.LEAVE, {}, true);
}

export function setReady(ready: boolean): void {
  emit(C2S.READY, { ready }, true);
}

export function updateSettings(partial: RaceSettingsPatch): void {
  emit(C2S.SETTINGS, partial, true);
}

export function startRace(): void {
  emit(C2S.START, {}, true);
}

export function rematch(): void {
  emit(C2S.REMATCH, {}, true);
}

export function submitGlobeSet(cards: number[]): void {
  emit(C2S.SUBMIT, { cards });
}

export function forfeitRace(): void {
  emit(C2S.FORFEIT, {}, true);
}

export function redeemTicket(ticket: string): void {
  emit(C2S.TICKET, { ticket }, true);
}
