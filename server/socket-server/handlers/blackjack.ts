/**
 * Blackjack — Handler for the unified socket server.
 *
 * Always-on public table with up to 6 players.
 * Standard blackjack rules: hit, stand, double down.
 * 6-deck shoe, dealer stands on soft 17.
 * Coins deducted on bet, credited on round resolution.
 */

import type { Server, Socket } from 'socket.io';
import { getPrismaClient } from '../prisma-client';
import { checkRateLimit } from '../rate-limit';
import { logger } from '../logger';
import { type Card, createShoe, handValue, isBlackjack, isBusted } from '../../../lib/blackjack/logic';

// ── Event Constants ────────────────────────────────────────────────

const C2S = {
  JOIN_TABLE:   'bj:join_table',
  LEAVE_TABLE:  'bj:leave_table',
  PLACE_BET:    'bj:place_bet',
  HIT:          'bj:hit',
  STAND:        'bj:stand',
  DOUBLE_DOWN:  'bj:double_down',
} as const;

const S2C = {
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
} as const;

// ── Types ──────────────────────────────────────────────────────────

type PlayerStatus = 'waiting' | 'betting' | 'playing' | 'standing' | 'busted' | 'blackjack' | 'done';
type HandResult = 'win' | 'lose' | 'push' | 'blackjack' | null;
type TablePhase = 'idle' | 'betting' | 'dealing' | 'player_turns' | 'dealer_turn' | 'payout' | 'results';

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
}

interface BlackjackTable {
  phase: TablePhase;
  players: Map<string, PlayerSeat>; // keyed by userId
  dealerHand: Card[];
  dealerHoleRevealed: boolean;
  shoe: Card[];
  currentTurnUserId: string | null;
  turnOrder: string[]; // userId array in seat order
  turnIndex: number;
  bettingTimer: ReturnType<typeof setTimeout> | null;
  resultsTimer: ReturnType<typeof setTimeout> | null;
  turnTimer: ReturnType<typeof setTimeout> | null;
  roundNumber: number;
  bettingDeadline: number | null; // timestamp
}

// ── Constants ──────────────────────────────────────────────────────

const MAX_PLAYERS = 6;
const BETTING_DURATION_MS = 15_000;
const TURN_TIMEOUT_MS = 30_000;
const RESULTS_DISPLAY_MS = 5_000;
const MIN_BET = 1;
const MAX_BET = 100;
const RESHUFFLE_THRESHOLD = 75;
const ROOM_KEY = 'bj:PUBLIC';

// ── State ──────────────────────────────────────────────────────────

let table: BlackjackTable | null = null;
const socketToUserId = new Map<string, string>();
let ioRef: Server;

// ── Shoe Management ────────────────────────────────────────────────

function drawCard(): Card {
  if (!table) throw new Error('No table');
  if (table.shoe.length < RESHUFFLE_THRESHOLD) {
    table.shoe = createShoe(6);
  }
  return table.shoe.pop()!;
}

// ── Table State Serialization ──────────────────────────────────────

function serializeTableState(forUserId?: string) {
  if (!table) return null;

  const players = Array.from(table.players.values()).map((p) => ({
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
  }));

  // Hide dealer's hole card if not revealed
  let dealerHand = table.dealerHand;
  let dealerValue: number | null = null;
  if (!table.dealerHoleRevealed && dealerHand.length >= 2) {
    dealerHand = [dealerHand[0], { suit: 'S', rank: '2' } as Card]; // placeholder for hidden card
    dealerValue = null;
  } else if (dealerHand.length > 0) {
    dealerValue = handValue(dealerHand).value;
  }

  return {
    tableId: 'PUBLIC',
    phase: table.phase,
    roundNumber: table.roundNumber,
    players,
    dealerHand,
    dealerValue,
    currentTurnUserId: table.currentTurnUserId,
    bettingCountdown: table.bettingDeadline
      ? Math.max(0, Math.ceil((table.bettingDeadline - Date.now()) / 1000))
      : null,
    turnTimeout: table.currentTurnUserId ? Math.ceil(TURN_TIMEOUT_MS / 1000) : null,
  };
}

function broadcastTableState() {
  if (!table) return;
  ioRef.to(ROOM_KEY).emit(S2C.TABLE_STATE, serializeTableState());
}

