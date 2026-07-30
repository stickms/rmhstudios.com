/**
 * Laundry Sort — multiplayer lobby + race handler.
 *
 * The server is a lobby manager and a scorekeeper. It does **not** simulate
 * cloth: it hands every client in a room the same 32-bit seed, and the seeded
 * drop schedule in `lib/laundry-sort/match.ts` guarantees they all get the same
 * laundry, in the same order, at the same simulated moments. Racing the same
 * laundry is the whole contest, so that seed is the only synchronisation the
 * game needs — no state replication, no rollback, no per-frame traffic.
 *
 * What the server does own:
 *  - the lobby FSM (`waiting → countdown → playing → results → waiting`),
 *  - the seed and the wall-clock deadline (with a grace window, so a slow
 *    device that simulates the match more slowly still gets to finish it),
 *  - one **batched** score broadcast per tick rather than one message per
 *    player per tick, and
 *  - the versus leaderboard write, fire-and-forget, on results.
 *
 * Follows the Dream Rift conventions: in-memory lobby Maps, socket.io rooms
 * for broadcast, soft hub auth read off `socket.data`, per-event rate limits
 * declared in `config.ts`.
 *
 * NOTE: server code imports `lib/` RELATIVELY. `@/lib/...` is not resolvable in
 * the esbuild server bundle (see server/CLAUDE.md §Gotchas 7).
 */

import type { Server, Socket } from 'socket.io';
import { generateRoomCode, sanitizeUserName } from '../utils';
import { checkRateLimit } from '../rate-limit';
import { logger } from '../logger';
import { getPrismaClient } from '../prisma-client';
import { registerPartyGame, type PartyMember, type PartyTicket } from '../party-contract';
import { verifyPartyTicket } from '../party-contract';
import {
  COUNTDOWN_SECONDS,
  DEFAULT_DIFFICULTY,
  DEFAULT_DURATION,
  DIFFICULTIES,
  MATCH_DURATIONS,
  MAX_LOBBY_PLAYERS,
  type Difficulty,
  type MatchDuration,
} from '../../../lib/laundry-sort/constants';
import {
  C2S,
  ROOM_PREFIX,
  S2C,
  type FinalStanding,
  type LiveScore,
  type LobbySnapshot,
  type MatchResults,
  type PublicLobbyInfo,
  type ScoreReport,
} from '../../../lib/laundry-sort/net/events';

// ─── Constants ──────────────────────────────────────────────────────────────

const MAX_LOBBIES = 2000;
const BROWSE_CAP = 30;
const GC_INTERVAL_MS = 60_000;
const LOBBY_IDLE_TIMEOUT_MS = 30 * 60_000;
/** Batched score broadcast cadence. */
const SCORE_TICK_MS = 500;
/**
 * Extra wall-clock time a match stays open past its simulated duration. The
 * simulation is fixed-timestep, so a device that cannot hold 60 fps takes
 * longer in real seconds to play the same 90 simulated ones. Cutting it off at
 * exactly the duration would penalise a weak phone for being slow rather than
 * for playing badly.
 */
const FINISH_GRACE_MS = 25_000;
/** A room needs at least this many players before a versus match can start. */
const MIN_VERSUS_PLAYERS = 2;

// ─── Types ──────────────────────────────────────────────────────────────────

interface Seat {
  socketId: string;
  userId: string;
  name: string;
  avatarUrl: string | null;
  ready: boolean;
  /** Running report from this player's client. Reset at every match start. */
  report: ScoreReport;
  done: boolean;
}

interface Lobby {
  code: string;
  hostSocketId: string;
  /**
   * Set when the lobby was created for a party before anyone connected: the
   * first seat claimed by this user becomes host.
   */
  pendingHostUserId: string | null;
  isPublic: boolean;
  durationSec: MatchDuration;
  difficulty: Difficulty;
  state: 'waiting' | 'countdown' | 'playing' | 'results';
  seats: Map<string, Seat>;
  seed: number;
  startedAt: number;
  deadline: number;
  lastActivityAt: number;
  countdownTimer: ReturnType<typeof setInterval> | null;
  scoreTimer: ReturnType<typeof setInterval> | null;
  deadlineTimer: ReturnType<typeof setTimeout> | null;
}

const lobbies = new Map<string, Lobby>();
/** Reverse index: a socket is only ever seated in one lobby. */
const socketLobby = new Map<string, string>();

let gcInterval: ReturnType<typeof setInterval> | null = null;

