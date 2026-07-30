/**
 * Laundry Sort — realtime client.
 *
 * Connection lifecycle, reconnect tuning and credential refresh all live in
 * `lib/shared/realtime/client`; this module is only the Laundry Sort event map
 * plus the store writes each message implies.
 *
 * The hub uses soft auth, but Laundry Sort's multiplayer is signed-in only —
 * matches write to a leaderboard, so an anonymous seat would be a hole in it.
 * We therefore fail fast without a session rather than opening a socket the
 * server will refuse to seat.
 */

'use client';

import type { Socket } from 'socket.io-client';
import { authClient } from '@/lib/auth-client';
import { createRealtimeClient, type RealtimeClient } from '@/lib/shared/realtime/client';
import { useLaundryStore } from '../store';
import { C2S, S2C } from './events';
import type {
  LiveScore,
  LobbySnapshot,
  MatchResults,
  MatchStartPayload,
  PublicLobbyInfo,
  ScoreReport,
} from './events';

let client: RealtimeClient | null = null;
/** Room to re-join after a drop — the server keys seats by socket id. */
let pendingCode: string | null = null;

const store = () => useLaundryStore.getState();

export async function connectLaundry(): Promise<Socket> {
  if (client) {
    client.reconnectNow();
    return client.socket;
  }

  const session = await authClient.getSession();
  if (!session?.data?.session?.token) {
    store().setConnection('error');
    throw new Error('Not authenticated');
  }

  client = createRealtimeClient({
    name: 'LaundrySort',
    url: import.meta.env.VITE_SOCKET_URL,
    path: '/socket/',
    auth: async () => {
      const current = await authClient.getSession();
      return { token: current?.data?.session?.token };
    },
    onStatus: (status) => store().setConnection(status),
    onConnect: (socket) => {
      store().setSelfSocketId(socket.id ?? null);
      // A reconnect means a new socket id, so the lobby has forgotten us.
      const code = store().lobby?.code ?? pendingCode;
      if (code) socket.emit(C2S.JOIN, { code });
    },
    bind: registerHandlers,
  });

  return client.socket;
}

function registerHandlers(socket: Socket): void {
  socket.on(S2C.LOBBY, (lobby: LobbySnapshot) => {
    pendingCode = lobby.code;
    const s = store();
    s.setLobby(lobby);
    s.setError(null);
    // The server is the authority on which screen a lobby member belongs on,
    // so a late joiner or a reconnecting player lands in the right place
    // without the client guessing.
    if (lobby.state === 'waiting' && s.screen !== 'results') s.setScreen('lobby');
  });

  socket.on(S2C.JOINED, (data: { code: string; socketId: string }) => {
    pendingCode = data.code;
    const s = store();
    s.setSelfSocketId(data.socketId);
    s.setMode('versus');
    s.setScreen('lobby');
  });

  socket.on(S2C.BROWSE_RESULT, (lobbies: PublicLobbyInfo[]) =>
    store().setPublicLobbies(Array.isArray(lobbies) ? lobbies : []),
  );

  socket.on(S2C.COUNTDOWN, (data: { seconds: number }) => store().setCountdown(data.seconds));

  socket.on(S2C.START, (payload: MatchStartPayload) => {
    const s = store();
    s.setCountdown(null);
    s.setResults(null);
    s.setLiveScores([]);
    s.setStart(payload);
    s.setScreen('playing');
  });

  socket.on(S2C.SCORES, (scores: LiveScore[]) =>
    store().setLiveScores(Array.isArray(scores) ? scores : []),
  );

  socket.on(S2C.RESULTS, (results: MatchResults) => {
    const s = store();
    s.setResults(results);
    s.setScreen('results');
  });

  socket.on(S2C.HOST_CHANGED, () => {
    // The lobby snapshot that follows carries the new host; nothing to do but
    // let it arrive. Kept as an explicit no-op so the event is documented.
  });

  socket.on(S2C.KICKED, () => {
    pendingCode = null;
    const s = store();
    s.setLobby(null);
    s.setScreen('menu');
    s.setError('kicked');
  });

  socket.on(S2C.ERROR, (error: { message?: string }) => {
    store().setError(error?.message ?? 'error');
  });
}

// ─── Access ─────────────────────────────────────────────────────────────────

export function getLaundrySocket(): Socket | null {
  return client?.socket ?? null;
}

export function reconnectNow(): void {
  client?.reconnectNow();
}

export function disconnectLaundry(): void {
  pendingCode = null;
  client?.destroy();
  client = null;
}

/**
 * `queue` holds an emit across a blip. Used for intents that still mean the
 * same thing a few seconds later (ready, settings, leave) — never for a running
 * score, which the next publish supersedes anyway.
 */
function emit(event: string, data?: unknown, queue = false): boolean {
  if (!client) return false;
  return client.emit(event, data, { queue });
}

export const laundryNet = {
  create: (settings: { isPublic: boolean; durationSec: number; difficulty: string }) =>
    emit(C2S.CREATE, settings, true),
  join: (code: string) => emit(C2S.JOIN, { code }, true),
  quickplay: () => emit(C2S.QUICKPLAY, {}, true),
  browse: () => emit(C2S.BROWSE, {}),
  leave: () => {
    pendingCode = null;
    return emit(C2S.LEAVE, {}, true);
  },
  ready: (ready: boolean) => emit(C2S.READY, { ready }, true),
  settings: (settings: { isPublic?: boolean; durationSec?: number; difficulty?: string }) =>
    emit(C2S.SETTINGS, settings, true),
  start: () => emit(C2S.START, {}, true),
  kick: (socketId: string) => emit(C2S.KICK, { socketId }, true),
  score: (report: ScoreReport) => emit(C2S.SCORE, report),
  finish: (report: ScoreReport) => emit(C2S.FINISH, report, true),
  rematch: () => emit(C2S.REMATCH, {}, true),
  ticket: (token: string) => emit(C2S.TICKET, { token }, true),
};