// ── Seat Assignment ────────────────────────────────────────────────

function getNextSeatIndex(): number {
  if (!table) return 0;
  const taken = new Set(Array.from(table.players.values()).map((p) => p.seatIndex));
  for (let i = 0; i < MAX_PLAYERS; i++) {
    if (!taken.has(i)) return i;
  }
  return -1;
}

// ── Round Lifecycle ────────────────────────────────────────────────

function clearTimers() {
  if (!table) return;
  if (table.bettingTimer) { clearTimeout(table.bettingTimer); table.bettingTimer = null; }
  if (table.resultsTimer) { clearTimeout(table.resultsTimer); table.resultsTimer = null; }
  if (table.turnTimer) { clearTimeout(table.turnTimer); table.turnTimer = null; }
}

function startBettingPhase() {
  if (!table) return;
  if (table.players.size === 0) {
    table.phase = 'idle';
    broadcastTableState();
    return;
  }

  table.phase = 'betting';
  table.roundNumber++;
  table.dealerHand = [];
  table.dealerHoleRevealed = false;
  table.currentTurnUserId = null;
  table.turnOrder = [];
  table.turnIndex = 0;

  // Reset all player states for new round
  for (const p of table.players.values()) {
    p.hand = [];
    p.bet = 0;
    p.status = 'waiting';
    p.result = null;
    p.payout = 0;
  }

  table.bettingDeadline = Date.now() + BETTING_DURATION_MS;

  ioRef.to(ROOM_KEY).emit(S2C.BETTING_PHASE, {
    countdown: Math.ceil(BETTING_DURATION_MS / 1000),
    roundNumber: table.roundNumber,
  });

  broadcastTableState();

  table.bettingTimer = setTimeout(() => endBettingPhase(), BETTING_DURATION_MS);
}

function endBettingPhase() {
  if (!table || table.phase !== 'betting') return;
  table.bettingTimer = null;
  table.bettingDeadline = null;

  // Collect players who placed bets
  const bettors: PlayerSeat[] = [];
  for (const p of table.players.values()) {
    if (p.status === 'betting' && p.bet > 0) {
      bettors.push(p);
    } else {
      p.status = 'waiting'; // didn't bet, skip this round
    }
  }

  if (bettors.length === 0) {
    // Nobody bet — go back to idle, then try again shortly
    table.phase = 'idle';
    broadcastTableState();
    // Auto-restart if players are still seated
    if (table.players.size > 0) {
      setTimeout(() => startBettingPhase(), 2000);
    }
    return;
  }

  dealInitialCards(bettors);
}

function dealInitialCards(bettors: PlayerSeat[]) {
  if (!table) return;
  table.phase = 'dealing';

  // Reshuffle if needed
  if (table.shoe.length < RESHUFFLE_THRESHOLD) {
    table.shoe = createShoe(6);
  }

  // Deal 2 cards to each bettor and dealer
  for (const p of bettors) {
    p.hand = [drawCard(), drawCard()];
    if (isBlackjack(p.hand)) {
      p.status = 'blackjack';
    }
  }

  table.dealerHand = [drawCard(), drawCard()];

  // Build turn order: seat order, exclude blackjacks
  table.turnOrder = bettors
    .sort((a, b) => a.seatIndex - b.seatIndex)
    .filter((p) => p.status !== 'blackjack')
    .map((p) => p.userId);

  table.turnIndex = 0;

  // Broadcast the deal
  broadcastTableState();

  // Check if dealer has blackjack
  if (isBlackjack(table.dealerHand)) {
    // Dealer BJ — skip player turns, go straight to payout
    table.dealerHoleRevealed = true;
    table.phase = 'dealer_turn';
    broadcastTableState();
    setTimeout(() => resolvePayouts(), 1500);
    return;
  }

  // If all players have blackjack, skip to dealer
  if (table.turnOrder.length === 0) {
    table.phase = 'dealer_turn';
    dealerTurn();
    return;
  }

  // Start player turns
  table.phase = 'player_turns';
  advanceToNextPlayer();
}