// ─── Helpers ────────────────────────────────────────────────────────────────

function roomName(code: string): string {
  return `${ROOM_PREFIX}${code}`;
}

function emptyReport(): ScoreReport {
  return { score: 0, combo: 0, sorted: 0, wrong: 0, missed: 0, bestCombo: 0 };
}

function isDifficulty(raw: unknown): raw is Difficulty {
  return typeof raw === 'string' && (DIFFICULTIES as readonly string[]).includes(raw);
}

function isDuration(raw: unknown): raw is MatchDuration {
  return typeof raw === 'number' && (MATCH_DURATIONS as readonly number[]).includes(raw);
}

function sanitizeCode(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8);
}

/** Clamp an untrusted client report into a shape the leaderboard can survive. */
function sanitizeReport(raw: unknown): ScoreReport {
  const r = (raw ?? {}) as Record<string, unknown>;
  const num = (v: unknown, max: number): number => {
    const n = typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : 0;
    return Math.max(0, Math.min(n, max));
  };
  return {
    score: num(r.score, 1_000_000),
    combo: num(r.combo, 10_000),
    sorted: num(r.sorted, 10_000),
    wrong: num(r.wrong, 10_000),
    missed: num(r.missed, 10_000),
    bestCombo: num(r.bestCombo, 10_000),
  };
}

function identity(socket: Socket): { userId: string; name: string; avatarUrl: string | null } {
  const userId = typeof socket.data?.userId === 'string' ? socket.data.userId : '';
  const raw = typeof socket.data?.userName === 'string' ? socket.data.userName : undefined;
  const avatarUrl = typeof socket.data?.avatarUrl === 'string' ? socket.data.avatarUrl : null;
  return { userId, name: sanitizeUserName(raw), avatarUrl };
}

function fail(socket: Socket, message: string): void {
  socket.emit(S2C.ERROR, { message });
}

function snapshot(lobby: Lobby): LobbySnapshot {
  return {
    code: lobby.code,
    hostSocketId: lobby.hostSocketId,
    isPublic: lobby.isPublic,
    durationSec: lobby.durationSec,
    difficulty: lobby.difficulty,
    state: lobby.state,
    maxPlayers: MAX_LOBBY_PLAYERS,
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
    maxPlayers: MAX_LOBBY_PLAYERS,
    durationSec: lobby.durationSec,
    difficulty: lobby.difficulty,
  };
}

function touch(lobby: Lobby): void {
  lobby.lastActivityAt = Date.now();
}

function clearTimers(lobby: Lobby): void {
  if (lobby.countdownTimer) clearInterval(lobby.countdownTimer);
  if (lobby.scoreTimer) clearInterval(lobby.scoreTimer);
  if (lobby.deadlineTimer) clearTimeout(lobby.deadlineTimer);
  lobby.countdownTimer = null;
  lobby.scoreTimer = null;
  lobby.deadlineTimer = null;
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
  durationSec: MatchDuration;
  difficulty: Difficulty;
  hostSocketId: string;
  pendingHostUserId: string | null;
}): Lobby | null {
  if (lobbies.size >= MAX_LOBBIES) return null;
  const lobby: Lobby = {
    code: newCode(),
    hostSocketId: options.hostSocketId,
    pendingHostUserId: options.pendingHostUserId,
    isPublic: options.isPublic,
    durationSec: options.durationSec,
    difficulty: options.difficulty,
    state: 'waiting',
    seats: new Map(),
    seed: 0,
    startedAt: 0,
    deadline: 0,
    lastActivityAt: Date.now(),
    countdownTimer: null,
    scoreTimer: null,
    deadlineTimer: null,
  };
  lobbies.set(lobby.code, lobby);
  return lobby;
}

/**
 * Seat a socket. Idempotent: re-joining with the same socket (a reconnect that
 * kept its id, or a duplicated client call) refreshes the seat rather than
 * doubling it.
 */
