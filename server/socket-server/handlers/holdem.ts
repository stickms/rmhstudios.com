/**
 * No Limit Texas Hold'em — Room-based multiplayer handler.
 *
 * Single-deck per hand, reshuffled each deal.
 * Standard NLHE rules with blinds, community cards, side pots.
 */

import type { Server, Socket } from 'socket.io';
import { getPrismaClient } from '../prisma-client';
import { checkRateLimit } from '../rate-limit';
import { logger } from '../logger';
import { type Card, type HandRank, createDeck, evaluateBestHand, compareHands, type EvaluatedHand } from '../../../lib/holdem/logic';

// ── Event Constants ────────────────────────────────────────────────

const C2S = {
  LIST_ROOMS:    'holdem:list_rooms',
  CREATE_ROOM:   'holdem:create_room',
  JOIN_ROOM:     'holdem:join_room',
  LEAVE_ROOM:    'holdem:leave_room',
  UPDATE_ROOM:   'holdem:update_room',
  FOLD:          'holdem:fold',
  CHECK:         'holdem:check',
  CALL:          'holdem:call',
  RAISE:         'holdem:raise',
  ALL_IN:        'holdem:all_in',
  SIT_IN:        'holdem:sit_in',
  SIT_OUT:       'holdem:sit_out',
  REBUY:         'holdem:rebuy',
  SHOW_CARDS:    'holdem:show_cards',
} as const;

const S2C = {
  ROOM_LIST:       'holdem:room_list',
  ROOM_CREATED:    'holdem:room_created',
  ROOM_JOINED:     'holdem:room_joined',
  ROOM_LEFT:       'holdem:room_left',
  ROOM_UPDATED:    'holdem:room_updated',
  TABLE_STATE:     'holdem:table_state',
  PLAYER_JOINED:   'holdem:player_joined',
  PLAYER_LEFT:     'holdem:player_left',
  NEW_HAND:        'holdem:new_hand',
  TURN:            'holdem:turn',
  COMMUNITY_CARDS: 'holdem:community_cards',
  SHOWDOWN:        'holdem:showdown',
  HAND_RESULT:     'holdem:hand_result',
  BALANCE_UPDATE:  'holdem:balance_update',
  ERROR:           'holdem:error',
} as const;

// ── Types ──────────────────────────────────────────────────────────

type TablePhase = 'waiting' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown' | 'results';
type PlayerAction = 'fold' | 'check' | 'call' | 'raise' | 'all_in' | null;

interface PlayerSeat {
  seatIndex: number;
  socketId: string;
  userId: string;
  userName: string;
  avatarUrl: string | null;
  holeCards: Card[];
  currentBet: number;
  totalBetThisHand: number;
  totalChips: number;
  folded: boolean;
  allIn: boolean;
  lastAction: PlayerAction;
  sittingOut: boolean;
  showCards: Set<number>; // indices of hole cards the player chose to reveal (0 and/or 1)
  sessionStats: {
    totalBuyIn: number;
    totalCashOut: number;
    handsPlayed: number;
    handsWon: number;
    biggestPot: number;
  };
}

interface SidePot {
  amount: number;
  eligible: string[];
}

interface HoldemRoom {
  roomId: string;
  name: string;
  ownerId: string;
  ownerName: string;
  maxPlayers: number;
  smallBlind: number;
  bigBlind: number;
  buyIn: number;
  privacy: 'public' | 'unlisted';
  joinCode: string;
  phase: TablePhase;
  players: Map<string, PlayerSeat>;
  deck: Card[];
  communityCards: Card[];
  pot: number;
  sidePots: SidePot[];
  currentTurnUserId: string | null;
  currentBet: number;
  minRaise: number;
  dealerIndex: number;
  turnOrder: string[];
  turnIdx: number;
  turnTimer: ReturnType<typeof setTimeout> | null;
  resultsTimer: ReturnType<typeof setTimeout> | null;
  handNumber: number;
  lastRaiseAmount: number;
  resultsEndTime: number | null;
  turnDeadline: number | null;
}

// ── Constants ──────────────────────────────────────────────────────

const DEFAULT_MAX_PLAYERS = 6;
const MAX_PLAYERS_CAP = 6;
const MIN_PLAYERS_TO_START = 2;
const TURN_TIMEOUT_MS = 30_000;
const RESULTS_DISPLAY_MS = 10_000;
// At showdown, reveal the players' hole cards and hold the result this long so
// the flip animation finishes on every client before the winner is announced.
// Server-held (not client-timed) so all clients reveal together and nobody can
// peek at the outcome early.
const SHOWDOWN_REVEAL_MS = 1_500;
const DEFAULT_SMALL_BLIND = 5;
const DEFAULT_BIG_BLIND = 10;
const DEFAULT_BUY_IN = 200;

// ── State ──────────────────────────────────────────────────────────

const rooms = new Map<string, HoldemRoom>();
const socketToUserId = new Map<string, string>();
const userToRoom = new Map<string, string>();
let ioRef: Server;

function roomKey(roomId: string): string {
  return `holdem:${roomId}`;
}

