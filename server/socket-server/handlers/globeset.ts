/**
 * GlobeSet — race lobby + authoritative run handler.
 *
 * The server is a lobby manager and the referee of a race, not a shared
 * board: every racer in a room is dealt the SAME deck (one seed, handed out
 * at the top of the countdown) but plays their OWN `RunState`, because
 * GlobeSet is a race to clear a deck, not a contest over one shared board.
 * `globeset:submit` names cards, not board positions — see
 * `lib/globeset/net/events.ts` for why — and this file maps a card back to
 * that player's own board index, replays it through `submitSelection`, and
 * ships the authoritative result back on `globeset:board`.
 *
 * Follows the Laundry Sort conventions: in-memory lobby `Map`, socket.io
 * rooms for broadcast, soft hub auth read off `socket.data`, per-event rate
 * limits declared in `config.ts`, a batched standings tick instead of one
 * broadcast per submission, and a fire-and-forget result write on finish —
 * except GlobeSet has nowhere to write to; see {@link logRaceResults}.
 *
 * **No reconnect grace window.** Laundry Sort's versus mode is signed-in
 * only and still drops a seat on disconnect with no grace; GlobeSet is
 * soft-auth (an anonymous racer is a first-class player, not a degraded
 * one — see {@link identity}) and follows the same simple rule: a socket
 * that drops loses its seat immediately. Holding a seat open would mean
 * matching a returning player back to it, and an anonymous seat has no
 * stable identity to match against beyond the socket id that just died.
 *
 * NOTE: server code imports `lib/` RELATIVELY. `@/lib/...` is not resolvable
 * in the esbuild server bundle (see `server/CLAUDE.md` §Gotchas 7).
 */

import type { Server, Socket } from 'socket.io';
import { generateRoomCode, sanitizeUserName } from '../utils';
import { checkRateLimit } from '../rate-limit';
import { logger } from '../logger';
import { bindEvents, type Handlers } from '../../shared/typed-socket';
import {
  registerPartyGame,
  verifyPartyTicket,
  PARTY_ROOM_GRACE_MS,
  type PartyMember,
  type PartyTicket,
} from '../party-contract';
import { BOARD_SIZE } from '../../../lib/globeset/cards';
import {
  createRun,
  dealFromSeed,
  submitSelection,
  type RunState,
} from '../../../lib/globeset/game';
import {
  COUNTDOWN_SECONDS,
  DEFAULT_GOAL,
  DEFAULT_SPRINT_TARGET,
  MAX_RACE_PLAYERS,
  MIN_RACE_PLAYERS,
  RACE_TIMEOUT_MS,
  STANDINGS_TICK_MS,
  type RaceGoal,
  type SprintTarget,
} from '../../../lib/globeset/constants';
import {
  EVENTS,
  ROOM_PREFIX,
  S2C,
  type BoardPayload,
  type FinalStanding,
  type LiveStanding,
  type LobbySnapshot,
  type PublicLobbyInfo,
  type RacePhase,
  type RaceStartPayload,
  type RejectReason,
} from '../../../lib/globeset/net/events';

/* ─── Constants ─────────────────────────────────────────────────────────── */

const MAX_LOBBIES = 2000;
const BROWSE_CAP = 30;
const GC_INTERVAL_MS = 60_000;
const LOBBY_IDLE_TIMEOUT_MS = 30 * 60_000;

/* ─── Types ─────────────────────────────────────────────────────────────── */

interface Seat {
  socketId: string;
  userId: string;
  name: string;
  avatarUrl: string | null;
  ready: boolean;
  /** This seat's authoritative run. Null until the countdown deals one. */
  run: RunState | null;
  /** Server ms-since-`startsAt` this seat met the goal, or null while racing. */
  finishedAtMs: number | null;
  forfeited: boolean;
}

interface Lobby {
  code: string;
  hostSocketId: string;
  /**
   * Set when the lobby was created for a party before anyone connected: the
   * first seat claimed by this user becomes host. See `seatPlayer`.
   */
  pendingHostUserId: string | null;
  isPublic: boolean;
  goal: RaceGoal;
  sprintTarget: SprintTarget;
  phase: RacePhase;
  seats: Map<string, Seat>;
  /** The seed every seat's run was dealt from this round. */
  seed: number;
  /** Server epoch-ms the countdown ends and submissions become legal. */
  startsAt: number;
  lastActivityAt: number;
  countdownTimer: ReturnType<typeof setTimeout> | null;
  standingsTimer: ReturnType<typeof setInterval> | null;
  timeoutTimer: ReturnType<typeof setTimeout> | null;
}