function seat(io: Server, socket: Socket, lobby: Lobby): boolean {
  const who = identity(socket);
  const existing = lobby.seats.get(socket.id);

  if (!existing) {
    if (lobby.seats.size >= MAX_LOBBY_PLAYERS) {
      fail(socket, 'lobby-full');
      return false;
    }
    if (lobby.state === 'playing' || lobby.state === 'countdown') {
      fail(socket, 'match-in-progress');
      return false;
    }
    lobby.seats.set(socket.id, {
      socketId: socket.id,
      userId: who.userId,
      name: who.name,
      avatarUrl: who.avatarUrl,
      ready: false,
      report: emptyReport(),
      done: false,
    });
  }

  // The party path creates a room before its host has connected; whoever
  // arrives holding that identity takes the chair.
  if (lobby.pendingHostUserId && who.userId === lobby.pendingHostUserId) {
    lobby.hostSocketId = socket.id;
    lobby.pendingHostUserId = null;
  }
  if (!lobby.seats.has(lobby.hostSocketId)) lobby.hostSocketId = socket.id;

  socketLobby.set(socket.id, lobby.code);
  socket.join(roomName(lobby.code));
  touch(lobby);
  socket.emit(S2C.JOINED, { code: lobby.code, socketId: socket.id });
  broadcastLobby(io, lobby);
  return true;
}

function unseat(io: Server, socketId: string): void {
  const code = socketLobby.get(socketId);
  socketLobby.delete(socketId);
  if (!code) return;
  // Leave the broadcast room too. Dropping the seat without this leaves the
  // socket subscribed to a lobby it is no longer in, so a player who hops from
  // one room to another keeps receiving the old room's snapshots and its UI
  // flickers between two lobbies.
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
    if (next) {
      lobby.hostSocketId = next;
      io.to(roomName(code)).emit(S2C.HOST_CHANGED, { hostSocketId: next });
    }
  }

  // A player leaving mid-match can be the last one the room was waiting on.
  if (lobby.state === 'playing' && allDone(lobby)) {
    finishMatch(io, lobby);
  } else {
    broadcastLobby(io, lobby);
  }
}

function allDone(lobby: Lobby): boolean {
  if (lobby.seats.size === 0) return true;
  for (const s of lobby.seats.values()) if (!s.done) return false;
  return true;
}

// ─── Match lifecycle ────────────────────────────────────────────────────────

function beginCountdown(io: Server, lobby: Lobby): void {
  clearTimers(lobby);
  lobby.state = 'countdown';
  broadcastLobby(io, lobby);

  let remaining = COUNTDOWN_SECONDS;
  io.to(roomName(lobby.code)).emit(S2C.COUNTDOWN, { seconds: remaining });

  lobby.countdownTimer = setInterval(() => {
    remaining -= 1;
    if (remaining > 0) {
      io.to(roomName(lobby.code)).emit(S2C.COUNTDOWN, { seconds: remaining });
      return;
    }
    if (lobby.countdownTimer) clearInterval(lobby.countdownTimer);
    lobby.countdownTimer = null;
    startMatch(io, lobby);
  }, 1000);
}

function startMatch(io: Server, lobby: Lobby): void {
  // A seed the clients cannot influence. Everyone in the room gets this one
  // number and derives identical laundry from it.
  lobby.seed = (Math.random() * 0xffffffff) >>> 0;
  lobby.state = 'playing';
  lobby.startedAt = Date.now();
  lobby.deadline = lobby.startedAt + lobby.durationSec * 1000 + FINISH_GRACE_MS;
  for (const s of lobby.seats.values()) {
    s.report = emptyReport();
    s.done = false;
    s.ready = false;
  }
  touch(lobby);

  io.to(roomName(lobby.code)).emit(S2C.START, {
    seed: lobby.seed,
    durationSec: lobby.durationSec,
    difficulty: lobby.difficulty,
    startedAt: lobby.startedAt,
    roster: Array.from(lobby.seats.values()).map((s) => ({
      socketId: s.socketId,
      userId: s.userId,
      name: s.name,
      avatarUrl: s.avatarUrl,
    })),
  });

  // One array per tick. Emitting per player per tick would be O(players²)
  // messages, which is the shape the RMHType perf audit called out.
  lobby.scoreTimer = setInterval(() => {
    const scores: LiveScore[] = Array.from(lobby.seats.values()).map((s) => ({
      socketId: s.socketId,
      score: s.report.score,
      combo: s.report.combo,
      sorted: s.report.sorted,
      missed: s.report.missed,
      done: s.done,
    }));
    io.to(roomName(lobby.code)).emit(S2C.SCORES, scores);
  }, SCORE_TICK_MS);

  lobby.deadlineTimer = setTimeout(() => {
    if (lobby.state === 'playing') finishMatch(io, lobby);
  }, lobby.deadline - Date.now());
}