function generateRoomId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  for (let i = 0; i < 5; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

// ── Helpers ────────────────────────────────────────────────────────

function drawCard(room: HoldemRoom): Card {
  return room.deck.pop()!;
}

function activePlayers(room: HoldemRoom): PlayerSeat[] {
  return Array.from(room.players.values()).filter((p) => !p.folded && !p.sittingOut);
}

function activeNonAllIn(room: HoldemRoom): PlayerSeat[] {
  return activePlayers(room).filter((p) => !p.allIn);
}

function getSeatedPlayers(room: HoldemRoom): PlayerSeat[] {
  return Array.from(room.players.values())
    .filter((p) => !p.sittingOut)
    .sort((a, b) => a.seatIndex - b.seatIndex);
}

// ── Serialization ──────────────────────────────────────────────────

function getVisibleHoleCards(p: PlayerSeat, forUserId?: string, isShowdown?: boolean): (Card | null)[] | null {
  // Always show your own cards
  if (p.userId === forUserId && !p.sittingOut) return p.holeCards;
  // During showdown/results, show cards the player opted to reveal
  if (isShowdown && !p.folded && p.holeCards.length === 2) {
    if (p.showCards.size === 2) return p.holeCards;
    if (p.showCards.size === 0) return null;
    // Partial reveal: show selected cards, null for hidden ones
    return p.holeCards.map((card, i) => p.showCards.has(i) ? card : null);
  }
  return null;
}

function serializeTableState(room: HoldemRoom, forUserId?: string) {
  const isShowdown = room.phase === 'showdown' || room.phase === 'results';
  const players = Array.from(room.players.values()).map((p) => ({
    userId: p.userId,
    userName: p.userName,
    avatarUrl: p.avatarUrl,
    seatIndex: p.seatIndex,
    holeCards: getVisibleHoleCards(p, forUserId, isShowdown),
    currentBet: p.currentBet,
    totalChips: p.totalChips,
    folded: p.folded,
    allIn: p.allIn,
    lastAction: p.lastAction,
    sittingOut: p.sittingOut,
    isDealer: false,
    isSmallBlind: false,
    isBigBlind: false,
    sessionStats: p.sessionStats,
  }));

  // Mark positions
  const seated = getSeatedPlayers(room);
  if (seated.length >= 2) {
    const dIdx = room.dealerIndex % seated.length;
    const sbIdx = seated.length === 2 ? dIdx : (dIdx + 1) % seated.length;
    const bbIdx = seated.length === 2 ? (dIdx + 1) % seated.length : (dIdx + 2) % seated.length;

    const dealerPlayer = players.find((p) => p.userId === seated[dIdx]?.userId);
    const sbPlayer = players.find((p) => p.userId === seated[sbIdx]?.userId);
    const bbPlayer = players.find((p) => p.userId === seated[bbIdx]?.userId);
    if (dealerPlayer) dealerPlayer.isDealer = true;
    if (sbPlayer) sbPlayer.isSmallBlind = true;
    if (bbPlayer) bbPlayer.isBigBlind = true;
  }

  return {
    roomId: room.roomId,
    phase: room.phase,
    handNumber: room.handNumber,
    players,
    communityCards: room.communityCards,
    pot: room.pot,
    sidePots: room.sidePots,
    currentTurnUserId: room.currentTurnUserId,
    currentBet: room.currentBet,
    minRaise: room.minRaise,
    turnTimeout: room.currentTurnUserId && room.turnDeadline
      ? Math.max(0, Math.ceil((room.turnDeadline - Date.now()) / 1000))
      : null,
    smallBlind: room.smallBlind,
    bigBlind: room.bigBlind,
    resultsCountdown: room.resultsEndTime ? Math.max(0, Math.ceil((room.resultsEndTime - Date.now()) / 1000)) : null,
  };
}

function broadcastPersonalizedState(room: HoldemRoom) {
  for (const p of room.players.values()) {
    const sock = ioRef.sockets.sockets.get(p.socketId);
    if (sock) {
      sock.emit(S2C.TABLE_STATE, serializeTableState(room, p.userId));
    }
  }
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
      smallBlind: r.smallBlind,
      bigBlind: r.bigBlind,
      inProgress: r.phase !== 'waiting',
    }));
  ioRef.emit(S2C.ROOM_LIST, { rooms: list });
}

// ── Seat Assignment ────────────────────────────────────────────────

function getNextSeatIndex(room: HoldemRoom): number {
  const taken = new Set(Array.from(room.players.values()).map((p) => p.seatIndex));
  for (let i = 0; i < room.maxPlayers; i++) {
    if (!taken.has(i)) return i;
  }
  return -1;
}

// ── Hand Lifecycle ────────────────────────────────────────────────

function clearTimers(room: HoldemRoom) {
  if (room.turnTimer) { clearTimeout(room.turnTimer); room.turnTimer = null; }
  if (room.resultsTimer) { clearTimeout(room.resultsTimer); room.resultsTimer = null; }
}

function startNewHand(room: HoldemRoom) {
  const seated = getSeatedPlayers(room);
  if (seated.length < MIN_PLAYERS_TO_START) {
    room.phase = 'waiting';
    broadcastPersonalizedState(room);
    return;
  }

  room.handNumber++;
  room.deck = createDeck();
  room.communityCards = [];
  room.pot = 0;
  room.sidePots = [];
  room.currentBet = 0;
  room.minRaise = room.bigBlind;
  room.currentTurnUserId = null;
  room.lastRaiseAmount = room.bigBlind;

  // Reset player states — respect sittingOut flag (player must opt in)
  for (const p of room.players.values()) {
    p.holeCards = [];
    p.currentBet = 0;
    p.totalBetThisHand = 0;
    p.folded = p.sittingOut;
    p.allIn = false;
    p.lastAction = null;
    p.showCards = new Set();
    if (!p.sittingOut) p.sessionStats.handsPlayed++;
  }

  // Move dealer button
  room.dealerIndex = (room.dealerIndex + 1) % seated.length;

  // Post blinds
  const sbIdx = seated.length === 2 ? room.dealerIndex % seated.length : (room.dealerIndex + 1) % seated.length;
  const bbIdx = seated.length === 2 ? (room.dealerIndex + 1) % seated.length : (room.dealerIndex + 2) % seated.length;

  const sbPlayer = seated[sbIdx];
  const bbPlayer = seated[bbIdx];

  postBlind(sbPlayer, room.smallBlind, room);
  postBlind(bbPlayer, room.bigBlind, room);

  room.currentBet = room.bigBlind;

  // Deal hole cards
  for (const p of seated) {
    if (!p.sittingOut) {
      p.holeCards = [drawCard(room), drawCard(room)];
    }
  }

  room.phase = 'preflop';

  // Build turn order starting after big blind
  buildTurnOrder(room, bbIdx);

  ioRef.to(roomKey(room.roomId)).emit(S2C.NEW_HAND, {
    handNumber: room.handNumber,
  });

  broadcastPersonalizedState(room);
  advanceToNextPlayer(room);
}