const lobbies = new Map<string, Lobby>();
/** Reverse index: a socket is only ever seated in one lobby. */
const socketLobby = new Map<string, string>();

let gcInterval: ReturnType<typeof setInterval> | null = null;

/* ─── Helpers ───────────────────────────────────────────────────────────── */

function roomName(code: string): string {
  return `${ROOM_PREFIX}${code}`;
}

/** The signed-in user id behind a socket, or null for an anonymous connection. */
function realUserId(socket: Socket): string | null {
  const raw = socket.data?.userId;
  return typeof raw === 'string' && raw ? raw : null;
}

/**
 * Who a socket races as.
 *
 * GlobeSet's hub auth is soft, but the race contract (`RacePlayer`,
 * `FinalStanding`, …) requires a non-null `userId` on every player-facing
 * payload, so an anonymous socket races under a synthetic id scoped to its
 * own connection. Never persisted and never matched against a party ticket
 * — {@link realUserId} is what ticket redemption uses instead.
 */
/**
 * A short, readable tag for an anonymous racer, hashed from the whole socket id.
 *
 * Not the id's last few characters: socket.io ids share long runs of the same
 * alphabet, so two racers in one room came out "Guest AAAK" and "Guest AAAO" —
 * unique, and useless for telling two rows of a scoreboard apart at a glance.
 * Folding the whole id spreads them across the alphabet instead. Uses the room
 * code's confusable-free alphabet (no O/0, no I/1) for the same reason room
 * codes do: somebody is going to read it out loud.
 */
function guestTag(socketId: string): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let hash = 0x811c9dc5;
  for (let i = 0; i < socketId.length; i++) {
    hash ^= socketId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  let tag = '';
  for (let i = 0; i < 4; i++) {
    tag += alphabet[hash % alphabet.length];
    hash = Math.floor(hash / alphabet.length) || Math.imul(hash + i + 1, 0x01000193) >>> 0;
  }
  return tag;
}

function identity(socket: Socket): { userId: string; name: string; avatarUrl: string | null } {
  const real = realUserId(socket);
  const given = typeof socket.data?.userName === 'string' ? socket.data.userName : undefined;
  // `sanitizeUserName` answers "Player" for everyone it does not recognise,
  // which in a race is a scoreboard of identical rows: the standings strip is
  // where a racer finds themselves and works out who to chase. An anonymous
  // seat gets a tag off its own socket id instead — unique for the length of
  // the room, which is exactly as long as it has to be.
  const name = given ? sanitizeUserName(given) : `Guest ${guestTag(socket.id)}`;
  const avatarUrl = typeof socket.data?.avatarUrl === 'string' ? socket.data.avatarUrl : null;
  return { userId: real ?? `guest:${socket.id}`, name, avatarUrl };
}

function fail(socket: Socket, message: string): void {
  socket.emit(S2C.ERROR, { message });
}

function reject(socket: Socket, reason: RejectReason): void {
  socket.emit(S2C.REJECT, { reason });
}

/** Cards no longer in play for a run — the progress rail's numerator. */
function clearedOf(run: RunState | null): number {
  if (!run) return 0;
  let n = 0;
  for (const f of run.found) n += f.cards.length;
  return n;
}

function hasFinished(run: RunState, goal: RaceGoal, sprintTarget: number): boolean {
  return goal === 'sprint' ? run.found.length >= sprintTarget : run.status === 'complete';
}

function snapshot(lobby: Lobby): LobbySnapshot {
  return {
    code: lobby.code,
    phase: lobby.phase,
    hostSocketId: lobby.hostSocketId,
    isPublic: lobby.isPublic,
    goal: lobby.goal,
    sprintTarget: lobby.sprintTarget,
    maxPlayers: MAX_RACE_PLAYERS,
    players: Array.from(lobby.seats.values()).map((seat) => ({
      socketId: seat.socketId,
      userId: seat.userId,
      name: seat.name,
      avatarUrl: seat.avatarUrl,
      ready: seat.ready,
      isHost: seat.socketId === lobby.hostSocketId,
    })),
  };
}