function finishMatch(io: Server, lobby: Lobby): void {
  clearTimers(lobby);
  lobby.state = 'results';
  touch(lobby);

  const ordered = Array.from(lobby.seats.values()).sort((a, b) => {
    if (b.report.score !== a.report.score) return b.report.score - a.report.score;
    if (b.report.sorted !== a.report.sorted) return b.report.sorted - a.report.sorted;
    return a.report.missed - b.report.missed;
  });

  const standings: FinalStanding[] = [];
  let place = 0;
  let lastScore: number | null = null;
  ordered.forEach((s, index) => {
    // Ties share a place, so two players on 4200 are both second.
    if (lastScore === null || s.report.score !== lastScore) place = index + 1;
    lastScore = s.report.score;
    standings.push({
      socketId: s.socketId,
      userId: s.userId,
      name: s.name,
      avatarUrl: s.avatarUrl,
      score: s.report.score,
      sorted: s.report.sorted,
      wrong: s.report.wrong,
      missed: s.report.missed,
      bestCombo: s.report.bestCombo,
      place,
    });
  });

  const results: MatchResults = {
    standings,
    durationSec: lobby.durationSec,
    difficulty: lobby.difficulty,
  };
  io.to(roomName(lobby.code)).emit(S2C.RESULTS, results);

  // Leaderboard writes never block gameplay (server/CLAUDE.md §Gotchas 4).
  void persistVersusResults(standings).catch((error) => {
    logger.error({ event: 'laundry_versus_persist_failed', error: String(error) });
  });

  // Straight back to a joinable lobby so a rematch is one click.
  lobby.state = 'waiting';
  for (const s of lobby.seats.values()) {
    s.ready = false;
    s.done = false;
  }
  broadcastLobby(io, lobby);
}

// ─── Persistence ────────────────────────────────────────────────────────────

async function persistVersusResults(standings: FinalStanding[]): Promise<void> {
  const real = standings.filter((s) => s.userId && s.userId !== 'guest');
  if (real.length === 0) return;
  const prisma = getPrismaClient();

  for (const s of real) {
    const won = s.place === 1 ? 1 : 0;
    try {
      const existing = await prisma.laundryPlayer.findUnique({ where: { userId: s.userId } });
      if (existing) {
        await prisma.laundryPlayer.update({
          where: { id: existing.id },
          data: {
            versusPlayed: { increment: 1 },
            versusWins: { increment: won },
            versusBest: Math.max(existing.versusBest, s.score),
            bestCombo: Math.max(existing.bestCombo, s.bestCombo),
            totalSorted: { increment: s.sorted },
          },
        });
        continue;
      }

      // First match ever for this account. `username` is unique, so a display
      // name already claimed by someone else falls back to a suffixed form
      // rather than losing the result.
      const base = sanitizeUserName(s.name);
      try {
        await prisma.laundryPlayer.create({
          data: {
            userId: s.userId,
            username: base,
            gamesPlayed: 0,
            versusPlayed: 1,
            versusWins: won,
            versusBest: s.score,
            bestCombo: s.bestCombo,
            totalSorted: s.sorted,
          },
        });
      } catch {
        await prisma.laundryPlayer.create({
          data: {
            userId: s.userId,
            username: `${base}-${s.userId.slice(0, 6)}`.slice(0, 32),
            gamesPlayed: 0,
            versusPlayed: 1,
            versusWins: won,
            versusBest: s.score,
            bestCombo: s.bestCombo,
            totalSorted: s.sorted,
          },
        });
      }
    } catch (error) {
      logger.warn({
        event: 'laundry_versus_row_failed',
        userId: s.userId,
        error: String(error),
      });
    }
  }
}

// ─── Garbage collection ─────────────────────────────────────────────────────

function ensureGc(): void {
  if (gcInterval) return;
  gcInterval = setInterval(() => {
    const now = Date.now();
    for (const [code, lobby] of lobbies) {
      if (lobby.seats.size === 0 || now - lobby.lastActivityAt > LOBBY_IDLE_TIMEOUT_MS) {
        destroyLobby(code);
      }
    }
  }, GC_INTERVAL_MS);
  if (gcInterval && typeof gcInterval === 'object' && 'unref' in gcInterval) gcInterval.unref();
}

// ─── Party contract ─────────────────────────────────────────────────────────

registerPartyGame('laundry-sort', {
  maxPartySize: MAX_LOBBY_PLAYERS,
  async createRoomForParty(members: PartyMember[]) {
    const lobby = createLobby({
      isPublic: false,
      durationSec: DEFAULT_DURATION,
      difficulty: DEFAULT_DIFFICULTY,
      // No socket has arrived yet; the party leader claims the chair on join.
      hostSocketId: '',
      pendingHostUserId: members[0]?.userId ?? null,
    });
    if (!lobby) throw new Error('lobby-capacity');
    return { game: 'laundry-sort', roomId: lobby.code };
  },
});

