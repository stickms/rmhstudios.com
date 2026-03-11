/**
 * Blackjack — Room-based multiplayer handler.
 *
 * Players create or join rooms. Each room runs its own table.
 * Standard blackjack rules: hit, stand, double down, insurance.
 * 3:2 blackjack payout. 6-deck shoe, dealer hits soft 17.
 */

import type { Server, Socket } from 'socket.io';
import { getPrismaClient } from '../prisma-client';
import { checkRateLimit } from '../rate-limit';
import { logger } from '../logger';
import { type Card, createShoe, handValue, isBlackjack, isBusted } from '../../../lib/blackjack/logic';

// ── Event Constants ────────────────────────────────────────────────

const C2S = {
  LIST_ROOMS:    'bj:list_rooms',
  CREATE_ROOM:   'bj:create_room',
  JOIN_ROOM:     'bj:join_room',
  LEAVE_ROOM:    'bj:leave_room',
  UPDATE_ROOM:   'bj:update_room',
  PLACE_BET:     'bj:place_bet',
  HIT:           'bj:hit',
  STAND:         'bj:stand',
  DOUBLE_DOWN:   'bj:double_down',
  TAKE_INSURANCE: 'bj:take_insurance',
  DECLINE_INSURANCE: 'bj:decline_insurance',
  SPLIT:          'bj:split',
} as const;

const S2C = {
  ROOM_LIST:       'bj:room_list',
  ROOM_CREATED:    'bj:room_created',
  ROOM_JOINED:     'bj:room_joined',
  ROOM_LEFT:       'bj:room_left',
  ROOM_UPDATED:    'bj:room_updated',
  TABLE_STATE:     'bj:table_state',
  PLAYER_JOINED:   'bj:player_joined',
  PLAYER_LEFT:     'bj:player_left',
  BETTING_PHASE:   'bj:betting_phase',
  DEAL:            'bj:deal',
  TURN:            'bj:turn',
  CARD_DEALT:      'bj:card_dealt',
  DEALER_REVEAL:   'bj:dealer_reveal',
  ROUND_RESULTS:   'bj:round_results',
  BALANCE_UPDATE:  'bj:balance_update',
  ERROR:           'bj:error',
  INSURANCE_OFFER: 'bj:insurance_offer',
  INSURANCE_RESOLVED: 'bj:insurance_resolved',
} as const;

// ── Types ──────────────────────────────────────────────────────────

type PlayerStatus = 'waiting' | 'betting' | 'playing' | 'standing' | 'busted' | 'blackjack' | 'done';
type HandResult = 'win' | 'lose' | 'push' | 'blackjack' | null;
type TablePhase = 'idle' | 'betting' | 'insurance' | 'dealing' | 'player_turns' | 'dealer_turn' | 'payout' | 'results';

interface SplitHand {
  hand: Card[];
  bet: number;
  status: PlayerStatus;
  result: HandResult;
  payout: number;
}

interface PlayerSeat {
  seatIndex: number;
  socketId: string;
  userId: string;
  userName: string;
  avatarUrl: string | null;
  hand: Card[];
  bet: number;
  status: PlayerStatus;
  result: HandResult;
  payout: number;
  insuranceBet: number;
  insuranceDecision: 'pending' | 'taken' | 'declined';
  insuranceResult: 'won' | 'lost' | null;
  // Split hands
  splitHands: SplitHand[];
  activeSplitIndex: number; // -1 = main hand, 0+ = split hand index
  hasSplit: boolean;
  // Session stats
  sessionStats: {
    totalBet: number;
    totalWon: number;
    handsPlayed: number;
    handsWon: number;
    blackjacks: number;
  };
}

interface BlackjackRoom {
  roomId: string;
  name: string;
  ownerId: string;
  ownerName: string;
  maxPlayers: number;
  privacy: 'public' | 'unlisted';
  joinCode: string;
  phase: TablePhase;
  players: Map<string, PlayerSeat>;
  dealerHand: Card[];
  dealerHoleRevealed: boolean;
  shoe: Card[];
  currentTurnUserId: string | null;
  turnOrder: string[];
  turnIndex: number;
  bettingTimer: ReturnType<typeof setTimeout> | null;
  resultsTimer: ReturnType<typeof setTimeout> | null;
  turnTimer: ReturnType<typeof setTimeout> | null;
  insuranceTimer: ReturnType<typeof setTimeout> | null;
  roundNumber: number;
  bettingDeadline: number | null;
}

