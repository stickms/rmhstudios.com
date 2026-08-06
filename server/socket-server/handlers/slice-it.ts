/**
 * Slice It — multiplayer lobby and match handler.
 *
 * The server is a lobby manager, a clock and a scorekeeper. It does **not**
 * judge rhythm: what is being judged is the alignment between a player's input
 * and audio playing on their own machine, and no amount of server-side
 * simulation can see that. Each client judges its own hits; the server owns
 * everything a client must not: who is in the room, which song, when the match
 * starts, when it stops, and what happens when someone's wifi dies.
 *
 * ## What this replaces
 *
 * The previous handler was ~200 lines with several structural problems, each of
 * which is a named fix below:
 *
 * - **Seats were keyed by `socket.id`.** A socket id is destroyed by any
 *   reconnect, so a two-second network blip removed a player from the lobby
 *   permanently — mid-match, from their own point of view, the game simply
 *   stopped mattering. Seats here are keyed by `userId` and rebound on
 *   reconnect.
 * - **Lobby ids came from the client**, and `sanitizeLobbyId('')` returned
 *   `'default'`, so everyone who arrived without a code shared one room. Codes
 *   are minted here.
 * - **The song was a client-supplied object** broadcast to the room verbatim —
 *   a host could point every other player's audio element anywhere. The host
 *   sends an id; this file reads the row.
 * - **No auth.** `userId` came off the payload, so scores were attributable to
 *   whoever you claimed to be. It now comes off `socket.data`, which the hub's
 *   auth middleware populated from a validated session.
 * - **No rate limits.** None of the eleven events were in `config.ts`, which is
 *   also the hub's event allowlist.
 * - **One broadcast per score change.** `score_update` fired on every note hit
 *   and fanned out to the whole room; eight players hitting 8 notes/second is
 *   ~500 messages/second in one lobby. Scores are batched onto a 500ms tick.
 *
 * NOTE: server code imports `lib/` RELATIVELY — `@/lib/...` is not resolvable
 * in the esbuild server bundle (see `server/CLAUDE.md` §Gotchas 7).
 */

import type { Server, Socket } from 'socket.io';
import { generateRoomCode, sanitizeString } from '../utils';
import { checkRateLimit } from '../rate-limit';
import { logger } from '../logger';
import { getPrismaClient } from '../prisma-client';
import { bindEvents, type Handlers } from '../../shared/typed-socket';
import {
  CHAT_HISTORY,
  CHAT_MAX_LENGTH,
  COUNTDOWN_SECONDS,
  FINISH_GRACE_MS,
  LOAD_TIMEOUT_MS,
  LOBBY_DISCONNECT_GRACE_MS,
  LOBBY_IDLE_TIMEOUT_MS,
  MATCH_DISCONNECT_GRACE_MS,
  MAX_LOBBY_PLAYERS,
  MAX_MATCH_PAUSES,
  RESUME_COUNTDOWN_SECONDS,
  SCORE_TICK_MS,
} from '../../../lib/slice-it/constants';
import { DEFAULT_MODIFIERS, forMultiplayer } from '../../../lib/slice-it/modifiers';
import {
  calculateScoreMultiplier,
  maxPlausibleCombo,
  maxPlausibleScore,
} from '../../../lib/slice-it/scoring';
import type { Modifiers } from '../../../lib/slice-it/types';
import {
  EVENTS,
  S2C,
  lobbyRoom,
  type ChatMessage,
  type FinalStanding,
  type LiveScore,
  type LobbyError,
  type LobbyErrorCode,
  type LobbyPlayer,
  type LobbySnapshot,
  type LobbySong,
  type LobbyState,
  type PublicLobbyInfo,
  type ScoreReport,
} from '../../../lib/slice-it/net/events';

/* ─── Constants ─────────────────────────────────────────────────────────── */

const MAX_LOBBIES = 2000;
const BROWSE_CAP = 30;
const GC_INTERVAL_MS = 60_000;
/** Attempts to mint a non-colliding code before giving up. */
const CODE_ATTEMPTS = 12;

const EMPTY_REPORT: ScoreReport = { score: 0, combo: 0, maxCombo: 0, accuracy: 0, health: 100 };

/* ─── Types ─────────────────────────────────────────────────────────────── */

interface Seat {
  userId: string;
  /** Null while the player is disconnected and their seat is being held. */
  socketId: string | null;
  name: string;
  avatarUrl: string | null;
  ready: boolean;
  /** Joined mid-match: watching this round, playing the next. */
  spectating: boolean;
  modifiers: Modifiers;
  report: ScoreReport;
  /** Their client has decoded the audio and built its chart. */
  loaded: boolean;
  /** Their client reached the end of the song. */
  done: boolean;
  /** Epoch-ms they dropped, or null while connected. */
  disconnectedAt: number | null;
  /** Timer that removes the seat when the grace window expires. */
  graceTimer: ReturnType<typeof setTimeout> | null;
}

interface Lobby {
  code: string;
  /**
   * Host is tracked by user, not by socket. A host who reconnects is still the
   * host; under the old socket-keyed scheme a blip handed the lobby to whoever
   * happened to be next in the map.
   */
  hostUserId: string;
  isPublic: boolean;
  state: LobbyState;
  /** Keyed by userId — the whole reconnect story depends on this. */
  seats: Map<string, Seat>;
  song: LobbySong | null;
  chat: ChatMessage[];
  createdAt: number;
  lastActivityAt: number;

  /* Match */
  matchStartedAt: number;
  /** Epoch-ms the match is force-ended, extended by every pause. */
  deadline: number;
  /** Set while the match is held for a dropped player. */
  pausedAt: number | null;
  pausedTotalMs: number;
  pauseCount: number;
  /** Names of players who were dropped mid-match, for the resume banner. */
  droppedNames: string[];

