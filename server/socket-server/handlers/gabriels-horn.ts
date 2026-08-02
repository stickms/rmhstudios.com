/**
 * Gabriel's Horn — lobby + authoritative table handler.
 *
 * Unlike most games on this hub, the server here is not a scorekeeper sitting
 * beside a simulation the clients run. It **is** the game: it owns the deck, the
 * dice, every hand, and — the reason it has to — the secret.
 *
 * ── Why none of this can live on the client ────────────────────────────────
 * The premise is that the player rolling the dice cannot see them. A client
 * that receives the faces and merely declines to draw them is not hiding
 * anything: one console line reads them, and that player then wins every round
 * for the rest of the game while the table has no way to tell. So the faces are
 * never sent to the roller at all. {@link S2C.STATE} is built per seat and
 * emitted per socket; the roller's copy carries `dice.faces = null` until the
 * reveal, or until they spend an Azure card to buy the look. Same for hands:
 * you get your own cards, everyone else's arrive as a count.
 *
 * That personalisation is the one structural difference from the other hub
 * games, and it is why there is no `io.to(room).emit(STATE, …)` anywhere below.
 *
 * ── Shape ───────────────────────────────────────────────────────────────────
 * Otherwise this follows the Laundry Sort / Dream Rift conventions exactly:
 * in-memory lobby Maps keyed by room code, socket.io rooms for the broadcasts
 * that ARE public (lobby, chat, results), soft hub auth read off `socket.data`,
 * per-event rate limits declared in `config.ts`, fire-and-forget persistence.
 *
 * Every phase is on a timer with a defined, non-punishing timeout, because a
 * turn-based game over the internet otherwise stalls on one person closing a
 * tab: claims default to the TRUTH, a call that never comes costs the roller a
 * draw (they had the whole phase to make one), a missed final turn is a pass.
 *
 * NOTE: server code imports `lib/` RELATIVELY. `@/lib/...` is not resolvable in
 * the esbuild server bundle (see server/CLAUDE.md §Gotchas 7).
 */

import type { Server, Socket } from 'socket.io';
import { generateRoomCode, sanitizeString, sanitizeUserName } from '../utils';
import { checkRateLimit } from '../rate-limit';
import { logger } from '../logger';
import { getPrismaClient } from '../prisma-client';
import { registerPartyGame, verifyPartyTicket } from '../party-contract';
import type { PartyMember, PartyTicket } from '../party-contract';
import {
  CHAT_HISTORY,
  CHAT_MAX_LENGTH,
  COUNTDOWN_SECONDS,
  DIE_FACES,
  HAND_LIMIT,
  LOG_HISTORY,
  MAX_PLAYERS,
  MIN_PLAYERS,
  PHASE_MS,
  RECONNECT_GRACE_MS,
  SWAP_RANK,
  TARGETED_EFFECTS,
  COLOR_EFFECT,
  type Card,
  type Phase,
} from '../../../lib/gabriels-horn/constants';
import { buildDeck, shuffle, sortHand } from '../../../lib/gabriels-horn/deck';
import {
  DEFAULT_HOUSE_RULES,
  clampHouseRules,
  diffHouseRules,
  type HouseRules,
} from '../../../lib/gabriels-horn/house-rules';
import {
  C2S,
  ROOM_PREFIX,
  S2C,
  type CallOutcome,
  type ChatMessage,
  type ClaimView,
  type FinalStanding,
  type GameResults,
  type GameView,
  type LobbySnapshot,
  type LogEntry,
  type LogKind,
  type PublicLobbyInfo,
  type TablePlayer,
} from '../../../lib/gabriels-horn/net/events';

// ─── Constants ──────────────────────────────────────────────────────────────

const MAX_LOBBIES = 2000;
const BROWSE_CAP = 30;
const GC_INTERVAL_MS = 60_000;
const LOBBY_IDLE_TIMEOUT_MS = 30 * 60_000;
/**
 * A hard stop on a table that will not resolve itself. Six players who never
 * sound the horn would otherwise play forever; at this many completed turns the
 * game ends on card count with nobody having called it.
 */
const MAX_TURNS = 400;

// ─── Types ──────────────────────────────────────────────────────────────────

interface Seat {
  socketId: string;
  userId: string;
  name: string;
  avatarUrl: string | null;
  ready: boolean;
  hand: Card[];
  /** Verdant is up: nothing can make this seat draw until its next turn. */
  warded: boolean;
  /** Azure was spent: this seat sees its own dice this turn. */
  glimpsed: boolean;
  /** A snapshot Amber bought — what that hand held at the moment of the look. */
  scry: { socketId: string; name: string; cards: Card[] } | null;
  /** Took its one turn after the horn. */
  finalDone: boolean;
  /** False while the socket is gone; the seat is held for the grace window. */
  connected: boolean;
  /** When the socket dropped, for the GC to reap against. */
  droppedAt: number;
}

interface Lobby {
  code: string;
  hostSocketId: string;
  /** Set for a party room created before its host connected. */
  pendingHostUserId: string | null;
  isPublic: boolean;
  /**
   * The table's tunable rules. Every rule the game reads at runtime comes from
   * here rather than from the constants, so a house-rule amendment is a change
   * to one object and not a change to the code paths that consume it.
   */
  rules: HouseRules;
  state: 'waiting' | 'countdown' | 'playing' | 'results';
  seats: Map<string, Seat>;

  /** Turn order, fixed when the game starts. Mirrors `seats` minus leavers. */
  order: string[];
  turnIndex: number;
  round: number;
  turnsTaken: number;

  phase: Phase;
  phaseEndsAt: number;
  /** Empty until the roll. Never sent to the roller — see the file header. */
  dice: number[];
  claims: Map<string, number>;
  outcome: CallOutcome | null;
  /** Set when the roller committed to the roll, so a timeout knows what to do. */
  rolled: boolean;

  endCalledBy: string | null;
  finalQueue: string[];

  deck: Card[];
  discard: Card[];

  log: LogEntry[];
  logSeq: number;
  chat: ChatMessage[];
  chatSeq: number;

  lastActivityAt: number;
  phaseTimer: ReturnType<typeof setTimeout> | null;
  countdownTimer: ReturnType<typeof setInterval> | null;
  /** Armed while a seat is being held open for a dropped player. */
  reapTimer: ReturnType<typeof setTimeout> | null;
}

const lobbies = new Map<string, Lobby>();
/** Reverse index: a socket is only ever seated in one lobby. */
const socketLobby = new Map<string, string>();

let gcInterval: ReturnType<typeof setInterval> | null = null;

// ─── Small helpers ──────────────────────────────────────────────────────────

function roomName(code: string): string {
  return `${ROOM_PREFIX}${code}`;
}

function sanitizeCode(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8);
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

function touch(lobby: Lobby): void {
  lobby.lastActivityAt = Date.now();
}