function advanceToNextPlayer() {
  if (!table) return;

  // Find next player who needs to act
  while (table.turnIndex < table.turnOrder.length) {
    const userId = table.turnOrder[table.turnIndex];
    const player = table.players.get(userId);

    if (player && player.status !== 'busted' && player.status !== 'standing' && player.status !== 'blackjack') {
      player.status = 'playing';
      table.currentTurnUserId = userId;

      ioRef.to(ROOM_KEY).emit(S2C.TURN, {
        userId,
        timeoutSeconds: Math.ceil(TURN_TIMEOUT_MS / 1000),
      });

      broadcastTableState();

      // Set turn timeout — auto-stand
      if (table.turnTimer) clearTimeout(table.turnTimer);
      table.turnTimer = setTimeout(() => {
        if (table && table.currentTurnUserId === userId) {
          onStand(userId);
        }
      }, TURN_TIMEOUT_MS);

      return;
    }

    table.turnIndex++;
  }

  // All players done — dealer's turn
  table.currentTurnUserId = null;
  if (table.turnTimer) { clearTimeout(table.turnTimer); table.turnTimer = null; }
  table.phase = 'dealer_turn';
  dealerTurn();
}

function dealerTurn() {
  if (!table) return;
  table.dealerHoleRevealed = true;

  // Dealer draws to 17+ (stands on soft 17)
  while (handValue(table.dealerHand).value < 17) {
    table.dealerHand.push(drawCard());
  }

  ioRef.to(ROOM_KEY).emit(S2C.DEALER_REVEAL, {
    dealerHand: table.dealerHand,
    dealerValue: handValue(table.dealerHand).value,
  });

  broadcastTableState();

  // Short delay before payouts
  setTimeout(() => resolvePayouts(), 1500);
}

async function resolvePayouts() {
  if (!table) return;
  table.phase = 'payout';

  const dealerVal = handValue(table.dealerHand).value;
  const dealerBusted = dealerVal > 21;
  const dealerBJ = isBlackjack(table.dealerHand);

  const payoutUpdates: { userId: string; amount: number; result: HandResult }[] = [];

  for (const p of table.players.values()) {
    if (p.bet === 0 || p.status === 'waiting') continue;

    const playerVal = handValue(p.hand).value;
    const playerBusted = playerVal > 21;
    const playerBJ = isBlackjack(p.hand);

    let result: HandResult;
    let payout = 0;

    if (playerBusted) {
      result = 'lose';
      payout = 0;
    } else if (playerBJ && dealerBJ) {
      result = 'push';
      payout = p.bet; // return bet
    } else if (playerBJ) {
      result = 'blackjack';
      payout = Math.floor(p.bet * 2.5); // original + 1.5x
    } else if (dealerBJ) {
      result = 'lose';
      payout = 0;
    } else if (dealerBusted) {
      result = 'win';
      payout = p.bet * 2;
    } else if (playerVal > dealerVal) {
      result = 'win';
      payout = p.bet * 2;
    } else if (playerVal === dealerVal) {
      result = 'push';
      payout = p.bet;
    } else {
      result = 'lose';
      payout = 0;
    }

    p.result = result;
    p.payout = payout;
    p.status = 'done';

    if (payout > 0) {
      payoutUpdates.push({ userId: p.userId, amount: payout, result });
    } else {
      payoutUpdates.push({ userId: p.userId, amount: 0, result });
    }
  }

  // Execute payouts in a single transaction
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
          // Just read balance for the result
          const profile = await tx.userProfile.findUnique({
            where: { userId: update.userId },
            select: { coins: true },
          });
          balanceMap.set(update.userId, profile?.coins ?? 0);
        }
      }
    });

    // Emit results
    const results = payoutUpdates.map((u) => ({
      userId: u.userId,
      result: u.result,
      payout: table!.players.get(u.userId)?.payout ?? 0,
      newBalance: balanceMap.get(u.userId) ?? 0,
    }));

    ioRef.to(ROOM_KEY).emit(S2C.ROUND_RESULTS, {
      results,
      dealerValue: dealerVal,
    });

    // Send individual balance updates
    for (const [userId, balance] of balanceMap) {
      const player = table.players.get(userId);
      if (player) {
        const sock = ioRef.sockets.sockets.get(player.socketId);
        if (sock) sock.emit(S2C.BALANCE_UPDATE, { coins: balance });
      }
    }
  } catch (err) {
    logger.error({ event: 'bj_payout_error', error: String(err) });
  }

  table.phase = 'results';
  broadcastTableState();

  // Next round after results display
  table.resultsTimer = setTimeout(() => {
    if (!table) return;

    // Remove disconnected players
    for (const [userId, p] of table.players) {
      const sock = ioRef.sockets.sockets.get(p.socketId);
      if (!sock || !sock.connected) {
        table.players.delete(userId);
      }
    }

    startBettingPhase();
  }, RESULTS_DISPLAY_MS);
}