  loadTimer: ReturnType<typeof setTimeout> | null;
  countdownTimer: ReturnType<typeof setTimeout> | null;
  scoreTimer: ReturnType<typeof setInterval> | null;
  /** Last broadcast score frame, so an unchanged one is not re-sent. */
  lastScoreDigest: string;
  deadlineTimer: ReturnType<typeof setTimeout> | null;
  pauseTimer: ReturnType<typeof setTimeout> | null;
}

const lobbies = new Map<string, Lobby>();
/** Reverse index: a socket is only ever seated in one lobby. */
const socketLobby = new Map<string, { code: string; userId: string }>();

let gcInterval: ReturnType<typeof setInterval> | null = null;

/* ─── Helpers ───────────────────────────────────────────────────────────── */

function identity(
  socket: Socket,
): { userId: string; name: string; avatarUrl: string | null } | null {
  const userId = socket.data?.userId;
  if (typeof userId !== 'string' || !userId) return null;
  return {
    userId,
    name: sanitizeString(socket.data?.userName, 32) || 'Player',
    avatarUrl: typeof socket.data?.avatarUrl === 'string' ? socket.data.avatarUrl : null,
  };
}

function fail(socket: Socket, code: LobbyErrorCode, message: string): void {
  const payload: LobbyError = { code, message };
  socket.emit(S2C.ERROR, payload);
}

function toPlayer(seat: Seat, lobby: Lobby): LobbyPlayer {
  return {
    socketId: seat.socketId ?? '',
    userId: seat.userId,
    name: seat.name,
    avatarUrl: seat.avatarUrl,
    ready: seat.ready,
    isHost: seat.userId === lobby.hostUserId,
    disconnected: seat.disconnectedAt !== null,
    spectating: seat.spectating,
    modifiers: seat.modifiers,
    scoreMultiplier: Number(calculateScoreMultiplier(seat.modifiers).toFixed(2)),
  };
}

function snapshot(lobby: Lobby): LobbySnapshot {
  return {
    code: lobby.code,
    hostSocketId: lobby.seats.get(lobby.hostUserId)?.socketId ?? '',
    isPublic: lobby.isPublic,
    state: lobby.state,
    players: Array.from(lobby.seats.values()).map((seat) => toPlayer(seat, lobby)),
    maxPlayers: MAX_LOBBY_PLAYERS,
    song: lobby.song,
  };
}

function broadcast(io: Server, lobby: Lobby): void {
  io.to(lobbyRoom(lobby.code)).emit(S2C.LOBBY, snapshot(lobby));
}

function touch(lobby: Lobby): void {
  lobby.lastActivityAt = Date.now();
}

/** Seats that are actually racing — not spectating, not dropped for good. */
function activeSeats(lobby: Lobby): Seat[] {
  return Array.from(lobby.seats.values()).filter((s) => !s.spectating);
}

function connectedSeats(lobby: Lobby): Seat[] {
  return Array.from(lobby.seats.values()).filter((s) => s.disconnectedAt === null);
}

function clearTimers(lobby: Lobby): void {
  if (lobby.loadTimer) clearTimeout(lobby.loadTimer);
  if (lobby.countdownTimer) clearTimeout(lobby.countdownTimer);
  if (lobby.scoreTimer) clearInterval(lobby.scoreTimer);
  if (lobby.deadlineTimer) clearTimeout(lobby.deadlineTimer);
  if (lobby.pauseTimer) clearTimeout(lobby.pauseTimer);
  lobby.loadTimer = null;
  lobby.countdownTimer = null;
  lobby.scoreTimer = null;
  lobby.deadlineTimer = null;
  lobby.pauseTimer = null;
}

function destroyLobby(code: string): void {
  const lobby = lobbies.get(code);
  if (!lobby) return;
  clearTimers(lobby);
  for (const seat of lobby.seats.values()) {
    if (seat.graceTimer) clearTimeout(seat.graceTimer);
    if (seat.socketId) socketLobby.delete(seat.socketId);
  }
  lobbies.delete(code);
}

function mintCode(): string | null {
  for (let i = 0; i < CODE_ATTEMPTS; i++) {
    const code = generateRoomCode();
    if (!lobbies.has(code)) return code;
  }
  return null;
}

function createLobby(host: { userId: string; name: string }, isPublic: boolean): Lobby | null {
  const code = mintCode();
  if (!code) return null;
  const now = Date.now();
  const lobby: Lobby = {
    code,
    hostUserId: host.userId,
    isPublic,
    state: 'waiting',
    seats: new Map(),
    song: null,
    chat: [],
    createdAt: now,
    lastActivityAt: now,
    matchStartedAt: 0,
    deadline: 0,
    pausedAt: null,
    pausedTotalMs: 0,
    pauseCount: 0,
    droppedNames: [],
    loadTimer: null,
    countdownTimer: null,
    scoreTimer: null,
    lastScoreDigest: '',
    deadlineTimer: null,
    pauseTimer: null,
  };
  lobbies.set(code, lobby);
  return lobby;
}

/**
 * Seat a socket in a lobby, rebinding an existing seat if this user already has
 * one.
 *
 * The rebind branch is the whole reconnect story: a player who dropped still
 * has a seat (their `graceTimer` is running), so joining again restores their
 * ready state, their modifiers, and — critically — the score they had already
 * reported, rather than starting them from zero halfway through a song.
 */