function diceTotal(lobby: Lobby): number {
  return lobby.dice.reduce((sum, die) => sum + die, 0);
}

/** The seat whose turn it is. During `final`, the seat taking its last turn. */
function activeSocketId(lobby: Lobby): string {
  if (lobby.phase === 'final') return lobby.finalQueue[0] ?? '';
  return lobby.order[lobby.turnIndex] ?? '';
}

function activeSeat(lobby: Lobby): Seat | null {
  return lobby.seats.get(activeSocketId(lobby)) ?? null;
}

/**
 * Seats with somebody actually behind them.
 *
 * The distinction matters everywhere a turn could stall: a dropped player keeps
 * their chair and their cards for the grace window, but the table never waits
 * on them, and once this reaches zero there is no game left to run.
 */
function connectedSeats(lobby: Lobby): Seat[] {
  return Array.from(lobby.seats.values()).filter((seat) => seat.connected);
}

function pushLog(lobby: Lobby, kind: LogKind, fields: Partial<LogEntry> = {}): void {
  lobby.log.push({ id: ++lobby.logSeq, kind, at: Date.now(), ...fields });
  if (lobby.log.length > LOG_HISTORY) lobby.log.splice(0, lobby.log.length - LOG_HISTORY);
}

// ─── Deck ───────────────────────────────────────────────────────────────────

/**
 * Draw up to `count` cards. Short by design rather than by accident: the discard
 * pile is reshuffled back in when the deck runs dry, and a hand at
 * {@link HAND_LIMIT} simply stops growing. Returns how many were actually taken,
 * because the caller reports that number to the table.
 */
function drawCards(lobby: Lobby, seat: Seat, count: number): number {
  let drawn = 0;
  for (let i = 0; i < count; i++) {
    if (seat.hand.length >= HAND_LIMIT) break;
    if (lobby.deck.length === 0) {
      if (lobby.discard.length === 0) break;
      lobby.deck = shuffle(lobby.discard);
      lobby.discard = [];
    }
    const card = lobby.deck.pop();
    if (!card) break;
    seat.hand.push(card);
    drawn++;
  }
  if (drawn > 0) seat.hand = sortHand(seat.hand);
  return drawn;
}

/**
 * Make a seat pay. A Verdant ward absorbs it entirely and lasts the whole lap,
 * so this returns 0 and logs the save instead.
 */
function penalize(lobby: Lobby, seat: Seat, amount = lobby.rules.penaltyDraw): number {
  if (seat.warded) {
    pushLog(lobby, 'ward', { actorName: seat.name });
    return 0;
  }
  const drawn = drawCards(lobby, seat, amount);
  if (drawn > 0) pushLog(lobby, 'draw', { actorName: seat.name, amount: drawn });
  return drawn;
}

// ─── Views ──────────────────────────────────────────────────────────────────

function snapshot(lobby: Lobby): LobbySnapshot {
  return {
    rules: lobby.rules,
    code: lobby.code,
    hostSocketId: lobby.hostSocketId,
    isPublic: lobby.isPublic,
    state: lobby.state,
    maxPlayers: MAX_PLAYERS,
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
    maxPlayers: MAX_PLAYERS,
  };
}

function tablePlayers(lobby: Lobby): TablePlayer[] {
  return lobby.order
    .map((id) => lobby.seats.get(id))
    .filter((seat): seat is Seat => Boolean(seat))
    .map((seat) => ({
      socketId: seat.socketId,
      userId: seat.userId,
      name: seat.name,
      avatarUrl: seat.avatarUrl,
      handCount: seat.hand.length,
      warded: seat.warded,
      finalDone: seat.finalDone,
      connected: seat.connected,
    }));
}

/**
 * The table as ONE seat is allowed to see it.
 *
 * The two withholdings that matter both happen here and nowhere else: the dice
 * are `null` for the roller until the reveal, and `lie` on a claim stays `null`
 * until the reveal (it is the dice restated).
 */
function viewFor(lobby: Lobby, seat: Seat): GameView {
  const revealed = lobby.phase === 'reveal' || lobby.phase === 'over';
  const rollerId = lobby.order[lobby.turnIndex] ?? '';
  const rolled = lobby.dice.length > 0;
  const hidden = seat.socketId === rollerId && !seat.glimpsed && !revealed;
  const total = diceTotal(lobby);

  const claims: ClaimView[] = lobby.order
    .filter((id) => id !== rollerId && lobby.seats.has(id))
    .map((id) => {
      const claimed = lobby.claims.get(id);
      return {
        socketId: id,
        total: claimed ?? null,
        lie: revealed && claimed !== undefined ? claimed !== total : null,
      };
    });

  return {
    code: lobby.code,
    phase: lobby.phase,
    round: lobby.round,
    activeSocketId: activeSocketId(lobby),
    selfSocketId: seat.socketId,
    players: tablePlayers(lobby),
    hand: seat.hand,
    dice: {
      faces: rolled && !hidden ? [...lobby.dice] : null,
      total: rolled && !hidden ? total : null,
      glimpsed: seat.socketId === rollerId && seat.glimpsed,
    },
    claims,
    deckCount: lobby.deck.length,
    phaseEndsAt: lobby.phase === 'over' ? null : lobby.phaseEndsAt,
    endCalledBy: lobby.endCalledBy,
    outcome: revealed ? lobby.outcome : null,
    scry: seat.scry,
    rules: lobby.rules,
    log: lobby.log,
  };
}

/** One message per seat. Never `io.to(room)` — that is the whole secret gone. */
function emitState(io: Server, lobby: Lobby): void {
  for (const seat of lobby.seats.values()) {
    // A dropped seat's socket id no longer resolves to anything; skipping it
    // saves building a view nobody receives.
    if (!seat.connected) continue;
    io.to(seat.socketId).emit(S2C.STATE, viewFor(lobby, seat));
  }
}

// ─── Phase machine ──────────────────────────────────────────────────────────

function clearTimers(lobby: Lobby): void {
  if (lobby.phaseTimer) clearTimeout(lobby.phaseTimer);
  if (lobby.countdownTimer) clearInterval(lobby.countdownTimer);
  if (lobby.reapTimer) clearTimeout(lobby.reapTimer);
  lobby.phaseTimer = null;
  lobby.countdownTimer = null;
  lobby.reapTimer = null;
}

/** The clock for a phase, from the table's rules rather than the shipped default. */
function phaseDuration(lobby: Lobby, phase: Exclude<Phase, 'over'>): number {
  switch (phase) {
    case 'action':
      return lobby.rules.actionMs;
    case 'claim':
      return lobby.rules.claimMs;
    case 'call':
      return lobby.rules.callMs;
    default:
      return PHASE_MS[phase];
  }
}