function postBlind(player: PlayerSeat, amount: number, room: HoldemRoom) {
  const actual = Math.min(amount, player.totalChips);
  player.totalChips -= actual;
  player.currentBet = actual;
  player.totalBetThisHand += actual;
  room.pot += actual;
  if (player.totalChips === 0) {
    player.allIn = true;
  }
}

function buildTurnOrder(room: HoldemRoom, afterIndex: number) {
  const seated = getSeatedPlayers(room);
  room.turnOrder = [];
  for (let i = 1; i <= seated.length; i++) {
    const idx = (afterIndex + i) % seated.length;
    const p = seated[idx];
    if (!p.folded && !p.sittingOut) {
      room.turnOrder.push(p.userId);
    }
  }
  room.turnIdx = 0;
}

function buildBettingRoundOrder(room: HoldemRoom) {
  // After flop/turn/river: start from first active player after dealer
  const seated = getSeatedPlayers(room);
  room.turnOrder = [];
  for (let i = 1; i <= seated.length; i++) {
    const idx = (room.dealerIndex + i) % seated.length;
    const p = seated[idx];
    if (!p.folded && !p.allIn && !p.sittingOut) {
      room.turnOrder.push(p.userId);
    }
  }
  room.turnIdx = 0;
}

function advanceToNextPlayer(room: HoldemRoom) {
  // Check if only one player remaining
  const active = activePlayers(room);
  if (active.length <= 1) {
    // Last man standing wins
    endHand(room);
    return;
  }

  // Check if all active non-all-in players have acted and bets are equal
  const nonAllIn = activeNonAllIn(room);
  if (nonAllIn.length === 0 || (room.turnIdx >= room.turnOrder.length && allBetsEqual(room))) {
    nextPhase(room);
    return;
  }

  while (room.turnIdx < room.turnOrder.length) {
    const userId = room.turnOrder[room.turnIdx];
    const player = room.players.get(userId);

    if (player && !player.folded && !player.allIn && !player.sittingOut) {
      room.currentTurnUserId = userId;
      room.turnDeadline = Date.now() + TURN_TIMEOUT_MS;

      ioRef.to(roomKey(room.roomId)).emit(S2C.TURN, {
        userId,
        timeoutSeconds: Math.ceil(TURN_TIMEOUT_MS / 1000),
      });

      broadcastPersonalizedState(room);

      if (room.turnTimer) clearTimeout(room.turnTimer);
      room.turnTimer = setTimeout(() => {
        // Max turn time reached — auto-fold (or check) so the table never stalls.
        if (room.currentTurnUserId === userId) {
          onTurnTimeout(room, userId);
        }
      }, TURN_TIMEOUT_MS);

      return;
    }

    room.turnIdx++;
  }

  // All acted — check if bets are equal
  if (allBetsEqual(room)) {
    nextPhase(room);
  } else {
    // Need another round of betting
    buildBettingRoundOrder(room);
    advanceToNextPlayer(room);
  }
}

function allBetsEqual(room: HoldemRoom): boolean {
  const active = activePlayers(room).filter((p) => !p.allIn);
  if (active.length === 0) return true;
  const bet = active[0].currentBet;
  return active.every((p) => p.currentBet === bet);
}

function nextPhase(room: HoldemRoom) {
  room.currentTurnUserId = null;
  room.turnDeadline = null;
  if (room.turnTimer) { clearTimeout(room.turnTimer); room.turnTimer = null; }

  // Reset bets for new betting round
  for (const p of room.players.values()) {
    p.currentBet = 0;
    p.lastAction = null;
  }
  room.currentBet = 0;
  room.lastRaiseAmount = room.bigBlind;

  const active = activePlayers(room);
  if (active.length <= 1) {
    endHand(room);
    return;
  }

  switch (room.phase) {
    case 'preflop':
      room.phase = 'flop';
      room.communityCards.push(drawCard(room), drawCard(room), drawCard(room));
      break;
    case 'flop':
      room.phase = 'turn';
      room.communityCards.push(drawCard(room));
      break;
    case 'turn':
      room.phase = 'river';
      room.communityCards.push(drawCard(room));
      break;
    case 'river':
      room.phase = 'showdown';
      endHand(room);
      return;
    default:
      return;
  }

  ioRef.to(roomKey(room.roomId)).emit(S2C.COMMUNITY_CARDS, {
    communityCards: room.communityCards,
    phase: room.phase,
  });

  // Check if any non-all-in players can act
  const canAct = activeNonAllIn(room);
  if (canAct.length <= 1) {
    // Everyone is all-in — deal remaining cards and resolve
    dealRemaining(room);
    return;
  }

  buildBettingRoundOrder(room);
  broadcastPersonalizedState(room);
  advanceToNextPlayer(room);
}

function dealRemaining(room: HoldemRoom) {
  // Deal remaining community cards automatically
  while (room.communityCards.length < 5) {
    room.communityCards.push(drawCard(room));
  }

  ioRef.to(roomKey(room.roomId)).emit(S2C.COMMUNITY_CARDS, {
    communityCards: room.communityCards,
    phase: room.phase,
  });

  room.phase = 'showdown';
  setTimeout(() => endHand(room), 1500);
}

// ── Hand Resolution ───────────────────────────────────────────────

