/**
 * Roulette — Room-based multiplayer handler.
 *
 * Players create or join rooms. Each room runs its own table.
 * European single-zero roulette (0-36).
 * Phases: idle → betting (25s) → spinning → results (5s) → betting.
 */

import type { Server, Socket } from 'socket.io';
import { getPrismaClient } from '../prisma-client';
import { checkRateLimit } from '../rate-limit';
import { logger } from '../logger';
import {
  type Bet,
  type BetType,
  spin,
  getPayoutMultiplier,
  calculatePayout,
  getNumberColor,
  getOutsideBetNumbers,
  DOUBLE_ZERO,
} from '../../../lib/roulette/logic';
import { C2S, S2C } from '../../../lib/roulette/events';
import type {
  TablePhase,
  TableStateSnapshot,
  PlayerSeatClient,
  SpinResultPayload,
  RoundResultPayload,
  SessionStats,
} from '../../../lib/roulette/types';

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
  'red', 'black', 'odd', 'even', 'low', 'high',
  'dozen1', 'dozen2', 'dozen3', 'column1', 'column2', 'column3',
]);

const ALL_BET_TYPES = new Set<BetType>([
  'straight', 'split', 'street', 'corner', 'line', 'topline',
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
      inProgress: r.phase !== 'idle' && r.phase !== 'betting',
    }));
  ioRef.emit(S2C.ROOM_LIST, { rooms: list });
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
  if (room.bettingTimer) { clearTimeout(room.bettingTimer); room.bettingTimer = null; }
  if (room.resultsTimer) { clearTimeout(room.resultsTimer); room.resultsTimer = null; }
  if (room.spinTimer) { clearTimeout(room.spinTimer); room.spinTimer = null; }
}