function broadcastLobby(io: Server, lobby: Lobby): void {
  io.to(roomName(lobby.code)).emit(S2C.LOBBY, snapshot(lobby));
}

function publicInfo(lobby: Lobby): PublicLobbyInfo {
  const host = lobby.seats.get(lobby.hostSocketId);
  return {
    code: lobby.code,
    hostName: host?.name ?? 'Host',
    playerCount: lobby.seats.size,
    maxPlayers: MAX_RACE_PLAYERS,
    goal: lobby.goal,
    sprintTarget: lobby.sprintTarget,
  };
}

function touch(lobby: Lobby): void {
  lobby.lastActivityAt = Date.now();
}

function clearTimers(lobby: Lobby): void {
  if (lobby.countdownTimer) clearTimeout(lobby.countdownTimer);
  if (lobby.standingsTimer) clearInterval(lobby.standingsTimer);
  if (lobby.timeoutTimer) clearTimeout(lobby.timeoutTimer);
  lobby.countdownTimer = null;
  lobby.standingsTimer = null;
  lobby.timeoutTimer = null;
}

function destroyLobby(code: string): void {
  const lobby = lobbies.get(code);
  if (!lobby) return;
  clearTimers(lobby);
  lobbies.delete(code);
}

function newCode(): string {
  for (let attempt = 0; attempt < 12; attempt++) {
    const code = generateRoomCode();
    if (!lobbies.has(code)) return code;
  }
  return `${generateRoomCode()}${Date.now().toString(36).slice(-2).toUpperCase()}`;
}

function createLobby(options: {
  isPublic: boolean;
  goal: RaceGoal;
  sprintTarget: SprintTarget;
  hostSocketId: string;
  pendingHostUserId: string | null;
}): Lobby | null {
  if (lobbies.size >= MAX_LOBBIES) return null;
  const lobby: Lobby = {
    code: newCode(),
    hostSocketId: options.hostSocketId,
    pendingHostUserId: options.pendingHostUserId,
    isPublic: options.isPublic,
    goal: options.goal,
    sprintTarget: options.sprintTarget,
    phase: 'waiting',
    seats: new Map(),
    seed: 0,
    startsAt: 0,
    lastActivityAt: Date.now(),
    countdownTimer: null,
    standingsTimer: null,
    timeoutTimer: null,
  };
  lobbies.set(lobby.code, lobby);
  return lobby;
}

/**
 * Seat a socket. Idempotent: re-sending a join for a lobby the socket is
 * already in refreshes the broadcast rather than doubling the seat.
 */
function seatPlayer(io: Server, socket: Socket, lobby: Lobby): void {
  const existing = lobby.seats.get(socket.id);

  if (!existing) {
    if (lobby.seats.size >= MAX_RACE_PLAYERS) return fail(socket, 'That lobby is full.');
    if (lobby.phase === 'playing' || lobby.phase === 'countdown') {
      return fail(socket, 'A race is already in progress.');
    }
    const who = identity(socket);
    lobby.seats.set(socket.id, {
      socketId: socket.id,
      userId: who.userId,
      name: who.name,
      avatarUrl: who.avatarUrl,
      ready: false,
      run: null,
      finishedAtMs: null,
      forfeited: false,
    });
    // The party path creates a room before its host has connected; whoever
    // arrives holding that identity takes the chair.
    if (lobby.pendingHostUserId && who.userId === lobby.pendingHostUserId) {
      lobby.hostSocketId = socket.id;
      lobby.pendingHostUserId = null;
    }
  }

  if (!lobby.seats.has(lobby.hostSocketId)) lobby.hostSocketId = socket.id;

  socketLobby.set(socket.id, lobby.code);
  socket.join(roomName(lobby.code));
  touch(lobby);
  socket.emit(S2C.JOINED, { code: lobby.code, socketId: socket.id });
  broadcastLobby(io, lobby);
}

function seatOf(socket: Socket): { lobby: Lobby; seat: Seat } | null {
  const code = socketLobby.get(socket.id);
  if (!code) return null;
  const lobby = lobbies.get(code);
  if (!lobby) {
    socketLobby.delete(socket.id);
    return null;
  }
  const seat = lobby.seats.get(socket.id);
  if (!seat) return null;
  return { lobby, seat };
}