function endHand(room: HoldemRoom) {
  room.phase = 'showdown';
  room.currentTurnUserId = null;
  room.turnDeadline = null;
  if (room.turnTimer) { clearTimeout(room.turnTimer); room.turnTimer = null; }

  const active = activePlayers(room);

  if (active.length === 1) {
    // Last man standing
    const winner = active[0];
    winner.totalChips += room.pot;
    winner.sessionStats.handsWon++;
    if (room.pot > winner.sessionStats.biggestPot) {
      winner.sessionStats.biggestPot = room.pot;
    }

    const netGain = room.pot - winner.totalBetThisHand;

    // Include all players in results (folded players lost their bets)
    const allResults = Array.from(room.players.values()).map((p) => ({
      userId: p.userId,
      payout: p.userId === winner.userId ? room.pot : 0,
      netGain: p.userId === winner.userId ? netGain : -p.totalBetThisHand,
      handRank: null as HandRank | null,
      bestHand: null as Card[] | null,
      holeCards: p.userId === winner.userId ? p.holeCards.map((card, i) => p.showCards.has(i) ? card : null) : [],
    }));

    // Everyone else folded — no cards to flip, so reveal the result right away.
    ioRef.to(roomKey(room.roomId)).emit(S2C.HAND_RESULT, {
      results: allResults,
      pot: room.pot,
    });
    finish();
  } else {
    // Showdown — evaluate hands
    const evaluations: { player: PlayerSeat; eval: EvaluatedHand }[] = [];

    for (const p of active) {
      const allCards = [...p.holeCards, ...room.communityCards];
      const ev = evaluateBestHand(allCards);
      evaluations.push({ player: p, eval: ev });
    }

    // Calculate side pots
    calculateSidePots(room);

    // Distribute main pot and side pots
    const totalPayouts = new Map<string, number>();

    // If no side pots, single pot resolution
    if (room.sidePots.length === 0) {
      room.sidePots.push({ amount: room.pot, eligible: active.map((p) => p.userId) });
    }

    for (const pot of room.sidePots) {
      const eligible = evaluations.filter((e) => pot.eligible.includes(e.player.userId));
      if (eligible.length === 0) continue;

      eligible.sort((a, b) => compareHands(b.eval, a.eval));
      const bestRank = eligible[0].eval;

      // Find all tied winners
      const winners = eligible.filter((e) => compareHands(e.eval, bestRank) === 0);
      const share = Math.floor(pot.amount / winners.length);
      const remainder = pot.amount - share * winners.length;

      for (let i = 0; i < winners.length; i++) {
        const payout = share + (i === 0 ? remainder : 0);
        const current = totalPayouts.get(winners[i].player.userId) ?? 0;
        totalPayouts.set(winners[i].player.userId, current + payout);
      }
    }

    // Apply payouts and force-reveal winners' cards
    const handRanks = new Map<string, HandRank>();
    for (const e of evaluations) {
      const payout = totalPayouts.get(e.player.userId) ?? 0;
      e.player.totalChips += payout;
      handRanks.set(e.player.userId, e.eval.rank);
      if (payout > 0) {
        // Winners must show their cards
        e.player.showCards = new Set([0, 1]);
        e.player.sessionStats.handsWon++;
        if (payout > e.player.sessionStats.biggestPot) {
          e.player.sessionStats.biggestPot = payout;
        }
      }
    }

    // Include all players in results (folded players lost their bets)
    const results = Array.from(room.players.values())
      .filter((p) => !p.sittingOut)
      .map((p) => {
        const payout = totalPayouts.get(p.userId) ?? 0;
        return {
          userId: p.userId,
          payout,
          netGain: payout > 0 ? payout - p.totalBetThisHand : -p.totalBetThisHand,
          handRank: handRanks.get(p.userId) ?? null,
          bestHand: null as Card[] | null,
          holeCards: p.folded ? [] : p.holeCards.map((card, i) => p.showCards.has(i) ? card : null),
        };
      });

    // Reveal the contested hole cards first (phase stays 'showdown' so clients
    // flip them face-up), then announce the winner only once that flip has
    // finished everywhere. The wait is held on the server, so every client
    // reveals together and no client can compute the result early.
    broadcastPersonalizedState(room);
    setTimeout(() => {
      ioRef.to(roomKey(room.roomId)).emit(S2C.HAND_RESULT, {
        results,
        pot: room.pot,
      });
      finish();
    }, SHOWDOWN_REVEAL_MS);
  }

  // Finalize the hand: move to the results phase, clear the pot, and schedule the
  // next hand. Hoisted so both the fold-win (immediate) and showdown (delayed)
  // paths above can call it. Runs exactly once per hand.
  function finish() {
    room.phase = 'results';
    room.pot = 0;
    room.sidePots = [];
    room.resultsEndTime = Date.now() + RESULTS_DISPLAY_MS;

    // Broadcast state (cards revealed based on showCards preferences)
    broadcastPersonalizedState(room);

    // Sit out busted players, then start next hand
    room.resultsTimer = setTimeout(async () => {
      room.resultsEndTime = null;
      // Remove disconnected/busted players
      for (const [userId, p] of room.players) {
        const sock = ioRef.sockets.sockets.get(p.socketId);
        if (!sock || !sock.connected) {
          await cashOutPlayer(room, p);
          room.players.delete(userId);
          userToRoom.delete(userId);
          continue;
        }
        if (p.totalChips === 0) {
          // Sit them out instead of kicking — they can rebuy
          p.sittingOut = true;
          p.folded = true;
        }
      }

      if (room.players.size === 0) {
        destroyRoom(room.roomId);
        return;
      }

      broadcastRoomList();
      startNewHand(room);
    }, RESULTS_DISPLAY_MS);
  }
}

