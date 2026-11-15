/**
 * Roulette — Room-based multiplayer handler.
 *
 * Players create or join rooms. Each room runs its own table.
 * European single-zero roulette (0-36).
 * Phases: idle → betting (25s) → spinning → results (5s) → betting.
 */

import { randomUUID } from 'crypto';
import type { Server, Socket } from 'socket.io';
import { getPrismaClient } from '../../../server/socket-server/prisma-client';
import {
  debitCoinsOn,
  creditCoinsOn,
  getBalanceOn,
  getBalancesOn,
} from '../../../lib/economy/ledger-core';
import { checkRateLimit } from '../../../server/socket-server/rate-limit';
import { logger } from '../../../server/socket-server/logger';
import {
  CASINO_SHUTDOWN_DEADLINE_MS,
  InFlight,
  settleShutdownClaims,
  type ShutdownRefundSummary,
  type StakeClaim,
} from './casino-shutdown';
import { saveTablesOrRefund } from './durable-shutdown';
import {
  ROULETTE_STAKE_KEYS as STAKE_KEYS,
  ROULETTE_TABLE_VERSION,
  parseStoredRouletteTable,
  seatStake,
  unsavedTableClaims,
  type StoredRouletteTable,
} from './roulette-table-state';
import type { StakeFate } from './stake-keys';
import { readStakeFates } from './stake-ledger';
import { TablePersistence } from './table-persistence';
import type { CasinoTableStore } from './table-store';
import {
  type Bet,
  type BetType,
  spin,
  getPayoutMultiplier,
  calculatePayout,
  getNumberColor,
  getOutsideBetNumbers,
  DOUBLE_ZERO,
} from '../engine/roulette/logic';
import { C2S, S2C } from '../engine/roulette/events';
import type {
  TablePhase,
  TableStateSnapshot,
  PlayerSeatClient,
  SpinResultPayload,
  RoundResultPayload,
  SessionStats,
} from '../engine/roulette/types';

// ── Types ──────────────────────────────────────────────────────────

interface PlayerBet {
  type: BetType;
  numbers: number[];
  amount: number;
}

interface PlayerSeat {
  seatIndex: number;
  socketId: string;
  userId: string;
  userName: string;
  avatarUrl: string | null;
  bets: PlayerBet[];
  totalBetThisRound: number;
  lastPayout: number;
  sessionStats: SessionStats;
  // Set when a player leaves/disconnects mid-round but still has an active bet.
  // The seat is kept until the spin resolves so the payout still lands.
  pendingRemoval?: boolean;
  // Names the bets on this seat: minted by the first bet, dropped when the
  // bets are cleared or the next betting phase opens. Durable tables key the
  // spin's payout and any return of the bets by it (roulette-table-state.ts).
  stakeId: string | null;
}

interface RouletteRoom {
  roomId: string;
  name: string;
  ownerId: string;
  ownerName: string;
  maxPlayers: number;
  privacy: 'public' | 'unlisted';
  joinCode: string;
  phase: TablePhase;
  players: Map<string, PlayerSeat>;
  bettingTimer: ReturnType<typeof setTimeout> | null;
  resultsTimer: ReturnType<typeof setTimeout> | null;
  spinTimer: ReturnType<typeof setTimeout> | null;
  // The 2s "nobody bet, try again" restart. It was untracked, so a join during
  // the gap started betting and the stray timer then restarted it, zeroing
  // every debited bet.
  restartTimer: ReturnType<typeof setTimeout> | null;
  // Durable tables only: armed when a table is restored after a restart; when
  // it fires, seats whose player has not come back leave under the usual rules.
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  // True from the moment resolvePayouts has computed this round's payouts
  // (its settlement transaction then owns every bet) until the next betting
  // phase. The phase stays 'spinning' across that await, so shutdown reads
  // this to tell a spin still owed a refund from one already being paid.
  settling: boolean;
  roundNumber: number;
  bettingDeadline: number | null;
  lastResult: number | null;
  history: number[];
}

// ── Constants ──────────────────────────────────────────────────────

const DEFAULT_MAX_PLAYERS = 10;
const MAX_PLAYERS_CAP = 10;
const BETTING_DURATION_MS = 25_000;
const RESULTS_DISPLAY_MS = 8_000;
const SPIN_ANIMATION_DELAY_MS = 5_000;
const MIN_BET = 1;
const MAX_HISTORY = 50;
// Restored tables (durable tables only). The betting window reopens at its
// full length. A spin that was waiting on the wheel pays after this delay
// instead of the animation delay, so a reconnecting player sees it land.
const RESTORE_SETTLE_DELAY_MS = 10_000;
// How long a restored seat is held for its player before the seat is treated
// as a disconnect.
const RESTORE_RECONNECT_MS = 30_000;

// ── Bet Validation ─────────────────────────────────────────────────

const INSIDE_BET_COUNTS: Record<string, number> = {
  straight: 1,
  split: 2,
  street: 3,
  corner: 4,
  topline: 5,
  line: 6,
};

const OUTSIDE_BET_TYPES = new Set<BetType>([
  'red',
  'black',
  'odd',
  'even',
  'low',
  'high',
  'dozen1',
  'dozen2',
  'dozen3',
  'column1',
  'column2',
  'column3',
]);

const ALL_BET_TYPES = new Set<BetType>([
  'straight',
  'split',
  'street',
  'corner',
  'line',
  'topline',
  ...OUTSIDE_BET_TYPES,
]);

function isValidBetType(type: string): type is BetType {
  return ALL_BET_TYPES.has(type as BetType);
}

function validateBetNumbers(type: BetType, numbers: number[]): boolean {
  // All numbers must be valid: -1 (00), 0-36
  if (!numbers.every((n) => Number.isInteger(n) && n >= DOUBLE_ZERO && n <= 36)) return false;

  // Outside bets: numbers must match the predefined set
  if (OUTSIDE_BET_TYPES.has(type)) {
    const expected = getOutsideBetNumbers(type);
    if (numbers.length !== expected.length) return false;
    const expectedSet = new Set(expected);
    return numbers.every((n) => expectedSet.has(n));
  }

  // Topline: must be exactly [0, -1, 1, 2, 3]
  if (type === 'topline') {
    const expected = new Set([0, DOUBLE_ZERO, 1, 2, 3]);
    return numbers.length === 5 && numbers.every((n) => expected.has(n));
  }

  // Inside bets: must have correct count and unique numbers
  const expectedCount = INSIDE_BET_COUNTS[type];
  if (!expectedCount || numbers.length !== expectedCount) return false;
  if (new Set(numbers).size !== numbers.length) return false;

  return true;
}

