/**
 * Blackjack — the stored form of a table (third-pass audit OP3).
 *
 * What a table is once everything tied to a live process is taken away:
 * timers, deadlines, socket ids and the per-seat in-flight lock. Everything
 * the round needs to continue is here, including the whole shoe in draw
 * order, so a restored round draws the cards the old process would have drawn.
 *
 * Pure: no socket, database or store. `blackjack.ts` turns a live room into
 * this and back; `table-store.ts` holds the JSON.
 */

import { z } from 'zod';
import type { StakeClaim } from './casino-shutdown';
import { stakeKeys } from './stake-keys';

export const BLACKJACK_TABLE_VERSION = 1;

const KEYS = stakeKeys('bj');

const CardSchema = z.object({
  suit: z.enum(['H', 'D', 'C', 'S']),
  rank: z.enum(['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']),
});

const PlayerStatusSchema = z.enum(['waiting', 'betting', 'playing', 'standing', 'busted', 'blackjack', 'done']);
const HandResultSchema = z.enum(['win', 'lose', 'push', 'blackjack']).nullable();

const HandSchema = z.object({
  cards: z.array(CardSchema),
  bet: z.number().int().min(0),
  status: PlayerStatusSchema,
  result: HandResultSchema,
  payout: z.number(),
  isSplit: z.boolean(),
  fromSplitAces: z.boolean(),
  doubled: z.boolean(),
});

const SeatSchema = z.object({
  seatIndex: z.number().int(),
  userId: z.string().min(1),
  userName: z.string(),
  avatarUrl: z.string().nullable(),
  bet: z.number().int().min(0),
  status: PlayerStatusSchema,
  result: HandResultSchema,
  payout: z.number(),
  insuranceBet: z.number().int().min(0),
  insuranceDecision: z.enum(['pending', 'taken', 'declined']),
  insuranceResult: z.enum(['won', 'lost']).nullable(),
  hands: z.array(HandSchema),
  activeHandIndex: z.number().int(),
  sessionStats: z.object({
    totalBet: z.number(),
    totalWon: z.number(),
    handsPlayed: z.number(),
    handsWon: z.number(),
    blackjacks: z.number(),
  }),
  pendingRemoval: z.boolean(),
  /** Names this seat's stake for this round in the ledger's idempotency keys. `null` before a bet. */
  stakeId: z.string().nullable(),
});

/**
 * `dealing` is absent on purpose: the deal runs to the next phase inside one
 * synchronous call, so no snapshot can be taken in it.
 */
const STORED_PHASES = ['idle', 'betting', 'insurance', 'player_turns', 'dealer_turn', 'payout', 'results'] as const;

export const StoredBlackjackTableSchema = z.object({
  v: z.literal(BLACKJACK_TABLE_VERSION),
  roomId: z.string().min(1),
  name: z.string(),
  ownerId: z.string(),
  ownerName: z.string(),
  maxPlayers: z.number().int(),
  privacy: z.enum(['public', 'unlisted']),
  joinCode: z.string(),
  phase: z.enum(STORED_PHASES),
  roundNumber: z.number().int(),
  players: z.array(SeatSchema),
  dealerHand: z.array(CardSchema),
  dealerHoleRevealed: z.boolean(),
  /** The whole shoe. Cards are drawn from the end. */
  shoe: z.array(CardSchema),
  currentTurnUserId: z.string().nullable(),
  turnOrder: z.array(z.string()),
  turnIndex: z.number().int(),
  savedAt: z.number(),
});

export type StoredBlackjackTable = z.infer<typeof StoredBlackjackTableSchema>;
export type StoredBlackjackSeat = StoredBlackjackTable['players'][number];

/** Stored JSON to a table, or `null` when it is corrupt or from another version. Never throws. */
export function parseStoredBlackjackTable(raw: unknown): StoredBlackjackTable | null {
  const parsed = StoredBlackjackTableSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/**
 * What a seat has debited for this round and not been paid for: every hand's
 * bet once dealt (doubles and splits included), else the base bet, plus
 * insurance. The same sum the shutdown refund has always claimed.
 */
export function seatStake(seat: StoredBlackjackSeat): number {
  const hands = seat.hands.reduce((sum, h) => sum + h.bet, 0);
  return (seat.hands.length > 0 ? hands : seat.bet) + seat.insuranceBet;
}

/**
 * Phases whose stakes are debited but not settled. `payout` is excluded: its
 * settlement transaction is in flight and owns those stakes (it is keyed, so
 * running it again after a restart pays nothing twice). `results` is settled;
 * `idle` holds none.
 */
const UNSETTLED: ReadonlySet<StoredBlackjackTable['phase']> = new Set(['betting', 'insurance', 'player_turns', 'dealer_turn']);

/** The ledger key under which one seat's stake for one round is paid out. */
export function payoutKey(stakeId: string): string {
  return KEYS.payout(stakeId);
}

/**
 * The ledger key under which one seat's stake for one round is given back
 * unplayed. Restore looks these up: a stored table whose stake has a return
 * row is a table the old process refunded after its last successful save.
 */
export function returnKey(stakeId: string): string {
  return KEYS.returned(stakeId);
}

/**
 * The refunds owed for a table that could not be saved at shutdown: one claim
 * per seat with an unsettled stake, keyed by that stake so a later restore of
 * an older stored copy of the same table can see it was returned.
 */
export function unsavedTableClaims(table: StoredBlackjackTable): StakeClaim[] {
  if (!UNSETTLED.has(table.phase)) return [];
  const claims: StakeClaim[] = [];
  for (const seat of table.players) {
    const amount = seatStake(seat);
    if (amount <= 0 || !seat.stakeId) continue;
    claims.push({
      game: 'blackjack',
      roomId: table.roomId,
      userId: seat.userId,
      amount,
      round: table.roundNumber,
      detail: `phase=${table.phase} hands=${seat.hands.length} insurance=${seat.insuranceBet} (table not saved)`,
      idempotencyKey: returnKey(seat.stakeId),
    });
  }
  return claims;
}