function calculateSidePots(room: HoldemRoom) {
  const active = activePlayers(room);
  const allInPlayers = active.filter((p) => p.allIn);

  if (allInPlayers.length === 0) {
    room.sidePots = [{ amount: room.pot, eligible: active.map((p) => p.userId) }];
    return;
  }

  // Also include folded players — they contributed chips to the pot
  const allContributors = Array.from(room.players.values())
    .filter((p) => p.totalBetThisHand > 0)
    .sort((a, b) => a.totalBetThisHand - b.totalBetThisHand);

  if (allContributors.length === 0) {
    room.sidePots = [{ amount: room.pot, eligible: active.map((p) => p.userId) }];
    return;
  }

  // Get unique contribution levels from all-in players
  const allInLevels = [...new Set(allInPlayers.map((p) => p.totalBetThisHand))].sort((a, b) => a - b);

  const pots: SidePot[] = [];
  let prevLevel = 0;

  for (const level of allInLevels) {
    if (level <= prevLevel) continue;

    const slice = level - prevLevel;
    let potAmount = 0;
    const eligible: string[] = [];

    for (const p of allContributors) {
      const contribution = Math.min(slice, Math.max(0, p.totalBetThisHand - prevLevel));
      potAmount += contribution;
      if (!p.folded && p.totalBetThisHand >= level) {
        eligible.push(p.userId);
      }
    }

    if (potAmount > 0 && eligible.length > 0) {
      pots.push({ amount: potAmount, eligible });
    }
    prevLevel = level;
  }

  // Remaining pot for players who bet above the highest all-in
  const maxAllIn = allInLevels[allInLevels.length - 1];
  let remaining = 0;
  const remainingEligible: string[] = [];

  for (const p of allContributors) {
    const above = Math.max(0, p.totalBetThisHand - maxAllIn);
    remaining += above;
    if (!p.folded && p.totalBetThisHand > maxAllIn) {
      remainingEligible.push(p.userId);
    }
  }

  if (remaining > 0 && remainingEligible.length > 0) {
    pots.push({ amount: remaining, eligible: remainingEligible });
  }

  // If only one player in the remaining pot, they get it back (uncalled bet)
  // This is handled naturally by the payout loop

  room.sidePots = pots.length > 0 ? pots : [{ amount: room.pot, eligible: active.map((p) => p.userId) }];
}

async function cashOutPlayer(room: HoldemRoom, player: PlayerSeat) {
  if (player.totalChips > 0) {
    try {
      const prisma = getPrismaClient();
      const updated = await prisma.userProfile.update({
        where: { userId: player.userId },
        data: { coins: { increment: player.totalChips } },
        select: { coins: true },
      });
      player.sessionStats.totalCashOut = player.totalChips;
      const sock = ioRef.sockets.sockets.get(player.socketId);
      if (sock) sock.emit(S2C.BALANCE_UPDATE, { coins: updated.coins });
    } catch (err) {
      logger.error({ event: 'holdem_cashout_error', userId: player.userId, error: String(err) });
    }
  }
}

// ── Room Management ───────────────────────────────────────────────

function destroyRoom(roomId: string) {
  const room = rooms.get(roomId);
  if (room) {
    clearTimers(room);
    rooms.delete(roomId);
    logger.info({ event: 'holdem_room_destroyed', roomId });
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
      smallBlind: r.smallBlind,
      bigBlind: r.bigBlind,
      inProgress: r.phase !== 'waiting',
    }));
  socket.emit(S2C.ROOM_LIST, { rooms: list });
}

async function onCreateRoom(socket: Socket, payload: unknown) {
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

  const currentRoomId = userToRoom.get(userId);
  if (currentRoomId) {
    await leaveRoom(userId, socket.id);
  }

  const data = payload as any;
  const name = typeof data?.name === 'string' ? data.name.trim().slice(0, 30) : `${userName}'s Table`;
  const maxPlayers = typeof data?.maxPlayers === 'number'
    ? Math.min(Math.max(Math.floor(data.maxPlayers), 2), MAX_PLAYERS_CAP)
    : DEFAULT_MAX_PLAYERS;
  const smallBlind = typeof data?.smallBlind === 'number' && data.smallBlind >= 1
    ? Math.floor(data.smallBlind) : DEFAULT_SMALL_BLIND;
  const bigBlind = smallBlind * 2;
  const buyIn = typeof data?.buyIn === 'number' && data.buyIn >= bigBlind
    ? Math.floor(data.buyIn) : Math.max(bigBlind * 10, DEFAULT_BUY_IN);
  const privacy = data?.privacy === 'unlisted' ? 'unlisted' as const : 'public' as const;

  const roomId = generateRoomId();
  const joinCode = generateRoomId(); // separate code for invites

  const room: HoldemRoom = {
    roomId,
    name,
    ownerId: userId,
    ownerName: userName,
    maxPlayers,
    smallBlind,
    bigBlind,
    buyIn,
    privacy,
    joinCode,
    phase: 'waiting',
    players: new Map(),
    deck: [],
    communityCards: [],
    pot: 0,
    sidePots: [],
    currentTurnUserId: null,
    currentBet: 0,
    minRaise: bigBlind,
    dealerIndex: -1,
    turnOrder: [],
    turnIdx: 0,
    turnTimer: null,
    resultsTimer: null,
    handNumber: 0,
    lastRaiseAmount: bigBlind,
    resultsEndTime: null,
    turnDeadline: null,
  };

  rooms.set(roomId, room);
  logger.info({ event: 'holdem_room_created', roomId, userId, name });

  await joinRoom(room, socket);

  // Only emit ROOM_CREATED after successful join (joinRoom handles errors internally)
  if (room.players.has(userId)) {
    socket.emit(S2C.ROOM_CREATED, { roomId, name, maxPlayers, smallBlind, bigBlind, buyIn, privacy, joinCode });
    broadcastRoomList();
  } else {
    // Join failed (e.g., insufficient coins) — clean up the empty room
    rooms.delete(roomId);
  }
}

async function onJoinRoom(socket: Socket, payload: unknown) {
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
  const joinCode = typeof data?.joinCode === 'string' ? data.joinCode : '';

  // Find room by ID or join code
  let room = rooms.get(roomId);
  if (!room && joinCode) {
    for (const r of rooms.values()) {
      if (r.joinCode === joinCode) {
        room = r;
        break;
      }
    }
  }
  if (!room) {
    socket.emit(S2C.ERROR, { message: 'Room not found.' });
    return;
  }

  const currentRoomId = userToRoom.get(userId);
  if (currentRoomId && currentRoomId !== room.roomId) {
    await leaveRoom(userId, socket.id);
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
      smallBlind: room.smallBlind,
      bigBlind: room.bigBlind,
      buyIn: room.buyIn,
      privacy: room.privacy,
      joinCode: room.joinCode,
    });
    socket.emit(S2C.TABLE_STATE, serializeTableState(room, userId));
    return;
  }

  if (room.players.size >= room.maxPlayers) {
    socket.emit(S2C.ERROR, { message: `Room is full (${room.maxPlayers}/${room.maxPlayers}).` });
    return;
  }

  await joinRoom(room, socket);
}