function setPhase(io: Server, lobby: Lobby, phase: Exclude<Phase, 'over'>): void {
  if (lobby.phaseTimer) clearTimeout(lobby.phaseTimer);
  const duration = phaseDuration(lobby, phase);
  lobby.phase = phase;
  lobby.phaseEndsAt = Date.now() + duration;
  touch(lobby);
  emitState(io, lobby);
  lobby.phaseTimer = setTimeout(() => onPhaseTimeout(io, lobby), duration);
}

function beginTurn(io: Server, lobby: Lobby): void {
  if (lobby.order.length < MIN_PLAYERS) {
    finishGame(io, lobby, true);
    return;
  }
  // Nobody is behind any of the remaining chairs. Skipping would spin forever,
  // so the game ends here rather than running an empty table until the GC gets
  // to it.
  if (connectedSeats(lobby).length === 0) {
    finishGame(io, lobby, true);
    return;
  }
  if (lobby.turnsTaken >= MAX_TURNS) {
    finishGame(io, lobby, false);
    return;
  }

  lobby.turnIndex %= lobby.order.length;
  const seat = lobby.seats.get(lobby.order[lobby.turnIndex]);
  if (!seat) {
    // The order and the seats disagreed — drop the ghost and try the next chair.
    lobby.order.splice(lobby.turnIndex, 1);
    beginTurn(io, lobby);
    return;
  }

  // A dropped player keeps their seat and their cards, but the table does not
  // sit through two minutes of phase timers waiting for somebody who is not
  // there. The guard above guarantees this recursion terminates: at least one
  // seat is connected, so at most one lap is skipped.
  if (!seat.connected) {
    pushLog(lobby, 'skipped', { actorName: seat.name });
    advanceTurn(io, lobby);
    return;
  }

  lobby.dice = [];
  lobby.claims.clear();
  lobby.outcome = null;
  lobby.rolled = false;
  // A ward lasts until its owner's next turn, and both a glimpse and a scry are
  // spent the moment the table moves on.
  seat.warded = false;
  for (const other of lobby.seats.values()) {
    other.glimpsed = false;
    other.scry = null;
  }

  setPhase(io, lobby, 'action');
}

function advanceTurn(io: Server, lobby: Lobby): void {
  lobby.turnsTaken++;
  if (lobby.endCalledBy) {
    nextFinalTurn(io, lobby);
    return;
  }
  lobby.turnIndex = (lobby.turnIndex + 1) % Math.max(1, lobby.order.length);
  if (lobby.turnIndex === 0) lobby.round++;
  beginTurn(io, lobby);
}

function rollDice(io: Server, lobby: Lobby): void {
  const seat = activeSeat(lobby);
  if (!seat) return;
  lobby.dice = Array.from(
    { length: lobby.rules.diceCount },
    () => 1 + Math.floor(Math.random() * DIE_FACES),
  );
  lobby.rolled = true;
  // Deliberately no total on this entry: the roller reads the same log.
  pushLog(lobby, 'roll', { actorName: seat.name });

  // Anyone who is not there answers truthfully and immediately, the same as a
  // player who lets the phase run out. Waiting on an absent seat is the one way
  // the claim phase could stall for its full duration every single round.
  for (const other of lobby.seats.values()) {
    if (other.socketId !== seat.socketId && !other.connected) {
      lobby.claims.set(other.socketId, diceTotal(lobby));
    }
  }

  // With nobody left to lie, there is nothing to call — score it as a bare
  // draw for the roller and move on rather than hanging on an empty phase.
  const speakers = lobby.order.filter(
    (id) => id !== seat.socketId && lobby.seats.get(id)?.connected,
  );
  if (speakers.length === 0) {
    setPhase(io, lobby, 'reveal');
    return;
  }
  setPhase(io, lobby, 'claim');
}

function allClaimsIn(lobby: Lobby): boolean {
  const rollerId = lobby.order[lobby.turnIndex] ?? '';
  for (const id of lobby.order) {
    if (id === rollerId || !lobby.seats.has(id)) continue;
    if (!lobby.claims.has(id)) return false;
  }
  return true;
}

function resolveCall(
  io: Server,
  lobby: Lobby,
  caller: Seat,
  targetSocketId: string,
  verdict: 'truth' | 'lie',
): void {
  const target = lobby.seats.get(targetSocketId);
  const claimed = lobby.claims.get(targetSocketId);
  if (!target || claimed === undefined) return;

  const total = diceTotal(lobby);
  const wasLie = claimed !== total;
  const correct = (verdict === 'lie') === wasLie;
  const loser = correct ? target : caller;

  pushLog(lobby, 'call', {
    actorName: caller.name,
    targetName: target.name,
    verdict,
    correct,
    total,
  });
  const drawn = penalize(lobby, loser);

  lobby.outcome = {
    callerSocketId: caller.socketId,
    targetSocketId,
    verdict,
    correct,
    drewSocketId: drawn > 0 ? loser.socketId : null,
    drawn,
    trueTotal: total,
  };
  setPhase(io, lobby, 'reveal');
}

function onPhaseTimeout(io: Server, lobby: Lobby): void {
  if (lobby.state !== 'playing') return;

  switch (lobby.phase) {
    case 'action': {
      // Nobody home. Roll on their behalf rather than stalling the table — the
      // round still resolves, and a wrong call was always going to cost them.
      rollDice(io, lobby);
      return;
    }
    case 'claim': {
      // Silence defaults to the TRUTH. Anything else would punish a dropped
      // connection with a lie it never told.
      const total = diceTotal(lobby);
      const rollerId = lobby.order[lobby.turnIndex] ?? '';
      for (const id of lobby.order) {
        if (id === rollerId || !lobby.seats.has(id)) continue;
        if (!lobby.claims.has(id)) lobby.claims.set(id, total);
      }
      setPhase(io, lobby, 'call');
      return;
    }
    case 'call': {
      // A whole phase to read four numbers and no call: that is a draw.
      const caller = activeSeat(lobby);
      if (caller) penalize(lobby, caller);
      lobby.outcome = null;
      setPhase(io, lobby, 'reveal');
      return;
    }
    case 'reveal': {
      advanceTurn(io, lobby);
      return;
    }
    case 'final': {
      const seat = activeSeat(lobby);
      if (seat) {
        seat.finalDone = true;
        pushLog(lobby, 'pass', { actorName: seat.name });
      }
      lobby.finalQueue.shift();
      nextFinalTurn(io, lobby);
      return;
    }
    default:
      return;
  }
}

// ─── The End ────────────────────────────────────────────────────────────────

