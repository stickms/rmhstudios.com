/**
 * Baccarat — Room-based multiplayer handler.
 *
 * Players create or join rooms. Each room runs its own table.
 * All players bet on the same player/banker hands.
 * Standard baccarat rules with side bets (pairs, dragon bonus).
 * 8-deck shoe, 5% banker commission.
 */

import type { Server, Socket } from 'socket.io';
import { getPrismaClient } from '../prisma-client';
import { checkRateLimit } from '../rate-limit';
import { logger } from '../logger';
import {
  type Card,
  createShoe,
  handValue,
  isNatural,
  playerDrawsThird,
  bankerDrawsThird,
  determineResult,
  calculateSideBets,
  PAYOUTS,
} from '../../../lib/baccarat/logic';
import { C2S, S2C } from '../../../lib/baccarat/events';
import type {
  TablePhase,
  BetType,
  PlayerBets,
  PlayerSeatClient,
  SessionStats,
  TableStateSnapshot,
  CardRevealPayload,
  RoundResultPayload,
} from '../../../lib/baccarat/types';
import type { BaccaratResult } from '../../../lib/baccarat/logic';

// ── Constants ──────────────────────────────────────────────────────

const DEFAULT_MAX_PLAYERS = 10;
const MAX_PLAYERS_CAP = 10;
const BETTING_DURATION_MS = 20_000;
const RESULTS_DISPLAY_MS = 5_000;
const CARD_REVEAL_DELAY_MS = 800;
const RESHUFFLE_THRESHOLD = 75;
const MIN_BET = 1;

// ── Types ──────────────────────────────────────────────────────────

interface PlayerSeat {
  seatIndex: number;
  socketId: string;
  userId: string;
  userName: string;
  avatarUrl: string | null;
  bets: PlayerBets;
  totalBetThisRound: number;
  lastPayout: number;
  sessionStats: SessionStats;
}

interface BaccaratRoom {
  roomId: string;
  name: string;
  ownerId: string;
  ownerName: string;
  maxPlayers: number;
  privacy: 'public' | 'unlisted';
  joinCode: string;
  phase: TablePhase;
  players: Map<string, PlayerSeat>;
  shoe: Card[];
  playerHand: Card[];
  bankerHand: Card[];
  // Cards revealed so far (for table state serialization)
  revealedPlayerCards: Card[];
  revealedBankerCards: Card[];
  bettingTimer: ReturnType<typeof setTimeout> | null;
  resultsTimer: ReturnType<typeof setTimeout> | null;
  roundNumber: number;
  bettingDeadline: number | null;
  history: BaccaratResult[];
}

// ── State ──────────────────────────────────────────────────────────

const rooms = new Map<string, BaccaratRoom>();
const socketToUserId = new Map<string, string>();
const userToRoom = new Map<string, string>();
let ioRef: Server;

function roomKey(roomId: string): string {
  return `bacc:${roomId}`;
}