function unseat(io: Server, socketId: string): void {
  const code = socketLobby.get(socketId);
  socketLobby.delete(socketId);
  if (!code) return;
  // Leave the broadcast room too, or a socket that hops lobbies keeps
  // receiving the old room's snapshots.
  io.sockets.sockets.get(socketId)?.leave(roomName(code));

  const lobby = lobbies.get(code);
  if (!lobby) return;

  lobby.seats.delete(socketId);
  touch(lobby);

  if (lobby.seats.size === 0) {
    destroyLobby(code);
    return;
  }

  if (lobby.hostSocketId === socketId) {
    const next = lobby.seats.keys().next().value;
    if (next) lobby.hostSocketId = next;
  }

  // A player leaving mid-race can be the last one the room was waiting on.
  if (lobby.phase === 'playing' && allSettled(lobby)) {
    finishRound(io, lobby);
  } else {
    broadcastLobby(io, lobby);
  }
}

/** Every seat that has not forfeited has finished — the round has nothing left to wait for. */
function allSettled(lobby: Lobby): boolean {
  for (const seat of lobby.seats.values()) {
    if (seat.forfeited) continue;
    if (seat.finishedAtMs === null) return false;
  }
  return true;
}

/* ─── Race lifecycle ────────────────────────────────────────────────────── */

function mintSeed(): number {
  return (Math.random() * 0xffffffff) >>> 0;
}

function beginCountdown(io: Server, lobby: Lobby): void {
  clearTimers(lobby);
  lobby.phase = 'countdown';

  // One seed, dealt once, handed to every seat's own run — the whole of the
  // synchronisation a race needs (see the file docblock).
  const seed = mintSeed();
  const deck = dealFromSeed(seed);
  lobby.seed = seed;
  lobby.startsAt = Date.now() + COUNTDOWN_SECONDS * 1000;

  for (const seat of lobby.seats.values()) {
    seat.run = createRun(deck, BOARD_SIZE);
    seat.ready = false;
    seat.finishedAtMs = null;
    seat.forfeited = false;
  }

  const payload: RaceStartPayload = {
    seed,
    goal: lobby.goal,
    sprintTarget: lobby.sprintTarget,
    startsAt: lobby.startsAt,
    roster: Array.from(lobby.seats.values()).map((seat) => ({
      socketId: seat.socketId,
      userId: seat.userId,
      name: seat.name,
      avatarUrl: seat.avatarUrl,
    })),
  };
  io.to(roomName(lobby.code)).emit(S2C.COUNTDOWN, payload);
  broadcastLobby(io, lobby);

  lobby.countdownTimer = setTimeout(() => {
    const current = lobbies.get(lobby.code);
    if (!current || current.phase !== 'countdown') return;
    startMatch(io, current);
  }, COUNTDOWN_SECONDS * 1000);
}

/**
 * One seat's private view of its own run. Never broadcast — an opponent's board
 * is not an opponent's business, and the standings carry everything a racer is
 * allowed to know about anyone else.
 */
function boardPayloadFor(seat: Seat): BoardPayload {
  return {
    board: seat.run ? [...seat.run.board] : [],
    drawIndex: seat.run?.drawIndex ?? 0,
    cleared: clearedOf(seat.run),
    globeSets: seat.run?.found.length ?? 0,
    misses: seat.run?.misses ?? 0,
    finishedAtMs: seat.finishedAtMs,
  };
}

function startMatch(io: Server, lobby: Lobby): void {
  lobby.phase = 'playing';
  touch(lobby);

  // Deal each racer their opening board. Without this the only `globeset:board`
  // a client ever sees is the answer to its own submission — so a race started
  // with a board nobody had been sent, and every player sat looking at an empty
  // table with a running clock.
  for (const seat of lobby.seats.values()) {
    io.to(seat.socketId).emit(S2C.BOARD, boardPayloadFor(seat));
  }

  // One batched broadcast per tick, never one message per player per event.
  lobby.standingsTimer = setInterval(() => broadcastStandings(io, lobby), STANDINGS_TICK_MS);

  // A single player who walks away must not hold the room — and everyone in
  // it — open indefinitely.
  lobby.timeoutTimer = setTimeout(() => {
    const current = lobbies.get(lobby.code);
    if (current && current.phase === 'playing') finishRound(io, current);
  }, RACE_TIMEOUT_MS);

  broadcastLobby(io, lobby);
}