function soundEnd(io: Server, lobby: Lobby, seat: Seat): void {
  lobby.endCalledBy = seat.socketId;
  pushLog(lobby, 'end-called', { actorName: seat.name });

  // Everyone else, once, in turn order starting after the caller. This is what
  // makes the horn a gamble: the player sitting on a seven can still take your
  // three-card hand off you.
  const from = lobby.order.indexOf(seat.socketId);
  lobby.finalQueue = [];
  for (let step = 1; step < lobby.order.length; step++) {
    const id = lobby.order[(from + step) % lobby.order.length];
    if (lobby.seats.has(id)) lobby.finalQueue.push(id);
  }
  nextFinalTurn(io, lobby);
}

function nextFinalTurn(io: Server, lobby: Lobby): void {
  // Absent seats forfeit their last turn on the spot. Without this the horn
  // could cost the table a full `PHASE_MS.final` per missing player before the
  // standings appeared.
  while (lobby.finalQueue.length > 0) {
    const next = lobby.seats.get(lobby.finalQueue[0]);
    if (next?.connected) break;
    if (next) {
      next.finalDone = true;
      pushLog(lobby, 'skipped', { actorName: next.name });
    }
    lobby.finalQueue.shift();
  }
  if (lobby.finalQueue.length === 0) {
    finishGame(io, lobby, false);
    return;
  }
  lobby.dice = [];
  lobby.claims.clear();
  lobby.outcome = null;
  for (const other of lobby.seats.values()) {
    other.glimpsed = false;
    other.scry = null;
  }
  setPhase(io, lobby, 'final');
}

/**
 * Fewest cards wins — with the one condition that gives the horn its teeth:
 * whoever sounded it has to be **strictly** lowest. Tie the field or lose to it
 * and the call backfires, dropping them to last however few cards they hold.
 */
function buildStandings(lobby: Lobby): FinalStanding[] {
  const seats = lobby.order
    .map((id) => lobby.seats.get(id))
    .filter((seat): seat is Seat => Boolean(seat));

  const caller = lobby.endCalledBy ? lobby.seats.get(lobby.endCalledBy) : undefined;
  const rest = seats
    .filter((seat) => seat !== caller)
    .sort((a, b) => a.hand.length - b.hand.length);

  const lowestOther = rest[0]?.hand.length ?? Infinity;
  // `hornMustBeStrictlyLowest` off makes a tie good enough, which is the single
  // biggest lever on how punishing the game feels.
  const hornHeld = caller
    ? lobby.rules.hornMustBeStrictlyLowest
      ? caller.hand.length < lowestOther
      : caller.hand.length <= lowestOther
    : false;

  const place = (index: number, list: Seat[], offset: number): number => {
    // Ties share a place: two players on four cards are both third.
    let first = index;
    while (first > 0 && list[first - 1].hand.length === list[index].hand.length) first--;
    return offset + first + 1;
  };

  const row = (
    seat: Seat,
    placement: number,
    calledEnd: boolean,
    backfired: boolean,
  ): FinalStanding => ({
    socketId: seat.socketId,
    userId: seat.userId,
    name: seat.name,
    avatarUrl: seat.avatarUrl,
    handCount: seat.hand.length,
    place: placement,
    calledEnd,
    endBackfired: backfired,
  });

  if (!caller) {
    // No horn: either the table emptied out or the turn cap hit. Straight count.
    return rest.map((seat, index) => row(seat, place(index, rest, 0), false, false));
  }

  if (hornHeld) {
    return [
      row(caller, 1, true, false),
      ...rest.map((seat, index) => row(seat, place(index, rest, 1), false, false)),
    ];
  }

  return [
    ...rest.map((seat, index) => row(seat, place(index, rest, 0), false, false)),
    row(caller, rest.length + 1, true, true),
  ];
}

function finishGame(io: Server, lobby: Lobby, abandoned: boolean): void {
  clearTimers(lobby);
  lobby.phase = 'over';
  lobby.phaseEndsAt = 0;

  const standings = buildStandings(lobby);
  const results: GameResults = {
    standings,
    endCalledBy: lobby.endCalledBy,
    rounds: lobby.round,
    abandoned,
  };
  pushLog(lobby, 'over', { actorName: standings[0]?.name });
  emitState(io, lobby);
  io.to(roomName(lobby.code)).emit(S2C.RESULTS, results);

  // Never block gameplay on a DB write (server/CLAUDE.md §Gotchas 4).
  if (!abandoned) {
    void persistResults(standings).catch((error) => {
      logger.error({ event: 'gabriels_horn_persist_failed', error: String(error) });
    });
  }

  // Straight back to a joinable lobby, so a rematch is one click. Seats that
  // were being held for a dropped player are released here — the grace exists
  // to protect a hand mid-game, and there is no longer a hand to protect.
  lobby.state = 'waiting';
  lobby.endCalledBy = null;
  lobby.finalQueue = [];
  lobby.order = [];
  for (const seat of [...lobby.seats.values()]) {
    if (!seat.connected) {
      lobby.seats.delete(seat.socketId);
      socketLobby.delete(seat.socketId);
      continue;
    }
    seat.ready = false;
    seat.hand = [];
    seat.warded = false;
    seat.glimpsed = false;
    seat.scry = null;
    seat.finalDone = false;
  }
  if (lobby.seats.size === 0) {
    destroyLobby(lobby.code);
    return;
  }
  if (!lobby.seats.has(lobby.hostSocketId)) {
    const next = lobby.seats.keys().next().value;
    if (next) lobby.hostSocketId = next;
  }
  broadcastLobby(io, lobby);
}

// ─── Game start ─────────────────────────────────────────────────────────────

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
    startGame(io, lobby);
  }, 1000);
}

function startGame(io: Server, lobby: Lobby): void {
  lobby.state = 'playing';
  lobby.deck = shuffle(buildDeck());
  lobby.discard = [];
  lobby.order = Array.from(lobby.seats.keys());
  lobby.turnIndex = 0;
  lobby.round = 1;
  lobby.turnsTaken = 0;
  lobby.endCalledBy = null;
  lobby.finalQueue = [];
  lobby.log = [];
  lobby.logSeq = 0;

  for (const seat of lobby.seats.values()) {
    seat.hand = [];
    seat.warded = false;
    seat.glimpsed = false;
    seat.scry = null;
    seat.finalDone = false;
    drawCards(lobby, seat, lobby.rules.startingHand);
  }
  pushLog(lobby, 'deal', { amount: lobby.rules.startingHand });

  broadcastLobby(io, lobby);
  beginTurn(io, lobby);
}

// ─── Seating ────────────────────────────────────────────────────────────────

function newCode(): string {
  for (let attempt = 0; attempt < 12; attempt++) {
    const code = generateRoomCode();
    if (!lobbies.has(code)) return code;
  }
  return `${generateRoomCode()}${Date.now().toString(36).slice(-2).toUpperCase()}`;
}