async function joinRoom(room: HoldemRoom, socket: Socket) {
  const userId = socket.data.userId as string;
  const userName = (socket.data.userName as string) || 'Player';
  const avatarUrl = (socket.data.avatarUrl as string | null) || null;

  const seatIndex = getNextSeatIndex(room);
  if (seatIndex < 0) {
    socket.emit(S2C.ERROR, { message: 'No seats available.' });
    return;
  }

  // Buy in — deduct coins
  try {
    const prisma = getPrismaClient();
    const result = await prisma.$transaction(async (tx: any) => {
      const profile = await tx.userProfile.findUnique({
        where: { userId },
        select: { coins: true },
      });

      if (!profile || profile.coins < room.buyIn) {
        throw new Error('INSUFFICIENT_COINS');
      }

      const updated = await tx.userProfile.update({
        where: { userId },
        data: { coins: { decrement: room.buyIn } },
        select: { coins: true },
      });

      return updated.coins;
    });

    const player: PlayerSeat = {
      seatIndex,
      socketId: socket.id,
      userId,
      userName,
      avatarUrl,
      holeCards: [],
      currentBet: 0,
      totalBetThisHand: 0,
      totalChips: room.buyIn,
      folded: true, // sit out until next hand
      allIn: false,
      lastAction: null,
      sittingOut: true, // always start sitting out — player opts in
      showCards: new Set(),
      sessionStats: { totalBuyIn: room.buyIn, totalCashOut: 0, handsPlayed: 0, handsWon: 0, biggestPot: 0 },
    };

    room.players.set(userId, player);
    socketToUserId.set(socket.id, userId);
    userToRoom.set(userId, room.roomId);
    socket.join(roomKey(room.roomId));

    socket.emit(S2C.BALANCE_UPDATE, { coins: result });

    logger.info({ event: 'holdem_player_joined', roomId: room.roomId, userId, userName, seatIndex, buyIn: room.buyIn });

    socket.emit(S2C.ROOM_JOINED, {
      roomId: room.roomId,
      name: room.name,
      ownerId: room.ownerId,
      ownerName: room.ownerName,
      maxPlayers: room.maxPlayers,
      smallBlind: room.smallBlind,
      bigBlind: room.bigBlind,
      buyIn: room.buyIn,
      privacy: room.privacy,
      joinCode: room.joinCode,
    });

    ioRef.to(roomKey(room.roomId)).emit(S2C.PLAYER_JOINED, {
      userId,
      userName,
      avatarUrl,
      seatIndex,
    });

    socket.emit(S2C.TABLE_STATE, serializeTableState(room, userId));
    broadcastRoomList();

    // Auto-start if enough players and waiting
    if (room.phase === 'waiting' && room.players.size >= MIN_PLAYERS_TO_START) {
      startNewHand(room);
    }
  } catch (err) {
    if (err instanceof Error && err.message === 'INSUFFICIENT_COINS') {
      socket.emit(S2C.ERROR, { message: `Not enough coins. Buy-in is ${room.buyIn}.` });
    } else {
      logger.error({ event: 'holdem_buyin_error', userId, error: String(err) });
      socket.emit(S2C.ERROR, { message: 'Failed to buy in.' });
    }
  }
}

async function onLeaveRoom(socket: Socket) {
  const userId = socketToUserId.get(socket.id);
  if (!userId) return;
  await leaveRoom(userId, socket.id);
}

async function leaveRoom(userId: string, socketId: string) {
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

  // Auto-fold if it's their turn
  if (room.currentTurnUserId === userId) {
    onFold(room, userId);
  } else if (room.phase !== 'waiting' && room.phase !== 'results' && !player.folded) {
    player.folded = true;
  }

  // Cash out their chips
  await cashOutPlayer(room, player);

  const seatIndex = player.seatIndex;
  room.players.delete(userId);
  userToRoom.delete(userId);
  socketToUserId.delete(socketId);

  const sock = ioRef.sockets.sockets.get(socketId);
  if (sock) {
    sock.leave(roomKey(roomId));
    sock.emit(S2C.ROOM_LEFT, { roomId });
  }

  logger.info({ event: 'holdem_player_left', roomId, userId, seatIndex });

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
    });
  }

  if (room.players.size === 0) {
    destroyRoom(roomId);
    return;
  }

  broadcastPersonalizedState(room);
  broadcastRoomList();
}