function generateRoomId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  for (let i = 0; i < 5; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

// ── Shoe Management ────────────────────────────────────────────────

function drawCard(room: BaccaratRoom): Card {
  if (room.shoe.length < RESHUFFLE_THRESHOLD) {
    room.shoe = createShoe(8);
  }
  return room.shoe.pop()!;
}

// ── Helpers ────────────────────────────────────────────────────────

function emptyBets(): PlayerBets {
  return {
    player: 0,
    banker: 0,
    tie: 0,
    playerPair: 0,
    bankerPair: 0,
    playerDragon: 0,
    bankerDragon: 0,
  };
}

function totalBets(bets: PlayerBets): number {
  return bets.player + bets.banker + bets.tie +
    bets.playerPair + bets.bankerPair +
    bets.playerDragon + bets.bankerDragon;
}

function hasBets(bets: PlayerBets): boolean {
  return totalBets(bets) > 0;
}

// ── Table State Serialization ──────────────────────────────────────

function serializeTableState(room: BaccaratRoom): TableStateSnapshot {
  const players: PlayerSeatClient[] = Array.from(room.players.values()).map((p) => ({
    userId: p.userId,
    userName: p.userName,
    avatarUrl: p.avatarUrl,
    seatIndex: p.seatIndex,
    bets: p.bets,
    totalBetThisRound: p.totalBetThisRound,
    lastPayout: p.lastPayout,
    sessionStats: p.sessionStats,
  }));

  return {
    tableId: room.roomId,
    phase: room.phase,
    roundNumber: room.roundNumber,
    players,
    // Only send cards that have been revealed already
    playerHand: room.revealedPlayerCards.slice(),
    bankerHand: room.revealedBankerCards.slice(),
    bettingCountdown: room.bettingDeadline
      ? Math.max(0, Math.ceil((room.bettingDeadline - Date.now()) / 1000))
      : null,
    history: room.history,
  };
}

function broadcastTableState(room: BaccaratRoom) {
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

function getNextSeatIndex(room: BaccaratRoom): number {
  const taken = new Set(Array.from(room.players.values()).map((p) => p.seatIndex));
  for (let i = 0; i < room.maxPlayers; i++) {
    if (!taken.has(i)) return i;
  }
  return -1;
}

// ── Timer Helpers ──────────────────────────────────────────────────

function clearTimers(room: BaccaratRoom) {
  if (room.bettingTimer) { clearTimeout(room.bettingTimer); room.bettingTimer = null; }
  if (room.resultsTimer) { clearTimeout(room.resultsTimer); room.resultsTimer = null; }
}

// ── Async Delay ────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Round Lifecycle ────────────────────────────────────────────────

function startBettingPhase(room: BaccaratRoom) {
  if (room.players.size === 0) {
    room.phase = 'idle';
    broadcastTableState(room);
    return;
  }

  room.phase = 'betting';
  room.roundNumber++;
  room.playerHand = [];
  room.bankerHand = [];
  room.revealedPlayerCards = [];
  room.revealedBankerCards = [];

  for (const p of room.players.values()) {
    p.bets = emptyBets();
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

function checkAllBetsPlaced(room: BaccaratRoom) {
  if (room.phase !== 'betting') return;

  for (const p of room.players.values()) {
    if (!hasBets(p.bets)) return; // At least one player hasn't bet
  }

  // All players have placed at least one bet — end early
  if (room.bettingTimer) {
    clearTimeout(room.bettingTimer);
    room.bettingTimer = null;
  }
  endBettingPhase(room);
}

function endBettingPhase(room: BaccaratRoom) {
  if (room.phase !== 'betting') return;
  room.bettingTimer = null;
  room.bettingDeadline = null;

  // Check if anyone bet
  let anyBets = false;
  for (const p of room.players.values()) {
    if (hasBets(p.bets)) {
      anyBets = true;
    }
  }

  if (!anyBets) {
    room.phase = 'idle';
    broadcastTableState(room);
    if (room.players.size > 0) {
      setTimeout(() => startBettingPhase(room), 2000);
    }
    return;
  }

  dealCards(room);
}

// ── Card Dealing & Reveal ──────────────────────────────────────────

async function dealCards(room: BaccaratRoom) {
  room.phase = 'dealing';

  if (room.shoe.length < RESHUFFLE_THRESHOLD) {
    room.shoe = createShoe(8);
  }

  // Draw all initial cards (but don't reveal yet)
  const pCard1 = drawCard(room);
  const bCard1 = drawCard(room);
  const pCard2 = drawCard(room);
  const bCard2 = drawCard(room);

  room.playerHand = [pCard1, pCard2];
  room.bankerHand = [bCard1, bCard2];

  broadcastTableState(room);

  // Reveal cards one at a time with delays
  // Order: Player card 1, Banker card 1, Player card 2, Banker card 2
  await revealCard(room, 'player', pCard1, 0);
  await delay(CARD_REVEAL_DELAY_MS);

  await revealCard(room, 'banker', bCard1, 0);
  await delay(CARD_REVEAL_DELAY_MS);

  await revealCard(room, 'player', pCard2, 1);
  await delay(CARD_REVEAL_DELAY_MS);

  await revealCard(room, 'banker', bCard2, 1);
  await delay(CARD_REVEAL_DELAY_MS);

  // Check for naturals
  const playerNat = isNatural(room.playerHand);
  const bankerNat = isNatural(room.bankerHand);

  if (playerNat || bankerNat) {
    // No drawing phase — go straight to results
    resolveRound(room);
    return;
  }

  // Third card drawing phase
  room.phase = 'drawing';
  broadcastTableState(room);

  let playerThirdCard: Card | null = null;

  // Player third card
  if (playerDrawsThird(room.playerHand)) {
    playerThirdCard = drawCard(room);
    room.playerHand.push(playerThirdCard);
    await revealCard(room, 'player', playerThirdCard, 2);
    await delay(CARD_REVEAL_DELAY_MS);
  }

  // Banker third card
  if (bankerDrawsThird(room.bankerHand, playerThirdCard)) {
    const bankerThirdCard = drawCard(room);
    room.bankerHand.push(bankerThirdCard);
    await revealCard(room, 'banker', bankerThirdCard, 2);
    await delay(CARD_REVEAL_DELAY_MS);
  }

  resolveRound(room);
}

async function revealCard(room: BaccaratRoom, target: 'player' | 'banker', card: Card, cardIndex: number) {
  // Track revealed cards
  if (target === 'player') {
    room.revealedPlayerCards.push(card);
  } else {
    room.revealedBankerCards.push(card);
  }

  const payload: CardRevealPayload = { target, card, cardIndex };
  ioRef.to(roomKey(room.roomId)).emit(S2C.CARD_REVEAL, payload);
}

// ── Payouts ───────────────────────────────────────────────────────

async function resolveRound(room: BaccaratRoom) {
  const result = determineResult(room.playerHand, room.bankerHand);
  const sideBets = calculateSideBets(room.playerHand, room.bankerHand, result);

  const pVal = handValue(room.playerHand);
  const bVal = handValue(room.bankerHand);

  // Add to history (last 50)
  room.history.push(result);
  if (room.history.length > 50) {
    room.history.shift();
  }

  // Emit round result
  const roundResult: RoundResultPayload = {
    result,
    playerHand: room.playerHand,
    bankerHand: room.bankerHand,
    playerValue: pVal,
    bankerValue: bVal,
    isNatural: isNatural(room.playerHand) || isNatural(room.bankerHand),
    sideBets: {
      playerPair: sideBets.playerPair,
      bankerPair: sideBets.bankerPair,
      playerDragonBonus: sideBets.playerDragonBonus,
      bankerDragonBonus: sideBets.bankerDragonBonus,
    },
  };

  ioRef.to(roomKey(room.roomId)).emit(S2C.ROUND_RESULT, roundResult);

  // Calculate payouts per player
  const payoutUpdates: { userId: string; totalPayout: number }[] = [];

  for (const p of room.players.values()) {
    if (!hasBets(p.bets)) continue;

    let payout = 0;

    // Main bets
    if (result === 'player') {
      payout += p.bets.player * (1 + PAYOUTS.player); // bet + winnings
    } else if (result === 'banker') {
      payout += p.bets.player * 0; // lost
    } else {
      // Tie — main player/banker bets push (returned)
      payout += p.bets.player;
    }

    if (result === 'banker') {
      payout += p.bets.banker * (1 + PAYOUTS.banker); // bet + winnings (minus 5% commission)
    } else if (result === 'player') {
      payout += p.bets.banker * 0; // lost
    } else {
      // Tie — banker bets push
      payout += p.bets.banker;
    }

    // Tie bet
    if (result === 'tie') {
      payout += p.bets.tie * (1 + PAYOUTS.tie); // bet + 8x winnings
    }
    // Tie bet lost (no return) if not tie — already 0

    // Pair bets
    if (sideBets.playerPair) {
      payout += p.bets.playerPair * (1 + PAYOUTS.playerPair); // bet + 11x
    }
    if (sideBets.bankerPair) {
      payout += p.bets.bankerPair * (1 + PAYOUTS.bankerPair); // bet + 11x
    }

    // Dragon bonus bets
    if (sideBets.playerDragonBonus > 0) {
      payout += p.bets.playerDragon * (1 + sideBets.playerDragonBonus);
    }
    if (sideBets.bankerDragonBonus > 0) {
      payout += p.bets.bankerDragon * (1 + sideBets.bankerDragonBonus);
    }

    payout = Math.floor(payout);
    p.lastPayout = payout;

    // Update session stats
    p.sessionStats.totalBet += p.totalBetThisRound;
    p.sessionStats.totalWon += payout;
    p.sessionStats.roundsPlayed++;

    payoutUpdates.push({ userId: p.userId, totalPayout: payout });
  }

  // Deposit payouts via Prisma
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

    // Send balance updates to each player
    for (const [userId, balance] of balanceMap) {
      const player = room.players.get(userId);
      if (player) {
        const sock = ioRef.sockets.sockets.get(player.socketId);
        if (sock) sock.emit(S2C.BALANCE_UPDATE, { coins: balance });
      }
    }
  } catch (err) {
    logger.error({ event: 'bacc_payout_error', roomId: room.roomId, error: String(err) });
  }

  room.phase = 'results';
  broadcastTableState(room);

  room.resultsTimer = setTimeout(() => {
    // Prune disconnected players
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
    logger.info({ event: 'bacc_room_destroyed', roomId });
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

  const room: BaccaratRoom = {
    roomId,
    name,
    ownerId: userId,
    ownerName: userName,
    maxPlayers,
    privacy,
    joinCode,
    phase: 'idle',
    players: new Map(),
    shoe: createShoe(8),
    playerHand: [],
    bankerHand: [],
    revealedPlayerCards: [],
    revealedBankerCards: [],
    bettingTimer: null,
    resultsTimer: null,
    roundNumber: 0,
    bettingDeadline: null,
    history: [],
  };

  rooms.set(roomId, room);
  logger.info({ event: 'bacc_room_created', roomId, userId, name });

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

function joinRoom(room: BaccaratRoom, socket: Socket) {
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
    bets: emptyBets(),
    totalBetThisRound: 0,
    lastPayout: 0,
    sessionStats: { totalBet: 0, totalWon: 0, roundsPlayed: 0 },
  };

  room.players.set(userId, player);
  socketToUserId.set(socket.id, userId);
  userToRoom.set(userId, room.roomId);
  socket.join(roomKey(room.roomId));

  logger.info({ event: 'bacc_player_joined', roomId: room.roomId, userId, userName, seatIndex });

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

  logger.info({ event: 'bacc_player_left', roomId, userId, seatIndex });

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

  if (room.phase === 'betting') {
    checkAllBetsPlaced(room);
  }
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

const VALID_BET_TYPES: BetType[] = ['player', 'banker', 'tie', 'playerPair', 'bankerPair', 'playerDragon', 'bankerDragon'];

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
  const amount = typeof data?.amount === 'number' ? Math.floor(data.amount) : 0;

  if (!VALID_BET_TYPES.includes(betType as BetType)) {
    socket.emit(S2C.ERROR, { message: 'Invalid bet type.' });
    return;
  }

  if (amount < MIN_BET) {
    socket.emit(S2C.ERROR, { message: `Bet must be at least ${MIN_BET}.` });
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

    // Add to the specific bet type
    player.bets[betType as BetType] += amount;
    player.totalBetThisRound += amount;

    socket.emit(S2C.BALANCE_UPDATE, { coins: result });
    broadcastTableState(room);

    checkAllBetsPlaced(room);
  } catch (err) {
    if (err instanceof Error && err.message === 'INSUFFICIENT_COINS') {
      socket.emit(S2C.ERROR, { message: 'Not enough coins.' });
    } else {
      logger.error({ event: 'bacc_bet_error', userId, error: String(err) });
      socket.emit(S2C.ERROR, { message: 'Failed to place bet.' });
    }
  }
}

// ── Public API ─────────────────────────────────────────────────────

export function initializeBaccarat(io: Server): void {
  ioRef = io;
  logger.info({ event: 'bacc_handler_initialized' });
}

export function registerBaccaratHandlers(io: Server, socket: Socket): void {
  ioRef = io;

  socket.on(C2S.LIST_ROOMS, () => onListRooms(socket));
  socket.on(C2S.CREATE_ROOM, (payload) => onCreateRoom(socket, payload));
  socket.on(C2S.JOIN_ROOM, (payload) => onJoinRoom(socket, payload));
  socket.on(C2S.LEAVE_ROOM, () => onLeaveRoom(socket));
  socket.on(C2S.UPDATE_ROOM, (payload) => onUpdateRoom(socket, payload));

  socket.on(C2S.PLACE_BET, (payload) => onPlaceBet(socket, payload));
}

export function handleBaccaratDisconnect(_io: Server, socket: Socket): void {
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

  if (room.phase === 'idle' || room.phase === 'betting') {
    leaveRoom(userId, socket.id);
  } else {
    // Mid-round: keep the player seat so they get payouts, just remove socket mapping
    socketToUserId.delete(socket.id);
  }
}
