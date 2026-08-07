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
import { C2S, S2C, isLobbyCode } from './events';
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
  TeamId,
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

/**
 * The lobby this client is *watching* (`N1`), if any.
 *
 * Held separately from {@link pendingCode} because the reconnect path treats the
 * two oppositely: a player re-joins and reclaims a seat, a spectator re-enters
 * the spectator room and must **not** be seated. The store cannot answer this —
 * a spectator's store holds a perfectly normal `LobbySnapshot`, which is the
 * whole point of the role — so a reconnect that read the store would silently
 * turn every watcher into a player the moment their wifi blinked.
 */
let spectatingCode: string | null = null;

/**
 * A Discord Activity access token, when the game is running inside one.
 *
 * Module-level rather than a `connectSliceIt()` argument because the reconnect
 * path needs it too: the shared realtime client re-reads its credentials on
 * every attempt, so a token passed once at connect time would be gone by the
 * first reconnect and the socket would come back anonymous, mid-match.
 *
 * Set by the Discord Activity component before it connects; `null` everywhere
 * else, which is what makes the standalone `/slice-it` page's behaviour exactly
 * what it was.
 */
let discordAuth: { accessToken: string; channelId: string | null } | null = null;

/**
 * Hand the client a verified-server-side Discord identity to connect with.
 *
 * The token is Discord's own OAuth access token, straight from the SDK
 * handshake (`lib/discord-sdk.ts`). It is a credential, not a claim: the hub
 * verifies it against Discord and derives the user from Discord's answer, so
 * nothing here can assert who the caller is. See
 * `server/socket-server/index.ts` `verifyDiscordActivityToken`.
 *
 * Pass `null` on teardown.
 */
export function setDiscordAuth(auth: { accessToken: string; channelId: string | null } | null) {
  discordAuth = auth;
}

/** Listeners for the events the UI reacts to imperatively (audio cues, chart load). */
export type MatchListeners = {
  onStart?: (payload: MatchStartPayload) => void;
  onCountdown?: (payload: CountdownPayload) => void;
  onKicked?: (reason: string) => void;
  /** Stop the engine — someone dropped and the room is waiting for them. */
  onPause?: (payload: PausePayload) => void;
  /** Restart the engine at `resumeAt`, after the re-countdown. */
  onResume?: (payload: ResumePayload) => void;
};

/**
 * A set, not a single object.
 *
 * Two components need these: the menu loads the chart on `onStart`, and the
 * canvas drives the engine on `onCountdown`/`onPause`/`onResume`. With one
 * slot, whichever mounted second silently replaced the first — and the symptom
 * would be a match that starts but never pauses, or pauses but never loads.
 */
const matchListeners = new Set<MatchListeners>();

function notify<K extends keyof MatchListeners>(
  key: K,
  invoke: (listener: NonNullable<MatchListeners[K]>) => void,
): void {
  for (const listener of matchListeners) {
    const handler = listener[key];
    if (handler) invoke(handler as NonNullable<MatchListeners[K]>);
  }
}

const store = () => useSliceItStore.getState();

/**
 * Open the connection, or reuse the existing one.
 *
 * Two credentials are accepted, mirroring the hub's soft auth. A Better Auth
 * session is the normal one and still wins. A Discord Activity token is the
 * fallback, and it is not a nicety: an Activity is served from Discord's proxy
 * origin, so a cookie scoped to rmhstudios.com is never sent from it and
 * `getSession()` is empty there for **every** player, linked account or not.
 * Before this, that emptiness was indistinguishable from "not signed in" and
 * every Discord player was thrown out of multiplayer at this line.
 *
 * With neither credential we still fail fast rather than opening a socket the
 * hub will refuse to seat.
 */
export async function connectSliceIt(): Promise<Socket> {
  if (client) {
    client.reconnectNow();
    return client.socket;
  }

  const session = await authClient.getSession();
  const token = session?.data?.session?.token;
  if (!token && !discordAuth) {
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
      return {
        token: current?.data?.session?.token,
        // Sent alongside, never instead: the hub prefers a valid session and
        // only falls back to the Discord token, so a player who signs in
        // mid-session is upgraded on their next reconnect rather than pinned
        // to a guest seat.
        discordToken: discordAuth?.accessToken,
        channelId: discordAuth?.channelId,
      };
    },
    onStatus: (status) => store().setConnection(status),
    onConnect: (socket, { isReconnect }) => {
      store().setSelfSocketId(socket.id ?? null);
      if (!isReconnect) return;
      // A watcher goes back to watching (`N1`). Checked first: a spectator's
      // store holds an ordinary snapshot, so the join below would read it, seat
      // them, and turn a blip into a player nobody invited.
      if (spectatingCode) {
        socket.emit(C2S.SPECTATE, { code: spectatingCode });
        return;
      }
      // A reconnect means a new socket id, so the lobby has forgotten this seat
      // — unless the grace window is still holding it, in which case the join
      // re-binds the seat rather than creating one.
      const code = store().lobby?.code ?? pendingCode;
      if (code) socket.emit(C2S.JOIN, { code });
    },
    bind: registerHandlers,
  });

  return client.socket;
}