// ─── Registration ───────────────────────────────────────────────────────────

export function registerLaundrySortHandlers(io: Server, socket: Socket): void {
  ensureGc();

  const requireAuth = (): string | null => {
    const { userId } = identity(socket);
    if (!userId) {
      fail(socket, 'sign-in-required');
      return null;
    }
    return userId;
  };

  const myLobby = (): Lobby | null => {
    const code = socketLobby.get(socket.id);
    return code ? (lobbies.get(code) ?? null) : null;
  };

  const requireHost = (): Lobby | null => {
    const lobby = myLobby();
    if (!lobby) {
      fail(socket, 'not-in-lobby');
      return null;
    }
    if (lobby.hostSocketId !== socket.id) {
      fail(socket, 'host-only');
      return null;
    }
    return lobby;
  };

  socket.on(C2S.CREATE, (payload: unknown) => {
    if (!checkRateLimit(socket.id, C2S.CREATE)) return fail(socket, 'rate-limited');
    if (!requireAuth()) return;

    const p = (payload ?? {}) as Record<string, unknown>;
    const lobby = createLobby({
      isPublic: p.isPublic !== false,
      durationSec: isDuration(p.durationSec) ? p.durationSec : DEFAULT_DURATION,
      difficulty: isDifficulty(p.difficulty) ? p.difficulty : DEFAULT_DIFFICULTY,
      hostSocketId: socket.id,
      pendingHostUserId: null,
    });
    if (!lobby) return fail(socket, 'lobby-capacity');

    unseat(io, socket.id);
    seat(io, socket, lobby);
  });

  socket.on(C2S.JOIN, (payload: unknown) => {
    if (!checkRateLimit(socket.id, C2S.JOIN)) return fail(socket, 'rate-limited');
    if (!requireAuth()) return;

    const code = sanitizeCode((payload as { code?: unknown } | undefined)?.code);
    if (!code) return fail(socket, 'invalid-code');
    const lobby = lobbies.get(code);
    if (!lobby) return fail(socket, 'lobby-not-found');

    const current = socketLobby.get(socket.id);
    if (current && current !== code) unseat(io, socket.id);
    seat(io, socket, lobby);
  });

  socket.on(C2S.QUICKPLAY, () => {
    if (!checkRateLimit(socket.id, C2S.QUICKPLAY)) return fail(socket, 'rate-limited');
    if (!requireAuth()) return;

    // Fullest joinable public lobby first, so players pool up instead of
    // scattering one-per-room.
    let best: Lobby | null = null;
    for (const lobby of lobbies.values()) {
      if (!lobby.isPublic || lobby.state !== 'waiting') continue;
      if (lobby.seats.size >= MAX_LOBBY_PLAYERS) continue;
      if (!best || lobby.seats.size > best.seats.size) best = lobby;
    }

    if (!best) {
      best = createLobby({
        isPublic: true,
        durationSec: DEFAULT_DURATION,
        difficulty: DEFAULT_DIFFICULTY,
        hostSocketId: socket.id,
        pendingHostUserId: null,
      });
      if (!best) return fail(socket, 'lobby-capacity');
    }

    unseat(io, socket.id);
    seat(io, socket, best);
  });

  socket.on(C2S.BROWSE, () => {
    if (!checkRateLimit(socket.id, C2S.BROWSE)) return fail(socket, 'rate-limited');
    const open: PublicLobbyInfo[] = [];
    for (const lobby of lobbies.values()) {
      if (!lobby.isPublic || lobby.state !== 'waiting') continue;
      if (lobby.seats.size === 0 || lobby.seats.size >= MAX_LOBBY_PLAYERS) continue;
      open.push(publicInfo(lobby));
      if (open.length >= BROWSE_CAP) break;
    }
    socket.emit(S2C.BROWSE_RESULT, open);
  });

  socket.on(C2S.TICKET, (payload: unknown) => {
    if (!checkRateLimit(socket.id, C2S.TICKET)) return fail(socket, 'rate-limited');
    const userId = requireAuth();
    if (!userId) return;

    const token = (payload as { token?: unknown } | undefined)?.token;
    if (typeof token !== 'string') return fail(socket, 'invalid-ticket');
    const ticket: PartyTicket | null = verifyPartyTicket(token);
    // A ticket is a bearer secret naming one user and one room; both must match
    // or it is being replayed by somebody else.
    if (!ticket || ticket.game !== 'laundry-sort' || ticket.userId !== userId) {
      return fail(socket, 'invalid-ticket');
    }
    const lobby = lobbies.get(ticket.roomId);
    if (!lobby) return fail(socket, 'lobby-not-found');

    unseat(io, socket.id);
    seat(io, socket, lobby);
  });

  socket.on(C2S.LEAVE, () => {
    if (!checkRateLimit(socket.id, C2S.LEAVE)) return;
    unseat(io, socket.id);
  });

  socket.on(C2S.READY, (payload: unknown) => {
    if (!checkRateLimit(socket.id, C2S.READY)) return fail(socket, 'rate-limited');
    const lobby = myLobby();
    if (!lobby || lobby.state !== 'waiting') return;
    const s = lobby.seats.get(socket.id);
    if (!s) return;
    s.ready = (payload as { ready?: unknown } | undefined)?.ready !== false;
    touch(lobby);
    broadcastLobby(io, lobby);
  });

  socket.on(C2S.REMATCH, () => {
    if (!checkRateLimit(socket.id, C2S.REMATCH)) return fail(socket, 'rate-limited');
    const lobby = myLobby();
    if (!lobby || lobby.state !== 'waiting') return;
    const s = lobby.seats.get(socket.id);
    if (!s) return;
    s.ready = true;
    touch(lobby);
    broadcastLobby(io, lobby);
  });

  socket.on(C2S.SETTINGS, (payload: unknown) => {
    if (!checkRateLimit(socket.id, C2S.SETTINGS)) return fail(socket, 'rate-limited');
    const lobby = requireHost();
    if (!lobby || lobby.state !== 'waiting') return;

    const p = (payload ?? {}) as Record<string, unknown>;
    if (typeof p.isPublic === 'boolean') lobby.isPublic = p.isPublic;
    if (isDuration(p.durationSec)) lobby.durationSec = p.durationSec;
    if (isDifficulty(p.difficulty)) lobby.difficulty = p.difficulty;
    // Changing the rules invalidates everyone's consent to the old ones.
    for (const s of lobby.seats.values()) s.ready = false;
    touch(lobby);
    broadcastLobby(io, lobby);
  });

  socket.on(C2S.KICK, (payload: unknown) => {
    if (!checkRateLimit(socket.id, C2S.KICK)) return fail(socket, 'rate-limited');
    const lobby = requireHost();
    if (!lobby || lobby.state !== 'waiting') return;

    const targetId = (payload as { socketId?: unknown } | undefined)?.socketId;
    if (typeof targetId !== 'string' || targetId === socket.id) return;
    if (!lobby.seats.has(targetId)) return;

    io.sockets.sockets.get(targetId)?.emit(S2C.KICKED, {});
    unseat(io, targetId);
  });

  socket.on(C2S.START, () => {
    if (!checkRateLimit(socket.id, C2S.START)) return fail(socket, 'rate-limited');
    const lobby = requireHost();
    if (!lobby || lobby.state !== 'waiting') return;
    if (lobby.seats.size < MIN_VERSUS_PLAYERS) return fail(socket, 'need-more-players');

    for (const s of lobby.seats.values()) {
      if (s.socketId !== lobby.hostSocketId && !s.ready) return fail(socket, 'not-everyone-ready');
    }
    beginCountdown(io, lobby);
  });

  socket.on(C2S.SCORE, (payload: unknown) => {
    if (!checkRateLimit(socket.id, C2S.SCORE)) return;
    const lobby = myLobby();
    if (!lobby || lobby.state !== 'playing') return;
    const s = lobby.seats.get(socket.id);
    if (!s || s.done) return;
    s.report = sanitizeReport(payload);
  });

  socket.on(C2S.FINISH, (payload: unknown) => {
    if (!checkRateLimit(socket.id, C2S.FINISH)) return;
    const lobby = myLobby();
    if (!lobby || lobby.state !== 'playing') return;
    const s = lobby.seats.get(socket.id);
    if (!s || s.done) return;
    s.report = sanitizeReport(payload);
    s.done = true;
    if (allDone(lobby)) finishMatch(io, lobby);
  });
}

export function handleLaundrySortDisconnect(io: Server, socket: Socket): void {
  unseat(io, socket.id);
}