// ── Player Action Handlers ─────────────────────────────────────────

function onJoinTable(socket: Socket) {
  if (!table) return;

  const userId = socket.data.userId as string | undefined;
  const userName = (socket.data.userName as string) || 'Player';
  const avatarUrl = (socket.data.avatarUrl as string | null) || null;

  if (!userId) {
    socket.emit(S2C.ERROR, { message: 'You must be logged in to play blackjack.' });
    return;
  }

  if (!checkRateLimit(socket.id, C2S.JOIN_TABLE)) {
    socket.emit(S2C.ERROR, { message: 'Too many requests.' });
    return;
  }

  // Already at the table? Reconnect
  if (table.players.has(userId)) {
    const existing = table.players.get(userId)!;
    existing.socketId = socket.id;
    socketToUserId.set(socket.id, userId);
    socket.join(ROOM_KEY);
    socket.emit(S2C.TABLE_STATE, serializeTableState());
    return;
  }

  if (table.players.size >= MAX_PLAYERS) {
    socket.emit(S2C.ERROR, { message: 'Table is full (6/6 seats).' });
    return;
  }

  const seatIndex = getNextSeatIndex();
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
  };

  table.players.set(userId, player);
  socketToUserId.set(socket.id, userId);
  socket.join(ROOM_KEY);

  logger.info({ event: 'bj_player_joined', userId, userName, seatIndex });

  ioRef.to(ROOM_KEY).emit(S2C.PLAYER_JOINED, {
    userId,
    userName,
    avatarUrl,
    seatIndex,
  });

  // Send full state to the joining player
  socket.emit(S2C.TABLE_STATE, serializeTableState());

  // If table was idle and this is the first player, start betting
  if (table.phase === 'idle') {
    startBettingPhase();
  }
}

function onLeaveTable(socket: Socket) {
  if (!table) return;
  const userId = socketToUserId.get(socket.id);
  if (!userId) return;

  removePlayer(userId, socket.id);
}

function removePlayer(userId: string, socketId: string) {
  if (!table) return;
  const player = table.players.get(userId);
  if (!player) return;

  // If it's their turn, auto-stand
  if (table.currentTurnUserId === userId) {
    onStand(userId);
  }

  const seatIndex = player.seatIndex;
  table.players.delete(userId);
  socketToUserId.delete(socketId);

  const sock = ioRef.sockets.sockets.get(socketId);
  if (sock) sock.leave(ROOM_KEY);

  logger.info({ event: 'bj_player_left', userId, seatIndex });

  ioRef.to(ROOM_KEY).emit(S2C.PLAYER_LEFT, { userId, seatIndex });
  broadcastTableState();

  // If no players left and in betting phase, cancel it
  if (table.players.size === 0 && table.phase === 'betting') {
    clearTimers();
    table.phase = 'idle';
  }
}

async function onPlaceBet(socket: Socket, payload: unknown) {
  if (!table || table.phase !== 'betting') {
    socket.emit(S2C.ERROR, { message: 'Not in betting phase.' });
    return;
  }

  const userId = socketToUserId.get(socket.id);
  if (!userId) {
    socket.emit(S2C.ERROR, { message: 'Not at the table.' });
    return;
  }

  if (!checkRateLimit(socket.id, C2S.PLACE_BET)) {
    socket.emit(S2C.ERROR, { message: 'Too many requests.' });
    return;
  }

  const player = table.players.get(userId);
  if (!player) return;

  if (player.status === 'betting') {
    socket.emit(S2C.ERROR, { message: 'You already placed a bet.' });
    return;
  }

  const amount = typeof (payload as any)?.amount === 'number'
    ? Math.floor((payload as any).amount)
    : 0;

  if (amount < MIN_BET || amount > MAX_BET) {
    socket.emit(S2C.ERROR, { message: `Bet must be between ${MIN_BET} and ${MAX_BET}.` });
    return;
  }

  // Deduct coins atomically
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
    broadcastTableState();
  } catch (err) {
    if (err instanceof Error && err.message === 'INSUFFICIENT_COINS') {
      socket.emit(S2C.ERROR, { message: 'Not enough coins.' });
    } else {
      logger.error({ event: 'bj_bet_error', userId, error: String(err) });
      socket.emit(S2C.ERROR, { message: 'Failed to place bet.' });
    }
  }
}

