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
 * ## Guests (`X10`)
 *
 * A Discord Activity player whose Discord account is not linked to a site
 * account has no `userId` — not a missing one, none. The hub's auth middleware
 * verifies their Discord token and hands this file a display name and an avatar
 * URL on `socket.data.discordGuest` instead (`server/socket-server/index.ts`).
 * They get a real seat, a real score and a real placing; what they do not get
 * is anything written down. No `User` row, no `SongLeaderboard` row, no run —
 * {@link persistResults} skips them explicitly — and their Discord name and
 * avatar are referenced from memory for the life of the seat and never copied
 * into a table or into object storage.
 *
 * The seat key is where that costs them something; see {@link seatKey}.
 *
 * ## Spectators (`N1`)
 *
 * A ninth person can watch without taking one of the eight seats. Spectators
 * live in a parallel socket.io room (`slice:<code>:spec`) and receive the same
 * broadcasts the room does, including the `volatile` score tick. They are not
 * in `lobby.seats`, so they are counted by nothing: not the capacity check, not
 * the ready check, not the set of players a match waits for.
 *
 * ## Teams (`N2`)
 *
 * A seat can hold a side, and a team match's totals are summed **here** and
 * shipped in `MatchResults.teams`. Deliberately not left to the client: a total
 * is the one number a team match is decided by, and two clients with slightly
 * different rosters would each add up their own view honestly and announce
 * different winners of the same match.
 *
 * ## Song voting (`N7`)
 *
 * With voting on, the room nominates and votes instead of the host picking, and
 * a fresh ballot opens on every return to the lobby — the rematch is the case
 * the feature exists for. Ties break with {@link lobbyRng}, seeded from the
 * lobby code and the ballot number, rather than `Math.random()`: the server can
 * then say *why* a track won, and the same room with the same votes resolves the
 * same way on any process that runs it.
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
// The one definition of which board a run belongs to, shared with
// `/api/slice-it/score`. Two implementations of this would silently file the
// same run on two different boards depending on which door it came through.
import { poolOf } from '../../../lib/slice-it/pools';
import {
  calculateScoreMultiplier,
  maxPlausibleCombo,
  maxPlausibleScore,
} from '../../../lib/slice-it/scoring';
import type { Modifiers } from '../../../lib/slice-it/types';
import {
  EVENTS,
  S2C,
  isLobbyCode,
  lobbyRoom,
  specRoom,
  type ChatMessage,
  type FinalStanding,
  type GuestIdentity,
  type LiveScore,
  type LobbyError,
  type LobbyErrorCode,
  type LobbyPlayer,
  type LobbySnapshot,
  type LobbySong,
  type LobbyState,
  type PublicLobbyInfo,
  type ScoreReport,
  type TeamId,
  type TeamTotal,
  type VoteState,
} from '../../../lib/slice-it/net/events';

/* ─── Constants ─────────────────────────────────────────────────────────── */

const MAX_LOBBIES = 2000;
const BROWSE_CAP = 30;
const GC_INTERVAL_MS = 60_000;
/** Attempts to mint a non-colliding code before giving up. */
const CODE_ATTEMPTS = 12;
/**
 * How long a song vote stays open (`N7`).
 *
 * Long enough to read six titles, short enough that one player who wandered off
 * cannot hold the lobby — the ballot resolves early anyway the moment every
 * connected seat has voted, so this bound is only ever paid by a room that is
 * waiting on somebody who is not there.
 */
const VOTE_DURATION_MS = 45_000;
/** Both sides of a team match (`N2`). */
const TEAMS: readonly TeamId[] = ['a', 'b'];

const EMPTY_REPORT: ScoreReport = { score: 0, combo: 0, maxCombo: 0, accuracy: 0, health: 100 };

/* ─── Types ─────────────────────────────────────────────────────────────── */

interface Seat {
  /** This seat's key in {@link Lobby.seats}. See {@link seatKey}. */
  key: string;
  /** Null for a guest — there is no account behind the seat. */
  userId: string | null;
  /** Set exactly when `userId` is null. Memory-only, never persisted. */
  guest: GuestIdentity | null;
  /** Null while the player is disconnected and their seat is being held. */
  socketId: string | null;
  name: string;
  avatarUrl: string | null;
  ready: boolean;
  /** Joined mid-match: watching this round, playing the next. */
  spectating: boolean;
  /** Their side in team mode (`N2`). Always null while team mode is off. */
  team: TeamId | null;
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

/**
 * One track on the ballot (`N7`), as the server holds it.
 *
 * The nominator is remembered by **seat key**, not socket id, for the same
 * reason seats are: a reconnect mints a new socket and the room would otherwise
 * decide the player who blinked had never nominated anything, freeing them to
 * put a second track up.
 */
interface Nomination {
  song: LobbySong;
  byKey: string;
  byName: string;
}

interface Ballot {
  /** Server epoch-ms the ballot closes. Absolute, like every other deadline. */
  closesAt: number;
  nominations: Nomination[];
  /** Seat key → the song id that seat is backing. One vote each, changeable. */
  votes: Map<string, string>;
}

interface Lobby {
  code: string;
  /**
   * Host is tracked by seat, not by socket. A host who reconnects is still the
   * host; under the old socket-keyed scheme a blip handed the lobby to whoever
   * happened to be next in the map. For an account that seat key *is* their
   * userId, so this is the same guarantee it always was.
   */
  hostKey: string;
  isPublic: boolean;
  state: LobbyState;
  /** Keyed by {@link seatKey} — the whole reconnect story depends on this. */
  seats: Map<string, Seat>;
  song: LobbySong | null;
  chat: ChatMessage[];
  createdAt: number;
  lastActivityAt: number;