function broadcastStandings(io: Server, lobby: Lobby): void {
  const standings: LiveStanding[] = Array.from(lobby.seats.values()).map((seat) => ({
    socketId: seat.socketId,
    cleared: clearedOf(seat.run),
    globeSets: seat.run?.found.length ?? 0,
    misses: seat.run?.misses ?? 0,
    done: seat.forfeited || seat.finishedAtMs !== null,
  }));
  io.to(roomName(lobby.code)).emit(S2C.STANDINGS, { standings });
}

/**
 * Rank the round: finishers by time ascending, then whoever is still
 * mid-run by progress, forfeiters last — each group sorted, never
 * interleaved, so giving up is never a way to outrank someone who kept
 * playing.
 */
function buildResults(lobby: Lobby): FinalStanding[] {
  const seats = Array.from(lobby.seats.values());
  const finishers = seats
    .filter((s) => !s.forfeited && s.finishedAtMs !== null)
    .sort((a, b) => (a.finishedAtMs as number) - (b.finishedAtMs as number));
  const stillRacing = seats
    .filter((s) => !s.forfeited && s.finishedAtMs === null)
    .sort((a, b) => clearedOf(b.run) - clearedOf(a.run));
  const forfeited = seats
    .filter((s) => s.forfeited)
    .sort((a, b) => clearedOf(b.run) - clearedOf(a.run));

  return [...finishers, ...stillRacing, ...forfeited].map((seat, index) => ({
    socketId: seat.socketId,
    userId: seat.userId,
    name: seat.name,
    avatarUrl: seat.avatarUrl,
    placement: index + 1,
    timeMs: seat.forfeited ? null : seat.finishedAtMs,
    cleared: clearedOf(seat.run),
    globeSets: seat.run?.found.length ?? 0,
    misses: seat.run?.misses ?? 0,
    forfeited: seat.forfeited,
  }));
}

function finishRound(io: Server, lobby: Lobby): void {
  clearTimers(lobby);
  lobby.phase = 'results';
  touch(lobby);

  const standings = buildResults(lobby);
  io.to(roomName(lobby.code)).emit(S2C.RESULTS, { standings });
  logRaceResults(lobby, standings);
  broadcastLobby(io, lobby);
}

/**
 * Race results have nowhere to persist to.
 *
 * `prisma/schema.prisma` has no `GlobeSetPlayer`/`GlobeSetRaceMatch` table the
 * way Laundry Sort's versus mode writes to `LaundryPlayer` — the closest
 * existing model, `DailyPuzzleScore`, is keyed `(userId, gameMode,
 * dateKey)` for the SOLO daily puzzle (one row per player per day) and
 * would either collide across same-day races or misrepresent a multiplayer
 * result as that day's daily-puzzle score. Adding a table is a schema
 * change (a migration; see `lib/CLAUDE.md`'s new-table PK policy) outside
 * this handler's remit, so results are logged and otherwise dropped until
 * one exists — never blocking the results screen, same as every other
 * write on this path would be.
 */
function logRaceResults(lobby: Lobby, standings: FinalStanding[]): void {
  logger.info({
    event: 'globeset_race_finished',
    code: lobby.code,
    goal: lobby.goal,
    sprintTarget: lobby.sprintTarget,
    players: standings.length,
    finishers: standings.filter((s) => s.timeMs !== null).length,
  });
}

/* ─── Garbage collection ────────────────────────────────────────────────── */

function ensureGc(): void {
  if (gcInterval) return;
  gcInterval = setInterval(() => {
    const now = Date.now();
    for (const [code, lobby] of lobbies) {
      // An empty lobby is swept, but not instantly — a party room is
      // created with no seats and stays that way until its members finish
      // loading, so an instant sweep would destroy it inside the ticket's
      // own lifetime. See `party-contract.ts`.
      const idleFor = now - lobby.lastActivityAt;
      const abandoned = lobby.seats.size === 0 && idleFor > PARTY_ROOM_GRACE_MS;
      if (abandoned || idleFor > LOBBY_IDLE_TIMEOUT_MS) destroyLobby(code);
    }
  }, GC_INTERVAL_MS);
  gcInterval.unref?.();
}