function seatUser(
  io: Server,
  lobby: Lobby,
  socket: Socket,
  who: { userId: string; name: string; avatarUrl: string | null },
): Seat {
  const existing = lobby.seats.get(who.userId);
  if (existing) {
    if (existing.graceTimer) {
      clearTimeout(existing.graceTimer);
      existing.graceTimer = null;
    }
    if (existing.socketId && existing.socketId !== socket.id) {
      // Same account, second tab. The newest socket wins the seat; the old one
      // is forgotten so it stops receiving a room it no longer owns.
      socketLobby.delete(existing.socketId);
      io.sockets.sockets.get(existing.socketId)?.leave(lobbyRoom(lobby.code));
    }
    existing.socketId = socket.id;
    existing.name = who.name;
    existing.avatarUrl = who.avatarUrl;
    existing.disconnectedAt = null;
    socket.join(lobbyRoom(lobby.code));
    socketLobby.set(socket.id, { code: lobby.code, userId: who.userId });
    return existing;
  }

  const seat: Seat = {
    userId: who.userId,
    socketId: socket.id,
    name: who.name,
    avatarUrl: who.avatarUrl,
    ready: false,
    // Anyone arriving while a match is live watches it out. Bouncing them was
    // the old behaviour and it made an invite link useless the moment the host
    // pressed start.
    spectating: lobby.state !== 'waiting',
    modifiers: { ...DEFAULT_MODIFIERS },
    report: { ...EMPTY_REPORT },
    loaded: false,
    done: false,
    disconnectedAt: null,
    graceTimer: null,
  };
  lobby.seats.set(who.userId, seat);
  socket.join(lobbyRoom(lobby.code));
  socketLobby.set(socket.id, { code: lobby.code, userId: who.userId });
  return seat;
}

/**
 * Remove a seat and repair the lobby around it: migrate the host, release a
 * pause that was being held for this player, and reap an empty room.
 */
function removeSeat(io: Server, lobby: Lobby, userId: string, reason: string): void {
  const seat = lobby.seats.get(userId);
  if (!seat) return;
  if (seat.graceTimer) clearTimeout(seat.graceTimer);
  if (seat.socketId) socketLobby.delete(seat.socketId);
  lobby.seats.delete(userId);

  if (lobby.seats.size === 0) {
    destroyLobby(lobby.code);
    return;
  }

  if (lobby.hostUserId === userId) {
    // Prefer a connected player — handing the lobby to someone who is
    // themselves mid-reconnect just moves the problem.
    const next = connectedSeats(lobby)[0] ?? Array.from(lobby.seats.values())[0];
    lobby.hostUserId = next.userId;
    logger.info({ event: 'slice_host_migrated', code: lobby.code, to: next.userId, reason });
  }

  releasePauseIfSettled(io, lobby);
  maybeFinishMatch(io, lobby);
  broadcast(io, lobby);
}

/* ─── Pause / resume ────────────────────────────────────────────────────── */

/** Players the room is currently waiting on. */
function heldPeers(lobby: Lobby): Seat[] {
  return Array.from(lobby.seats.values()).filter(
    (s) => s.disconnectedAt !== null && !s.spectating && !s.done,
  );
}

/**
 * Hold the match for a player who dropped.
 *
 * Everyone's audio stops. The alternative — carrying on — means the dropped
 * player returns to a song 20 seconds further along than the chart in front of
 * them, which is not a recoverable state for a rhythm game. The cost is that
 * the room waits, which is why {@link MAX_MATCH_PAUSES} exists: after three
 * holds the room stops honouring them and a flapping connection can no longer
 * hold four other people hostage.
 */
function pauseMatch(io: Server, lobby: Lobby): void {
  if (lobby.state !== 'playing' && lobby.state !== 'countdown') return;
  const peers = heldPeers(lobby);
  if (peers.length === 0) return;

  if (lobby.pauseCount >= MAX_MATCH_PAUSES) {
    logger.info({ event: 'slice_pause_budget_exhausted', code: lobby.code });
    return;
  }

  const alreadyPaused = lobby.pausedAt !== null;
  if (!alreadyPaused) {
    lobby.pausedAt = Date.now();
    lobby.pauseCount++;
    // The score tick and the match deadline both stop: a paused match must not
    // time out, and a paused player must not appear to flatline on the sidebar.
    if (lobby.scoreTimer) {
      clearInterval(lobby.scoreTimer);
      lobby.scoreTimer = null;
    }
    if (lobby.deadlineTimer) {
      clearTimeout(lobby.deadlineTimer);
      lobby.deadlineTimer = null;
    }
  }

  // The window runs from the *earliest* still-held drop, so a second player
  // dropping during a pause does not extend the first one's grace.
  const earliest = Math.min(...peers.map((p) => p.disconnectedAt ?? Date.now()));
  const kickAt = earliest + MATCH_DISCONNECT_GRACE_MS;

  // The lobby's pause timer takes over from the per-seat grace timers, which
  // were armed for the same instant. Leaving both running is a race, and the
  // seat timer wins it — it was armed first — so the removal happens through a
  // path that does not know it is ending a pause, and the room is told to
  // resume without being told who it stopped waiting for. One deadline, owned
  // by the room, is also the one the clients are counting down to.
  for (const peer of peers) {
    if (peer.graceTimer) {
      clearTimeout(peer.graceTimer);
      peer.graceTimer = null;
    }
  }

  if (lobby.pauseTimer) clearTimeout(lobby.pauseTimer);
  lobby.pauseTimer = setTimeout(
    () => {
      const current = lobbies.get(lobby.code);
      if (!current) return;
      const expired = heldPeers(current);

      // Recorded BEFORE the removals, not after. `removeSeat` calls
      // `releasePauseIfSettled`, so the resume fires from inside the loop the
      // moment the last held peer is gone — assigning the names afterwards set
      // them on a lobby that had already sent an empty `droppedNames`, and the
      // room never learned who it had just stopped waiting for.
      current.droppedNames = expired.map((peer) => peer.name);
      for (const peer of expired) {
        removeSeat(io, current, peer.userId, 'grace_expired');
      }

      // A lobby that emptied out is already destroyed; and if every held peer
      // somehow returned in the same tick, the resume already happened.
      const still = lobbies.get(lobby.code);
      if (still) resumeMatch(io, still);
    },
    Math.max(0, kickAt - Date.now()),
  );

  io.to(lobbyRoom(lobby.code)).emit(S2C.PAUSE, {
    peers: peers.map((p) => ({ userId: p.userId, userName: p.name })),
    kickAt,
    pausesLeft: Math.max(0, MAX_MATCH_PAUSES - lobby.pauseCount),
  });
}