function createLobby(options: {
  isPublic: boolean;
  hostSocketId: string;
  pendingHostUserId: string | null;
}): Lobby | null {
  if (lobbies.size >= MAX_LOBBIES) return null;
  const lobby: Lobby = {
    code: newCode(),
    hostSocketId: options.hostSocketId,
    pendingHostUserId: options.pendingHostUserId,
    isPublic: options.isPublic,
    rules: { ...DEFAULT_HOUSE_RULES, effects: { ...DEFAULT_HOUSE_RULES.effects } },
    state: 'waiting',
    seats: new Map(),
    order: [],
    turnIndex: 0,
    round: 1,
    turnsTaken: 0,
    phase: 'action',
    phaseEndsAt: 0,
    dice: [],
    claims: new Map(),
    outcome: null,
    rolled: false,
    endCalledBy: null,
    finalQueue: [],
    deck: [],
    discard: [],
    log: [],
    logSeq: 0,
    chat: [],
    chatSeq: 0,
    lastActivityAt: Date.now(),
    phaseTimer: null,
    countdownTimer: null,
    reapTimer: null,
  };
  lobbies.set(lobby.code, lobby);
  return lobby;
}

function destroyLobby(code: string): void {
  const lobby = lobbies.get(code);
  if (!lobby) return;
  clearTimers(lobby);
  lobbies.delete(code);
}

/**
 * Move a held seat onto a new socket.
 *
 * socket.io hands out a fresh id on every reconnection, so a returning player
 * arrives as a stranger. The seat is keyed by socket id and referenced by it
 * from four other places (the turn order, the final queue, the claim map, the
 * host pointer), so reclaiming it means re-keying all five together — anything
 * missed leaves a chair that cannot take its turn.
 */
function rebindSeat(io: Server, socket: Socket, lobby: Lobby, seat: Seat): void {
  const oldId = seat.socketId;

  lobby.seats.delete(oldId);
  socketLobby.delete(oldId);
  seat.socketId = socket.id;
  seat.connected = true;
  seat.droppedAt = 0;
  lobby.seats.set(socket.id, seat);

  const orderIndex = lobby.order.indexOf(oldId);
  if (orderIndex >= 0) lobby.order[orderIndex] = socket.id;
  lobby.finalQueue = lobby.finalQueue.map((id) => (id === oldId ? socket.id : id));
  const claim = lobby.claims.get(oldId);
  if (claim !== undefined) {
    lobby.claims.delete(oldId);
    lobby.claims.set(socket.id, claim);
  }
  if (lobby.hostSocketId === oldId) lobby.hostSocketId = socket.id;
  if (lobby.endCalledBy === oldId) lobby.endCalledBy = socket.id;
  if (lobby.outcome) {
    if (lobby.outcome.callerSocketId === oldId) lobby.outcome.callerSocketId = socket.id;
    if (lobby.outcome.targetSocketId === oldId) lobby.outcome.targetSocketId = socket.id;
    if (lobby.outcome.drewSocketId === oldId) lobby.outcome.drewSocketId = socket.id;
  }

  pushLog(lobby, 'returned', { actorName: seat.name });
  logger.info({ event: 'gabriels_horn_reconnect', code: lobby.code, userId: seat.userId });
}

/**
 * Seat a socket. Idempotent: re-joining on the same socket refreshes the seat
 * rather than doubling it.
 */
function seatSocket(io: Server, socket: Socket, lobby: Lobby): boolean {
  const who = identity(socket);

  if (!lobby.seats.has(socket.id)) {
    // A seat held open for this account after a drop. Reclaiming it is what
    // makes a locked phone screen survivable — the hand and the place in turn
    // order are exactly as they were left.
    const held = who.userId
      ? [...lobby.seats.values()].find((s) => !s.connected && s.userId === who.userId)
      : undefined;
    if (held) {
      rebindSeat(io, socket, lobby, held);
      socketLobby.set(socket.id, lobby.code);
      socket.join(roomName(lobby.code));
      touch(lobby);
      socket.emit(S2C.JOINED, { code: lobby.code, socketId: socket.id });
      for (const message of lobby.chat.slice(-20)) socket.emit(S2C.CHAT, message);
      broadcastLobby(io, lobby);
      if (lobby.state === 'playing') emitState(io, lobby);
      // Nobody is held any more (or somebody still is) — either way the
      // deadline moved.
      armReaper(io, lobby);
      return true;
    }

    if (lobby.seats.size >= MAX_PLAYERS) {
      fail(socket, 'lobby-full');
      return false;
    }
    if (lobby.state !== 'waiting') {
      // Hands are dealt and turn order is fixed; there is no seat to give.
      fail(socket, 'game-in-progress');
      return false;
    }
    lobby.seats.set(socket.id, {
      socketId: socket.id,
      userId: who.userId,
      name: who.name,
      avatarUrl: who.avatarUrl,
      ready: false,
      hand: [],
      warded: false,
      glimpsed: false,
      scry: null,
      finalDone: false,
      connected: true,
      droppedAt: 0,
    });
  }

  // A party room is created before its leader connects; whoever arrives holding
  // that identity takes the chair.
  if (lobby.pendingHostUserId && who.userId === lobby.pendingHostUserId) {
    lobby.hostSocketId = socket.id;
    lobby.pendingHostUserId = null;
  }
  if (!lobby.seats.has(lobby.hostSocketId)) lobby.hostSocketId = socket.id;

  socketLobby.set(socket.id, lobby.code);
  socket.join(roomName(lobby.code));
  touch(lobby);
  socket.emit(S2C.JOINED, { code: lobby.code, socketId: socket.id });
  for (const message of lobby.chat.slice(-20)) socket.emit(S2C.CHAT, message);
  broadcastLobby(io, lobby);
  return true;
}

/**
 * Give up on seats whose grace has run out, and re-arm for any still ticking.
 *
 * Per-lobby and armed on the drop rather than a global sweep, so the deadline is
 * exact and a table with nobody held costs nothing. Removal goes through the
 * ordinary explicit-leave path, so everything that follows from somebody leaving
 * — hands back to the pile, host handover, an abandoned game if the table falls
 * below two — happens once, in one place.
 */
function armReaper(io: Server, lobby: Lobby): void {
  if (lobby.reapTimer) clearTimeout(lobby.reapTimer);
  lobby.reapTimer = null;

  const held = [...lobby.seats.values()].filter((seat) => !seat.connected);
  if (held.length === 0) return;

  const soonest = Math.min(...held.map((seat) => seat.droppedAt + RECONNECT_GRACE_MS));
  lobby.reapTimer = setTimeout(
    () => {
      lobby.reapTimer = null;
      if (!lobbies.has(lobby.code)) return;
      const now = Date.now();
      for (const seat of [...lobby.seats.values()]) {
        if (seat.connected || now - seat.droppedAt < RECONNECT_GRACE_MS) continue;
        unseat(io, seat.socketId, 'leave');
      }
      if (lobbies.has(lobby.code)) armReaper(io, lobby);
    },
    Math.max(0, soonest - Date.now()),
  );
  if (lobby.reapTimer && typeof lobby.reapTimer === 'object' && 'unref' in lobby.reapTimer) {
    lobby.reapTimer.unref();
  }
}