/* ─── Party contract ────────────────────────────────────────────────────── */

registerPartyGame('globeset', {
  maxPartySize: MAX_RACE_PLAYERS,
  async createRoomForParty(members: PartyMember[]) {
    const lobby = createLobby({
      isPublic: false,
      goal: DEFAULT_GOAL,
      sprintTarget: DEFAULT_SPRINT_TARGET,
      // No socket has arrived yet; the party leader claims the chair on join.
      hostSocketId: '',
      pendingHostUserId: members[0]?.userId ?? null,
    });
    if (!lobby) throw new Error('lobby-capacity');
    return { game: 'globeset', roomId: lobby.code };
  },
  reapIfEmpty(roomId: string): void {
    const lobby = lobbies.get(roomId.toUpperCase());
    if (!lobby || lobby.seats.size > 0) return;
    destroyLobby(lobby.code);
  },
});

/* ─── Registration ──────────────────────────────────────────────────────── */

export function registerGlobeSetHandlers(io: Server, socket: Socket): void {
  ensureGc();

  const handlers: Handlers<typeof EVENTS> = {
    'globeset:create': (payload, sock) => {
      const lobby = createLobby({
        isPublic: payload.isPublic,
        goal: payload.goal,
        sprintTarget: payload.sprintTarget,
        hostSocketId: sock.id,
        pendingHostUserId: null,
      });
      if (!lobby) return fail(sock, 'Could not create a lobby right now. Try again.');
      unseat(io, sock.id);
      seatPlayer(io, sock, lobby);
    },

    'globeset:join': (payload, sock) => {
      const lobby = lobbies.get(payload.code);
      if (!lobby) return fail(sock, 'No lobby with that code.');

      const current = socketLobby.get(sock.id);
      if (current && current !== lobby.code) unseat(io, sock.id);
      seatPlayer(io, sock, lobby);
    },

    'globeset:quickplay': (_payload, sock) => {
      // Fullest joinable public lobby first, so players pool up instead of
      // scattering one-per-room.
      let best: Lobby | null = null;
      for (const lobby of lobbies.values()) {
        if (!lobby.isPublic || lobby.phase !== 'waiting') continue;
        if (lobby.seats.size >= MAX_RACE_PLAYERS) continue;
        if (!best || lobby.seats.size > best.seats.size) best = lobby;
      }

      if (!best) {
        best = createLobby({
          isPublic: true,
          goal: DEFAULT_GOAL,
          sprintTarget: DEFAULT_SPRINT_TARGET,
          hostSocketId: sock.id,
          pendingHostUserId: null,
        });
        if (!best) return fail(sock, 'Could not find or create a lobby.');
      }

      unseat(io, sock.id);
      seatPlayer(io, sock, best);
    },

    'globeset:browse': (_payload, sock) => {
      const rows: PublicLobbyInfo[] = [];
      for (const lobby of lobbies.values()) {
        if (!lobby.isPublic || lobby.phase !== 'waiting') continue;
        if (lobby.seats.size === 0 || lobby.seats.size >= MAX_RACE_PLAYERS) continue;
        rows.push(publicInfo(lobby));
        if (rows.length >= BROWSE_CAP) break;
      }
      sock.emit(S2C.BROWSE_RESULT, { lobbies: rows });
    },

    'globeset:leave': (_payload, sock) => {
      unseat(io, sock.id);
    },

    'globeset:ready': (payload, sock) => {
      const found = seatOf(sock);
      if (!found) return;
      const { lobby, seat } = found;
      if (lobby.phase !== 'waiting') return;
      seat.ready = payload.ready;
      touch(lobby);
      broadcastLobby(io, lobby);
    },

    'globeset:settings': (payload, sock) => {
      const found = seatOf(sock);
      if (!found) return;
      const { lobby, seat } = found;
      if (seat.socketId !== lobby.hostSocketId) {
        return fail(sock, 'Only the host can change settings.');
      }
      if (lobby.phase !== 'waiting') return fail(sock, 'A race is in progress.');

      if (payload.isPublic !== undefined) lobby.isPublic = payload.isPublic;
      if (payload.goal !== undefined) lobby.goal = payload.goal;
      if (payload.sprintTarget !== undefined) lobby.sprintTarget = payload.sprintTarget;
      // Changing the rules invalidates everyone's consent to the old ones.
      for (const s of lobby.seats.values()) s.ready = false;
      touch(lobby);
      broadcastLobby(io, lobby);
    },

    'globeset:start': (_payload, sock) => {
      const found = seatOf(sock);
      if (!found) return;
      const { lobby, seat } = found;
      if (seat.socketId !== lobby.hostSocketId) {
        return fail(sock, 'Only the host can start the race.');
      }
      if (lobby.phase !== 'waiting') return fail(sock, 'A race is already in progress.');
      if (lobby.seats.size < MIN_RACE_PLAYERS) {
        return fail(sock, 'Need at least two players to start.');
      }
      // Everyone but the host must have readied — the host's own click is
      // their ready.
      for (const s of lobby.seats.values()) {
        if (s.socketId !== lobby.hostSocketId && !s.ready) {
          return fail(sock, 'Not everyone is ready yet.');
        }
      }
      touch(lobby);
      beginCountdown(io, lobby);
    },

    'globeset:rematch': (_payload, sock) => {
      const found = seatOf(sock);
      if (!found) return;
      const { lobby, seat } = found;
      if (seat.socketId !== lobby.hostSocketId) {
        return fail(sock, 'Only the host can start a rematch.');
      }
      if (lobby.phase !== 'results') return;
      lobby.phase = 'waiting';
      for (const s of lobby.seats.values()) {
        s.ready = false;
        s.run = null;
        s.finishedAtMs = null;
        s.forfeited = false;
      }
      touch(lobby);
      broadcastLobby(io, lobby);
    },

    'globeset:ticket': (payload, sock) => {
      const userId = realUserId(sock);
      const ticket: PartyTicket | null = verifyPartyTicket(payload.ticket);
      // A ticket is a bearer secret naming one user and one room; both must
      // match or it is being replayed by somebody else.
      if (!ticket || ticket.game !== 'globeset' || !userId || ticket.userId !== userId) {
        return fail(sock, 'That invite has expired.');
      }
      const lobby = lobbies.get(ticket.roomId);
      if (!lobby) return fail(sock, 'That lobby is gone.');

      unseat(io, sock.id);
      seatPlayer(io, sock, lobby);
    },

    'globeset:submit': (payload, sock) => {
      const found = seatOf(sock);
      if (!found) return;
      const { lobby, seat } = found;
      if (lobby.phase !== 'playing' || !seat.run) return reject(sock, 'not-playing');
      if (seat.forfeited || seat.finishedAtMs !== null) return reject(sock, 'already-finished');

      const cards = payload.cards;
      if (new Set(cards).size !== cards.length) return reject(sock, 'duplicate-card');

      // A card names itself, not a position — map every one back to THIS
      // player's own board (see the file docblock).
      const indices: number[] = [];
      for (const card of cards) {
        const index = seat.run.board.indexOf(card);
        if (index === -1) return reject(sock, 'not-your-card');
        indices.push(index);
      }

      // Never trust a client-supplied time — the clock is the server's.
      const atMs = Date.now() - lobby.startsAt;
      const result = submitSelection(seat.run, indices, atMs);
      if (result.outcome !== 'accepted') return reject(sock, 'not-a-globeset');

      seat.run = result.state;
      touch(lobby);

      if (seat.finishedAtMs === null && hasFinished(seat.run, lobby.goal, lobby.sprintTarget)) {
        seat.finishedAtMs = atMs;
      }

      sock.emit(S2C.BOARD, boardPayloadFor(seat));

      if (allSettled(lobby)) finishRound(io, lobby);
    },

    'globeset:forfeit': (_payload, sock) => {
      const found = seatOf(sock);
      if (!found) return;
      const { lobby, seat } = found;
      if (lobby.phase !== 'playing') return;
      if (seat.forfeited || seat.finishedAtMs !== null) return;
      seat.forfeited = true;
      touch(lobby);
      if (allSettled(lobby)) finishRound(io, lobby);
    },
  };

  bindEvents(socket, EVENTS, handlers, {
    app: 'globeset',
    logger,
    rateLimit: checkRateLimit,
    onRateLimited: (sock) => fail(sock, 'Slow down a moment.'),
  });
}

export function handleGlobeSetDisconnect(io: Server, socket: Socket): void {
  unseat(io, socket.id);
}