/**
 * Resume once nobody is being waited on any more.
 *
 * Deliberately does NOT touch `droppedNames`: whether the hold ended because
 * someone came back (nobody dropped, the list is already empty) or because the
 * window expired (the expiry path sets it just before removing them) is decided
 * by the caller, and clearing it here erased the one case that had something to
 * say.
 */
function releasePauseIfSettled(io: Server, lobby: Lobby): void {
  if (lobby.pausedAt === null) return;
  if (heldPeers(lobby).length > 0) return;
  resumeMatch(io, lobby);
}

/**
 * Restart play after a hold.
 *
 * `resumeAt` is a *future* server timestamp, not "now": everyone gets the same
 * short countdown so nobody is dropped back into a note that was already
 * halfway down the screen when the socket recovered.
 */
function resumeMatch(io: Server, lobby: Lobby): void {
  if (lobby.pausedAt === null) return;

  const pausedFor = Date.now() - lobby.pausedAt;
  lobby.pausedTotalMs += pausedFor;
  lobby.pausedAt = null;
  if (lobby.pauseTimer) {
    clearTimeout(lobby.pauseTimer);
    lobby.pauseTimer = null;
  }

  const resumeAt = Date.now() + RESUME_COUNTDOWN_SECONDS * 1000;
  // The deadline moves by the pause plus the re-countdown, so a match that was
  // held for 25 seconds still gets its full remaining song.
  lobby.deadline += pausedFor + RESUME_COUNTDOWN_SECONDS * 1000;

  io.to(lobbyRoom(lobby.code)).emit(S2C.RESUME, {
    resumeAt,
    countdownSeconds: RESUME_COUNTDOWN_SECONDS,
    droppedNames: lobby.droppedNames,
  });
  lobby.droppedNames = [];

  if (lobby.state === 'playing') {
    startScoreTicker(io, lobby);
    armDeadline(io, lobby);
  }
  broadcast(io, lobby);
}

/* ─── Match lifecycle ───────────────────────────────────────────────────── */

function beginLoading(io: Server, lobby: Lobby): void {
  lobby.state = 'loading';
  for (const seat of lobby.seats.values()) {
    seat.loaded = false;
    seat.done = false;
    seat.report = { ...EMPTY_REPORT };
  }

  const deadline = Date.now() + LOAD_TIMEOUT_MS;
  emitLoading(io, lobby, deadline);

  // One client that never reports `loaded` — a crashed tab, a decode failure —
  // used to hang the lobby with no way out but everyone leaving.
  lobby.loadTimer = setTimeout(() => {
    const current = lobbies.get(lobby.code);
    if (!current || current.state !== 'loading') return;
    for (const seat of activeSeats(current)) {
      if (!seat.loaded) {
        seat.spectating = true;
        logger.info({ event: 'slice_load_timeout', code: current.code, userId: seat.userId });
      }
    }
    beginCountdown(io, current);
  }, LOAD_TIMEOUT_MS);

  broadcast(io, lobby);
}

function emitLoading(io: Server, lobby: Lobby, deadline: number): void {
  io.to(lobbyRoom(lobby.code)).emit(S2C.LOADING, {
    players: activeSeats(lobby).map((seat) => ({
      socketId: seat.socketId ?? '',
      name: seat.name,
      loaded: seat.loaded,
    })),
    deadline,
  });
}

function beginCountdown(io: Server, lobby: Lobby): void {
  if (lobby.loadTimer) {
    clearTimeout(lobby.loadTimer);
    lobby.loadTimer = null;
  }
  lobby.state = 'countdown';

  const startsAt = Date.now() + COUNTDOWN_SECONDS * 1000;
  io.to(lobbyRoom(lobby.code)).emit(S2C.COUNTDOWN, {
    seconds: COUNTDOWN_SECONDS,
    startsAt,
  });
  broadcast(io, lobby);

  lobby.countdownTimer = setTimeout(() => {
    const current = lobbies.get(lobby.code);
    if (!current || current.state !== 'countdown') return;
    startMatch(io, current);
  }, COUNTDOWN_SECONDS * 1000);
}

function startMatch(io: Server, lobby: Lobby): void {
  // Anyone who dropped between pressing Start and the countdown ending cannot
  // have loaded the chart, so they watch this round rather than being counted
  // as a racer the match then waits on.
  for (const seat of lobby.seats.values()) {
    if (seat.disconnectedAt !== null) seat.spectating = true;
  }

  lobby.state = 'playing';
  lobby.matchStartedAt = Date.now();
  lobby.pausedTotalMs = 0;
  lobby.pauseCount = 0;
  lobby.pausedAt = null;
  lobby.droppedNames = [];

  const duration = lobby.song?.duration ?? 0;
  // Speed modifiers only ever make the song *shorter* in real time (multiplayer
  // forbids < 1.0x), so the un-scaled duration is the safe upper bound.
  lobby.deadline = lobby.matchStartedAt + duration * 1000 + FINISH_GRACE_MS;

  io.to(lobbyRoom(lobby.code)).emit(S2C.START, {
    song: lobby.song!,
    startedAt: lobby.matchStartedAt,
    roster: activeSeats(lobby).map((seat) => ({
      socketId: seat.socketId ?? '',
      userId: seat.userId,
      name: seat.name,
      avatarUrl: seat.avatarUrl,
    })),
  });

  startScoreTicker(io, lobby);
  armDeadline(io, lobby);
  broadcast(io, lobby);
}

