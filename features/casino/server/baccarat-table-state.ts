/**
 * Baccarat — the stored form of a table (third-pass audit OP3).
 *
 * What a table is once everything tied to a live process is taken away:
 * timers, deadlines, socket ids and the reveal animation's position.
 * Everything the round needs to continue is here: both hands as drawn so far
 * and the whole shoe in draw order, so a restored deal draws the third cards
 * the old process would have drawn.
 *
 * Pure: no socket, database or store. `baccarat.ts` turns a live room into
 * this and back; `table-store.ts` holds the JSON.
 */

import { z } from 'zod';
import type { StakeClaim } from './casino-shutdown';
import { stakeKeys } from './stake-keys';

export const BACCARAT_TABLE_VERSION = 1;

/** `bacc-payout:<stakeId>` and `bacc-return:<stakeId>` (`stake-ledger.ts`). */
export const BACCARAT_STAKE_KEYS =
  stakeKeys(
    'bacc',
  );

const CardSchema =
  z.object(
    {
      suit: z.enum(
        [
          'H',
          'D',
          'C',
          'S',
        ],
      ),
      rank: z.enum(
        [
          '2',
          '3',
          '4',
          '5',
          '6',
          '7',
          '8',
          '9',
          '10',
          'J',
          'Q',
          'K',
          'A',
        ],
      ),
    },
  );

const amount =
  z
    .number()
    .int()
    .min(
      0,
    );

const BetsSchema =
  z.object(
    {
      player:
        amount,
      banker:
        amount,
      tie: amount,
      playerPair:
        amount,
      bankerPair:
        amount,
      playerDragon:
        amount,
      bankerDragon:
        amount,
    },
  );

const SeatSchema =
  z.object(
    {
      seatIndex:
        z
          .number()
          .int(),
      userId:
        z
          .string()
          .min(
            1,
          ),
      userName:
        z.string(),
      avatarUrl:
        z
          .string()
          .nullable(),
      bets: BetsSchema,
      totalBetThisRound:
        z
          .number()
          .int()
          .min(
            0,
          ),
      lastPayout:
        z.number(),
      sessionStats:
        z.object(
          {
            totalBet:
              z.number(),
            totalWon:
              z.number(),
            roundsPlayed:
              z.number(),
          },
        ),
      pendingRemoval:
        z.boolean(),
      /**
       * Names the bets on this seat in the ledger's idempotency keys: minted by
       * the first bet, dropped when the bets are cleared or a new betting phase
       * opens. `null` when the seat has no bets.
       */
      stakeId:
        z
          .string()
          .nullable(),
    },
  );

export const StoredBaccaratTableSchema =
  z
    .object(
      {
        v: z.literal(
          BACCARAT_TABLE_VERSION,
        ),
        roomId:
          z
            .string()
            .min(
              1,
            ),
        name: z.string(),
        ownerId:
          z.string(),
        ownerName:
          z.string(),
        maxPlayers:
          z
            .number()
            .int(),
        privacy:
          z.enum(
            [
              'public',
              'unlisted',
            ],
          ),
        joinCode:
          z.string(),
        phase:
          z.enum(
            [
              'idle',
              'betting',
              'dealing',
              'drawing',
              'results',
            ],
          ),
        /** The settlement of this round had started (its statistics and history are already counted). */
        settling:
          z.boolean(),
        roundNumber:
          z
            .number()
            .int(),
        players:
          z.array(
            SeatSchema,
          ),
        /** The whole shoe. Cards are drawn from the end. */
        shoe: z.array(
          CardSchema,
        ),
        /** Both hands as drawn so far: two cards each once dealt, three after a draw. */
        playerHand:
          z
            .array(
              CardSchema,
            )
            .max(
              3,
            ),
        bankerHand:
          z
            .array(
              CardSchema,
            )
            .max(
              3,
            ),
        history:
          z.array(
            z.enum(
              [
                'player',
                'banker',
                'tie',
              ],
            ),
          ),
        savedAt:
          z.number(),
      },
    )
    // The first four cards are drawn in the same step that opens the deal.
    .refine(
      (
        t,
      ) =>
        (t.phase !==
          'dealing' &&
          t.phase !==
            'drawing') ||
        (t
          .playerHand
          .length >=
          2 &&
          t
            .bankerHand
            .length >=
            2),
    );

export type StoredBaccaratTable =
  z.infer<
    typeof StoredBaccaratTableSchema
  >;
export type StoredBaccaratSeat =
  StoredBaccaratTable['players'][number];

/** Stored JSON to a table, or `null` when it is corrupt or from another version. Never throws. */
export function parseStoredBaccaratTable(
  raw: unknown,
): StoredBaccaratTable | null {
  const parsed =
    StoredBaccaratTableSchema.safeParse(
      raw,
    );
  return parsed.success
    ? parsed.data
    : null;
}

/** What a seat has debited for this round and not been paid for: the sum of its bets. */
export function seatStake(
  seat: StoredBaccaratSeat,
): number {
  const b =
    seat.bets;
  return (
    b.player +
    b.banker +
    b.tie +
    b.playerPair +
    b.bankerPair +
    b.playerDragon +
    b.bankerDragon
  );
}

/**
 * Bets are debited but not settled while betting is open and while the cards
 * are dealt, until the settlement starts (`settling`): from then on its
 * transaction owns them, and it is keyed, so running it again pays nothing
 * twice. `results` is settled; `idle` holds none.
 */
export function tableUnsettled(
  table: Pick<
    StoredBaccaratTable,
    | 'phase'
    | 'settling'
  >,
): boolean {
  return (
    table.phase ===
      'betting' ||
    ((table.phase ===
      'dealing' ||
      table.phase ===
        'drawing') &&
      !table.settling)
  );
}

/**
 * The refunds owed for a table that could not be saved at shutdown: one claim
 * per seat with unsettled bets, keyed by that stake so a later restore of an
 * older stored copy of the same table can see it was returned.
 */
export function unsavedTableClaims(
  table: StoredBaccaratTable,
): StakeClaim[] {
  if (
    !tableUnsettled(
      table,
    )
  )
    return [];
  const claims: StakeClaim[] =
    [];
  for (const seat of table.players) {
    const stake =
      seatStake(
        seat,
      );
    if (
      stake <=
        0 ||
      !seat.stakeId
    )
      continue;
    claims.push(
      {
        game: 'baccarat',
        roomId:
          table.roomId,
        userId:
          seat.userId,
        amount:
          stake,
        round:
          table.roundNumber,
        detail: `phase=${table.phase} (table not saved)`,
        idempotencyKey:
          BACCARAT_STAKE_KEYS.returned(
            seat.stakeId,
          ),
      },
    );
  }
  return claims;
}
