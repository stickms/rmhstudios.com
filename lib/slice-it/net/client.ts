/**
 * Slice It — realtime client.
 *
 * Connection lifecycle, reconnect tuning and credential refresh all live in
 * `lib/shared/realtime/client`; this module is only the Slice It event map plus
 * the store writes each message implies.
 *
 * ## What this replaces
 *
 * `lib/game/MultiplayerFactory.ts`: a hand-rolled singleton with
 * `reconnectionAttempts: 5`, `transports: ['websocket']` (no long-poll
 * fallback, so a restrictive proxy meant no multiplayer at all), a `Map<string,
 * Function[]>` pub/sub with no types, and a `connect()` that re-registered
 * every listener each time it was called. It had no notion of a *failed*
 * connection — `connect_error` was a `console.error` — so a player whose socket
 * never came up sat on a lobby screen that simply never populated.
 *
 * Three things the shared client buys that matter here specifically:
 *
 * - **Rejoin on reconnect.** The hub keys seats by socket id, and a reconnect
 *   mints a new one. `onConnect` re-sends the join, so a dropped player lands
 *   back in the same lobby rather than a ghost seat the room waits on.
 * - **Fresh credentials per attempt**, so a reconnect after a token refresh
 *   does not fail auth and strand the player.
 * - **An honest status**, surfaced into the store so the lobby can say
 *   "reconnecting" instead of freezing.
 */

'use client';

import type { Socket } from 'socket.io-client';
import { authClient } from '@/lib/auth-client';
import { createRealtimeClient, type RealtimeClient } from '@/lib/shared/realtime/client';
import { useSliceItStore } from '../store';
import { C2S, S2C } from './events';
import type {
  ChatMessage,
  CountdownPayload,
  LiveScore,
  LoadingStatus,
  LobbyError,
  LobbySnapshot,
  MatchResults,
  MatchStartPayload,
  PausePayload,
  PublicLobbyInfo,
  ResumePayload,
  ScoreReport,
} from './events';
import type { Modifiers } from '../types';

let client: RealtimeClient | null = null;
/**
 * The room to re-join after a drop.
 *
 * Held outside the store because it must survive `resetRun()` — a reconnect
 * during the results screen still needs to know which lobby to rejoin.
 */
let pendingCode: string | null = null;

/** Listeners for the events the UI reacts to imperatively (audio cues, chart load). */
type MatchListeners = {
  onStart?: (payload: MatchStartPayload) => void;
  onCountdown?: (payload: CountdownPayload) => void;
  onKicked?: (reason: string) => void;
  /** Stop the engine — someone dropped and the room is waiting for them. */
  onPause?: (payload: PausePayload) => void;
  /** Restart the engine at `resumeAt`, after the re-countdown. */
  onResume?: (payload: ResumePayload) => void;
};
let matchListeners: MatchListeners = {};

const store = () => useSliceItStore.getState();

/**
 * Open the connection, or reuse the existing one.
 *
 * Multiplayer is signed-in only — matches write to a leaderboard, so an
 * anonymous seat would be a hole in it — and we fail fast rather than opening a
 * socket the hub will refuse to seat.
 */
export async function connectSliceIt(): Promise<Socket> {
  if (client) {
    client.reconnectNow();
    return client.socket;
  }

  const session = await authClient.getSession();
  const token = session?.data?.session?.token;
  if (!token) {
    store().setConnection('error');
    store().setLobbyError('auth_required');
    throw new Error('Not authenticated');
  }

  client = createRealtimeClient({
    name: 'SliceIt',
    url: import.meta.env.VITE_SOCKET_URL,
    path: '/socket/',
    auth: async () => {
      const current = await authClient.getSession();
      return { token: current?.data?.session?.token };
    },
    onStatus: (status) => store().setConnection(status),
    onConnect: (socket, { isReconnect }) => {
      store().setSelfSocketId(socket.id ?? null);
      // A reconnect means a new socket id, so the lobby has forgotten this seat
      // — unless the grace window is still holding it, in which case the join
      // re-binds the seat rather than creating one.
      const code = store().lobby?.code ?? pendingCode;
      if (isReconnect && code) socket.emit(C2S.JOIN, { code });
    },
    bind: registerHandlers,
  });

  return client.socket;
}

export function disconnectSliceIt(): void {
  client?.destroy();
  client = null;
  pendingCode = null;
  matchListeners = {};
  store().resetMultiplayer();
  store().setConnection('idle');
}

export function isSliceItConnected(): boolean {
  return client?.status === 'connected';
}

export function selfSocketId(): string | null {
  return client?.socket.id ?? null;
}

/**
 * Register the imperative callbacks the canvas needs.
 *
 * Countdown beeps and chart loading are side effects with timing, not state —
 * routing them through the store and a `useEffect` would fire them a frame late
 * and, worse, again on every unrelated re-render.
 */