/**
 * One batched broadcast per tick, rather than one message per player per score
 * change. With eight players hitting eight notes a second, the difference is
 * two messages a second and five hundred.
 */
function startScoreTicker(io: Server, lobby: Lobby): void {
  if (lobby.scoreTimer) clearInterval(lobby.scoreTimer);
  // A fresh match — or a resumed one — must not be silenced by the digest the
  // previous run left behind.
  lobby.lastScoreDigest = '';
  lobby.scoreTimer = setInterval(() => {
    const current = lobbies.get(lobby.code);
    if (!current || current.state !== 'playing' || current.pausedAt !== null) return;
    const scores: LiveScore[] = activeSeats(current).map((seat) => ({
      socketId: seat.socketId ?? '',
      ...seat.report,
      done: seat.done,
    }));

    // Nothing moved — usually everyone finished and the room is waiting on one
    // straggler. Sending the same numbers again is bandwidth the match is not
    // using for anything.
    const digest = scoreDigest(scores);
    if (digest === current.lastScoreDigest) return;
    current.lastScoreDigest = digest;

    // `volatile`: drop rather than queue when a client's socket is backed up.
    //
    // Without it, a player on a bad connection accumulates a backlog of score
    // frames and then receives them all at once, rendering each in turn — so
    // the opponent board replays the last few seconds in fast-forward and
    // arrives late anyway. A live score has no value once a newer one exists;
    // the right thing to do with a stale one is throw it away. Nothing else in
    // this handler is volatile, because everything else is a state transition
    // that must not be lost.
    io.to(lobbyRoom(current.code)).volatile.emit(S2C.SCORES, scores);
  }, SCORE_TICK_MS);
}

/** Cheap change detector for a score frame — see {@link startScoreTicker}. */
function scoreDigest(scores: LiveScore[]): string {
  let out = '';
  for (const s of scores) {
    out += `${s.socketId}:${s.score}:${s.combo}:${s.accuracy.toFixed(4)}:${s.done ? 1 : 0}|`;
  }
  return out;
}

function armDeadline(io: Server, lobby: Lobby): void {
  if (lobby.deadlineTimer) clearTimeout(lobby.deadlineTimer);
  lobby.deadlineTimer = setTimeout(
    () => {
      const current = lobbies.get(lobby.code);
      if (!current || current.state !== 'playing') return;
      logger.info({ event: 'slice_match_deadline', code: current.code });
      finishMatch(io, current);
    },
    Math.max(1000, lobby.deadline - Date.now()),
  );
}

/** End the match once every racer has reported in (or been removed). */
function maybeFinishMatch(io: Server, lobby: Lobby): void {
  if (lobby.state !== 'playing') return;
  const racers = activeSeats(lobby);
  if (racers.length === 0) {
    finishMatch(io, lobby);
    return;
  }
  // A player being held in a pause window has not finished — waiting for them
  // is the point of the pause.
  if (racers.every((seat) => seat.done)) finishMatch(io, lobby);
}

function finishMatch(io: Server, lobby: Lobby): void {
  clearTimers(lobby);
  lobby.state = 'results';
  lobby.pausedAt = null;

  const standings = buildStandings(lobby);
  io.to(lobbyRoom(lobby.code)).emit(S2C.RESULTS, { standings, song: lobby.song });
  broadcast(io, lobby);

  void persistResults(lobby, standings);
}

function buildStandings(lobby: Lobby): FinalStanding[] {
  const rows = activeSeats(lobby)
    .map((seat) => ({
      socketId: seat.socketId ?? '',
      userId: seat.userId,
      name: seat.name,
      avatarUrl: seat.avatarUrl,
      score: seat.report.score,
      maxCombo: seat.report.maxCombo,
      accuracy: seat.report.accuracy,
      modifiers: seat.modifiers,
      scoreMultiplier: Number(calculateScoreMultiplier(seat.modifiers).toFixed(2)),
      place: 0,
      finished: seat.done,
    }))
    .sort((a, b) => b.score - a.score || b.accuracy - a.accuracy);

  // Ties share a place, and the next place skips — 1, 2, 2, 4.
  let place = 0;
  let previousScore = Number.NaN;
  rows.forEach((row, index) => {
    if (row.score !== previousScore) {
      place = index + 1;
      previousScore = row.score;
    }
    row.place = place;
  });
  return rows;
}

/**
 * Write personal bests, fire-and-forget.
 *
 * Never blocks the results screen and never throws into the hub: a database
 * hiccup must not cost the room its match. Recording results here as well as at
 * `/api/slice-it/score` is what makes a multiplayer result show up on the song's
 * board even if a client closes the tab on the results screen.
 *
 * **These are client-reported scores, so they get the same ceiling the HTTP
 * route applies.** `ScoreReportZ` bounds a live report only at
 * `Number.MAX_SAFE_INTEGER` — the live number is cosmetic, it drives the
 * opponent board and nothing else, and clamping it hard would make a legitimate
 * high scorer's board readout wrong. That is fine right up until the same
 * number is written to a leaderboard, which is what this function does: one
 * `slice:score` emit of `{score: 9e15}` in a lobby of one was a permanent global
 * first place, straight past every bound `/api/slice-it/score` exists to
 * enforce. The song's duration comes from the database (`resolveSong`), so the
 * ceiling here is derived from the same facts as the HTTP one.
 */