/**
 * A socket stops being at the table.
 *
 * `reason` is the whole of the difference between the two ways that happens.
 * **`leave`** — the player pressed the button, or the host kicked them — takes
 * the chair away immediately. **`drop`** — the socket went — does not: a turn
 * here lasts under a minute, so treating a locked phone screen the same as
 * quitting would cost people games they were winning. The seat is held for
 * {@link RECONNECT_GRACE_MS} instead, and the table plays on around it (their
 * turns are skipped, their claims default to the truth) until they either come
 * back or the GC reaps them.
 */
function unseat(io: Server, socketId: string, reason: 'leave' | 'drop' = 'leave'): void {
  const code = socketLobby.get(socketId);
  if (!code) return;

  const lobby = lobbies.get(code);
  if (!lobby) {
    socketLobby.delete(socketId);
    return;
  }

  const seat = lobby.seats.get(socketId);
  if (!seat) {
    socketLobby.delete(socketId);
    return;
  }

  // Hold the chair. `socketLobby` keeps pointing at the lobby so the GC and a
  // later explicit leave can still find it.
  if (reason === 'drop' && lobby.state === 'playing') {
    if (!seat.connected) return;
    seat.connected = false;
    seat.droppedAt = Date.now();
    pushLog(lobby, 'away', { actorName: seat.name });
    touch(lobby);
    // The chair stays in the room and in `socketLobby`, so a rebind can find it
    // and the reaper can still reach it.
    armReaper(io, lobby);

    if (connectedSeats(lobby).length === 0) {
      finishGame(io, lobby, true);
      return;
    }
    if (activeSocketId(lobby) === socketId) {
      // The table was waiting on them. Move it along now rather than sitting
      // out the phase timer.
      if (lobby.phase === 'final') {
        seat.finalDone = true;
        lobby.finalQueue.shift();
        nextFinalTurn(io, lobby);
      } else {
        advanceTurn(io, lobby);
      }
      return;
    }
    if (lobby.phase === 'claim') {
      // Their silence resolves as the truth, immediately.
      if (!lobby.claims.has(socketId)) lobby.claims.set(socketId, diceTotal(lobby));
      if (allClaimsIn(lobby)) {
        setPhase(io, lobby, 'call');
        return;
      }
    }
    emitState(io, lobby);
    return;
  }

  socketLobby.delete(socketId);
  // Leave the broadcast room too, or a player who hops rooms keeps receiving
  // the old lobby's snapshots.
  io.sockets.sockets.get(socketId)?.leave(roomName(code));

  const wasActive = lobby.state === 'playing' && activeSocketId(lobby) === socketId;
  const orderIndex = lobby.order.indexOf(socketId);

  // Their cards go back to the pile rather than vanishing, so the deck a
  // reshuffle rebuilds is still 52 cards.
  lobby.discard.push(...seat.hand);
  lobby.seats.delete(socketId);
  lobby.claims.delete(socketId);
  lobby.finalQueue = lobby.finalQueue.filter((id) => id !== socketId);
  if (orderIndex >= 0) {
    lobby.order.splice(orderIndex, 1);
    if (orderIndex < lobby.turnIndex) lobby.turnIndex--;
  }
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

  if (lobby.state !== 'playing') {
    broadcastLobby(io, lobby);
    return;
  }

  pushLog(lobby, 'left', { actorName: seat.name });

  if (lobby.order.length < MIN_PLAYERS || connectedSeats(lobby).length === 0) {
    finishGame(io, lobby, true);
    return;
  }
  if (wasActive) {
    // Whoever it was, the table was waiting on them. Move it along.
    if (lobby.phase === 'final') {
      nextFinalTurn(io, lobby);
    } else {
      advanceTurn(io, lobby);
    }
    return;
  }
  if (lobby.phase === 'claim' && allClaimsIn(lobby)) {
    setPhase(io, lobby, 'call');
    return;
  }
  emitState(io, lobby);
}

// ─── Persistence ────────────────────────────────────────────────────────────