function onUpdateRoom(socket: Socket, payload: unknown) {
  const userId = socketToUserId.get(socket.id);
  if (!userId) return;

  const roomId = userToRoom.get(userId);
  if (!roomId) return;

  const room = rooms.get(roomId);
  if (!room || room.ownerId !== userId) {
    socket.emit(S2C.ERROR, { message: 'Only the room owner can change settings.' });
    return;
  }

  // Only allow changes when not in a hand
  if (room.phase !== 'waiting') {
    socket.emit(S2C.ERROR, { message: 'Cannot change settings during a hand.' });
    return;
  }

  const data = payload as any;
  if (typeof data?.maxPlayers === 'number') {
    const newMax = Math.min(Math.max(Math.floor(data.maxPlayers), 2), MAX_PLAYERS_CAP);
    if (newMax < room.players.size) {
      socket.emit(S2C.ERROR, { message: 'Cannot reduce below current player count.' });
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

// ── Player Actions ────────────────────────────────────────────────

/**
 * Auto-action when a player runs out of turn time. Checks for free when there
 * is nothing to call (so the player isn't folded out of a hand they could have
 * stayed in), otherwise folds. Keeps the table moving without punishing a
 * player who only owes a check.
 */
function onTurnTimeout(room: HoldemRoom, userId: string) {
  if (room.currentTurnUserId !== userId) return;
  const player = room.players.get(userId);
  if (!player) {
    // Player vanished mid-turn — force the table forward so it can't freeze.
    room.turnIdx++;
    advanceToNextPlayer(room);
    return;
  }
  const sock = ioRef.sockets.sockets.get(player.socketId);
  if (sock && player.currentBet >= room.currentBet) {
    onCheck(room, sock, userId);
  } else {
    onFold(room, userId);
  }
  // Safety net: if the auto-action couldn't advance the turn (e.g. an early
  // return on some unexpected state), force progress so the table never stalls.
  if (room.currentTurnUserId === userId) {
    room.turnIdx++;
    advanceToNextPlayer(room);
  }
}

function onFold(room: HoldemRoom, userId: string) {
  if (room.currentTurnUserId !== userId) return;

  const player = room.players.get(userId);
  if (!player || player.folded) return;

  player.folded = true;
  player.lastAction = 'fold';
  room.turnIdx++;

  if (room.turnTimer) { clearTimeout(room.turnTimer); room.turnTimer = null; }

  advanceToNextPlayer(room);
}

function onCheck(room: HoldemRoom, socket: Socket, userId: string) {
  if (room.currentTurnUserId !== userId) return;

  const player = room.players.get(userId);
  if (!player || player.folded) return;

  if (player.currentBet < room.currentBet) {
    socket.emit(S2C.ERROR, { message: 'Cannot check — there is a bet to call.' });
    return;
  }

  player.lastAction = 'check';
  room.turnIdx++;

  if (room.turnTimer) { clearTimeout(room.turnTimer); room.turnTimer = null; }

  advanceToNextPlayer(room);
}

function onCall(room: HoldemRoom, userId: string) {
  if (room.currentTurnUserId !== userId) return;

  const player = room.players.get(userId);
  if (!player || player.folded) return;

  const toCall = room.currentBet - player.currentBet;
  if (toCall <= 0) return;

  const actual = Math.min(toCall, player.totalChips);
  player.totalChips -= actual;
  player.currentBet += actual;
  player.totalBetThisHand += actual;
  room.pot += actual;

  if (player.totalChips === 0) {
    player.allIn = true;
    player.lastAction = 'all_in';
  } else {
    player.lastAction = 'call';
  }

  room.turnIdx++;
  if (room.turnTimer) { clearTimeout(room.turnTimer); room.turnTimer = null; }

  advanceToNextPlayer(room);
}

function onRaise(room: HoldemRoom, socket: Socket, userId: string, amount: number) {
  if (room.currentTurnUserId !== userId) return;

  const player = room.players.get(userId);
  if (!player || player.folded) return;

  const totalBet = amount; // total bet this round
  const raiseBy = totalBet - room.currentBet;

  if (raiseBy < room.minRaise && totalBet < player.totalChips + player.currentBet) {
    socket.emit(S2C.ERROR, { message: `Minimum raise is ${room.minRaise}.` });
    return;
  }

  const toAdd = totalBet - player.currentBet;
  if (toAdd > player.totalChips) {
    socket.emit(S2C.ERROR, { message: 'Not enough chips.' });
    return;
  }

  player.totalChips -= toAdd;
  player.currentBet = totalBet;
  player.totalBetThisHand += toAdd;
  room.pot += toAdd;
  room.lastRaiseAmount = raiseBy;
  room.currentBet = totalBet;
  room.minRaise = raiseBy;

  if (player.totalChips === 0) {
    player.allIn = true;
    player.lastAction = 'all_in';
  } else {
    player.lastAction = 'raise';
  }

  // Reopen action to all other players
  buildBettingRoundOrder(room);
  // Skip raiser in the new order
  room.turnOrder = room.turnOrder.filter((id) => id !== userId);

  if (room.turnTimer) { clearTimeout(room.turnTimer); room.turnTimer = null; }

  advanceToNextPlayer(room);
}

function onAllIn(room: HoldemRoom, userId: string) {
  if (room.currentTurnUserId !== userId) return;

  const player = room.players.get(userId);
  if (!player || player.folded) return;

  const toAdd = player.totalChips;
  const newBet = player.currentBet + toAdd;

  player.totalChips = 0;
  room.pot += toAdd;
  player.currentBet = newBet;
  player.totalBetThisHand += toAdd;
  player.allIn = true;
  player.lastAction = 'all_in';

  if (newBet > room.currentBet) {
    const raiseBy = newBet - room.currentBet;
    room.currentBet = newBet;
    if (raiseBy >= room.minRaise) {
      room.lastRaiseAmount = raiseBy;
      room.minRaise = raiseBy;
    }
    // Reopen action
    buildBettingRoundOrder(room);
    room.turnOrder = room.turnOrder.filter((id) => id !== userId);
  } else {
    room.turnIdx++;
  }

  if (room.turnTimer) { clearTimeout(room.turnTimer); room.turnTimer = null; }

  advanceToNextPlayer(room);
}

// ── Public API ─────────────────────────────────────────────────────

export function initializeHoldem(io: Server): void {
  ioRef = io;
  logger.info({ event: 'holdem_handler_initialized' });
}

export function registerHoldemHandlers(io: Server, socket: Socket): void {
  ioRef = io;

  socket.on(C2S.LIST_ROOMS, () => onListRooms(socket));
  socket.on(C2S.CREATE_ROOM, (payload) => { onCreateRoom(socket, payload).catch((err) => logger.error({ event: 'holdem_create_room_error', error: String(err) })); });
  socket.on(C2S.JOIN_ROOM, (payload) => { onJoinRoom(socket, payload).catch((err) => logger.error({ event: 'holdem_join_room_error', error: String(err) })); });
  socket.on(C2S.LEAVE_ROOM, () => { onLeaveRoom(socket).catch((err) => logger.error({ event: 'holdem_leave_room_error', error: String(err) })); });
  socket.on(C2S.UPDATE_ROOM, (payload) => onUpdateRoom(socket, payload));

  socket.on(C2S.FOLD, () => {
    const userId = socketToUserId.get(socket.id);
    if (!userId) return;
    if (!checkRateLimit(socket.id, C2S.FOLD)) return;
    const roomId = userToRoom.get(userId);
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room) return;
    onFold(room, userId);
  });

  socket.on(C2S.CHECK, () => {
    const userId = socketToUserId.get(socket.id);
    if (!userId) return;
    if (!checkRateLimit(socket.id, C2S.CHECK)) return;
    const roomId = userToRoom.get(userId);
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room) return;
    onCheck(room, socket, userId);
  });

  socket.on(C2S.CALL, () => {
    const userId = socketToUserId.get(socket.id);
    if (!userId) return;
    if (!checkRateLimit(socket.id, C2S.CALL)) return;
    const roomId = userToRoom.get(userId);
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room) return;
    onCall(room, userId);
  });

  socket.on(C2S.RAISE, (payload: unknown) => {
    const userId = socketToUserId.get(socket.id);
    if (!userId) return;
    if (!checkRateLimit(socket.id, C2S.RAISE)) return;
    const roomId = userToRoom.get(userId);
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room) return;
    const amount = typeof (payload as any)?.amount === 'number' ? Math.floor((payload as any).amount) : 0;
    onRaise(room, socket, userId, amount);
  });

  socket.on(C2S.ALL_IN, () => {
    const userId = socketToUserId.get(socket.id);
    if (!userId) return;
    if (!checkRateLimit(socket.id, C2S.ALL_IN)) return;
    const roomId = userToRoom.get(userId);
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room) return;
    onAllIn(room, userId);
  });

  socket.on(C2S.SIT_IN, () => {
    const userId = socketToUserId.get(socket.id);
    if (!userId) return;
    const roomId = userToRoom.get(userId);
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room) return;
    const player = room.players.get(userId);
    if (!player || !player.sittingOut) return;
    // Must rebuy first if busted
    if (player.totalChips === 0) {
      socket.emit(S2C.ERROR, { message: `You need to rebuy first. Buy-in is ${room.buyIn} coins.` });
      return;
    }
    player.sittingOut = false;
    broadcastPersonalizedState(room);
    // If waiting and enough players, start the hand
    if (room.phase === 'waiting') {
      const seated = getSeatedPlayers(room);
      if (seated.length >= MIN_PLAYERS_TO_START) {
        startNewHand(room);
      }
    }
  });

  socket.on(C2S.REBUY, async () => {
    const userId = socketToUserId.get(socket.id);
    if (!userId) return;
    const roomId = userToRoom.get(userId);
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room) return;
    const player = room.players.get(userId);
    if (!player) return;
    if (player.totalChips > 0) {
      socket.emit(S2C.ERROR, { message: 'You still have chips.' });
      return;
    }

    try {
      const prisma = getPrismaClient();
      const result = await prisma.$transaction(async (tx) => {
        const profile = await tx.userProfile.findUnique({
          where: { userId },
          select: { coins: true },
        });
        if (!profile || profile.coins < room.buyIn) {
          throw new Error('INSUFFICIENT_COINS');
        }
        const updated = await tx.userProfile.update({
          where: { userId },
          data: { coins: { decrement: room.buyIn } },
          select: { coins: true },
        });
        return updated.coins;
      });

      player.totalChips = room.buyIn;
      player.sessionStats.totalBuyIn += room.buyIn;
      socket.emit(S2C.BALANCE_UPDATE, { coins: result });
      logger.info({ event: 'holdem_rebuy', roomId: room.roomId, userId, buyIn: room.buyIn });

      // Auto sit-in after rebuy
      player.sittingOut = false;
      broadcastPersonalizedState(room);

      if (room.phase === 'waiting') {
        const seated = getSeatedPlayers(room);
        if (seated.length >= MIN_PLAYERS_TO_START) {
          startNewHand(room);
        }
      }
    } catch (err) {
      if (err instanceof Error && err.message === 'INSUFFICIENT_COINS') {
        socket.emit(S2C.ERROR, { message: `Not enough coins. Buy-in is ${room.buyIn}.` });
      } else {
        logger.error({ event: 'holdem_rebuy_error', userId, error: String(err) });
        socket.emit(S2C.ERROR, { message: 'Failed to rebuy.' });
      }
    }
  });

  socket.on(C2S.SHOW_CARDS, (payload: unknown) => {
    const userId = socketToUserId.get(socket.id);
    if (!userId) return;
    const roomId = userToRoom.get(userId);
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room) return;
    const player = room.players.get(userId);
    if (!player || player.holeCards.length < 2) return;
    // Only allow during results phase
    if (room.phase !== 'results' && room.phase !== 'showdown') return;

    const data = payload as any;
    const indices = Array.isArray(data?.indices) ? data.indices : [];
    // Set showCards to the valid indices (0 and/or 1)
    player.showCards = new Set(indices.filter((i: unknown) => i === 0 || i === 1));
    broadcastPersonalizedState(room);
  });

  socket.on(C2S.SIT_OUT, () => {
    const userId = socketToUserId.get(socket.id);
    if (!userId) return;
    const roomId = userToRoom.get(userId);
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room) return;
    const player = room.players.get(userId);
    if (!player || player.sittingOut) return;
    player.sittingOut = true;
    // If it's their turn, auto-fold
    if (room.currentTurnUserId === userId) {
      onFold(room, userId);
    }
    broadcastPersonalizedState(room);
  });
}

export function handleHoldemDisconnect(_io: Server, socket: Socket): void {
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

  // Auto-fold and cash out immediately
  leaveRoom(userId, socket.id).catch((err) =>
    logger.error({ event: 'holdem_disconnect_leave_error', userId, error: String(err) })
  );
}