function onHit(userId: string) {
  if (!table || table.phase !== 'player_turns') return;
  if (table.currentTurnUserId !== userId) return;

  const player = table.players.get(userId);
  if (!player || player.status !== 'playing') return;

  const card = drawCard();
  player.hand.push(card);

  ioRef.to(ROOM_KEY).emit(S2C.CARD_DEALT, {
    target: 'player',
    userId,
    card,
    handValue: handValue(player.hand).value,
  });

  if (isBusted(player.hand)) {
    player.status = 'busted';
    table.turnIndex++;
    advanceToNextPlayer();
  } else if (handValue(player.hand).value === 21) {
    // Auto-stand on 21
    player.status = 'standing';
    table.turnIndex++;
    advanceToNextPlayer();
  } else {
    broadcastTableState();
  }
}

function onStand(userId: string) {
  if (!table || table.phase !== 'player_turns') return;
  if (table.currentTurnUserId !== userId) return;

  const player = table.players.get(userId);
  if (!player || player.status !== 'playing') return;

  player.status = 'standing';
  table.turnIndex++;
  advanceToNextPlayer();
}

async function onDoubleDown(socket: Socket, userId: string) {
  if (!table || table.phase !== 'player_turns') return;
  if (table.currentTurnUserId !== userId) return;

  const player = table.players.get(userId);
  if (!player || player.status !== 'playing') return;

  // Can only double down on first action (2 cards)
  if (player.hand.length !== 2) {
    socket.emit(S2C.ERROR, { message: 'Can only double down on initial hand.' });
    return;
  }

  const additionalBet = player.bet;

  // Deduct additional bet
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

    // Deal exactly one card, then auto-stand
    const card = drawCard();
    player.hand.push(card);

    ioRef.to(ROOM_KEY).emit(S2C.CARD_DEALT, {
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

    table.turnIndex++;
    advanceToNextPlayer();
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
  table = {
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
    roundNumber: 0,
    bettingDeadline: null,
  };
  logger.info({ event: 'bj_public_table_initialized' });
}

export function registerBlackjackHandlers(io: Server, socket: Socket): void {
  ioRef = io;

  socket.on(C2S.JOIN_TABLE, () => onJoinTable(socket));
  socket.on(C2S.LEAVE_TABLE, () => onLeaveTable(socket));
  socket.on(C2S.PLACE_BET, (payload) => onPlaceBet(socket, payload));

  socket.on(C2S.HIT, () => {
    const userId = socketToUserId.get(socket.id);
    if (!userId) return;
    if (!checkRateLimit(socket.id, C2S.HIT)) return;
    onHit(userId);
  });

  socket.on(C2S.STAND, () => {
    const userId = socketToUserId.get(socket.id);
    if (!userId) return;
    if (!checkRateLimit(socket.id, C2S.STAND)) return;
    onStand(userId);
  });

  socket.on(C2S.DOUBLE_DOWN, () => {
    const userId = socketToUserId.get(socket.id);
    if (!userId) return;
    if (!checkRateLimit(socket.id, C2S.DOUBLE_DOWN)) return;
    onDoubleDown(socket, userId);
  });
}

export function handleBlackjackDisconnect(_io: Server, socket: Socket): void {
  const userId = socketToUserId.get(socket.id);
  if (!userId || !table) return;

  const player = table.players.get(userId);
  if (!player) {
    socketToUserId.delete(socket.id);
    return;
  }

  // If in a round, auto-stand their hand
  if (table.phase === 'player_turns' && table.currentTurnUserId === userId) {
    onStand(userId);
  }

  // Remove after round if mid-game, immediately if idle/betting
  if (table.phase === 'idle' || table.phase === 'betting') {
    removePlayer(userId, socket.id);
  } else {
    // Mark for removal after round — keep them in so they can get payouts
    // They'll be cleaned up in the results timer callback
    socketToUserId.delete(socket.id);
  }
}