// ── State ──────────────────────────────────────────────────────────

const rooms = new Map<string, RouletteRoom>();
const socketToUserId = new Map<string, string>();
const userToRoom = new Map<string, string>();
let ioRef: Server;
// Set once by refundRouletteOnShutdown(): from then on no room is live.
let closing = false;
// Debits, refunds and payout transactions still awaiting the database.
const inFlight = new InFlight();
// Set once by restoreRouletteTables() when CASINO_DURABLE_TABLES is on; null
// otherwise, and then every `durable?.` below does nothing.
let durable: TablePersistence | null = null;

// Socket.io room that lobby browsers join so room-list updates reach only the
// clients currently viewing the lobby — not every connected socket on the
// server (which sprayed all ~18 games on every casino room mutation).
const LOBBY_ROOM = 'rl:lobby';

function roomKey(roomId: string): string {
  return `rl:${roomId}`;
}

function generateRoomId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  for (let i = 0; i < 5; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

// ── Table State Serialization ──────────────────────────────────────

function serializeTableState(room: RouletteRoom): TableStateSnapshot {
  const players: PlayerSeatClient[] = Array.from(room.players.values()).map((p) => ({
    userId: p.userId,
    userName: p.userName,
    avatarUrl: p.avatarUrl,
    seatIndex: p.seatIndex,
    bets: p.bets.map((b) => ({ type: b.type, numbers: b.numbers, amount: b.amount })),
    totalBetThisRound: p.totalBetThisRound,
    lastPayout: p.lastPayout,
    sessionStats: p.sessionStats,
  }));

  return {
    tableId: room.roomId,
    phase: room.phase,
    roundNumber: room.roundNumber,
    players,
    bettingCountdown: room.bettingDeadline
      ? Math.max(0, Math.ceil((room.bettingDeadline - Date.now()) / 1000))
      : null,
    lastResult: room.lastResult,
    history: room.history,
  };
}

function broadcastTableState(room: RouletteRoom) {
  // Every change a client can see goes out through here, so this is the save seam.
  durable?.markDirty(room.roomId);
  ioRef.to(roomKey(room.roomId)).emit(S2C.TABLE_STATE, serializeTableState(room));
}

function broadcastRoomList() {
  const list = Array.from(rooms.values())
    .filter((r) => r.privacy === 'public')
    .map((r) => ({
      roomId: r.roomId,
      name: r.name,
      ownerName: r.ownerName,
      playerCount: r.players.size,
      maxPlayers: r.maxPlayers,
      inProgress: roundInProgress(r),
    }));
  ioRef.to(LOBBY_ROOM).emit(S2C.ROOM_LIST, { rooms: list });
}

// ── Seat Assignment ────────────────────────────────────────────────

function getNextSeatIndex(room: RouletteRoom): number {
  const taken = new Set(Array.from(room.players.values()).map((p) => p.seatIndex));
  for (let i = 0; i < room.maxPlayers; i++) {
    if (!taken.has(i)) return i;
  }
  return -1;
}

// ── Round Lifecycle ────────────────────────────────────────────────

function clearTimers(room: RouletteRoom) {
  if (room.bettingTimer) {
    clearTimeout(room.bettingTimer);
    room.bettingTimer = null;
  }
  if (room.resultsTimer) {
    clearTimeout(room.resultsTimer);
    room.resultsTimer = null;
  }
  if (room.spinTimer) {
    clearTimeout(room.spinTimer);
    room.spinTimer = null;
  }
  if (room.restartTimer) {
    clearTimeout(room.restartTimer);
    room.restartTimer = null;
  }
  if (room.reconnectTimer) {
    clearTimeout(room.reconnectTimer);
    room.reconnectTimer = null;
  }
}

/** The wheel is spinning or showing results: stakes are committed. */
function roundInProgress(room: RouletteRoom): boolean {
  return room.phase !== 'idle' && room.phase !== 'betting';
}

/**
 * The room is still the live one for this id (not destroyed while we awaited),
 * and the hub is not shutting down (its stakes were refunded at shutdown).
 */
function isLive(room: RouletteRoom): boolean {
  return !closing && rooms.get(room.roomId) === room;
}

/** Return a stake that never reached a spin. Errors are logged, never thrown. */
function refundStake(
  room: RouletteRoom,
  userId: string,
  amount: number,
  note: string,
  idempotencyKey?: string,
) {
  return inFlight.track(refundStakeNow(room, userId, amount, note, idempotencyKey));
}

async function refundStakeNow(
  room: RouletteRoom,
  userId: string,
  amount: number,
  note: string,
  idempotencyKey?: string,
) {
  if (amount <= 0) return;
  try {
    const prisma = getPrismaClient();
    const balance = await prisma.$transaction(async (tx) => {
      await creditCoinsOn(tx, userId, amount, {
        tx,
        type: 'WAGER',
        entityType: 'roulette',
        entityId: room.roomId,
        note,
        ...(idempotencyKey ? { idempotencyKey } : {}),
      });
      return getBalanceOn(tx, userId);
    });
    for (const [sid, uid] of socketToUserId) {
      if (uid === userId) ioRef.sockets.sockets.get(sid)?.emit(S2C.BALANCE_UPDATE, { coins: balance });
    }
  } catch (err) {
    logger.error({ event: 'rl_refund_error', roomId: room.roomId, userId, amount, error: String(err) });
  }
}

function startBettingPhase(room: RouletteRoom) {
  if (room.restartTimer) {
    clearTimeout(room.restartTimer);
    room.restartTimer = null;
  }
  // Only from idle: re-entering over a live betting phase wiped debited bets.
  if (room.phase !== 'idle' || !isLive(room)) return;
  if (room.players.size === 0) {
    room.phase = 'idle';
    broadcastTableState(room);
    return;
  }

  room.phase = 'betting';
  room.settling = false;
  room.roundNumber++;

  for (const p of room.players.values()) {
    p.bets = [];
    p.totalBetThisRound = 0;
    p.lastPayout = 0;
    p.stakeId = null;
  }

  room.bettingDeadline = Date.now() + BETTING_DURATION_MS;

  ioRef.to(roomKey(room.roomId)).emit(S2C.BETTING_PHASE, {
    countdown: Math.ceil(BETTING_DURATION_MS / 1000),
    roundNumber: room.roundNumber,
  });

  broadcastTableState(room);

  room.bettingTimer = setTimeout(() => endBettingPhase(room), BETTING_DURATION_MS);
}

function endBettingPhase(room: RouletteRoom) {
  if (room.phase !== 'betting') return;
  room.bettingTimer = null;
  room.bettingDeadline = null;

  // Check if any player placed bets
  let hasBets = false;
  for (const p of room.players.values()) {
    if (p.bets.length > 0) {
      hasBets = true;
      break;
    }
  }

  if (!hasBets) {
    room.phase = 'idle';
    broadcastTableState(room);
    if (room.players.size > 0) {
      room.restartTimer = setTimeout(() => {
        room.restartTimer = null;
        startBettingPhase(room);
      }, 2000);
    }
    return;
  }

  startSpinPhase(room);
}

function startSpinPhase(room: RouletteRoom) {
  room.phase = 'spinning';

  // Determine result server-side
  const result = spin();

  // Store result on room so broadcastTableState includes it
  room.lastResult = result;

  // Send spin result immediately so client can start animation
  const spinPayload: SpinResultPayload = { result };
  ioRef.to(roomKey(room.roomId)).emit(S2C.SPIN_RESULT, spinPayload);

  broadcastTableState(room);

  // Wait for client animation to complete, then resolve payouts
  scheduleSettlement(room, result, SPIN_ANIMATION_DELAY_MS);
}

function scheduleSettlement(room: RouletteRoom, result: number, delayMs: number) {
  if (room.spinTimer) clearTimeout(room.spinTimer);
  room.spinTimer = setTimeout(() => {
    room.spinTimer = null;
    void inFlight.track(resolvePayouts(room, result));
  }, delayMs);
}

async function resolvePayouts(room: RouletteRoom, result: number) {
  if (room.phase !== 'spinning' || !isLive(room)) return;
  // From here the settlement below owns every bet on the table (see `settling`).
  // `settling` on the way in happens only on a restored table that was saved
  // while this settlement was in flight: its history and statistics are
  // already counted.
  const counted = room.settling;
  room.settling = true;
  room.lastResult = result;
  if (!counted) {
    room.history.unshift(result);
    if (room.history.length > MAX_HISTORY) {
      room.history = room.history.slice(0, MAX_HISTORY);
    }
  }

  const payoutUpdates: {
    userId: string;
    totalPayout: number;
    netGain: number;
    idempotencyKey: string | undefined;
  }[] = [];

  for (const p of room.players.values()) {
    if (p.bets.length === 0) continue;

    let totalPayout = 0;
    for (const bet of p.bets) {
      totalPayout += calculatePayout(bet, result);
    }

    const netGain = totalPayout - p.totalBetThisRound;
    p.lastPayout = totalPayout;

    // Update session stats
    if (!counted) {
      p.sessionStats.totalBet += p.totalBetThisRound;
      p.sessionStats.totalWon += totalPayout;
      p.sessionStats.roundsPlayed++;
    }

    payoutUpdates.push({
      userId: p.userId,
      totalPayout,
      netGain,
      // Durable tables: one key per stake, so a settlement that runs again
      // after a restart credits nothing a second time.
      idempotencyKey: durable && p.stakeId ? STAKE_KEYS.payout(p.stakeId) : undefined,
    });
  }

  try {
    const prisma = getPrismaClient();
    const balanceMap = new Map<string, number>();

    await prisma.$transaction(async (tx: any) => {
      for (const update of payoutUpdates) {
        if (update.totalPayout > 0) {
          // Payout from the house: a faucet, recorded so the table's coin
          // creation shows up in supply reporting instead of appearing as an
          // unexplained balance jump.
          await creditCoinsOn(tx, update.userId, update.totalPayout, {
            tx,
            type: 'WAGER',
            entityType: 'roulette',
            entityId: room.roomId,
            note: 'Roulette payout',
            ...(update.idempotencyKey ? { idempotencyKey: update.idempotencyKey } : {}),
          });
        }
      }
      // One balance read for the whole table once every credit has landed,
      // rather than a lookup per seat interleaved with the credits. Each
      // player's balance only depends on their own credit, so the values are
      // identical — this just stops paying a round-trip per seat inside the
      // settlement transaction. Seats with no profile row still report 0, so
      // every player continues to receive a BALANCE_UPDATE.
      const balances = await getBalancesOn(
        tx,
        payoutUpdates.map((u) => u.userId),
      );
      for (const update of payoutUpdates) {
        balanceMap.set(update.userId, balances.get(update.userId) ?? 0);
      }
    });

    const roundResult: RoundResultPayload = {
      result,
      payouts: payoutUpdates.map((u) => ({
        userId: u.userId,
        payout: u.totalPayout,
        netGain: u.netGain,
      })),
    };

    ioRef.to(roomKey(room.roomId)).emit(S2C.ROUND_RESULT, roundResult);

    for (const [userId, balance] of balanceMap) {
      const player = room.players.get(userId);
      if (player) {
        const sock = ioRef.sockets.sockets.get(player.socketId);
        if (sock) sock.emit(S2C.BALANCE_UPDATE, { coins: balance });
      }
    }
  } catch (err) {
    logger.error({ event: 'rl_payout_error', roomId: room.roomId, error: String(err) });
  }

  if (!isLive(room)) return;
  room.phase = 'results';
  broadcastTableState(room);

  room.resultsTimer = setTimeout(() => {
    room.resultsTimer = null;
    // Prune players who left or disconnected, now that payouts have settled.
    for (const [uid, p] of room.players) {
      const sock = p.socketId ? ioRef.sockets.sockets.get(p.socketId) : null;
      if (p.pendingRemoval || !sock || !sock.connected) {
        room.players.delete(uid);
        userToRoom.delete(uid);
        ioRef
          .to(roomKey(room.roomId))
          .emit(S2C.PLAYER_LEFT, { userId: uid, seatIndex: p.seatIndex });

        if (room.ownerId === uid && room.players.size > 0) {
          const newOwner = room.players.values().next().value!;
          room.ownerId = newOwner.userId;
          room.ownerName = newOwner.userName;
          ioRef.to(roomKey(room.roomId)).emit(S2C.ROOM_UPDATED, {
            ownerId: room.ownerId,
            ownerName: room.ownerName,
            maxPlayers: room.maxPlayers,
            name: room.name,
            privacy: room.privacy,
            joinCode: room.joinCode,
          });
        }
      }
    }

    if (room.players.size === 0) {
      destroyRoom(room.roomId);
      return;
    }

    broadcastRoomList();
    room.phase = 'idle';
    startBettingPhase(room);
  }, RESULTS_DISPLAY_MS);
}

// ── Room Management ───────────────────────────────────────────────

function destroyRoom(roomId: string) {
  const room = rooms.get(roomId);
  if (room) {
    clearTimers(room);
    rooms.delete(roomId);
    durable?.remove(roomId);
    logger.info({ event: 'rl_room_destroyed', roomId });
    broadcastRoomList();
  }
}

/** The public lobby rows — see `blackjack.ts#listPublicRooms` for why this is
 *  exported rather than inlined into the socket handler. */
export function listPublicRooms() {
  return Array.from(rooms.values())
    .filter((r) => r.privacy === 'public')
    .map((r) => ({
      roomId: r.roomId,
      name: r.name,
      ownerName: r.ownerName,
      playerCount: r.players.size,
      maxPlayers: r.maxPlayers,
      inProgress: roundInProgress(r),
    }));
}

function onListRooms(socket: Socket) {
  // Browsing the lobby → subscribe this socket to the lobby room so it keeps
  // receiving broadcastRoomList() updates while it's viewing the list.
  socket.join(LOBBY_ROOM);
  socket.emit(S2C.ROOM_LIST, { rooms: listPublicRooms() });
}

function onCreateRoom(socket: Socket, payload: unknown) {
  const userId = socket.data.userId as string | undefined;
  const userName = (socket.data.userName as string) || 'Player';

  if (!userId) {
    socket.emit(S2C.ERROR, { message: 'You must be logged in.' });
    return;
  }

  if (!checkRateLimit(socket.id, C2S.CREATE_ROOM)) {
    socket.emit(S2C.ERROR, { message: 'Too many requests.' });
    return;
  }

  // Leave current room if in one
  const currentRoomId = userToRoom.get(userId);
  if (currentRoomId) {
    leaveRoom(userId, socket.id);
  }

  const data = payload as any;
  const name =
    typeof data?.name === 'string' ? data.name.trim().slice(0, 30) : `${userName}'s Room`;
  const maxPlayers =
    typeof data?.maxPlayers === 'number'
      ? Math.min(Math.max(Math.floor(data.maxPlayers), 2), MAX_PLAYERS_CAP)
      : DEFAULT_MAX_PLAYERS;
  const privacy = data?.privacy === 'unlisted' ? ('unlisted' as const) : ('public' as const);

  const roomId = generateRoomId();
  const joinCode = generateRoomId();

  const room: RouletteRoom = {
    roomId,
    name,
    ownerId: userId,
    ownerName: userName,
    maxPlayers,
    privacy,
    joinCode,
    phase: 'idle',
    players: new Map(),
    bettingTimer: null,
    resultsTimer: null,
    spinTimer: null,
    restartTimer: null,
    reconnectTimer: null,
    settling: false,
    roundNumber: 0,
    bettingDeadline: null,
    lastResult: null,
    history: [],
  };

  rooms.set(roomId, room);
  logger.info({ event: 'rl_room_created', roomId, userId, name });

  joinRoom(room, socket);

  socket.emit(S2C.ROOM_CREATED, { roomId, name, maxPlayers, privacy, joinCode });
  broadcastRoomList();
}

function onJoinRoom(socket: Socket, payload: unknown) {
  const userId = socket.data.userId as string | undefined;

  if (!userId) {
    socket.emit(S2C.ERROR, { message: 'You must be logged in.' });
    return;
  }

  if (!checkRateLimit(socket.id, C2S.JOIN_ROOM)) {
    socket.emit(S2C.ERROR, { message: 'Too many requests.' });
    return;
  }

  const data = payload as any;
  const roomId = typeof data?.roomId === 'string' ? data.roomId : '';
  const joinCodeInput = typeof data?.joinCode === 'string' ? data.joinCode : '';

  let room = rooms.get(roomId);
  if (!room && joinCodeInput) {
    for (const r of rooms.values()) {
      if (r.joinCode === joinCodeInput) {
        room = r;
        break;
      }
    }
  }
  if (!room) {
    socket.emit(S2C.ERROR, { message: 'Room not found.' });
    return;
  }

  // Leave current room if different
  const currentRoomId = userToRoom.get(userId);
  if (currentRoomId && currentRoomId !== room.roomId) {
    leaveRoom(userId, socket.id);
  }

  // Reconnect
  if (room.players.has(userId)) {
    const existing = room.players.get(userId)!;
    existing.socketId = socket.id;
    socketToUserId.set(socket.id, userId);
    userToRoom.set(userId, room.roomId);
    socket.join(roomKey(room.roomId));
    socket.leave(LOBBY_ROOM); // entering a table → stop receiving lobby updates
    socket.emit(S2C.ROOM_JOINED, {
      roomId: room.roomId,
      name: room.name,
      ownerId: room.ownerId,
      ownerName: room.ownerName,
      maxPlayers: room.maxPlayers,
      privacy: room.privacy,
      joinCode: room.joinCode,
    });
    socket.emit(S2C.TABLE_STATE, serializeTableState(room));
    return;
  }

  if (room.players.size >= room.maxPlayers) {
    socket.emit(S2C.ERROR, { message: `Room is full (${room.maxPlayers}/${room.maxPlayers}).` });
    return;
  }

  joinRoom(room, socket);
}

function joinRoom(room: RouletteRoom, socket: Socket) {
  const userId = socket.data.userId as string;
  const userName = (socket.data.userName as string) || 'Player';
  const avatarUrl = (socket.data.avatarUrl as string | null) || null;

  const seatIndex = getNextSeatIndex(room);
  if (seatIndex < 0) {
    socket.emit(S2C.ERROR, { message: 'No seats available.' });
    return;
  }

  const player: PlayerSeat = {
    seatIndex,
    socketId: socket.id,
    userId,
    userName,
    avatarUrl,
    bets: [],
    totalBetThisRound: 0,
    lastPayout: 0,
    sessionStats: { totalBet: 0, totalWon: 0, roundsPlayed: 0 },
    stakeId: null,
  };

  room.players.set(userId, player);
  durable?.markDirty(room.roomId);
  socketToUserId.set(socket.id, userId);
  userToRoom.set(userId, room.roomId);
  socket.join(roomKey(room.roomId));
  socket.leave(LOBBY_ROOM); // entering a table → stop receiving lobby updates

  logger.info({ event: 'rl_player_joined', roomId: room.roomId, userId, userName, seatIndex });

  socket.emit(S2C.ROOM_JOINED, {
    roomId: room.roomId,
    name: room.name,
    ownerId: room.ownerId,
    ownerName: room.ownerName,
    maxPlayers: room.maxPlayers,
    privacy: room.privacy,
    joinCode: room.joinCode,
  });

  ioRef.to(roomKey(room.roomId)).emit(S2C.PLAYER_JOINED, {
    userId,
    userName,
    avatarUrl,
    seatIndex,
  });

  socket.emit(S2C.TABLE_STATE, serializeTableState(room));
  broadcastRoomList();

  if (room.phase === 'idle') {
    startBettingPhase(room);
  }
}

function onLeaveRoom(socket: Socket) {
  const userId = socketToUserId.get(socket.id);
  if (!userId) return;
  leaveRoom(userId, socket.id);
}

function leaveRoom(userId: string, socketId: string) {
  const roomId = userToRoom.get(userId);
  if (!roomId) return;

  const room = rooms.get(roomId);
  if (!room) {
    userToRoom.delete(userId);
    socketToUserId.delete(socketId);
    return;
  }

  const player = room.players.get(userId);
  if (!player) {
    userToRoom.delete(userId);
    socketToUserId.delete(socketId);
    return;
  }

  const seatIndex = player.seatIndex;

  // If the player leaves while the wheel is spinning / showing results and
  // still has an active bet, keep the seat so the pending payout settles.
  const roundActive = roundInProgress(room);
  if (roundActive && player.totalBetThisRound > 0) {
    player.pendingRemoval = true;
    player.socketId = '';
    userToRoom.delete(userId);
    socketToUserId.delete(socketId);
    const leavingSock = ioRef.sockets.sockets.get(socketId);
    if (leavingSock) {
      leavingSock.leave(roomKey(roomId));
      leavingSock.emit(S2C.ROOM_LEFT, { roomId });
    }
    durable?.markDirty(roomId);
    logger.info({ event: 'rl_player_left_pending_payout', roomId, userId, seatIndex });
    return;
  }

  // Bets placed this betting phase never reached a spin: give them back (they
  // used to vanish with the deleted seat).
  const uncommitted = player.totalBetThisRound;
  const stakeId = player.stakeId;
  player.bets = [];
  player.totalBetThisRound = 0;
  player.stakeId = null;
  void refundStake(
    room,
    userId,
    uncommitted,
    'Roulette bet refund (left table)',
    // Keyed by the stake, so a restart that restores a save taken before this
    // refund can see the bets were returned.
    durable && stakeId ? STAKE_KEYS.returned(stakeId) : undefined,
  );

  room.players.delete(userId);
  userToRoom.delete(userId);
  socketToUserId.delete(socketId);

  const sock = ioRef.sockets.sockets.get(socketId);
  if (sock) {
    sock.leave(roomKey(roomId));
    sock.emit(S2C.ROOM_LEFT, { roomId });
  }

  logger.info({ event: 'rl_player_left', roomId, userId, seatIndex });

  ioRef.to(roomKey(roomId)).emit(S2C.PLAYER_LEFT, { userId, seatIndex });

  // Transfer ownership
  if (room.ownerId === userId && room.players.size > 0) {
    const newOwner = room.players.values().next().value!;
    room.ownerId = newOwner.userId;
    room.ownerName = newOwner.userName;
    ioRef.to(roomKey(roomId)).emit(S2C.ROOM_UPDATED, {
      ownerId: room.ownerId,
      ownerName: room.ownerName,
      maxPlayers: room.maxPlayers,
      name: room.name,
      privacy: room.privacy,
      joinCode: room.joinCode,
    });
  }

  if (room.players.size === 0) {
    clearTimers(room);
    destroyRoom(roomId);
    return;
  }

  broadcastTableState(room);
  broadcastRoomList();
}

function onUpdateRoom(socket: Socket, payload: unknown) {
  const userId = socketToUserId.get(socket.id);
  if (!userId) return;

  const roomId = userToRoom.get(userId);
  if (!roomId) return;

  const room = rooms.get(roomId);
  if (!room) return;

  if (room.ownerId !== userId) {
    socket.emit(S2C.ERROR, { message: 'Only the room owner can change settings.' });
    return;
  }

  const data = payload as any;
  if (typeof data?.maxPlayers === 'number') {
    const newMax = Math.min(Math.max(Math.floor(data.maxPlayers), 2), MAX_PLAYERS_CAP);
    if (newMax < room.players.size) {
      socket.emit(S2C.ERROR, { message: 'Cannot reduce max below current player count.' });
      return;
    }
    room.maxPlayers = newMax;
  }

  if (typeof data?.name === 'string') {
    room.name = data.name.trim().slice(0, 30);
  }

  if (data?.privacy === 'public' || data?.privacy === 'unlisted') {
    room.privacy = data.privacy;
  }

  ioRef.to(roomKey(roomId)).emit(S2C.ROOM_UPDATED, {
    ownerId: room.ownerId,
    ownerName: room.ownerName,
    maxPlayers: room.maxPlayers,
    name: room.name,
    privacy: room.privacy,
    joinCode: room.joinCode,
  });

  durable?.markDirty(roomId);
  broadcastRoomList();
}

// ── Player Action Handlers ─────────────────────────────────────────

async function onPlaceBet(socket: Socket, payload: unknown) {
  const userId = socketToUserId.get(socket.id);
  if (!userId) {
    socket.emit(S2C.ERROR, { message: 'Not in a room.' });
    return;
  }

  const roomId = userToRoom.get(userId);
  if (!roomId) return;

  const room = rooms.get(roomId);
  if (!room || room.phase !== 'betting') {
    socket.emit(S2C.ERROR, { message: 'Not in betting phase.' });
    return;
  }

  if (!checkRateLimit(socket.id, C2S.PLACE_BET)) {
    socket.emit(S2C.ERROR, { message: 'Too many requests.' });
    return;
  }

  const player = room.players.get(userId);
  if (!player) return;

  const data = payload as any;
  const betType = typeof data?.type === 'string' ? data.type : '';
  const numbers = Array.isArray(data?.numbers) ? data.numbers : [];
  const amount = typeof data?.amount === 'number' ? Math.floor(data.amount) : 0;

  // Validate bet type
  if (!isValidBetType(betType)) {
    socket.emit(S2C.ERROR, { message: 'Invalid bet type.' });
    return;
  }

  // Validate amount
  if (amount < MIN_BET) {
    socket.emit(S2C.ERROR, { message: `Bet must be at least ${MIN_BET}.` });
    return;
  }

  // Validate numbers match bet type
  if (!validateBetNumbers(betType, numbers)) {
    socket.emit(S2C.ERROR, { message: 'Invalid numbers for this bet type.' });
    return;
  }

  const round = room.roundNumber;
  try {
    const prisma = getPrismaClient();
    const result = await prisma.$transaction(async (tx: any) => {
      // The stake leaves circulation. Was read-then-decrement: two actions
      // arriving together both read the same balance, both passed the check and
      // both decremented — a double-spend at a gambling table, where spamming
      // the action is the whole attack. debitCoinsOn puts the balance guard
      // inside the UPDATE, so the loser matches zero rows and throws.
      await debitCoinsOn(tx, userId, amount, {
        tx,
        type: 'WAGER',
        entityType: 'roulette',
        entityId: room.roomId,
        note: 'Roulette bet',
      });
      return getBalanceOn(tx, userId);
    });

    // Betting may have closed (or the player left) while the debit awaited.
    if (
      !isLive(room) ||
      room.phase !== 'betting' ||
      room.roundNumber !== round ||
      room.players.get(userId) !== player
    ) {
      socket.emit(S2C.ERROR, { message: 'Betting closed — your bet was refunded.' });
      await refundStake(room, userId, amount, 'Roulette bet refund (betting closed)');
      return;
    }

    player.bets.push({ type: betType, numbers, amount });
    player.totalBetThisRound += amount;
    player.stakeId ??= randomUUID();

    socket.emit(S2C.BALANCE_UPDATE, { coins: result });
    broadcastTableState(room);
  } catch (err) {
    if (err instanceof Error && err.message === 'INSUFFICIENT_COINS') {
      socket.emit(S2C.ERROR, { message: 'Not enough coins.' });
    } else {
      logger.error({ event: 'rl_bet_error', userId, error: String(err) });
      socket.emit(S2C.ERROR, { message: 'Failed to place bet.' });
    }
  } finally {
    // A stake moved: write the table now instead of waiting for the coalesced save.
    durable?.saveNow(room.roomId);
  }
}

async function onClearBets(socket: Socket) {
  const userId = socketToUserId.get(socket.id);
  if (!userId) {
    socket.emit(S2C.ERROR, { message: 'Not in a room.' });
    return;
  }

  const roomId = userToRoom.get(userId);
  if (!roomId) return;

  const room = rooms.get(roomId);
  if (!room || room.phase !== 'betting') {
    socket.emit(S2C.ERROR, { message: 'Not in betting phase.' });
    return;
  }

  if (!checkRateLimit(socket.id, C2S.CLEAR_BETS)) {
    socket.emit(S2C.ERROR, { message: 'Too many requests.' });
    return;
  }

  const player = room.players.get(userId);
  if (!player) return;

  if (player.bets.length === 0) {
    socket.emit(S2C.ERROR, { message: 'No bets to clear.' });
    return;
  }

  // Take exactly the bets being cleared off the seat now, synchronously: a bet
  // whose debit commits while this refund awaits is kept, not wiped unrefunded.
  const cleared = player.bets;
  const refundAmount = cleared.reduce((sum, b) => sum + b.amount, 0);
  const round = room.roundNumber;
  // The stake id goes with the bets it named: a bet placed from here on starts
  // a new one, and the refund below is keyed by the old one, so a restart that
  // restores a save taken before this refund can see the bets were returned.
  const stakeId = player.stakeId;
  const returnKey = durable && stakeId ? STAKE_KEYS.returned(stakeId) : undefined;
  player.bets = [];
  player.totalBetThisRound -= refundAmount;
  player.stakeId = null;

  try {
    const prisma = getPrismaClient();
    const result = await prisma.$transaction(async (tx: any) => {
      // Returning an un-resolved stake: a faucet back to the player, paired
      // with the WAGER sink that took it.
      await creditCoinsOn(tx, userId, refundAmount, {
        tx,
        type: 'WAGER',
        entityType: 'roulette',
        entityId: room.roomId,
        note: 'Roulette bet cleared',
        ...(returnKey ? { idempotencyKey: returnKey } : {}),
      });
      return getBalanceOn(tx, userId);
    });

    socket.emit(S2C.BALANCE_UPDATE, { coins: result });
    broadcastTableState(room);
  } catch (err) {
    logger.error({ event: 'rl_clear_bets_error', userId, error: String(err) });
    // The refund didn't land: put the bets back if they can still play.
    if (isLive(room) && room.roundNumber === round && room.players.get(userId) === player && room.phase === 'betting') {
      player.bets = [...cleared, ...player.bets];
      player.totalBetThisRound += refundAmount;
      // Bets placed while the refund awaited already carry a new id; all of
      // them now ride on that one.
      player.stakeId ??= stakeId;
      broadcastTableState(room);
    } else {
      // Too late to play them: retry the refund once instead of losing them.
      void refundStake(room, userId, refundAmount, 'Roulette bet cleared (retry)', returnKey);
    }
    socket.emit(S2C.ERROR, { message: 'Failed to clear bets.' });
  } finally {
    // A stake moved: write the table now instead of waiting for the coalesced save.
    durable?.saveNow(room.roomId);
  }
}

// ── Public API ─────────────────────────────────────────────────────

export function initializeRoulette(io: Server): void {
  ioRef = io;
  logger.info({ event: 'rl_handler_initialized' });
}

export function registerRouletteHandlers(io: Server, socket: Socket): void {
  ioRef = io;

  socket.on(C2S.LIST_ROOMS, () => onListRooms(socket));
  socket.on(C2S.CREATE_ROOM, (payload) => onCreateRoom(socket, payload));
  socket.on(C2S.JOIN_ROOM, (payload) => onJoinRoom(socket, payload));
  socket.on(C2S.LEAVE_ROOM, () => onLeaveRoom(socket));
  socket.on(C2S.UPDATE_ROOM, (payload) => onUpdateRoom(socket, payload));

  socket.on(C2S.PLACE_BET, (payload) => inFlight.track(onPlaceBet(socket, payload)));
  socket.on(C2S.CLEAR_BETS, () => inFlight.track(onClearBets(socket)));
}

export function handleRouletteDisconnect(_io: Server, socket: Socket): void {
  const userId = socketToUserId.get(socket.id);
  if (!userId) return;

  const roomId = userToRoom.get(userId);
  if (!roomId) {
    socketToUserId.delete(socket.id);
    return;
  }

  const room = rooms.get(roomId);
  if (!room) {
    socketToUserId.delete(socket.id);
    userToRoom.delete(userId);
    return;
  }

  const player = room.players.get(userId);
  if (!player) {
    socketToUserId.delete(socket.id);
    userToRoom.delete(userId);
    return;
  }

  // In idle or betting phase, fully remove the player
  if (!roundInProgress(room)) {
    leaveRoom(userId, socket.id);
  } else {
    // During spinning/results, just mark socket as stale — cleanup after results
    socketToUserId.delete(socket.id);
  }
}

// ── Shutdown ───────────────────────────────────────────────────────

/**
 * Hub shutdown. With durable tables on (`CASINO_DURABLE_TABLES=1`, see
 * {@link saveRouletteOnShutdown}) every table is written to the store and
 * nothing is refunded. Otherwise:
 *
 * Refund every bet on a table that is betting or spinning and
 * has not started settling, then kill every room. A spin whose payout
 * transaction is already in flight (`settling`) is left to it — that
 * transaction computed every seat's credit before awaiting, and shutdown waits
 * for it via `inFlight`. `results` is settled; `idle` holds no bets.
 *
 * Exactly-once: bets are read and zeroed synchronously, before anything
 * awaits, and `closing` makes every room not-live, so the spin timer, the
 * results sweep, leave/disconnect and the post-debit re-checks can no longer
 * reach them. A bet whose debit is still in flight is not on the seat yet; its
 * handler refunds it when it sees the room is gone, and the returned promise
 * waits for that too.
 */
export function refundRouletteOnShutdown(deadlineMs?: number): Promise<ShutdownRefundSummary> {
  if (durable) return saveRouletteOnShutdown(durable, deadlineMs ?? CASINO_SHUTDOWN_DEADLINE_MS);
  closing = true;
  const claims: StakeClaim[] = [];
  for (const room of rooms.values()) {
    clearTimers(room);
    const unsettled =
      room.phase === 'betting' || (room.phase === 'spinning' && !room.settling);
    for (const p of room.players.values()) {
      const amount = unsettled ? p.bets.reduce((sum, b) => sum + b.amount, 0) : 0;
      const count = p.bets.length;
      p.bets = [];
      p.totalBetThisRound = 0;
      if (amount > 0) {
        claims.push({
          game: 'roulette',
          roomId: room.roomId,
          userId: p.userId,
          amount,
          round: room.roundNumber,
          detail: `phase=${room.phase} bets=${count}`,
        });
      }
    }
  }
  rooms.clear();
  userToRoom.clear();
  socketToUserId.clear();
  return settleShutdownClaims('roulette', claims, inFlight, deadlineMs);
}

// ── Durable tables (CASINO_DURABLE_TABLES=1) ───────────────────────

/** A live room as it is stored: no timers, deadlines or socket ids. */
function serializeRoom(room: RouletteRoom): StoredRouletteTable {
  return {
    v: ROULETTE_TABLE_VERSION,
    roomId: room.roomId,
    name: room.name,
    ownerId: room.ownerId,
    ownerName: room.ownerName,
    maxPlayers: room.maxPlayers,
    privacy: room.privacy,
    joinCode: room.joinCode,
    phase: room.phase,
    settling: room.settling,
    roundNumber: room.roundNumber,
    players: Array.from(room.players.values(), (p) => ({
      seatIndex: p.seatIndex,
      userId: p.userId,
      userName: p.userName,
      avatarUrl: p.avatarUrl,
      bets: p.bets.map((b) => ({ type: b.type, numbers: [...b.numbers], amount: b.amount })),
      totalBetThisRound: p.totalBetThisRound,
      lastPayout: p.lastPayout,
      sessionStats: { ...p.sessionStats },
      pendingRemoval: p.pendingRemoval === true,
      stakeId: p.stakeId,
    })),
    lastResult: room.lastResult,
    history: [...room.history],
    savedAt: Date.now(),
  };
}

/** A stored table as a room: every seat disconnected, no timer armed. */
function roomFromStored(s: StoredRouletteTable): RouletteRoom {
  const players = new Map<string, PlayerSeat>();
  for (const p of s.players) {
    const { pendingRemoval, ...seat } = p;
    players.set(p.userId, { ...seat, socketId: '', ...(pendingRemoval ? { pendingRemoval: true } : {}) });
  }
  return {
    roomId: s.roomId,
    name: s.name,
    ownerId: s.ownerId,
    ownerName: s.ownerName,
    maxPlayers: s.maxPlayers,
    privacy: s.privacy,
    joinCode: s.joinCode,
    phase: s.phase,
    players,
    bettingTimer: null,
    resultsTimer: null,
    spinTimer: null,
    restartTimer: null,
    reconnectTimer: null,
    settling: s.settling,
    roundNumber: s.roundNumber,
    bettingDeadline: null,
    lastResult: s.lastResult,
    history: s.history,
  };
}

/**
 * Hub shutdown with durable tables: save instead of refund. Synchronously,
 * before anything awaits: mark the module closed, stop every timer, take a
 * snapshot of every table and empty the maps. The rest, and why a stake is
 * saved or refunded and never both, is `saveTablesOrRefund`
 * (`durable-shutdown.ts`); the refunds are keyed `rl-return:<stakeId>`.
 */
function saveRouletteOnShutdown(tables: TablePersistence, deadlineMs: number): Promise<ShutdownRefundSummary> {
  closing = true;
  const stored: StoredRouletteTable[] = [];
  for (const room of rooms.values()) {
    clearTimers(room);
    if (room.players.size > 0) stored.push(serializeRoom(room));
  }
  rooms.clear();
  userToRoom.clear();
  socketToUserId.clear();
  return saveTablesOrRefund('roulette', tables, stored, unsavedTableClaims, inFlight, deadlineMs);
}

/** Restart a restored table's clock for the phase it was stored in. See RESTORE_* above. */
function resumeRoom(room: RouletteRoom) {
  if (room.phase === 'betting') {
    // Bets already placed stay on their seats; the window reopens in full.
    room.bettingDeadline = Date.now() + BETTING_DURATION_MS;
    room.bettingTimer = setTimeout(() => endBettingPhase(room), BETTING_DURATION_MS);
  } else if (room.phase === 'spinning' && room.lastResult !== null) {
    // The wheel has landed (the number is stored): only the payout is pending.
    // If the settlement had started (`settling`) it runs again; it is computed
    // from the stored number and bets, and its credits are keyed per stake.
    scheduleSettlement(room, room.lastResult, RESTORE_SETTLE_DELAY_MS);
  } else {
    // idle, results: nothing at stake. Seats that had already left go now (the
    // results sweep that would have pruned them did not run). The settled
    // round's bets come off the seats here, as the next betting phase would
    // have taken them off: outside a round, a bet on a seat is one to give back.
    for (const [uid, p] of room.players) {
      if (p.pendingRemoval) room.players.delete(uid);
      p.bets = [];
      p.totalBetThisRound = 0;
      p.stakeId = null;
    }
    room.phase = 'idle';
    if (room.players.size === 0) {
      destroyRoom(room.roomId);
      return;
    }
    room.restartTimer = setTimeout(() => {
      room.restartTimer = null;
      startBettingPhase(room);
    }, 2000);
  }

  room.reconnectTimer = setTimeout(() => {
    room.reconnectTimer = null;
    if (!isLive(room)) return;
    // Mid-spin an absent seat is already handled: its bets are settled by user
    // id and the results sweep prunes it.
    if (roundInProgress(room)) return;
    for (const p of [...room.players.values()]) {
      const sock = p.socketId ? ioRef.sockets.sockets.get(p.socketId) : null;
      // The disconnect rule outside a spin: the seat leaves, and bets placed
      // during betting are refunded.
      if (sock?.connected) continue;
      // Not if the user has since sat down at another table: leaveRoom acts on
      // the table the user maps to, and joining that one already left this one.
      if (userToRoom.get(p.userId) === room.roomId) leaveRoom(p.userId, p.socketId);
    }
  }, RESTORE_RECONNECT_MS);
}

export interface RouletteRestoreSummary {
  restored: number;
  /** Entries that were not valid tables. Left in the store for a person to read. */
  unreadable: number;
  /** Stakes found already refunded by the previous process, and taken off their seats. */
  returnedStakes: number;
  /** Tables whose stored spin the ledger shows was already paid: not paid or played again. */
  settledRounds: number;
}

/**
 * Turn durable tables on for this process and bring back every table the
 * previous one saved. Called once at boot, before the hub listens, and only
 * when `openCasinoTableStore()` returned a store. Never throws.
 *
 * Every seat comes back disconnected; a player returns through the ordinary
 * `rl:join_room` reconnect branch. The betting window reopens at its full
 * length; a spin that had landed pays 10 s after the restore, by user id, so
 * a player who does not return is still paid.
 *
 * An entry that does not parse is logged at error level and LEFT in the
 * store: it may hold stakes, and deleting it would delete the only record.
 * If the ledger cannot be read to check what became of the stakes
 * (`stake-ledger.ts`), no table with a stake is restored on this boot (they
 * stay in the store for the next one).
 */
export async function restoreRouletteTables(io: Server, store: CasinoTableStore): Promise<RouletteRestoreSummary> {
  ioRef = io;
  durable = new TablePersistence(
    store,
    'roulette',
    (id) => {
      const room = rooms.get(id);
      return room ? serializeRoom(room) : null;
    },
    logger,
  );
  const summary: RouletteRestoreSummary = { restored: 0, unreadable: 0, returnedStakes: 0, settledRounds: 0 };

  let entries;
  try {
    entries = await store.loadAll('roulette');
  } catch (err) {
    logger.error({ event: 'rl_tables_load_failed', error: String(err) });
    return summary;
  }

  const tables: StoredRouletteTable[] = [];
  for (const entry of entries) {
    const table = parseStoredRouletteTable(entry.data);
    if (!table || table.roomId !== entry.id) {
      summary.unreadable++;
      logger.error({ event: 'rl_table_unreadable', roomId: entry.id });
      continue;
    }
    if (table.players.length === 0) {
      durable.remove(entry.id);
      continue;
    }
    tables.push(table);
  }

  let fates: Map<string, StakeFate> | null;
  try {
    fates = await readStakeFates(
      STAKE_KEYS,
      tables.flatMap((t) => t.players.flatMap((seat) => (seat.stakeId && seatStake(seat) > 0 ? [seat.stakeId] : []))),
    );
  } catch (err) {
    fates = null;
    logger.error({ event: 'rl_tables_ledger_check_failed', error: String(err) });
  }

  for (const table of tables) {
    const staked = table.players.some((seat) => seatStake(seat) > 0);
    if (staked && !fates) {
      logger.error({ event: 'rl_table_not_restored', roomId: table.roomId, reason: 'ledger unreadable' });
      continue;
    }
    // A payout row for any stake: the old process settled this spin after the
    // copy in the store was written. One transaction pays the whole table, so
    // the round is over for every seat.
    if (table.players.some((seat) => seat.stakeId && fates?.get(seat.stakeId) === 'paid')) {
      summary.settledRounds++;
      logger.warn({ event: 'rl_round_already_settled', roomId: table.roomId, round: table.roundNumber });
      table.phase = 'results';
    }
    for (const seat of table.players) {
      if (!seat.stakeId || fates?.get(seat.stakeId) !== 'returned') continue;
      // Refunded by the previous process: the seat stays, with nothing on it.
      summary.returnedStakes++;
      logger.warn({ event: 'rl_stake_already_returned', roomId: table.roomId, userId: seat.userId, amount: seatStake(seat) });
      seat.bets = [];
      seat.totalBetThisRound = 0;
      seat.stakeId = null;
    }

    const room = roomFromStored(table);
    rooms.set(room.roomId, room);
    for (const p of room.players.values()) {
      // As after a mid-spin disconnect: the user still maps to the room, so
      // joining another table leaves this one first.
      if (!p.pendingRemoval) userToRoom.set(p.userId, room.roomId);
    }
    resumeRoom(room);
    if (!rooms.has(room.roomId)) continue; // every seat had already left
    durable.markDirty(room.roomId);
    summary.restored++;
  }

  logger.info({ event: 'rl_tables_restored', ...summary });
  return summary;
}