export function setMatchListeners(listeners: MatchListeners): () => void {
  matchListeners = listeners;
  return () => {
    matchListeners = {};
  };
}

function registerHandlers(socket: Socket): void {
  socket.on(S2C.LOBBY, (lobby: LobbySnapshot) => {
    pendingCode = lobby.code;
    const s = store();
    s.setLobby(lobby);
    s.setLobbyError(null);
    s.setIsMultiplayer(true);
  });

  socket.on(S2C.JOINED, (data: { code: string; socketId: string }) => {
    pendingCode = data.code;
    const s = store();
    s.setSelfSocketId(data.socketId);
    s.setIsMultiplayer(true);
    s.setLobbyError(null);
  });

  socket.on(S2C.ERROR, (error: LobbyError) => {
    store().setLobbyError(error?.code ?? 'not_found');
  });

  socket.on(S2C.BROWSE_RESULT, (lobbies: PublicLobbyInfo[]) => {
    store().setPublicLobbies(Array.isArray(lobbies) ? lobbies : []);
  });

  socket.on(S2C.LOADING, (status: LoadingStatus) => {
    store().setLoadingPlayers(Array.isArray(status?.players) ? status.players : []);
  });

  socket.on(S2C.COUNTDOWN, (payload: CountdownPayload) => {
    store().setCountdown(Math.max(0, Math.ceil(payload?.seconds ?? 0)));
    matchListeners.onCountdown?.(payload);
  });

  socket.on(S2C.START, (payload: MatchStartPayload) => {
    const s = store();
    s.setMatchResults(null);
    s.setLiveScores([]);
    matchListeners.onStart?.(payload);
  });

  socket.on(S2C.SCORES, (scores: LiveScore[]) => {
    store().setLiveScores(Array.isArray(scores) ? scores : []);
  });

  socket.on(S2C.RESULTS, (results: MatchResults) => {
    store().setMatchResults(results);
  });

  socket.on(S2C.CHAT, (message: ChatMessage) => {
    store().pushChat(message);
  });

  socket.on(S2C.KICKED, (payload: { reason: string }) => {
    pendingCode = null;
    store().resetMultiplayer();
    matchListeners.onKicked?.(payload?.reason ?? 'removed');
  });

  socket.on(S2C.PAUSE, (payload: PausePayload) => {
    const s = store();
    s.setPause(payload ?? null);
    s.setIsPaused(true);
    matchListeners.onPause?.(payload);
  });

  socket.on(S2C.RESUME, (payload: ResumePayload) => {
    store().setPause(null);
    matchListeners.onResume?.(payload);
  });
}

/* ─── Commands ───────────────────────────────────────────────────────────── */

function emit(event: string, payload?: unknown, queue = false): boolean {
  if (!client) return false;
  return client.emit(event, payload, { queue });
}

export function createLobby(isPublic: boolean): void {
  emit(C2S.CREATE, { isPublic }, true);
}

export function joinLobby(code: string): void {
  pendingCode = code.toUpperCase();
  emit(C2S.JOIN, { code: pendingCode }, true);
}

export function quickplay(): void {
  emit(C2S.QUICKPLAY, {}, true);
}

export function browseLobbies(): void {
  emit(C2S.BROWSE, {});
}

export function leaveLobby(): void {
  emit(C2S.LEAVE, {});
  pendingCode = null;
  store().resetMultiplayer();
}

export function setReady(ready: boolean): void {
  emit(C2S.READY, { ready }, true);
}

export function selectSong(songId: string): void {
  emit(C2S.SONG, { songId }, true);
}

export function setLobbySettings(isPublic: boolean): void {
  emit(C2S.SETTINGS, { isPublic }, true);
}

export function setLobbyModifiers(modifiers: Modifiers): void {
  emit(C2S.MODS, { modifiers }, true);
}

export function startMatch(): void {
  emit(C2S.START, {});
}

export function reportLoaded(): void {
  // Queued: if this lands during a blip it is still the right thing to say on
  // reconnect, and the lobby is otherwise stuck waiting for a client that has
  // in fact finished loading.
  emit(C2S.LOADED, {}, true);
}

export function reportScore(report: ScoreReport): void {
  // Never queued — a stale score flushed 4 seconds later is worse than a gap.
  emit(C2S.SCORE, report);
}

export function reportFinish(report: ScoreReport): void {
  emit(C2S.FINISH, report, true);
}

export function requestRematch(): void {
  emit(C2S.REMATCH, {}, true);
}

export function sendChat(text: string): void {
  const trimmed = text.trim();
  if (!trimmed) return;
  emit(C2S.CHAT, { text: trimmed }, true);
}

export function kickPlayer(socketId: string): void {
  emit(C2S.KICK, { socketId });
}