function startBettingPhase(room: RouletteRoom) {
  if (room.players.size === 0) {
    room.phase = 'idle';
    broadcastTableState(room);
    return;
  }

  room.phase = 'betting';
  room.roundNumber++;

  for (const p of room.players.values()) {
    p.bets = [];
    p.totalBetThisRound = 0;
    p.lastPayout = 0;
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
      setTimeout(() => startBettingPhase(room), 2000);
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
  room.spinTimer = setTimeout(() => {
    room.spinTimer = null;
    resolvePayouts(room, result);
  }, SPIN_ANIMATION_DELAY_MS);
}

async function resolvePayouts(room: RouletteRoom, result: number) {
  room.lastResult = result;
  room.history.unshift(result);
  if (room.history.length > MAX_HISTORY) {
    room.history = room.history.slice(0, MAX_HISTORY);
  }

  const payoutUpdates: { userId: string; totalPayout: number; netGain: number }[] = [];

  for (const p of room.players.values()) {
    if (p.bets.length === 0) continue;

    let totalPayout = 0;
    for (const bet of p.bets) {
      totalPayout += calculatePayout(bet, result);
    }

    const netGain = totalPayout - p.totalBetThisRound;
    p.lastPayout = totalPayout;

    // Update session stats
    p.sessionStats.totalBet += p.totalBetThisRound;
    p.sessionStats.totalWon += totalPayout;
    p.sessionStats.roundsPlayed++;

    payoutUpdates.push({ userId: p.userId, totalPayout, netGain });
  }

  try {
    const prisma = getPrismaClient();
    const balanceMap = new Map<string, number>();

    await prisma.$transaction(async (tx: any) => {
      for (const update of payoutUpdates) {
        if (update.totalPayout > 0) {
          const updated = await tx.userProfile.update({
            where: { userId: update.userId },
            data: { coins: { increment: update.totalPayout } },
            select: { coins: true },
          });
          balanceMap.set(update.userId, updated.coins);
        } else {
          const profile = await tx.userProfile.findUnique({
            where: { userId: update.userId },
            select: { coins: true },
          });
          balanceMap.set(update.userId, profile?.coins ?? 0);
        }
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

  room.phase = 'results';
  broadcastTableState(room);

  room.resultsTimer = setTimeout(() => {
    // Clean up disconnected players
    for (const [userId, p] of room.players) {
      const sock = ioRef.sockets.sockets.get(p.socketId);
      if (!sock || !sock.connected) {
        room.players.delete(userId);
        userToRoom.delete(userId);
      }
    }

    if (room.players.size === 0) {
      destroyRoom(room.roomId);
      return;
    }

    startBettingPhase(room);
  }, RESULTS_DISPLAY_MS);
}

// ── Room Management ───────────────────────────────────────────────

function destroyRoom(roomId: string) {
  const room = rooms.get(roomId);
  if (room) {
    clearTimers(room);
    rooms.delete(roomId);
    logger.info({ event: 'rl_room_destroyed', roomId });
    broadcastRoomList();
  }
}

function onListRooms(socket: Socket) {
  const list = Array.from(rooms.values())
    .filter((r) => r.privacy === 'public')
    .map((r) => ({
      roomId: r.roomId,
      name: r.name,
      ownerName: r.ownerName,
      playerCount: r.players.size,
      maxPlayers: r.maxPlayers,
      inProgress: r.phase !== 'idle' && r.phase !== 'betting',
    }));
  socket.emit(S2C.ROOM_LIST, { rooms: list });
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
  const name = typeof data?.name === 'string' ? data.name.trim().slice(0, 30) : `${userName}'s Room`;
  const maxPlayers = typeof data?.maxPlayers === 'number'
    ? Math.min(Math.max(Math.floor(data.maxPlayers), 2), MAX_PLAYERS_CAP)
    : DEFAULT_MAX_PLAYERS;
  const privacy = data?.privacy === 'unlisted' ? 'unlisted' as const : 'public' as const;

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
  };

  room.players.set(userId, player);
  socketToUserId.set(socket.id, userId);
  userToRoom.set(userId, room.roomId);
  socket.join(roomKey(room.roomId));

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

  try {
    const prisma = getPrismaClient();
    const result = await prisma.$transaction(async (tx: any) => {
      const profile = await tx.userProfile.findUnique({
        where: { userId },
        select: { coins: true },
      });

      if (!profile || profile.coins < amount) {
        throw new Error('INSUFFICIENT_COINS');
      }

      const updated = await tx.userProfile.update({
        where: { userId },
        data: { coins: { decrement: amount } },
        select: { coins: true },
      });

      return updated.coins;
    });

    player.bets.push({ type: betType, numbers, amount });
    player.totalBetThisRound += amount;

    socket.emit(S2C.BALANCE_UPDATE, { coins: result });
    broadcastTableState(room);
  } catch (err) {
    if (err instanceof Error && err.message === 'INSUFFICIENT_COINS') {
      socket.emit(S2C.ERROR, { message: 'Not enough coins.' });
    } else {
      logger.error({ event: 'rl_bet_error', userId, error: String(err) });
      socket.emit(S2C.ERROR, { message: 'Failed to place bet.' });
    }
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

  const refundAmount = player.totalBetThisRound;

  try {
    const prisma = getPrismaClient();
    const result = await prisma.$transaction(async (tx: any) => {
      const updated = await tx.userProfile.update({
        where: { userId },
        data: { coins: { increment: refundAmount } },
        select: { coins: true },
      });

      return updated.coins;
    });

    player.bets = [];
    player.totalBetThisRound = 0;

    socket.emit(S2C.BALANCE_UPDATE, { coins: result });
    broadcastTableState(room);
  } catch (err) {
    logger.error({ event: 'rl_clear_bets_error', userId, error: String(err) });
    socket.emit(S2C.ERROR, { message: 'Failed to clear bets.' });
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

  socket.on(C2S.PLACE_BET, (payload) => onPlaceBet(socket, payload));
  socket.on(C2S.CLEAR_BETS, () => onClearBets(socket));
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
  if (room.phase === 'idle' || room.phase === 'betting') {
    leaveRoom(userId, socket.id);
  } else {
    // During spinning/results, just mark socket as stale — cleanup after results
    socketToUserId.delete(socket.id);
  }
}