// ── Constants ──────────────────────────────────────────────────────

const DEFAULT_MAX_PLAYERS = 6;
const MAX_PLAYERS_CAP = 6;
const BETTING_DURATION_MS = 15_000;
const TURN_TIMEOUT_MS = 30_000;
const RESULTS_DISPLAY_MS = 5_000;
const INSURANCE_TIMEOUT_MS = 10_000;
const MIN_BET = 1;
const RESHUFFLE_THRESHOLD = 75;

// ── State ──────────────────────────────────────────────────────────

const rooms = new Map<string, BlackjackRoom>();
const socketToUserId = new Map<string, string>();
const userToRoom = new Map<string, string>();
let ioRef: Server;

function roomKey(roomId: string): string {
  return `bj:${roomId}`;
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

function drawCard(room: BlackjackRoom): Card {
  if (room.shoe.length < RESHUFFLE_THRESHOLD) {
    room.shoe = createShoe(6);
  }
  return room.shoe.pop()!;
}

// ── Table State Serialization ──────────────────────────────────────

function serializeTableState(room: BlackjackRoom) {
  const players = Array.from(room.players.values()).map((p) => ({
    userId: p.userId,
    userName: p.userName,
    avatarUrl: p.avatarUrl,
    seatIndex: p.seatIndex,
    hand: p.hand,
    bet: p.bet,
    status: p.status,
    handValue: p.hand.length > 0 ? handValue(p.hand).value : null,
    result: p.result,
    payout: p.payout,
    insuranceBet: p.insuranceBet,
    insuranceResult: p.insuranceResult,
    sessionStats: p.sessionStats,
    hasSplit: p.hasSplit,
    activeSplitIndex: p.activeSplitIndex,
    splitHands: p.splitHands.map((sh) => ({
      hand: sh.hand,
      bet: sh.bet,
      status: sh.status,
      handValue: sh.hand.length > 0 ? handValue(sh.hand).value : null,
      result: sh.result,
      payout: sh.payout,
    })),
  }));

  let dealerHand = room.dealerHand;
  let dealerValue: number | null = null;
  if (!room.dealerHoleRevealed && dealerHand.length >= 2) {
    dealerHand = [dealerHand[0], { suit: 'S', rank: '2' } as Card];
    dealerValue = null;
  } else if (dealerHand.length > 0) {
    dealerValue = handValue(dealerHand).value;
  }

  return {
    tableId: room.roomId,
    phase: room.phase,
    roundNumber: room.roundNumber,
    players,
    dealerHand,
    dealerValue,
    currentTurnUserId: room.currentTurnUserId,
    bettingCountdown: room.bettingDeadline
      ? Math.max(0, Math.ceil((room.bettingDeadline - Date.now()) / 1000))
      : null,
    turnTimeout: room.currentTurnUserId ? Math.ceil(TURN_TIMEOUT_MS / 1000) : null,
  };
}

function broadcastTableState(room: BlackjackRoom) {
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

function getNextSeatIndex(room: BlackjackRoom): number {
  const taken = new Set(Array.from(room.players.values()).map((p) => p.seatIndex));
  for (let i = 0; i < room.maxPlayers; i++) {
    if (!taken.has(i)) return i;
  }
  return -1;
}

// ── Round Lifecycle ────────────────────────────────────────────────

function clearTimers(room: BlackjackRoom) {
  if (room.bettingTimer) { clearTimeout(room.bettingTimer); room.bettingTimer = null; }
  if (room.resultsTimer) { clearTimeout(room.resultsTimer); room.resultsTimer = null; }
  if (room.turnTimer) { clearTimeout(room.turnTimer); room.turnTimer = null; }
  if (room.insuranceTimer) { clearTimeout(room.insuranceTimer); room.insuranceTimer = null; }
}

function startBettingPhase(room: BlackjackRoom) {
  if (room.players.size === 0) {
    room.phase = 'idle';
    broadcastTableState(room);
    return;
  }

  room.phase = 'betting';
  room.roundNumber++;
  room.dealerHand = [];
  room.dealerHoleRevealed = false;
  room.currentTurnUserId = null;
  room.turnOrder = [];
  room.turnIndex = 0;

  for (const p of room.players.values()) {
    p.hand = [];
    p.bet = 0;
    p.status = 'waiting';
    p.result = null;
    p.payout = 0;
    p.insuranceBet = 0;
    p.insuranceDecision = 'pending';
    p.insuranceResult = null;
    p.splitHands = [];
    p.activeSplitIndex = -1;
    p.hasSplit = false;
  }

  room.bettingDeadline = Date.now() + BETTING_DURATION_MS;

  ioRef.to(roomKey(room.roomId)).emit(S2C.BETTING_PHASE, {
    countdown: Math.ceil(BETTING_DURATION_MS / 1000),
    roundNumber: room.roundNumber,
  });

  broadcastTableState(room);

  room.bettingTimer = setTimeout(() => endBettingPhase(room), BETTING_DURATION_MS);
}

function checkAllBetsPlaced(room: BlackjackRoom) {
  if (room.phase !== 'betting') return;

  for (const p of room.players.values()) {
    if (p.status !== 'betting') return;
  }

  // All players bet — end early
  if (room.bettingTimer) {
    clearTimeout(room.bettingTimer);
    room.bettingTimer = null;
  }
  endBettingPhase(room);
}

function endBettingPhase(room: BlackjackRoom) {
  if (room.phase !== 'betting') return;
  room.bettingTimer = null;
  room.bettingDeadline = null;

  const bettors: PlayerSeat[] = [];
  for (const p of room.players.values()) {
    if (p.status === 'betting' && p.bet > 0) {
      bettors.push(p);
    } else {
      p.status = 'waiting';
    }
  }

  if (bettors.length === 0) {
    room.phase = 'idle';
    broadcastTableState(room);
    if (room.players.size > 0) {
      setTimeout(() => startBettingPhase(room), 2000);
    }
    return;
  }

  dealInitialCards(room, bettors);
}

function dealInitialCards(room: BlackjackRoom, bettors: PlayerSeat[]) {
  room.phase = 'dealing';

  if (room.shoe.length < RESHUFFLE_THRESHOLD) {
    room.shoe = createShoe(6);
  }

  for (const p of bettors) {
    p.hand = [drawCard(room), drawCard(room)];
    if (isBlackjack(p.hand)) {
      p.status = 'blackjack';
    }
  }

  room.dealerHand = [drawCard(room), drawCard(room)];

  room.turnOrder = bettors
    .sort((a, b) => a.seatIndex - b.seatIndex)
    .filter((p) => p.status !== 'blackjack')
    .map((p) => p.userId);

  room.turnIndex = 0;

  broadcastTableState(room);

  // Dealer up card is Ace → offer insurance
  const dealerUpCard = room.dealerHand[0];
  if (dealerUpCard.rank === 'A') {
    offerInsurance(room, bettors);
    return;
  }

  // Dealer BJ with 10-value up card
  if (isBlackjack(room.dealerHand)) {
    room.dealerHoleRevealed = true;
    room.phase = 'dealer_turn';
    broadcastTableState(room);
    setTimeout(() => resolvePayouts(room), 1500);
    return;
  }

  proceedAfterInsurance(room);
}

// ── Insurance ──────────────────────────────────────────────────────

function offerInsurance(room: BlackjackRoom, bettors: PlayerSeat[]) {
  room.phase = 'insurance';

  const eligible = bettors.filter((p) => p.status !== 'blackjack');
  if (eligible.length === 0) {
    proceedAfterInsurance(room);
    return;
  }

  for (const p of eligible) {
    p.insuranceDecision = 'pending';
  }
  for (const p of bettors) {
    if (p.status === 'blackjack') {
      p.insuranceDecision = 'declined';
    }
  }

  ioRef.to(roomKey(room.roomId)).emit(S2C.INSURANCE_OFFER, {
    timeoutSeconds: Math.ceil(INSURANCE_TIMEOUT_MS / 1000),
  });

  broadcastTableState(room);

  room.insuranceTimer = setTimeout(() => {
    for (const p of room.players.values()) {
      if (p.insuranceDecision === 'pending') {
        p.insuranceDecision = 'declined';
      }
    }
    resolveInsurance(room);
  }, INSURANCE_TIMEOUT_MS);
}

function checkAllInsuranceDecided(room: BlackjackRoom) {
  if (room.phase !== 'insurance') return;

  for (const p of room.players.values()) {
    if (p.bet > 0 && p.insuranceDecision === 'pending') return;
  }

  if (room.insuranceTimer) {
    clearTimeout(room.insuranceTimer);
    room.insuranceTimer = null;
  }
  resolveInsurance(room);
}

function resolveInsurance(room: BlackjackRoom) {
  room.insuranceTimer = null;
  const dealerHasBJ = isBlackjack(room.dealerHand);

  for (const p of room.players.values()) {
    if (p.insuranceBet > 0) {
      p.insuranceResult = dealerHasBJ ? 'won' : 'lost';
    }
  }

  ioRef.to(roomKey(room.roomId)).emit(S2C.INSURANCE_RESOLVED, {
    dealerHasBlackjack: dealerHasBJ,
  });

  broadcastTableState(room);

  if (dealerHasBJ) {
    room.dealerHoleRevealed = true;
    room.phase = 'dealer_turn';
    broadcastTableState(room);
    setTimeout(() => resolvePayouts(room), 1500);
    return;
  }

  proceedAfterInsurance(room);
}

function proceedAfterInsurance(room: BlackjackRoom) {
  if (room.turnOrder.length === 0) {
    room.phase = 'dealer_turn';
    dealerTurn(room);
    return;
  }

  room.phase = 'player_turns';
  advanceToNextPlayer(room);
}

// ── Player Turns ──────────────────────────────────────────────────

function advanceToNextPlayer(room: BlackjackRoom) {
  while (room.turnIndex < room.turnOrder.length) {
    const userId = room.turnOrder[room.turnIndex];
    const player = room.players.get(userId);

    if (player && player.status !== 'busted' && player.status !== 'standing' && player.status !== 'blackjack') {
      player.status = 'playing';
      room.currentTurnUserId = userId;

      ioRef.to(roomKey(room.roomId)).emit(S2C.TURN, {
        userId,
        timeoutSeconds: Math.ceil(TURN_TIMEOUT_MS / 1000),
      });

      broadcastTableState(room);

      if (room.turnTimer) clearTimeout(room.turnTimer);
      room.turnTimer = setTimeout(() => {
        if (room.currentTurnUserId === userId) {
          onStand(room, userId);
        }
      }, TURN_TIMEOUT_MS);

      return;
    }

    room.turnIndex++;
  }

  room.currentTurnUserId = null;
  if (room.turnTimer) { clearTimeout(room.turnTimer); room.turnTimer = null; }
  room.phase = 'dealer_turn';
  dealerTurn(room);
}

function dealerTurn(room: BlackjackRoom) {
  room.dealerHoleRevealed = true;

  // Dealer hits soft 17, stands on hard 17+
  let hv = handValue(room.dealerHand);
  while (hv.value < 17 || (hv.value === 17 && hv.soft)) {
    room.dealerHand.push(drawCard(room));
    hv = handValue(room.dealerHand);
  }

  ioRef.to(roomKey(room.roomId)).emit(S2C.DEALER_REVEAL, {
    dealerHand: room.dealerHand,
    dealerValue: handValue(room.dealerHand).value,
  });

  broadcastTableState(room);
  setTimeout(() => resolvePayouts(room), 1500);
}

// ── Payouts ───────────────────────────────────────────────────────

async function resolvePayouts(room: BlackjackRoom) {
  room.phase = 'payout';

  const dealerVal = handValue(room.dealerHand).value;
  const dealerBJ = isBlackjack(room.dealerHand);

  const payoutUpdates: { userId: string; amount: number; result: HandResult; insurancePayout: number }[] = [];

  function resolveHand(hand: Card[], bet: number): { result: HandResult; payout: number } {
    const playerVal = handValue(hand).value;
    const playerBusted = playerVal > 21;
    const playerBJ = isBlackjack(hand);

    if (playerBusted) return { result: 'lose', payout: 0 };
    if (playerBJ && dealerBJ) return { result: 'push', payout: bet };
    if (playerBJ) return { result: 'blackjack', payout: Math.floor(bet * 2.5) };
    if (dealerBJ) return { result: 'lose', payout: 0 };
    if (dealerVal > 21) return { result: 'win', payout: bet * 2 };
    if (playerVal > dealerVal) return { result: 'win', payout: bet * 2 };
    if (playerVal === dealerVal) return { result: 'push', payout: bet };
    return { result: 'lose', payout: 0 };
  }

  for (const p of room.players.values()) {
    if (p.bet === 0 || p.status === 'waiting') continue;

    let totalPayout = 0;

    // Resolve main hand
    const mainResult = resolveHand(p.hand, p.bet);
    p.result = mainResult.result;
    totalPayout += mainResult.payout;

    // Resolve split hands
    for (const sh of p.splitHands) {
      const splitResult = resolveHand(sh.hand, sh.bet);
      sh.result = splitResult.result;
      sh.payout = splitResult.payout;
      totalPayout += splitResult.payout;
    }

    // Insurance payout: 2:1
    let insurancePayout = 0;
    if (p.insuranceBet > 0 && p.insuranceResult === 'won') {
      insurancePayout = p.insuranceBet * 3;
    }

    p.payout = totalPayout + insurancePayout;
    p.status = 'done';

    // Update session stats
    const totalBetForHand = p.bet + p.splitHands.reduce((s, sh) => s + sh.bet, 0) + p.insuranceBet;
    p.sessionStats.totalBet += totalBetForHand;
    p.sessionStats.totalWon += totalPayout + insurancePayout;
    p.sessionStats.handsPlayed++;
    if (mainResult.result === 'win' || mainResult.result === 'blackjack') p.sessionStats.handsWon++;
    if (mainResult.result === 'blackjack') p.sessionStats.blackjacks++;

    payoutUpdates.push({ userId: p.userId, amount: totalPayout + insurancePayout, result: p.result, insurancePayout });
  }

  try {
    const prisma = getPrismaClient();
    const balanceMap = new Map<string, number>();

    await prisma.$transaction(async (tx: any) => {
      for (const update of payoutUpdates) {
        if (update.amount > 0) {
          const updated = await tx.userProfile.update({
            where: { userId: update.userId },
            data: { coins: { increment: update.amount } },
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

    const results = payoutUpdates.map((u) => ({
      userId: u.userId,
      result: u.result,
      payout: room.players.get(u.userId)?.payout ?? 0,
      insurancePayout: u.insurancePayout,
      newBalance: balanceMap.get(u.userId) ?? 0,
    }));

    ioRef.to(roomKey(room.roomId)).emit(S2C.ROUND_RESULTS, { results, dealerValue: dealerVal });

    for (const [userId, balance] of balanceMap) {
      const player = room.players.get(userId);
      if (player) {
        const sock = ioRef.sockets.sockets.get(player.socketId);
        if (sock) sock.emit(S2C.BALANCE_UPDATE, { coins: balance });
      }
    }
  } catch (err) {
    logger.error({ event: 'bj_payout_error', roomId: room.roomId, error: String(err) });
  }

  room.phase = 'results';
  broadcastTableState(room);

  room.resultsTimer = setTimeout(() => {
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
    logger.info({ event: 'bj_room_destroyed', roomId });
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

  const room: BlackjackRoom = {
    roomId,
    name,
    ownerId: userId,
    ownerName: userName,
    maxPlayers,
    privacy,
    joinCode,
    phase: 'idle',
    players: new Map(),
    dealerHand: [],
    dealerHoleRevealed: false,
    shoe: createShoe(6),
    currentTurnUserId: null,
    turnOrder: [],
    turnIndex: 0,
    bettingTimer: null,
    resultsTimer: null,
    turnTimer: null,
    insuranceTimer: null,
    roundNumber: 0,
    bettingDeadline: null,
  };

  rooms.set(roomId, room);
  logger.info({ event: 'bj_room_created', roomId, userId, name });

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
  if (currentRoomId && currentRoomId !== roomId) {
    leaveRoom(userId, socket.id);
  }

  // Reconnect
  if (room.players.has(userId)) {
    const existing = room.players.get(userId)!;
    existing.socketId = socket.id;
    socketToUserId.set(socket.id, userId);
    userToRoom.set(userId, roomId);
    socket.join(roomKey(roomId));
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

function joinRoom(room: BlackjackRoom, socket: Socket) {
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
    hand: [],
    bet: 0,
    status: 'waiting',
    result: null,
    payout: 0,
    insuranceBet: 0,
    insuranceDecision: 'pending',
    insuranceResult: null,
    splitHands: [],
    activeSplitIndex: -1,
    hasSplit: false,
    sessionStats: { totalBet: 0, totalWon: 0, handsPlayed: 0, handsWon: 0, blackjacks: 0 },
  };

  room.players.set(userId, player);
  socketToUserId.set(socket.id, userId);
  userToRoom.set(userId, room.roomId);
  socket.join(roomKey(room.roomId));

  logger.info({ event: 'bj_player_joined', roomId: room.roomId, userId, userName, seatIndex });

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

  if (room.currentTurnUserId === userId) {
    onStand(room, userId);
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

  logger.info({ event: 'bj_player_left', roomId, userId, seatIndex });

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

  if (room.phase === 'insurance') {
    checkAllInsuranceDecided(room);
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

  if (player.status === 'betting') {
    socket.emit(S2C.ERROR, { message: 'You already placed a bet.' });
    return;
  }

  const amount = typeof (payload as any)?.amount === 'number'
    ? Math.floor((payload as any).amount)
    : 0;

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

    player.bet = amount;
    player.status = 'betting';

    socket.emit(S2C.BALANCE_UPDATE, { coins: result });
    broadcastTableState(room);

    checkAllBetsPlaced(room);
  } catch (err) {
    if (err instanceof Error && err.message === 'INSUFFICIENT_COINS') {
      socket.emit(S2C.ERROR, { message: 'Not enough coins.' });
    } else {
      logger.error({ event: 'bj_bet_error', userId, error: String(err) });
      socket.emit(S2C.ERROR, { message: 'Failed to place bet.' });
    }
  }
}

async function onTakeInsurance(socket: Socket) {
  const userId = socketToUserId.get(socket.id);
  if (!userId) return;

  const roomId = userToRoom.get(userId);
  if (!roomId) return;

  const room = rooms.get(roomId);
  if (!room || room.phase !== 'insurance') return;

  const player = room.players.get(userId);
  if (!player || player.insuranceDecision !== 'pending') return;

  const insuranceAmount = Math.floor(player.bet / 2);

  try {
    const prisma = getPrismaClient();
    const result = await prisma.$transaction(async (tx: any) => {
      const profile = await tx.userProfile.findUnique({
        where: { userId },
        select: { coins: true },
      });

      if (!profile || profile.coins < insuranceAmount) {
        throw new Error('INSUFFICIENT_COINS');
      }

      const updated = await tx.userProfile.update({
        where: { userId },
        data: { coins: { decrement: insuranceAmount } },
        select: { coins: true },
      });

      return updated.coins;
    });

    player.insuranceBet = insuranceAmount;
    player.insuranceDecision = 'taken';

    socket.emit(S2C.BALANCE_UPDATE, { coins: result });
    broadcastTableState(room);

    checkAllInsuranceDecided(room);
  } catch (err) {
    if (err instanceof Error && err.message === 'INSUFFICIENT_COINS') {
      socket.emit(S2C.ERROR, { message: 'Not enough coins for insurance.' });
      player.insuranceDecision = 'declined';
      checkAllInsuranceDecided(room);
    } else {
      logger.error({ event: 'bj_insurance_error', userId, error: String(err) });
    }
  }
}

function onDeclineInsurance(socket: Socket) {
  const userId = socketToUserId.get(socket.id);
  if (!userId) return;

  const roomId = userToRoom.get(userId);
  if (!roomId) return;

  const room = rooms.get(roomId);
  if (!room || room.phase !== 'insurance') return;

  const player = room.players.get(userId);
  if (!player || player.insuranceDecision !== 'pending') return;

  player.insuranceDecision = 'declined';
  broadcastTableState(room);
  checkAllInsuranceDecided(room);
}

/** Get the active hand for a player (main hand or split hand). */
function getActiveHand(player: PlayerSeat): { hand: Card[]; setHand: (h: Card[]) => void; bet: number } {
  if (player.hasSplit && player.activeSplitIndex >= 0 && player.activeSplitIndex < player.splitHands.length) {
    const sh = player.splitHands[player.activeSplitIndex];
    return {
      hand: sh.hand,
      setHand: (h) => { sh.hand = h; },
      bet: sh.bet,
    };
  }
  return {
    hand: player.hand,
    setHand: (h) => { player.hand = h; },
    bet: player.bet,
  };
}

/** Advance to next split hand or next player. */
function advanceSplitOrNext(room: BlackjackRoom, player: PlayerSeat) {
  if (player.hasSplit && player.activeSplitIndex < player.splitHands.length - 1) {
    // Move to next split hand
    player.activeSplitIndex++;
    const nextSplit = player.splitHands[player.activeSplitIndex];
    // Deal second card to this split hand
    nextSplit.hand.push(drawCard(room));
    nextSplit.status = 'playing';
    broadcastTableState(room);
    return;
  }

  // All hands done for this player — determine overall status
  if (player.hasSplit) {
    // Overall status: if all busted → busted, if all standing → standing, else standing
    const allBusted = player.splitHands.every((sh) => sh.status === 'busted') &&
                      (player.hand.length === 0 || player.status === 'busted');
    player.status = allBusted ? 'busted' : 'standing';
  }

  room.turnIndex++;
  advanceToNextPlayer(room);
}

function onHit(room: BlackjackRoom, userId: string) {
  if (room.phase !== 'player_turns') return;
  if (room.currentTurnUserId !== userId) return;

  const player = room.players.get(userId);
  if (!player || player.status !== 'playing') return;

  const active = getActiveHand(player);
  const card = drawCard(room);
  active.hand.push(card);

  ioRef.to(roomKey(room.roomId)).emit(S2C.CARD_DEALT, {
    target: 'player',
    userId,
    card,
    handValue: handValue(active.hand).value,
    splitIndex: player.hasSplit ? player.activeSplitIndex : undefined,
  });

  if (isBusted(active.hand)) {
    if (player.hasSplit && player.activeSplitIndex >= 0) {
      player.splitHands[player.activeSplitIndex].status = 'busted';
    } else {
      player.status = 'busted';
    }
    advanceSplitOrNext(room, player);
  } else if (handValue(active.hand).value === 21) {
    if (player.hasSplit && player.activeSplitIndex >= 0) {
      player.splitHands[player.activeSplitIndex].status = 'standing';
    } else {
      player.status = 'standing';
    }
    advanceSplitOrNext(room, player);
  } else {
    broadcastTableState(room);
  }
}

function onStand(room: BlackjackRoom, userId: string) {
  if (room.phase !== 'player_turns') return;
  if (room.currentTurnUserId !== userId) return;

  const player = room.players.get(userId);
  if (!player || player.status !== 'playing') return;

  if (player.hasSplit && player.activeSplitIndex >= 0) {
    player.splitHands[player.activeSplitIndex].status = 'standing';
  } else {
    player.status = 'standing';
  }
  advanceSplitOrNext(room, player);
}

async function onSplit(room: BlackjackRoom, socket: Socket, userId: string) {
  if (room.phase !== 'player_turns') return;
  if (room.currentTurnUserId !== userId) return;

  const player = room.players.get(userId);
  if (!player || player.status !== 'playing') return;

  // Can only split on 2 cards of same rank
  if (player.hand.length !== 2) {
    socket.emit(S2C.ERROR, { message: 'Can only split with 2 cards.' });
    return;
  }

  // Check if cards have same rank (10/J/Q/K all count as 10-value for splitting)
  const rankVal = (r: string) => (['10', 'J', 'Q', 'K'].includes(r) ? 10 : r);
  if (rankVal(player.hand[0].rank) !== rankVal(player.hand[1].rank)) {
    socket.emit(S2C.ERROR, { message: 'Can only split matching cards.' });
    return;
  }

  if (player.hasSplit) {
    socket.emit(S2C.ERROR, { message: 'Already split.' });
    return;
  }

  const splitBet = player.bet;

  // Deduct coins for the split bet
  try {
    const prisma = getPrismaClient();
    const result = await prisma.$transaction(async (tx: any) => {
      const profile = await tx.userProfile.findUnique({
        where: { userId },
        select: { coins: true },
      });

      if (!profile || profile.coins < splitBet) {
        throw new Error('INSUFFICIENT_COINS');
      }

      const updated = await tx.userProfile.update({
        where: { userId },
        data: { coins: { decrement: splitBet } },
        select: { coins: true },
      });

      return updated.coins;
    });

    socket.emit(S2C.BALANCE_UPDATE, { coins: result });

    // Split the hand: first card stays in main hand, second goes to split
    const secondCard = player.hand.pop()!;
    player.hasSplit = true;
    player.activeSplitIndex = -1; // playing main hand first

    // Create split hand with the second card
    player.splitHands = [{
      hand: [secondCard],
      bet: splitBet,
      status: 'waiting',
      result: null,
      payout: 0,
    }];

    // Deal a second card to the main hand
    player.hand.push(drawCard(room));

    broadcastTableState(room);
  } catch (err) {
    if (err instanceof Error && err.message === 'INSUFFICIENT_COINS') {
      socket.emit(S2C.ERROR, { message: 'Not enough coins to split.' });
    } else {
      logger.error({ event: 'bj_split_error', userId, error: String(err) });
      socket.emit(S2C.ERROR, { message: 'Failed to split.' });
    }
  }
}

async function onDoubleDown(room: BlackjackRoom, socket: Socket, userId: string) {
  if (room.phase !== 'player_turns') return;
  if (room.currentTurnUserId !== userId) return;

  const player = room.players.get(userId);
  if (!player || player.status !== 'playing') return;

  if (player.hand.length !== 2) {
    socket.emit(S2C.ERROR, { message: 'Can only double down on initial hand.' });
    return;
  }

  const additionalBet = player.bet;

  try {
    const prisma = getPrismaClient();
    const result = await prisma.$transaction(async (tx: any) => {
      const profile = await tx.userProfile.findUnique({
        where: { userId },
        select: { coins: true },
      });

      if (!profile || profile.coins < additionalBet) {
        throw new Error('INSUFFICIENT_COINS');
      }

      const updated = await tx.userProfile.update({
        where: { userId },
        data: { coins: { decrement: additionalBet } },
        select: { coins: true },
      });

      return updated.coins;
    });

    player.bet *= 2;
    socket.emit(S2C.BALANCE_UPDATE, { coins: result });

    const card = drawCard(room);
    player.hand.push(card);

    ioRef.to(roomKey(room.roomId)).emit(S2C.CARD_DEALT, {
      target: 'player',
      userId,
      card,
      handValue: handValue(player.hand).value,
    });

    if (isBusted(player.hand)) {
      player.status = 'busted';
    } else {
      player.status = 'standing';
    }

    room.turnIndex++;
    advanceToNextPlayer(room);
  } catch (err) {
    if (err instanceof Error && err.message === 'INSUFFICIENT_COINS') {
      socket.emit(S2C.ERROR, { message: 'Not enough coins to double down.' });
    } else {
      logger.error({ event: 'bj_double_error', userId, error: String(err) });
      socket.emit(S2C.ERROR, { message: 'Failed to double down.' });
    }
  }
}

// ── Public API ─────────────────────────────────────────────────────

export function initializeBlackjackPublicTable(io: Server): void {
  ioRef = io;
  logger.info({ event: 'bj_handler_initialized' });
}

export function registerBlackjackHandlers(io: Server, socket: Socket): void {
  ioRef = io;

  socket.on(C2S.LIST_ROOMS, () => onListRooms(socket));
  socket.on(C2S.CREATE_ROOM, (payload) => onCreateRoom(socket, payload));
  socket.on(C2S.JOIN_ROOM, (payload) => onJoinRoom(socket, payload));
  socket.on(C2S.LEAVE_ROOM, () => onLeaveRoom(socket));
  socket.on(C2S.UPDATE_ROOM, (payload) => onUpdateRoom(socket, payload));

  socket.on(C2S.PLACE_BET, (payload) => onPlaceBet(socket, payload));
  socket.on(C2S.TAKE_INSURANCE, () => onTakeInsurance(socket));
  socket.on(C2S.DECLINE_INSURANCE, () => onDeclineInsurance(socket));

  socket.on(C2S.HIT, () => {
    const userId = socketToUserId.get(socket.id);
    if (!userId) return;
    if (!checkRateLimit(socket.id, C2S.HIT)) return;
    const roomId = userToRoom.get(userId);
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room) return;
    onHit(room, userId);
  });

  socket.on(C2S.STAND, () => {
    const userId = socketToUserId.get(socket.id);
    if (!userId) return;
    if (!checkRateLimit(socket.id, C2S.STAND)) return;
    const roomId = userToRoom.get(userId);
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room) return;
    onStand(room, userId);
  });

  socket.on(C2S.DOUBLE_DOWN, () => {
    const userId = socketToUserId.get(socket.id);
    if (!userId) return;
    if (!checkRateLimit(socket.id, C2S.DOUBLE_DOWN)) return;
    const roomId = userToRoom.get(userId);
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room) return;
    onDoubleDown(room, socket, userId);
  });

  socket.on(C2S.SPLIT, () => {
    const userId = socketToUserId.get(socket.id);
    if (!userId) return;
    if (!checkRateLimit(socket.id, C2S.SPLIT)) return;
    const roomId = userToRoom.get(userId);
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room) return;
    onSplit(room, socket, userId);
  });
}

export function handleBlackjackDisconnect(_io: Server, socket: Socket): void {
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

  if (room.phase === 'player_turns' && room.currentTurnUserId === userId) {
    onStand(room, userId);
  }

  if (room.phase === 'idle' || room.phase === 'betting') {
    leaveRoom(userId, socket.id);
  } else {
    socketToUserId.delete(socket.id);
  }
}