async function persistResults(standings: FinalStanding[]): Promise<void> {
  const real = standings.filter((row) => row.userId);
  if (real.length === 0) return;
  const prisma = getPrismaClient();

  for (const row of real) {
    const won = row.place === 1 ? 1 : 0;
    const sounded = row.calledEnd ? 1 : 0;
    const hornWon = row.calledEnd && !row.endBackfired ? 1 : 0;
    try {
      const existing = await prisma.gabrielsHornPlayer.findUnique({
        where: { userId: row.userId },
      });
      if (existing) {
        await prisma.gabrielsHornPlayer.update({
          where: { id: existing.id },
          data: {
            gamesPlayed: { increment: 1 },
            wins: { increment: won },
            hornsSounded: { increment: sounded },
            hornsWon: { increment: hornWon },
            bestHand:
              existing.bestHand === null
                ? row.handCount
                : Math.min(existing.bestHand, row.handCount),
          },
        });
        continue;
      }

      // First finished game for this account. `username` is unique, so a display
      // name somebody else already claimed falls back to a suffixed form rather
      // than losing the result.
      const base = sanitizeUserName(row.name);
      const data = {
        userId: row.userId,
        gamesPlayed: 1,
        wins: won,
        hornsSounded: sounded,
        hornsWon: hornWon,
        bestHand: row.handCount,
      };
      try {
        await prisma.gabrielsHornPlayer.create({ data: { ...data, username: base } });
      } catch {
        await prisma.gabrielsHornPlayer.create({
          data: { ...data, username: `${base}-${row.userId.slice(0, 6)}`.slice(0, 32) },
        });
      }
    } catch (error) {
      logger.warn({
        event: 'gabriels_horn_row_failed',
        userId: row.userId,
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

registerPartyGame('gabriels-horn', {
  maxPartySize: MAX_PLAYERS,
  async createRoomForParty(members: PartyMember[]) {
    const lobby = createLobby({
      isPublic: false,
      // No socket has arrived yet; the party leader claims the chair on join.
      hostSocketId: '',
      pendingHostUserId: members[0]?.userId ?? null,
    });
    if (!lobby) throw new Error('lobby-capacity');
    return { game: 'gabriels-horn', roomId: lobby.code };
  },
});

// ─── Registration ───────────────────────────────────────────────────────────

export function registerGabrielsHornHandlers(io: Server, socket: Socket): void {
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

  /** The lobby + seat for an action only the player on turn may take. */
  const requireTurn = (phases: Phase[]): { lobby: Lobby; seat: Seat } | null => {
    const lobby = myLobby();
    if (!lobby || lobby.state !== 'playing') return null;
    if (!phases.includes(lobby.phase)) return null;
    const seat = lobby.seats.get(socket.id);
    if (!seat || activeSocketId(lobby) !== socket.id) {
      fail(socket, 'not-your-turn');
      return null;
    }
    return { lobby, seat };
  };

  // ── Lobby ────────────────────────────────────────────────────────────────

  socket.on(C2S.CREATE, (payload: unknown) => {
    if (!checkRateLimit(socket.id, C2S.CREATE)) return fail(socket, 'rate-limited');
    if (!requireAuth()) return;

    const p = (payload ?? {}) as Record<string, unknown>;
    const lobby = createLobby({
      isPublic: p.isPublic !== false,
      hostSocketId: socket.id,
      pendingHostUserId: null,
    });
    if (!lobby) return fail(socket, 'lobby-capacity');

    unseat(io, socket.id);
    seatSocket(io, socket, lobby);
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
    seatSocket(io, socket, lobby);
  });

  socket.on(C2S.QUICKPLAY, () => {
    if (!checkRateLimit(socket.id, C2S.QUICKPLAY)) return fail(socket, 'rate-limited');
    if (!requireAuth()) return;

    // Fullest joinable table first, so players pool up instead of scattering
    // one per room — a bluffing game is dead at two and alive at five.
    let best: Lobby | null = null;
    for (const lobby of lobbies.values()) {
      if (!lobby.isPublic || lobby.state !== 'waiting') continue;
      if (lobby.seats.size >= MAX_PLAYERS) continue;
      if (!best || lobby.seats.size > best.seats.size) best = lobby;
    }

    if (!best) {
      best = createLobby({ isPublic: true, hostSocketId: socket.id, pendingHostUserId: null });
      if (!best) return fail(socket, 'lobby-capacity');
    }

    unseat(io, socket.id);
    seatSocket(io, socket, best);
  });

  socket.on(C2S.BROWSE, () => {
    if (!checkRateLimit(socket.id, C2S.BROWSE)) return fail(socket, 'rate-limited');
    const open: PublicLobbyInfo[] = [];
    for (const lobby of lobbies.values()) {
      if (!lobby.isPublic || lobby.state !== 'waiting') continue;
      if (lobby.seats.size === 0 || lobby.seats.size >= MAX_PLAYERS) continue;
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
    // or somebody else is replaying it.
    if (!ticket || ticket.game !== 'gabriels-horn' || ticket.userId !== userId) {
      return fail(socket, 'invalid-ticket');
    }
    const lobby = lobbies.get(ticket.roomId);
    if (!lobby) return fail(socket, 'lobby-not-found');

    unseat(io, socket.id);
    seatSocket(io, socket, lobby);
  });

  socket.on(C2S.LEAVE, () => {
    if (!checkRateLimit(socket.id, C2S.LEAVE)) return;
    unseat(io, socket.id);
  });

  socket.on(C2S.READY, (payload: unknown) => {
    if (!checkRateLimit(socket.id, C2S.READY)) return fail(socket, 'rate-limited');
    const lobby = myLobby();
    if (!lobby || lobby.state !== 'waiting') return;
    const seat = lobby.seats.get(socket.id);
    if (!seat) return;
    seat.ready = (payload as { ready?: unknown } | undefined)?.ready !== false;
    touch(lobby);
    broadcastLobby(io, lobby);
  });

  socket.on(C2S.REMATCH, () => {
    if (!checkRateLimit(socket.id, C2S.REMATCH)) return fail(socket, 'rate-limited');
    const lobby = myLobby();
    if (!lobby || lobby.state !== 'waiting') return;
    const seat = lobby.seats.get(socket.id);
    if (!seat) return;
    seat.ready = true;
    touch(lobby);
    broadcastLobby(io, lobby);
  });

  socket.on(C2S.SETTINGS, (payload: unknown) => {
    if (!checkRateLimit(socket.id, C2S.SETTINGS)) return fail(socket, 'rate-limited');
    const lobby = requireHost();
    if (!lobby || lobby.state !== 'waiting') return;
    const p = (payload ?? {}) as Record<string, unknown>;
    if (typeof p.isPublic === 'boolean') lobby.isPublic = p.isPublic;
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
    if (lobby.seats.size < MIN_PLAYERS) return fail(socket, 'need-more-players');

    for (const seat of lobby.seats.values()) {
      if (seat.socketId !== lobby.hostSocketId && !seat.ready) {
        return fail(socket, 'not-everyone-ready');
      }
    }
    beginCountdown(io, lobby);
  });

  socket.on(C2S.HOUSE_RULES, (payload: unknown) => {
    if (!checkRateLimit(socket.id, C2S.HOUSE_RULES)) return fail(socket, 'rate-limited');
    const lobby = requireHost();
    if (!lobby) return;

    // The client may have had these drafted by the AI endpoint, or may have
    // typed them itself, or may be lying — it makes no difference. The clamp is
    // the rule, and it runs here regardless of what happened upstream.
    const next = clampHouseRules((payload as { rules?: unknown } | undefined)?.rules, lobby.rules);
    const changes = diffHouseRules(lobby.rules, next);
    if (changes.length === 0) return;

    lobby.rules = next;
    touch(lobby);
    pushLog(lobby, 'house-rules', {
      actorName: lobby.seats.get(socket.id)?.name,
      changes,
    });
    io.to(roomName(lobby.code)).emit(S2C.HOUSE_RULES, { rules: next, changes });
    broadcastLobby(io, lobby);
    // A clock that just changed should not keep running on its old length, and
    // a table mid-hand needs to see the new numbers immediately.
    if (lobby.state === 'playing') emitState(io, lobby);
  });

  socket.on(C2S.CHAT, (payload: unknown) => {
    if (!checkRateLimit(socket.id, C2S.CHAT)) return;
    const lobby = myLobby();
    if (!lobby) return;
    const seat = lobby.seats.get(socket.id);
    if (!seat) return;

    const text = sanitizeString((payload as { text?: unknown } | undefined)?.text, CHAT_MAX_LENGTH);
    if (!text) return;

    const message: ChatMessage = {
      id: `${lobby.code}-${++lobby.chatSeq}`,
      socketId: seat.socketId,
      name: seat.name,
      avatarUrl: seat.avatarUrl,
      text,
      at: Date.now(),
    };
    lobby.chat.push(message);
    if (lobby.chat.length > CHAT_HISTORY) lobby.chat.shift();
    touch(lobby);
    io.to(roomName(lobby.code)).emit(S2C.CHAT, message);
  });

  // ── The table ────────────────────────────────────────────────────────────

  socket.on(C2S.PLAY, (payload: unknown) => {
    if (!checkRateLimit(socket.id, C2S.PLAY)) return fail(socket, 'rate-limited');
    // Cards are spent on your own turn only, and before you commit to the roll —
    // buying a look at the dice AFTER hearing the claims would make Azure an
    // auto-win rather than a bet.
    const turn = requireTurn(['action', 'final']);
    if (!turn) return;
    const { lobby, seat } = turn;
    if (lobby.phase === 'action' && lobby.rolled) return fail(socket, 'already-rolled');

    const p = (payload ?? {}) as Record<string, unknown>;
    const cardId = typeof p.cardId === 'string' ? p.cardId : '';
    const card = seat.hand.find((c) => c.id === cardId);
    if (!card) return fail(socket, 'no-such-card');

    // A house rule can switch a colour (or the seven) off. Refuse the play
    // outright rather than spending the card on nothing.
    const wouldSwap = card.rank === SWAP_RANK && lobby.rules.swapEnabled;
    if (card.rank === SWAP_RANK && !lobby.rules.swapEnabled && !lobby.rules.effects[card.color]) {
      return fail(socket, 'rule-disabled');
    }
    if (card.rank !== SWAP_RANK && !lobby.rules.effects[card.color]) {
      return fail(socket, 'rule-disabled');
    }

    // Validate the target BEFORE spending the card, so a mis-aimed play costs
    // nothing rather than burning a seven into the discard.
    let target: Seat | null = null;
    if (TARGETED_EFFECTS.includes(wouldSwap ? 'swap' : COLOR_EFFECT[card.color])) {
      const targetId = typeof p.targetSocketId === 'string' ? p.targetSocketId : '';
      const found = lobby.seats.get(targetId);
      if (!found || found.socketId === seat.socketId) return fail(socket, 'invalid-target');
      target = found;
    }

    seat.hand = seat.hand.filter((c) => c.id !== card.id);
    lobby.discard.push(card);
    const effect = wouldSwap ? 'swap' : COLOR_EFFECT[card.color];
    // The discard's two cards land before the effect resolves — which is why a
    // seven you play is a seven you swap away *after* paying for it.
    drawCards(lobby, seat, lobby.rules.playDraw);
    pushLog(lobby, 'play', {
      actorName: seat.name,
      targetName: target?.name,
      color: card.color,
      effect,
      amount: lobby.rules.playDraw,
    });

    switch (effect) {
      case 'swap': {
        if (!target) break;
        const mine = seat.hand;
        seat.hand = target.hand;
        target.hand = mine;
        pushLog(lobby, 'swap', { actorName: seat.name, targetName: target.name });
        break;
      }
      case 'accuse': {
        if (target) penalize(lobby, target);
        break;
      }
      case 'ward': {
        seat.warded = true;
        break;
      }
      case 'scry': {
        if (target) {
          seat.scry = {
            socketId: target.socketId,
            name: target.name,
            cards: [...target.hand],
          };
          pushLog(lobby, 'scry', { actorName: seat.name, targetName: target.name });
        }
        break;
      }
      case 'glimpse': {
        seat.glimpsed = true;
        pushLog(lobby, 'glimpse', { actorName: seat.name });
        break;
      }
    }

    touch(lobby);
    emitState(io, lobby);
  });

  socket.on(C2S.ROLL, () => {
    if (!checkRateLimit(socket.id, C2S.ROLL)) return fail(socket, 'rate-limited');
    const turn = requireTurn(['action']);
    if (!turn) return;
    if (turn.lobby.rolled) return;
    rollDice(io, turn.lobby);
  });

  socket.on(C2S.SOUND_END, () => {
    if (!checkRateLimit(socket.id, C2S.SOUND_END)) return fail(socket, 'rate-limited');
    const turn = requireTurn(['action']);
    if (!turn) return;
    const { lobby, seat } = turn;
    if (lobby.endCalledBy) return;
    if (lobby.rolled) return fail(socket, 'already-rolled');
    // Not before everyone has played: on turn one the caller holds the same four
    // cards as everybody else, so it would not be a bluff, just a short game.
    if (lobby.turnsTaken < Math.max(lobby.rules.minTurnsBeforeEnd, lobby.order.length)) {
      return fail(socket, 'too-early');
    }
    soundEnd(io, lobby, seat);
  });

  socket.on(C2S.PASS, () => {
    if (!checkRateLimit(socket.id, C2S.PASS)) return fail(socket, 'rate-limited');
    const turn = requireTurn(['final']);
    if (!turn) return;
    const { lobby, seat } = turn;
    seat.finalDone = true;
    pushLog(lobby, 'pass', { actorName: seat.name });
    lobby.finalQueue.shift();
    nextFinalTurn(io, lobby);
  });

  socket.on(C2S.CLAIM, (payload: unknown) => {
    if (!checkRateLimit(socket.id, C2S.CLAIM)) return fail(socket, 'rate-limited');
    const lobby = myLobby();
    if (!lobby || lobby.state !== 'playing' || lobby.phase !== 'claim') return;
    const seat = lobby.seats.get(socket.id);
    if (!seat) return;
    // The roller is the one person who does not get to say a number.
    if (activeSocketId(lobby) === socket.id) return fail(socket, 'roller-cannot-claim');
    if (lobby.claims.has(socket.id)) return fail(socket, 'already-claimed');

    const raw = (payload as { total?: unknown } | undefined)?.total;
    const total = typeof raw === 'number' && Number.isFinite(raw) ? Math.floor(raw) : NaN;
    // The legal range moves with the dice count, which a house rule can change.
    const low = lobby.rules.diceCount;
    const high = lobby.rules.diceCount * DIE_FACES;
    if (!Number.isInteger(total) || total < low || total > high) {
      return fail(socket, 'invalid-claim');
    }

    lobby.claims.set(socket.id, total);
    pushLog(lobby, 'claim', { actorName: seat.name, total });
    touch(lobby);

    if (allClaimsIn(lobby)) {
      setPhase(io, lobby, 'call');
      return;
    }
    emitState(io, lobby);
  });

  socket.on(C2S.CALL, (payload: unknown) => {
    if (!checkRateLimit(socket.id, C2S.CALL)) return fail(socket, 'rate-limited');
    const turn = requireTurn(['call']);
    if (!turn) return;
    const { lobby, seat } = turn;

    const p = (payload ?? {}) as Record<string, unknown>;
    const targetSocketId = typeof p.targetSocketId === 'string' ? p.targetSocketId : '';
    const verdict = p.verdict === 'lie' ? 'lie' : p.verdict === 'truth' ? 'truth' : null;
    if (!verdict) return fail(socket, 'invalid-call');
    if (!lobby.claims.has(targetSocketId)) return fail(socket, 'no-such-claim');

    resolveCall(io, lobby, seat, targetSocketId, verdict);
  });
}

export function handleGabrielsHornDisconnect(io: Server, socket: Socket): void {
  // A dropped socket is not a player quitting — the seat is held (see `unseat`).
  unseat(io, socket.id, 'drop');
}