export function disconnectSliceIt(): void {
  client?.destroy();
  client = null;
  pendingCode = null;
  spectatingCode = null;
  // Deliberately NOT cleared: the Discord Activity's own probe disconnects and
  // reconnects while deciding whether multiplayer is reachable, and dropping
  // the credential here would make the second attempt fail for a reason the
  // first one did not. The Activity component clears it on unmount.
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
 * Subscribe to the match events the UI must react to imperatively.
 *
 * Countdown beeps, chart loading and pause/resume are side effects with timing,
 * not state — routing them through the store and a `useEffect` would fire them
 * a frame late and, worse, again on every unrelated re-render.
 *
 * Returns an unsubscribe.
 */
export function addMatchListener(listeners: MatchListeners): () => void {
  matchListeners.add(listeners);
  return () => {
    matchListeners.delete(listeners);
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
    notify('onCountdown', (fn) => fn(payload));
  });

  socket.on(S2C.START, (payload: MatchStartPayload) => {
    const s = store();
    s.setMatchResults(null);
    s.setLiveScores([]);
    notify('onStart', (fn) => fn(payload));
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
    notify('onKicked', (fn) => fn(payload?.reason ?? 'removed'));
  });

  socket.on(S2C.PAUSE, (payload: PausePayload) => {
    const s = store();
    s.setPause(payload ?? null);
    s.setIsPaused(true);
    notify('onPause', (fn) => fn(payload));
  });

  socket.on(S2C.RESUME, (payload: ResumePayload) => {
    store().setPause(null);
    notify('onResume', (fn) => fn(payload));
  });
}

/* ─── Commands ───────────────────────────────────────────────────────────── */

function emit(event: string, payload?: unknown, queue = false): boolean {
  if (!client) return false;
  return client.emit(event, payload, { queue });
}

/**
 * @param code A *preferred* lobby code (`X9`). The server honours it when it is
 *   free and answers `code_taken` when it is not — which for a caller deriving
 *   the code from a Discord channel means "somebody beat you to it, join
 *   instead", not "creating failed". Omit for a server-minted random code.
 */
export function createLobby(isPublic: boolean, code?: string): void {
  emit(C2S.CREATE, { isPublic, code: code?.toUpperCase() }, true);
}

/**
 * Join a lobby by code.
 *
 * The shape is checked **here**, before anything reaches the socket (`N9`).
 * `pendingCode` is what the reconnect path re-joins with, so a malformed code
 * accepted at this line is not one bad round-trip — it is one per reconnect, for
 * as long as the tab is open, each answering `not_found` into the error toast.
 * A stale invite link is exactly how that used to happen.
 *
 * @returns false when the code is not a lobby code at all. Whether a well-formed
 *   code names a *live* lobby is a question only the server can answer.
 */
export function joinLobby(code: string): boolean {
  const normalized = normalizeLobbyCode(code);
  if (!normalized) return false;
  pendingCode = normalized;
  spectatingCode = null;
  emit(C2S.JOIN, { code: normalized }, true);
  return true;
}

/**
 * Watch a lobby without taking one of its eight seats (`N1`).
 *
 * Deliberately does **not** set `pendingCode`: that is the seat the reconnect
 * path reclaims, and a spectator has no seat. Reconnecting straight back into
 * the spectator room is the caller's job — it re-emits this on `connected`.
 */
export function spectateLobby(code: string): boolean {
  const normalized = normalizeLobbyCode(code);
  if (!normalized) return false;
  pendingCode = null;
  spectatingCode = normalized;
  emit(C2S.SPECTATE, { code: normalized }, true);
  return true;
}

/** The lobby being watched (`N1`), or null when this client holds a seat. */
export function spectatingLobbyCode(): string | null {
  return spectatingCode;
}

/**
 * The link that gets somebody else into this lobby (`N9`).
 *
 * `?watch=1` sends them to the spectator view instead of a seat, which is the
 * only useful thing to send once a match is under way.
 */
export function inviteLink(code: string, watch = false): string {
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('lobby', code);
  if (watch) url.searchParams.set('watch', '1');
  return url.toString();
}

/**
 * Upper-case a code and check it is one, or null (`N9`).
 *
 * The shape check itself is `isLobbyCode` in the wire contract, shared with the
 * hub so the browser and the server cannot disagree about what a code is.
 */
export function normalizeLobbyCode(code: unknown): string | null {
  if (typeof code !== 'string') return null;
  const normalized = code.trim().toUpperCase();
  return isLobbyCode(normalized) ? normalized : null;
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
  // `slice:leave` gives up a seat *and* a spectator slot, so this clears both.
  spectatingCode = null;
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

/** Host: turn team mode on or off (`N2`). Turning it on balances the room. */
export function setTeamMode(teams: boolean): void {
  emit(C2S.SETTINGS, { teams }, true);
}

/** Pick a side, or `null` to sit on neither (`N2`). */
export function setTeam(team: TeamId | null): void {
  emit(C2S.TEAM, { team }, true);
}

/** Host: spread the seats evenly across the two sides (`N2`). */
export function balanceTeams(): void {
  emit(C2S.BALANCE, {}, true);
}

/** Host: hand song choice to the room, or take it back (`N7`). */
export function setVoteMode(voting: boolean): void {
  emit(C2S.SETTINGS, { voting }, true);
}

/** Put a track on the ballot (`N7`). One nomination per seat. */
export function nominateSong(songId: string): void {
  emit(C2S.NOMINATE, { songId }, true);
}

/** Back a nominated track (`N7`). Changeable until the ballot closes. */
export function voteForSong(songId: string): void {
  emit(C2S.VOTE, { songId }, true);
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
