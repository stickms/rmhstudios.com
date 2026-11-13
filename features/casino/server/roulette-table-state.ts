/**
 * Roulette — the stored form of a table (third-pass audit OP3).
 *
 * What a table is once everything tied to a live process is taken away:
 * timers, deadlines and socket ids. Everything the round needs to continue is
 * here, including the number the wheel already landed on (`lastResult` while
 * the phase is `spinning`), so a restored spin pays the result the old process
 * drew and never spins again.
 *
 * Pure: no socket, database or store. `roulette.ts` turns a live room into
 * this and back; `table-store.ts` holds the JSON.
 */

import { z } from 'zod';
import type { StakeClaim } from './casino-shutdown';
import { stakeKeys } from './stake-keys';

export const ROULETTE_TABLE_VERSION = 1;

/** `rl-payout:<stakeId>` and `rl-return:<stakeId>` (`stake-ledger.ts`). */
export const ROULETTE_STAKE_KEYS = stakeKeys('rl');

const BET_TYPES = [
  'straight',
  'split',
  'street',
  'corner',
  'line',
  'topline',
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
] as const;

/** A pocket: -1 is the double zero. */
const PocketSchema = z.number().int().min(-1).max(36);

const BetSchema = z.object({
  type: z.enum(BET_TYPES),
  numbers: z.array(PocketSchema),
  amount: z.number().int().min(1),
});

const SeatSchema = z.object({
  seatIndex: z.number().int(),
  userId: z.string().min(1),
  userName: z.string(),
  avatarUrl: z.string().nullable(),
  bets: z.array(BetSchema),
  totalBetThisRound: z.number().int().min(0),
  lastPayout: z.number(),
  sessionStats: z.object({ totalBet: z.number(), totalWon: z.number(), roundsPlayed: z.number() }),
  pendingRemoval: z.boolean(),
  /**
   * Names the bets on this seat in the ledger's idempotency keys: minted by
   * the first bet, dropped when the bets are cleared or a new betting phase
   * opens. `null` when the seat has no bets.
   */
  stakeId: z.string().nullable(),
});

export const StoredRouletteTableSchema = z
  .object({
    v: z.literal(ROULETTE_TABLE_VERSION),
    roomId: z.string().min(1),
    name: z.string(),
    ownerId: z.string(),
    ownerName: z.string(),
    maxPlayers: z.number().int(),
    privacy: z.enum(['public', 'unlisted']),
    joinCode: z.string(),
    phase: z.enum(['idle', 'betting', 'spinning', 'results']),
    /** The settlement of this spin had started (its statistics and history are already counted). */
    settling: z.boolean(),
    roundNumber: z.number().int(),
    players: z.array(SeatSchema),
    /** While `spinning`: the number this spin landed on. Otherwise the previous round's. */
    lastResult: PocketSchema.nullable(),
    history: z.array(PocketSchema),
    savedAt: z.number(),
  })
  // A spin with no number cannot be paid, and must never be spun again.
  .refine((t) => t.phase !== 'spinning' || t.lastResult !== null);

export type StoredRouletteTable = z.infer<typeof StoredRouletteTableSchema>;
export type StoredRouletteSeat = StoredRouletteTable['players'][number];

/** Stored JSON to a table, or `null` when it is corrupt or from another version. Never throws. */
export function parseStoredRouletteTable(raw: unknown): StoredRouletteTable | null {
  const parsed = StoredRouletteTableSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** What a seat has debited for this round and not been paid for: the sum of its bets. */
export function seatStake(seat: StoredRouletteSeat): number {
  return seat.bets.reduce((sum, b) => sum + b.amount, 0);
}

/**
 * Bets are debited but not settled while betting is open and while the wheel
 * spins, until the settlement starts (`settling`): from then on its
 * transaction owns them, and it is keyed, so running it again pays nothing
 * twice. `results` is settled; `idle` holds none.
 */
export function tableUnsettled(table: Pick<StoredRouletteTable, 'phase' | 'settling'>): boolean {
  return table.phase === 'betting' || (table.phase === 'spinning' && !table.settling);
}

/**
 * The refunds owed for a table that could not be saved at shutdown: one claim
 * per seat with unsettled bets, keyed by that stake so a later restore of an
 * older stored copy of the same table can see it was returned.
 */
export function unsavedTableClaims(table: StoredRouletteTable): StakeClaim[] {
  if (!tableUnsettled(table)) return [];
  const claims: StakeClaim[] = [];
  for (const seat of table.players) {
    const amount = seatStake(seat);
    if (amount <= 0 || !seat.stakeId) continue;
    claims.push({
      game: 'roulette',
      roomId: table.roomId,
      userId: seat.userId,
      amount,
      round: table.roundNumber,
      detail: `phase=${table.phase} bets=${seat.bets.length} (table not saved)`,
      idempotencyKey: ROULETTE_STAKE_KEYS.returned(seat.stakeId),
    });
  }
  return claims;
}