  /* Modes */
  /** Team mode (`N2`): seats carry a side and results carry per-side totals. */
  teamsEnabled: boolean;
  /** Song voting (`N7`): the room picks the track instead of the host. */
  votingEnabled: boolean;
  /** The open ballot, or null. */
  vote: Ballot | null;
  /**
   * How many ballots this lobby has run.
   *
   * Part of the vote's RNG seed, so two ballots in the same lobby do not break
   * their ties the same way — and so a tie-break is reproducible from facts the
   * server can state out loud rather than from `Math.random()`.
   */
  voteRound: number;
  voteTimer: ReturnType<typeof setTimeout> | null;

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
const socketLobby = new Map<string, { code: string; key: string }>();
/** Reverse index for the spectator role — a socket watches at most one lobby. */
const socketSpectating = new Map<string, string>();

let gcInterval: ReturnType<typeof setInterval> | null = null;

/* ─── Helpers ───────────────────────────────────────────────────────────── */

/** Who a socket is, as far as this file is concerned. */
interface Who {
  /** Null for a guest. */
  userId: string | null;
  guest: GuestIdentity | null;
  name: string;
  avatarUrl: string | null;
  socketId: string;
}

/**
 * Resolve a socket to an identity, or null if it has none.
 *
 * Two paths, both established by the hub's auth middleware before this file
 * ever sees the socket:
 *
 * - `socket.data.userId` — a validated Better Auth session, or a Discord
 *   Activity token whose Discord account is linked to a site account. Identical
 *   downstream; a linked Discord player is not a guest.
 * - `socket.data.discordGuest` — a verified Discord Activity token with no
 *   linked account. Display name and avatar only, and no id, because there is
 *   no account for an id to refer to.
 *
 * Neither is ever taken from the payload. The old handler read `userId` off the
 * wire, which is how scores became attributable to whoever you claimed to be.
 */
function identity(socket: Socket): Who | null {
  const userId = socket.data?.userId;
  if (typeof userId === 'string' && userId) {
    return {
      userId,
      guest: null,
      name: sanitizeString(socket.data?.userName, 32) || 'Player',
      avatarUrl: typeof socket.data?.avatarUrl === 'string' ? socket.data.avatarUrl : null,
      socketId: socket.id,
    };
  }

  const guest = socket.data?.discordGuest as GuestIdentity | undefined;
  if (guest && typeof guest.name === 'string') {
    const name = sanitizeString(guest.name, 32) || 'Guest';
    const avatarUrl = typeof guest.avatarUrl === 'string' ? guest.avatarUrl : null;
    return { userId: null, guest: { name, avatarUrl }, name, avatarUrl, socketId: socket.id };
  }

  return null;
}

/**
 * The key a seat lives under in {@link Lobby.seats}.
 *
 * Seats are keyed by `userId` because a reconnect mints a new socket id, and
 * keying on THAT removed players mid-song — the failure this whole file was
 * rewritten around (see the docblock at the top). That reasoning is unchanged
 * and still applies to every seat that has a userId.
 *
 * A guest has no userId, so their seat is keyed by socket instead, and the
 * consequence follows directly from the key: it cannot be found again after a
 * reconnect, so a guest does NOT get the grace window in
 * {@link handleSliceItDisconnect}. That is a real downgrade and it is the
 * honest one — holding a seat for an identity this file refuses to store would
 * mean storing it. The alternative, a stable `guest:<discord-id>` key, is
 * exactly the persistent per-guest identifier `X10` exists to not create.
 */
function seatKey(who: { userId: string | null; socketId: string }): string {
  return who.userId ?? `guest:${who.socketId}`;
}

/** True for a seat with no account behind it — see {@link seatKey}. */
function isGuestSeat(seat: Seat): boolean {
  return seat.userId === null;
}

function fail(socket: Socket, code: LobbyErrorCode, message: string): void {
  const payload: LobbyError = { code, message };
  socket.emit(S2C.ERROR, payload);
}

function toPlayer(seat: Seat, lobby: Lobby): LobbyPlayer {
  return {
    socketId: seat.socketId ?? '',
    userId: seat.userId,
    // Present exactly when there is no account behind the seat, which is what
    // lets the client badge them without inventing a second signal for it.
    guest: seat.guest ?? undefined,
    name: seat.name,
    avatarUrl: seat.avatarUrl,
    ready: seat.ready,
    isHost: seat.key === lobby.hostKey,
    disconnected: seat.disconnectedAt !== null,
    spectating: seat.spectating,
    // Reported as null while team mode is off even if the seat still remembers a
    // side from a previous round, so a client never has to ask two questions to
    // know whether to draw a badge.
    team: lobby.teamsEnabled ? seat.team : null,
    modifiers: seat.modifiers,
    scoreMultiplier: Number(calculateScoreMultiplier(seat.modifiers).toFixed(2)),
  };
}

function snapshot(lobby: Lobby): LobbySnapshot {
  return {
    code: lobby.code,
    hostSocketId: lobby.seats.get(lobby.hostKey)?.socketId ?? '',
    isPublic: lobby.isPublic,
    state: lobby.state,
    players: Array.from(lobby.seats.values()).map((seat) => toPlayer(seat, lobby)),
    maxPlayers: MAX_LOBBY_PLAYERS,
    song: lobby.song,
    teamsEnabled: lobby.teamsEnabled,
    votingEnabled: lobby.votingEnabled,
    vote: voteSnapshot(lobby),
  };
}

/**
 * The ballot as the wire carries it (`N7`).
 *
 * Voters are published as **socket ids** while the server holds them as seat
 * keys: a seat key is a `userId`, and broadcasting the roster's user ids to
 * everyone in the room would hand out an identifier the snapshot does not
 * otherwise expose for a disconnected seat. The socket id is what every other
 * per-player field in {@link LobbySnapshot} is addressed by, so "did I vote for
 * this" stays one comparison on the client.
 */
function voteSnapshot(lobby: Lobby): VoteState | null {
  const ballot = lobby.vote;
  if (!ballot) return null;
  const socketOf = new Map<string, string>();
  for (const seat of lobby.seats.values()) {
    if (seat.socketId) socketOf.set(seat.key, seat.socketId);
  }
  return {
    closesAt: ballot.closesAt,
    nominations: ballot.nominations.map((nomination) => ({
      song: nomination.song,
      nominatedBy: nomination.byName,
      voters: Array.from(ballot.votes)
        .filter(([, songId]) => songId === nomination.song.id)
        .map(([key]) => socketOf.get(key))
        .filter((id): id is string => Boolean(id)),
    })),
  };
}

/**
 * Emit to everyone watching this lobby: the seated players and the spectators.
 *
 * Two emits rather than `io.to([a, b])` so the fake io in
 * `lib/slice-it/__tests__/handler.test.ts` stays a faithful model of the one
 * call shape this file uses. Sending twice is safe because a socket is never in
 * both rooms — {@link seatPlayer} leaves the spectator room and
 * {@link spectate} gives up any seat.
 */
function emitAll(io: Server, code: string, event: string, payload: unknown): void {
  io.to(lobbyRoom(code)).emit(event, payload);
  io.to(specRoom(code)).emit(event, payload);
}

function broadcast(io: Server, lobby: Lobby): void {
  emitAll(io, lobby.code, S2C.LOBBY, snapshot(lobby));
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
  if (lobby.voteTimer) {
    clearTimeout(lobby.voteTimer);
    lobby.voteTimer = null;
  }
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
  for (const [socketId, watching] of socketSpectating) {
    if (watching === code) socketSpectating.delete(socketId);
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

/**
 * A well-formed lobby code — the shape {@link mintCode} produces.
 *
 * Delegates to the contract's own {@link isLobbyCode} so the browser's
 * invite-link check (`N9`) and this one cannot drift into disagreeing about
 * which strings are codes.
 */
function isWellFormedCode(code: string): boolean {
  return isLobbyCode(code);
}

/**
 * @param preferredCode A code the caller asked for. Callers must have already
 *   established it is well-formed and free — {@link registerSliceItHandlers}'s
 *   `slice:create` answers `invalid_code` / `code_taken` before getting here,
 *   because "your code was not honoured" is a different outcome from "the
 *   server ran out of codes" and only the caller can tell the client which.
 */
function createLobby(host: Who, isPublic: boolean, preferredCode?: string): Lobby | null {
  const code = preferredCode ?? mintCode();
  if (!code) return null;
  const now = Date.now();
  const lobby: Lobby = {
    code,
    hostKey: seatKey(host),
    isPublic,
    state: 'waiting',
    seats: new Map(),
    song: null,
    chat: [],
    createdAt: now,
    lastActivityAt: now,
    teamsEnabled: false,
    votingEnabled: false,
    vote: null,
    voteRound: 0,
    voteTimer: null,
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
function seatPlayer(io: Server, lobby: Lobby, socket: Socket, who: Who): Seat {
  const key = seatKey(who);

  // A seat and a spectator slot are mutually exclusive: taking one gives up the
  // other, which is also what makes the two-room fan-out in `emitAll` safe.
  stopSpectating(socket);

  const existing = lobby.seats.get(key);
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
    socketLobby.set(socket.id, { code: lobby.code, key });
    return existing;
  }

  const seat: Seat = {
    key,
    userId: who.userId,
    guest: who.guest,
    socketId: socket.id,
    name: who.name,
    avatarUrl: who.avatarUrl,
    ready: false,
    // Anyone arriving while a match is live watches it out. Bouncing them was
    // the old behaviour and it made an invite link useless the moment the host
    // pressed start.
    spectating: lobby.state !== 'waiting',
    // A late arrival in team mode lands on the *smaller* side rather than on no
    // side: an unassigned seat scores into no total, so the default has to be
    // the one that keeps the match a match.
    team: lobby.teamsEnabled ? smallerTeam(lobby) : null,
    modifiers: { ...DEFAULT_MODIFIERS },
    report: { ...EMPTY_REPORT },
    loaded: false,
    done: false,
    disconnectedAt: null,
    graceTimer: null,
  };
  lobby.seats.set(key, seat);
  socket.join(lobbyRoom(lobby.code));
  socketLobby.set(socket.id, { code: lobby.code, key });
  return seat;
}

/** Drop a socket's spectator role, if it has one. */
function stopSpectating(socket: Socket): void {
  const code = socketSpectating.get(socket.id);
  if (!code) return;
  socketSpectating.delete(socket.id);
  socket.leave(specRoom(code));
}

/**
 * Remove a seat and repair the lobby around it: migrate the host, release a
 * pause that was being held for this player, and reap an empty room.
 */
function removeSeat(io: Server, lobby: Lobby, key: string, reason: string): void {
  const seat = lobby.seats.get(key);
  if (!seat) return;
  if (seat.graceTimer) clearTimeout(seat.graceTimer);
  if (seat.socketId) socketLobby.delete(seat.socketId);
  lobby.seats.delete(key);

  if (lobby.seats.size === 0) {
    destroyLobby(lobby.code);
    return;
  }

  if (lobby.hostKey === key) {
    // Prefer a connected player — handing the lobby to someone who is
    // themselves mid-reconnect just moves the problem.
    const next = connectedSeats(lobby)[0] ?? Array.from(lobby.seats.values())[0];
    lobby.hostKey = next.key;
    logger.info({ event: 'slice_host_migrated', code: lobby.code, to: next.key, reason });
  }

  releasePauseIfSettled(io, lobby);
  maybeFinishMatch(io, lobby);
  // A ballot the room was only waiting on this seat for can now close (`N7`).
  // Their own vote goes with them: counting a vote from a seat that is gone
  // would let a player leave and still decide the next song.
  if (lobby.vote) {
    lobby.vote.votes.delete(key);
    maybeCloseVote(io, lobby);
  }
  broadcast(io, lobby);
}

/* ─── Teams (`N2`) ──────────────────────────────────────────────────────── */

/** Seats currently on a side. Spectators included — they play the next round. */
function seatsOn(lobby: Lobby, team: TeamId): Seat[] {
  return Array.from(lobby.seats.values()).filter((seat) => seat.team === team);
}

/** The side with fewer seats; `'a'` on a draw, so the choice is never random. */
function smallerTeam(lobby: Lobby): TeamId {
  return seatsOn(lobby, 'b').length < seatsOn(lobby, 'a').length ? 'b' : 'a';
}

/**
 * Spread every seat evenly across the two sides — the host's balance control.
 *
 * Alternates in **seat order**, which is join order, so the result is a function
 * of who is in the room and nothing else: pressing balance twice gives the same
 * two sides, and the host can explain why anyone ended up where they did. A
 * shuffle here would make the control feel like a reroll and would put the
 * outcome of a team match partly in the hands of an unseeded `Math.random()`.
 */
function balanceTeams(lobby: Lobby): void {
  let index = 0;
  for (const seat of lobby.seats.values()) {
    seat.team = TEAMS[index % TEAMS.length];
    index++;
  }
}

function clearTeams(lobby: Lobby): void {
  for (const seat of lobby.seats.values()) seat.team = null;
}

/**
 * Add up each side, and place them (`N2`).
 *
 * Summed here rather than on the client because a total is the one number a
 * team match is decided by: two clients holding slightly different rosters —
 * one that missed a late `slice:score`, one that saw a seat leave — would each
 * add up their own view honestly and announce different winners of the same
 * match. Accuracy is the **mean** over the side's racers, not a sum, because a
 * sum of accuracies is not a quantity anybody can read.
 */
function buildTeamTotals(standings: FinalStanding[]): TeamTotal[] {
  const totals = TEAMS.map((team) => {
    const rows = standings.filter((row) => row.team === team);
    const score = rows.reduce((sum, row) => sum + row.score, 0);
    const accuracy = rows.length
      ? rows.reduce((sum, row) => sum + row.accuracy, 0) / rows.length
      : 0;
    return { team, score, accuracy, players: rows.length, place: 1 };
  });

  // Both sides share first place on an exact tie — the same rule the individual
  // standings use, and the only honest answer to two equal sums.
  const ranked = [...totals].sort((a, b) => b.score - a.score || b.accuracy - a.accuracy);
  if (ranked[0].score !== ranked[1].score) ranked[1].place = 2;
  return totals;
}

/* ─── Song voting (`N7`) ────────────────────────────────────────────────── */

/**
 * A message from the room itself.
 *
 * The vote is the one thing in this handler that decides something on the
 * players' behalf, so it says why: which track won, with how many votes, and
 * whether a tie had to be broken. An empty `socketId` is what marks it as not
 * having come from a player.
 */
function announce(io: Server, lobby: Lobby, text: string): void {
  const message: ChatMessage = {
    id: `system-${lobby.code}-${Date.now()}`,
    socketId: '',
    name: 'Lobby',
    text,
    at: Date.now(),
  };
  lobby.chat.push(message);
  if (lobby.chat.length > CHAT_HISTORY) lobby.chat.shift();
  emitAll(io, lobby.code, S2C.CHAT, message);
}

/**
 * A deterministic random source for this lobby's current ballot.
 *
 * `Math.random()` would decide a tie in a way the server cannot restate
 * afterwards ("why did it pick that one?" has no answer) and that two servers
 * given the same room and the same votes would answer differently. Seeded from
 * the lobby code and the ballot number, the tie-break is a fact about the room
 * rather than an accident of the process — reproducible in a test, explainable
 * in a log line, and still unpredictable to a player who cannot know either
 * input's effect in advance.
 *
 * FNV-1a into mulberry32: both are three lines, neither is a dependency, and
 * the quality bar for choosing between two equally-voted songs is low.
 */
function lobbyRng(lobby: Lobby): () => number {
  const input = `${lobby.code}:${lobby.voteRound}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  let state = hash >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Pick the winning song id from a tally.
 *
 * @param votes song id → count, in nomination order.
 * @param rng the lobby's seeded source — see {@link lobbyRng}.
 * @returns the winner and how many nominations were tied for it, so the caller
 *   can say whether a tie was broken at all.
 */
function resolveVote(
  votes: Map<string, number>,
  rng: () => number,
): { songId: string; tied: number } {
  const max = Math.max(...votes.values());
  // Sorted, so the candidate list does not depend on Map insertion order — the
  // same votes must resolve the same way whichever order the nominations
  // happened to arrive in.
  const winners = Array.from(votes)
    .filter(([, count]) => count === max)
    .map(([songId]) => songId)
    .sort();
  return { songId: winners[Math.floor(rng() * winners.length)], tied: winners.length };
}

function cancelVote(lobby: Lobby): void {
  if (lobby.voteTimer) {
    clearTimeout(lobby.voteTimer);
    lobby.voteTimer = null;
  }
  lobby.vote = null;
}

/** Open a fresh ballot, and arm the deadline that closes it. */
function openVote(io: Server, lobby: Lobby): void {
  cancelVote(lobby);
  lobby.voteRound++;
  lobby.vote = { closesAt: Date.now() + VOTE_DURATION_MS, nominations: [], votes: new Map() };
  lobby.voteTimer = setTimeout(() => {
    const current = lobbies.get(lobby.code);
    if (current) closeVote(io, current);
  }, VOTE_DURATION_MS);
  broadcast(io, lobby);
}

/**
 * Close the ballot and adopt its winner.
 *
 * A ballot nobody nominated to leaves the lobby's song exactly as it was — the
 * alternative, clearing it, would punish a room for not voting by taking away
 * the track it already had.
 */
function closeVote(io: Server, lobby: Lobby): void {
  const ballot = lobby.vote;
  if (!ballot) return;
  cancelVote(lobby);

  if (ballot.nominations.length === 0) {
    announce(io, lobby, 'Nobody nominated a track, so the song is unchanged.');
    broadcast(io, lobby);
    return;
  }

  const tally = new Map<string, number>();
  for (const nomination of ballot.nominations) tally.set(nomination.song.id, 0);
  for (const songId of ballot.votes.values()) {
    const current = tally.get(songId);
    if (current !== undefined) tally.set(songId, current + 1);
  }

  const { songId, tied } = resolveVote(tally, lobbyRng(lobby));
  const winner = ballot.nominations.find((nomination) => nomination.song.id === songId);
  if (!winner) return;

  lobby.song = winner.song;
  // The room agreed to a track, not to starting: the same rule `slice:song`
  // follows, for the same reason.
  for (const seat of lobby.seats.values()) seat.ready = false;

  const count = tally.get(songId) ?? 0;
  announce(
    io,
    lobby,
    tied > 1
      ? `Vote: “${winner.song.title}” wins with ${count} vote${count === 1 ? '' : 's'}, after a ${tied}-way tie.`
      : `Vote: “${winner.song.title}” wins with ${count} vote${count === 1 ? '' : 's'}.`,
  );
  logger.info({
    event: 'slice_vote_resolved',
    code: lobby.code,
    round: lobby.voteRound,
    songId,
    votes: count,
    tied,
  });
  broadcast(io, lobby);
}

/** Close the ballot early once every connected racer has voted. */
function maybeCloseVote(io: Server, lobby: Lobby): void {
  const ballot = lobby.vote;
  if (!ballot) return;
  const voters = connectedSeats(lobby);
  if (voters.length === 0) return;
  if (voters.every((seat) => ballot.votes.has(seat.key))) closeVote(io, lobby);
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
        removeSeat(io, current, peer.key, 'grace_expired');
      }

      // A lobby that emptied out is already destroyed; and if every held peer
      // somehow returned in the same tick, the resume already happened.
      const still = lobbies.get(lobby.code);
      if (still) resumeMatch(io, still);
    },
    Math.max(0, kickAt - Date.now()),
  );

  emitAll(io, lobby.code, S2C.PAUSE, {
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

  emitAll(io, lobby.code, S2C.RESUME, {
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
        logger.info({ event: 'slice_load_timeout', code: current.code, seat: seat.key });
      }
    }
    beginCountdown(io, current);
  }, LOAD_TIMEOUT_MS);

  broadcast(io, lobby);
}

function emitLoading(io: Server, lobby: Lobby, deadline: number): void {
  emitAll(io, lobby.code, S2C.LOADING, {
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
  emitAll(io, lobby.code, S2C.COUNTDOWN, {
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

  emitAll(io, lobby.code, S2C.START, {
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
    // Spectators (`N1`) get the same frame on the same terms — one extra emit
    // per tick rather than a filter over the roster on every tick.
    io.to(specRoom(current.code)).volatile.emit(S2C.SCORES, scores);
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
  emitAll(io, lobby.code, S2C.RESULTS, {
    standings,
    song: lobby.song,
    // Absent, not empty, outside team mode: a results card that has to tell
    // "no teams" from "two empty teams" has been handed the wrong shape.
    teams: lobby.teamsEnabled ? buildTeamTotals(standings) : undefined,
  });
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
      team: lobby.teamsEnabled ? seat.team : null,
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
 *
 * **Guests write nothing.** `SongLeaderboard.userId` is a required FK and a
 * guest has no `User` row to point it at — but the reason is not the schema.
 * The alternative (mint a shadow account per Discord guest) would hold a third
 * party's display name and avatar indefinitely and turn "I tried a game in a
 * voice call" into a data-retention question nobody asked. Their score is real,
 * it is shown, and then it is gone.
 */
async function persistResults(lobby: Lobby, standings: FinalStanding[]): Promise<void> {
  const songId = lobby.song?.id;
  const duration = lobby.song?.duration ?? 0;
  if (!songId || standings.length === 0) return;

  try {
    const prisma = getPrismaClient();
    for (const standing of standings) {
      if (standing.score <= 0 || !standing.finished) continue;
      // A guest seat. Not an error and not worth a log line — it is the
      // designed outcome, on every match a guest plays.
      if (!standing.userId) continue;

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

      // The board is keyed by (songId, difficulty, modPool, userId) — R1. This
      // path addressed the old `songId_userId` pair, which the rekey migration
      // dropped: it would have thrown on every match result, and before that it
      // would have filed every multiplayer score under whatever board the
      // column defaults happened to name rather than the one it was set on.
      //
      // Per-seat modifiers are the reason this matters here specifically:
      // players in one lobby pick their own difficulty, so a single match can
      // write to four different boards.
      const difficulty = standing.modifiers.difficulty;
      const modPool = poolOf(standing.modifiers);

      const existing = await prisma.songLeaderboard.findUnique({
        where: {
          songId_difficulty_modPool_userId: {
            songId,
            difficulty,
            modPool,
            userId: standing.userId,
          },
        },
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
          data: { songId, userId: standing.userId, difficulty, modPool, ...data },
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
  cancelVote(lobby);
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

  // The whole point of `N7` is the rematch: with voting on, the room picks the
  // next track itself rather than waiting for the host to pick again.
  if (lobby.votingEnabled) openVote(io, lobby);
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
  const seat = lobby.seats.get(link.key);
  if (!seat) return null;
  return { lobby, seat };
}

function isHost(lobby: Lobby, seat: Seat): boolean {
  return lobby.hostKey === seat.key;
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

      // A *preferred* code (`X9`). A Discord Activity derives one from its voice
      // channel id so a whole call converges on one lobby with nothing typed.
      // Both failure modes are answered rather than silently swallowed: minting
      // a random code after being asked for a specific one looks like success
      // and leaves every other participant retrying a code that will never
      // exist, which is precisely the behaviour this replaces.
      const preferred = payload?.code ?? '';
      if (preferred) {
        if (!isWellFormedCode(preferred)) {
          return fail(sock, 'invalid_code', 'That lobby code is not a valid code.');
        }
        if (lobbies.has(preferred)) {
          return fail(sock, 'code_taken', 'That lobby already exists — join it instead.');
        }
      }

      leaveCurrent(io, sock);

      const lobby = createLobby(who, payload?.isPublic === true, preferred || undefined);
      if (!lobby) return fail(sock, 'lobby_limit', 'Could not create a lobby. Try again.');

      seatPlayer(io, lobby, sock, who);
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

      const existing = lobby.seats.get(seatKey(who));
      if (!existing && lobby.seats.size >= MAX_LOBBY_PLAYERS) {
        return fail(sock, 'full', 'That lobby is full.');
      }

      // Only leave a *different* lobby: a reconnect re-joining its own room
      // must not tear its seat down and rebuild it.
      const current = socketLobby.get(sock.id);
      if (current && current.code !== code) leaveCurrent(io, sock);

      seatPlayer(io, lobby, sock, who);
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

      seatPlayer(io, lobby, sock, who);
      touch(lobby);
      sock.emit(S2C.JOINED, { code: lobby.code, socketId: sock.id });
      broadcast(io, lobby);
    },

    /**
     * Watch a lobby without taking a seat (`N1`).
     *
     * No identity is required, matching `slice:browse`: spectating is read-only
     * and a code is already all it takes to *join*, so this is strictly less
     * permissive than what the same caller could do instead.
     */
    'slice:spectate': (payload, sock) => {
      const lobby = lobbies.get(payload.code);
      if (!lobby) return fail(sock, 'not_found', 'No lobby with that code.');

      // Give up any seat first: a spectator who is also a player would be
      // counted in the roster and waited on at the start of a match.
      leaveCurrent(io, sock);
      stopSpectating(sock);

      socketSpectating.set(sock.id, lobby.code);
      sock.join(specRoom(lobby.code));
      touch(lobby);
      // Immediately, not on the next transition: a spectator missed every state
      // change that built the room they are now looking at.
      sock.emit(S2C.LOBBY, snapshot(lobby));
    },

    'slice:browse': (_payload, sock) => {
      const rows: PublicLobbyInfo[] = Array.from(lobbies.values())
        .filter((l) => l.isPublic && l.state === 'waiting' && l.seats.size < MAX_LOBBY_PLAYERS)
        .sort((a, b) => b.seats.size - a.seats.size || a.createdAt - b.createdAt)
        .slice(0, BROWSE_CAP)
        .map((l) => ({
          code: l.code,
          hostName: l.seats.get(l.hostKey)?.name ?? 'Host',
          playerCount: l.seats.size,
          maxPlayers: MAX_LOBBY_PLAYERS,
          songTitle: l.song?.title ?? null,
        }));
      sock.emit(S2C.BROWSE_RESULT, rows);
    },

    'slice:leave': (_payload, sock) => {
      leaveCurrent(io, sock);
      stopSpectating(sock);
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
      // A host who picks a track while a ballot is open has overruled it. The
      // ballot is closed rather than left running, because letting it resolve
      // later would silently overwrite the pick the host just made.
      if (live.vote) {
        cancelVote(live);
        announce(io, live, 'The host picked a track, so the vote was cancelled.');
      }
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

      // Teams (`N2`). Turning the mode on balances the room straight away: an
      // all-unassigned team match scores into no total at all, which looks
      // exactly like the feature being broken.
      if (typeof payload?.teams === 'boolean' && payload.teams !== lobby.teamsEnabled) {
        lobby.teamsEnabled = payload.teams;
        if (payload.teams) balanceTeams(lobby);
        else clearTeams(lobby);
      }

      // Voting (`N7`). Only meaningful in the lobby: a ballot opened mid-match
      // would close onto a song nobody can switch to.
      if (typeof payload?.voting === 'boolean' && payload.voting !== lobby.votingEnabled) {
        lobby.votingEnabled = payload.voting;
        if (payload.voting && lobby.state === 'waiting') {
          openVote(io, lobby);
        } else if (!payload.voting && lobby.vote) {
          cancelVote(lobby);
          announce(io, lobby, 'The host cancelled the vote.');
        }
      }

      touch(lobby);
      broadcast(io, lobby);
    },

    /**
     * Pick a side (`N2`).
     *
     * Self-service rather than host-assigned: the host has the balance control
     * for the case where the room cannot sort itself out, and making every
     * switch go through one person is how a two-minute lobby becomes a
     * five-minute one.
     */
    'slice:team': (payload, sock) => {
      const found = lobbyOf(sock);
      if (!found) return;
      const { lobby, seat } = found;
      if (!lobby.teamsEnabled)
        return fail(sock, 'teams_disabled', 'This lobby is not in team mode.');
      if (lobby.state !== 'waiting') return fail(sock, 'in_progress', 'A match is in progress.');
      seat.team = payload.team;
      touch(lobby);
      broadcast(io, lobby);
    },

    'slice:balance': (_payload, sock) => {
      const found = lobbyOf(sock);
      if (!found) return;
      const { lobby, seat } = found;
      if (!isHost(lobby, seat)) return fail(sock, 'not_host', 'Only the host can balance teams.');
      if (!lobby.teamsEnabled)
        return fail(sock, 'teams_disabled', 'This lobby is not in team mode.');
      if (lobby.state !== 'waiting') return fail(sock, 'in_progress', 'A match is in progress.');
      balanceTeams(lobby);
      touch(lobby);
      broadcast(io, lobby);
    },

    /**
     * Put a track on the ballot (`N7`).
     *
     * One nomination per seat, and a second replaces the first: the alternative
     * is one enthusiastic player filling the ballot with six of their own tracks
     * and the vote being over before anyone else has read it.
     */
    'slice:nominate': async (payload, sock) => {
      const found = lobbyOf(sock);
      if (!found) return;
      const { lobby, seat } = found;
      if (!lobby.vote) return fail(sock, 'vote_closed', 'There is no vote open.');

      const song = await resolveSong(payload.songId);
      if (!song) return fail(sock, 'song_unavailable', 'That track is no longer available.');

      // Re-read: `resolveSong` awaited a database round-trip, and the ballot may
      // have closed — or the whole lobby gone — while it was in flight.
      const live = lobbies.get(lobby.code);
      const ballot = live?.vote;
      if (!live || !ballot) return fail(sock, 'vote_closed', 'That vote has closed.');
      if (!live.seats.has(seat.key)) return;

      const already = ballot.nominations.findIndex((nomination) => nomination.byKey === seat.key);
      const duplicate = ballot.nominations.some(
        (nomination, index) => nomination.song.id === song.id && index !== already,
      );
      if (duplicate) return fail(sock, 'song_unavailable', 'That track is already on the ballot.');

      const nomination: Nomination = { song, byKey: seat.key, byName: seat.name };
      if (already >= 0) {
        // Their old track leaves the ballot, so every vote cast for it goes with
        // it — a vote for a track that is no longer standing is not a vote.
        const dropped = ballot.nominations[already].song.id;
        for (const [key, songId] of ballot.votes) {
          if (songId === dropped) ballot.votes.delete(key);
        }
        ballot.nominations[already] = nomination;
      } else {
        ballot.nominations.push(nomination);
      }

      touch(live);
      broadcast(io, live);
    },

    'slice:vote': (payload, sock) => {
      const found = lobbyOf(sock);
      if (!found) return;
      const { lobby, seat } = found;
      const ballot = lobby.vote;
      if (!ballot) return fail(sock, 'vote_closed', 'There is no vote open.');
      if (!ballot.nominations.some((nomination) => nomination.song.id === payload.songId)) {
        return fail(sock, 'song_unavailable', 'That track is not on the ballot.');
      }

      ballot.votes.set(seat.key, payload.songId);
      touch(lobby);
      broadcast(io, lobby);
      // Everyone connected has voted — there is nothing left to wait for.
      maybeCloseVote(io, lobby);
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

      // A team match with everyone on one side is not a team match — it is a
      // free-for-all whose results card claims a winner by forfeit.
      if (lobby.teamsEnabled && TEAMS.some((team) => !racers.some((s) => s.team === team))) {
        return fail(sock, 'too_few_players', 'Both teams need at least one player.');
      }

      // Starting settles the question the ballot was asking.
      if (lobby.vote) {
        cancelVote(lobby);
        announce(io, lobby, 'The match started, so the vote was closed.');
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
      if (!target || target.key === seat.key) return;

      const targetSocket = target.socketId ? io.sockets.sockets.get(target.socketId) : null;
      targetSocket?.emit(S2C.KICKED, { reason: 'removed_by_host' });
      targetSocket?.leave(lobbyRoom(lobby.code));
      removeSeat(io, lobby, target.key, 'kicked');
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
  removeSeat(io, lobby, link.key, 'left');
}

/**
 * A socket dropped.
 *
 * Distinguished from {@link leaveCurrent} on purpose: leaving is a decision and
 * takes effect at once; dropping is an accident and buys a grace window whose
 * length depends on what is at stake — 30 seconds mid-song, 15 in a lobby.
 */
export function handleSliceItDisconnect(io: Server, socket: Socket): void {
  socketSpectating.delete(socket.id);

  const link = socketLobby.get(socket.id);
  if (!link) return;
  socketLobby.delete(socket.id);

  const lobby = lobbies.get(link.code);
  if (!lobby) return;
  const seat = lobby.seats.get(link.key);
  if (!seat || seat.socketId !== socket.id) return;

  // A guest seat cannot be reclaimed, so there is nothing to hold it for.
  //
  // The grace window works by keeping the seat findable until the same player
  // comes back — and "the same player" is a lookup by `userId`. A guest is keyed
  // by socket (see {@link seatKey}), and a reconnect mints a new socket id, so a
  // returning guest is by construction a new person to this file. Holding the
  // seat anyway would just park a phantom the room waits on and, in a live
  // match, pause everyone for a player who can never satisfy the wait. The only
  // way to do better is to give guests a stable identifier and remember it,
  // which is the one thing `X10` is built not to do.
  if (isGuestSeat(seat)) {
    socket.leave(lobbyRoom(lobby.code));
    removeSeat(io, lobby, seat.key, 'guest_disconnect');
    return;
  }

  seat.socketId = null;
  seat.disconnectedAt = Date.now();

  const inMatch =
    lobby.state === 'playing' || lobby.state === 'countdown' || lobby.state === 'loading';
  const graceMs = inMatch ? MATCH_DISCONNECT_GRACE_MS : LOBBY_DISCONNECT_GRACE_MS;

  if (seat.graceTimer) clearTimeout(seat.graceTimer);
  seat.graceTimer = setTimeout(() => {
    const current = lobbies.get(link.code);
    if (!current) return;
    const held = current.seats.get(link.key);
    // They came back inside the window — nothing to do.
    if (!held || held.disconnectedAt === null) return;
    removeSeat(io, current, link.key, 'disconnect_grace_expired');
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
  socketSpectating.clear();
  if (gcInterval) {
    clearInterval(gcInterval);
    gcInterval = null;
  }
}