async function persistResults(lobby: Lobby, standings: FinalStanding[]): Promise<void> {
  const songId = lobby.song?.id;
  const duration = lobby.song?.duration ?? 0;
  if (!songId || standings.length === 0) return;

  try {
    const prisma = getPrismaClient();
    for (const standing of standings) {
      if (standing.score <= 0 || !standing.finished) continue;

      const scoreCeiling = maxPlausibleScore(duration, standing.modifiers);
      const comboCeiling = maxPlausibleCombo(duration);
      if (standing.score > scoreCeiling || standing.maxCombo > comboCeiling) {
        // Logged, not silently dropped: a legitimate run tripping this means
        // the ceiling is wrong, and the only way to learn that is to see it.
        logger.warn({
          event: 'slice_implausible_score_rejected',
          code: lobby.code,
          userId: standing.userId,
          songId,
          score: standing.score,
          scoreCeiling,
          maxCombo: standing.maxCombo,
          comboCeiling,
        });
        continue;
      }

      const existing = await prisma.songLeaderboard.findUnique({
        where: { songId_userId: { songId, userId: standing.userId } },
        select: { id: true, score: true },
      });
      if (existing && existing.score >= standing.score) continue;

      const data = {
        score: Math.round(standing.score),
        maxCombo: Math.round(standing.maxCombo),
        accuracy: Math.max(0, Math.min(1, standing.accuracy)),
        speedMod: standing.modifiers.speed,
        modifiers: standing.modifiers as unknown as object,
        createdAt: new Date(),
      };
      if (existing) {
        await prisma.songLeaderboard.update({ where: { id: existing.id }, data });
      } else {
        await prisma.songLeaderboard.create({
          data: { songId, userId: standing.userId, ...data },
        });
      }
    }
  } catch (error) {
    logger.warn({
      event: 'slice_results_persist_failed',
      code: lobby.code,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/** Back to the lobby: spectators become players, everything resets. */
function returnToLobby(io: Server, lobby: Lobby): void {
  clearTimers(lobby);
  lobby.state = 'waiting';
  lobby.pausedAt = null;
  lobby.pausedTotalMs = 0;
  lobby.pauseCount = 0;
  lobby.droppedNames = [];
  for (const seat of lobby.seats.values()) {
    seat.ready = false;
    seat.loaded = false;
    seat.done = false;
    seat.spectating = false;
    seat.report = { ...EMPTY_REPORT };
  }
  broadcast(io, lobby);
}

/* ─── Song resolution ───────────────────────────────────────────────────── */

/**
 * Resolve a song id to the projection the lobby publishes.
 *
 * The host names a song; the *server* decides what that means. This is the
 * single most important difference from the old handler, which took a song
 * object off the wire and broadcast it — letting a host hand every other player
 * in the room an arbitrary `audioUrl`.
 */
async function resolveSong(songId: string): Promise<LobbySong | null> {
  try {
    const prisma = getPrismaClient();
    const song = await prisma.song.findFirst({
      where: { id: songId, isPublic: true },
      select: { id: true, title: true, artist: true, coverUrl: true, duration: true, bpm: true },
    });
    if (!song) return null;
    return {
      id: song.id,
      title: song.title,
      artist: song.artist,
      coverUrl: song.coverUrl,
      duration: song.duration,
      bpm: song.bpm ?? 0,
    };
  } catch (error) {
    logger.warn({
      event: 'slice_song_lookup_failed',
      songId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/* ─── Garbage collection ────────────────────────────────────────────────── */

function ensureGc(): void {
  if (gcInterval) return;
  gcInterval = setInterval(() => {
    const now = Date.now();
    for (const [code, lobby] of lobbies) {
      const idle = now - lobby.lastActivityAt > LOBBY_IDLE_TIMEOUT_MS;
      const empty = lobby.seats.size === 0;
      if (idle || empty) destroyLobby(code);
    }
  }, GC_INTERVAL_MS);
  gcInterval.unref?.();
}

/* ─── Handlers ──────────────────────────────────────────────────────────── */

function lobbyOf(socket: Socket): { lobby: Lobby; seat: Seat } | null {
  const link = socketLobby.get(socket.id);
  if (!link) return null;
  const lobby = lobbies.get(link.code);
  if (!lobby) {
    socketLobby.delete(socket.id);
    return null;
  }
  const seat = lobby.seats.get(link.userId);
  if (!seat) return null;
  return { lobby, seat };
}

function isHost(lobby: Lobby, seat: Seat): boolean {
  return lobby.hostUserId === seat.userId;
}

export function registerSliceItHandlers(io: Server, socket: Socket): void {
  ensureGc();

  const handlers: Handlers<typeof EVENTS> = {
    'slice:create': (payload, sock) => {
      const who = identity(sock);
      if (!who) return fail(sock, 'auth_required', 'Sign in to play multiplayer.');
      if (lobbies.size >= MAX_LOBBIES) {
        return fail(sock, 'lobby_limit', 'Too many lobbies right now. Try again shortly.');
      }
      leaveCurrent(io, sock);

      const lobby = createLobby(who, payload?.isPublic === true);
      if (!lobby) return fail(sock, 'lobby_limit', 'Could not create a lobby. Try again.');

      seatUser(io, lobby, sock, who);
      touch(lobby);
      sock.emit(S2C.JOINED, { code: lobby.code, socketId: sock.id });
      broadcast(io, lobby);
    },

    'slice:join': (payload, sock) => {
      const who = identity(sock);
      if (!who) return fail(sock, 'auth_required', 'Sign in to play multiplayer.');

      const code = payload.code;
      const lobby = lobbies.get(code);
      if (!lobby) return fail(sock, 'not_found', 'No lobby with that code.');

      const existing = lobby.seats.get(who.userId);
      if (!existing && lobby.seats.size >= MAX_LOBBY_PLAYERS) {
        return fail(sock, 'full', 'That lobby is full.');
      }

      // Only leave a *different* lobby: a reconnect re-joining its own room
      // must not tear its seat down and rebuild it.
      const current = socketLobby.get(sock.id);
      if (current && current.code !== code) leaveCurrent(io, sock);

      const seat = seatUser(io, lobby, sock, who);
      touch(lobby);
      sock.emit(S2C.JOINED, { code: lobby.code, socketId: sock.id });
      // Catch a returning player up on what was said while they were gone.
      for (const message of lobby.chat.slice(-10)) sock.emit(S2C.CHAT, message);

      // They are back inside their grace window — put the room back in motion.
      // Nobody was dropped, so the resume banner has no names to report.
      if (lobby.pausedAt !== null && heldPeers(lobby).length === 0) lobby.droppedNames = [];
      releasePauseIfSettled(io, lobby);
      broadcast(io, lobby);
    },

    'slice:quickplay': (_payload, sock) => {
      const who = identity(sock);
      if (!who) return fail(sock, 'auth_required', 'Sign in to play multiplayer.');
      leaveCurrent(io, sock);

      // Fullest-first, so quickplay concentrates people into a few busy lobbies
      // rather than scattering them one to a room.
      const open = Array.from(lobbies.values())
        .filter((l) => l.isPublic && l.state === 'waiting' && l.seats.size < MAX_LOBBY_PLAYERS)
        .sort((a, b) => b.seats.size - a.seats.size);

      const lobby = open[0] ?? createLobby(who, true);
      if (!lobby) return fail(sock, 'lobby_limit', 'Could not find or create a lobby.');

      seatUser(io, lobby, sock, who);
      touch(lobby);
      sock.emit(S2C.JOINED, { code: lobby.code, socketId: sock.id });
      broadcast(io, lobby);
    },

    'slice:browse': (_payload, sock) => {
      const rows: PublicLobbyInfo[] = Array.from(lobbies.values())
        .filter((l) => l.isPublic && l.state === 'waiting' && l.seats.size < MAX_LOBBY_PLAYERS)
        .sort((a, b) => b.seats.size - a.seats.size || a.createdAt - b.createdAt)
        .slice(0, BROWSE_CAP)
        .map((l) => ({
          code: l.code,
          hostName: l.seats.get(l.hostUserId)?.name ?? 'Host',
          playerCount: l.seats.size,
          maxPlayers: MAX_LOBBY_PLAYERS,
          songTitle: l.song?.title ?? null,
        }));
      sock.emit(S2C.BROWSE_RESULT, rows);
    },

    'slice:leave': (_payload, sock) => {
      leaveCurrent(io, sock);
    },

    'slice:ready': (payload, sock) => {
      const found = lobbyOf(sock);
      if (!found) return;
      const { lobby, seat } = found;
      if (lobby.state !== 'waiting') return;
      seat.ready = typeof payload?.ready === 'boolean' ? payload.ready : !seat.ready;
      touch(lobby);
      broadcast(io, lobby);
    },

    'slice:song': async (payload, sock) => {
      const found = lobbyOf(sock);
      if (!found) return;
      const { lobby, seat } = found;
      if (!isHost(lobby, seat)) return fail(sock, 'not_host', 'Only the host can pick the song.');
      if (lobby.state !== 'waiting') return fail(sock, 'in_progress', 'A match is in progress.');

      const song = await resolveSong(payload.songId);
      if (!song) return fail(sock, 'song_unavailable', 'That track is no longer available.');

      const live = lobbies.get(lobby.code);
      if (!live) return;
      live.song = song;
      // A new song invalidates everyone's ready state — you agreed to play a
      // different track.
      for (const s of live.seats.values()) s.ready = false;
      touch(live);
      broadcast(io, live);
    },

    'slice:settings': (payload, sock) => {
      const found = lobbyOf(sock);
      if (!found) return;
      const { lobby, seat } = found;
      if (!isHost(lobby, seat)) return fail(sock, 'not_host', 'Only the host can change settings.');
      if (typeof payload?.isPublic === 'boolean') lobby.isPublic = payload.isPublic;
      touch(lobby);
      broadcast(io, lobby);
    },

    'slice:mods': (payload, sock) => {
      const found = lobbyOf(sock);
      if (!found) return;
      const { lobby, seat } = found;
      if (lobby.state !== 'waiting') return;
      // `forMultiplayer` is what stops a 0.5x seat racing everyone else at half
      // speed for a free win, and what drops Sudden Death in a mode where dying
      // early means watching four minutes of other people playing.
      seat.modifiers = forMultiplayer(payload.modifiers);
      touch(lobby);
      broadcast(io, lobby);
    },

    'slice:start': (_payload, sock) => {
      const found = lobbyOf(sock);
      if (!found) return;
      const { lobby, seat } = found;
      if (!isHost(lobby, seat)) return fail(sock, 'not_host', 'Only the host can start the match.');
      if (lobby.state !== 'waiting') return fail(sock, 'in_progress', 'A match is in progress.');
      if (!lobby.song) return fail(sock, 'no_song', 'Pick a track first.');

      const racers = connectedSeats(lobby);
      if (racers.length === 0) return fail(sock, 'too_few_players', 'Nobody is here to play.');
      // Everyone who is not the host must have readied. The host's own click
      // *is* their ready.
      const waiting = racers.filter((s) => !isHost(lobby, s) && !s.ready);
      if (waiting.length > 0) {
        return fail(sock, 'too_few_players', 'Not everyone is ready yet.');
      }

      // A player still inside a disconnect window does not get dragged into a
      // match they cannot load.
      for (const s of lobby.seats.values()) {
        s.spectating = s.disconnectedAt !== null;
      }

      touch(lobby);
      beginLoading(io, lobby);
    },

    'slice:loaded': (_payload, sock) => {
      const found = lobbyOf(sock);
      if (!found) return;
      const { lobby, seat } = found;
      if (lobby.state !== 'loading') return;
      seat.loaded = true;
      touch(lobby);

      const racers = activeSeats(lobby);
      emitLoading(io, lobby, Date.now() + LOAD_TIMEOUT_MS);
      if (racers.length > 0 && racers.every((s) => s.loaded)) beginCountdown(io, lobby);
    },

    'slice:score': (payload, sock) => {
      const found = lobbyOf(sock);
      if (!found) return;
      const { lobby, seat } = found;
      if (lobby.state !== 'playing') return;
      // Stored, not broadcast: the ticker publishes the whole room at once.
      seat.report = payload;
      lobby.lastActivityAt = Date.now();
    },

    'slice:finish': (payload, sock) => {
      const found = lobbyOf(sock);
      if (!found) return;
      const { lobby, seat } = found;
      if (lobby.state !== 'playing' && lobby.state !== 'countdown') return;
      seat.report = payload;
      seat.done = true;
      touch(lobby);
      maybeFinishMatch(io, lobby);
    },

    'slice:rematch': (_payload, sock) => {
      const found = lobbyOf(sock);
      if (!found) return;
      const { lobby, seat } = found;
      if (!isHost(lobby, seat)) return fail(sock, 'not_host', 'Only the host can restart.');
      touch(lobby);
      returnToLobby(io, lobby);
    },

    'slice:chat': (payload, sock) => {
      const found = lobbyOf(sock);
      if (!found) return;
      const { lobby, seat } = found;
      const text = sanitizeString(payload.text, CHAT_MAX_LENGTH);
      if (!text) return;

      const message: ChatMessage = {
        // Deterministic and collision-free without pulling in a uuid
        // dependency: one socket cannot send two messages in the same
        // millisecond and pass the rate limiter.
        id: `${sock.id}-${Date.now()}`,
        socketId: sock.id,
        name: seat.name,
        text,
        at: Date.now(),
      };
      lobby.chat.push(message);
      if (lobby.chat.length > CHAT_HISTORY) lobby.chat.shift();
      touch(lobby);
      io.to(lobbyRoom(lobby.code)).emit(S2C.CHAT, message);
    },

    'slice:kick': (payload, sock) => {
      const found = lobbyOf(sock);
      if (!found) return;
      const { lobby, seat } = found;
      if (!isHost(lobby, seat)) return fail(sock, 'not_host', 'Only the host can remove players.');

      const target = Array.from(lobby.seats.values()).find((s) => s.socketId === payload.socketId);
      if (!target || target.userId === seat.userId) return;

      const targetSocket = target.socketId ? io.sockets.sockets.get(target.socketId) : null;
      targetSocket?.emit(S2C.KICKED, { reason: 'removed_by_host' });
      targetSocket?.leave(lobbyRoom(lobby.code));
      removeSeat(io, lobby, target.userId, 'kicked');
    },
  };

  bindEvents(socket, EVENTS, handlers, {
    app: 'slice-it',
    logger,
    rateLimit: checkRateLimit,
    onRateLimited: (sock) => fail(sock, 'rate_limited', 'Slow down a moment.'),
  });
}

/** Deliberate departure — the seat goes immediately, no grace window. */
function leaveCurrent(io: Server, socket: Socket): void {
  const link = socketLobby.get(socket.id);
  if (!link) return;
  socketLobby.delete(socket.id);
  const lobby = lobbies.get(link.code);
  if (!lobby) return;
  socket.leave(lobbyRoom(lobby.code));
  removeSeat(io, lobby, link.userId, 'left');
}

/**
 * A socket dropped.
 *
 * Distinguished from {@link leaveCurrent} on purpose: leaving is a decision and
 * takes effect at once; dropping is an accident and buys a grace window whose
 * length depends on what is at stake — 30 seconds mid-song, 15 in a lobby.
 */
export function handleSliceItDisconnect(io: Server, socket: Socket): void {
  const link = socketLobby.get(socket.id);
  if (!link) return;
  socketLobby.delete(socket.id);

  const lobby = lobbies.get(link.code);
  if (!lobby) return;
  const seat = lobby.seats.get(link.userId);
  if (!seat || seat.socketId !== socket.id) return;

  seat.socketId = null;
  seat.disconnectedAt = Date.now();

  const inMatch =
    lobby.state === 'playing' || lobby.state === 'countdown' || lobby.state === 'loading';
  const graceMs = inMatch ? MATCH_DISCONNECT_GRACE_MS : LOBBY_DISCONNECT_GRACE_MS;

  if (seat.graceTimer) clearTimeout(seat.graceTimer);
  seat.graceTimer = setTimeout(() => {
    const current = lobbies.get(link.code);
    if (!current) return;
    const held = current.seats.get(link.userId);
    // They came back inside the window — nothing to do.
    if (!held || held.disconnectedAt === null) return;
    removeSeat(io, current, link.userId, 'disconnect_grace_expired');
  }, graceMs);

  if (lobby.state === 'playing' || lobby.state === 'countdown') {
    // The pause timer supersedes the per-seat one while a match is live: the
    // room's window is what decides, so everyone sees the same countdown.
    pauseMatch(io, lobby);
  } else if (lobby.state === 'loading') {
    // Nothing to pause yet — just stop waiting on them to finish loading.
    const racers = activeSeats(lobby).filter((s) => s.disconnectedAt === null);
    if (racers.length > 0 && racers.every((s) => s.loaded)) beginCountdown(io, lobby);
  }

  broadcast(io, lobby);
}

/** Test seam: drop every lobby. Never called in production. */
export function __resetSliceItLobbies(): void {
  for (const code of Array.from(lobbies.keys())) destroyLobby(code);
  socketLobby.clear();
  if (gcInterval) {
    clearInterval(gcInterval);
    gcInterval = null;
  }
}
