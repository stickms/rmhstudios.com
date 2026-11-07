/**
 * Casino stakes on hub shutdown.
 *
 * Every casino table lives in this process's memory, so a restart (each deploy
 * restarts the hub) used to drop every stake that had been debited but not yet
 * settled: bets in a blackjack/roulette/baccarat round in progress, and chips
 * seated at a Hold'em table. Each casino module now exports a
 * `…OnShutdown()` that the SIGTERM/SIGINT path in `index.ts` calls before
 * `io.close()`. Each one:
 *
 *   1. marks the module closed, so every room reads as not-live: payout timers,
 *      deal steps and the post-debit re-checks in the action handlers all
 *      become no-ops (or refund their own in-flight debit, which they already
 *      do for a room that went away);
 *   2. claims every unsettled stake SYNCHRONOUSLY — zeroing the seat's bet or
 *      chips before anything awaits — so no payout, leave or disconnect path
 *      can see the same coins afterwards;
 *   3. hands the claims to {@link settleShutdownClaims} below, which credits
 *      them through the same ledger call the handlers' refunds use, with an
 *      idempotency key, inside a deadline, and logs anything it could not
 *      confirm with enough detail to reconcile by hand.
 *
 * The deadline is bounded by Docker's stop grace: the `socket` service sets no
 * `stop_grace_period`, so it gets the 10s default and is SIGKILLed after that
 * (`config.SHUTDOWN_TIMEOUT_MS` force-exits at the same 10s). Refunds get the
 * first half; closing Prisma and the auth pool gets the rest.
 */

import { createHash, randomUUID } from 'crypto';
import { creditCoinsOn } from '../../../lib/economy/ledger-core';
import { getPrismaClient } from '../prisma-client';
import { logger } from '../logger';

export type CasinoGame = 'blackjack' | 'roulette' | 'baccarat' | 'holdem';

/** How long the casino modules may spend refunding before shutdown moves on. */
export const CASINO_SHUTDOWN_DEADLINE_MS = 5_000;

/** One stake taken off a seat at shutdown, owed back to its player. */
export interface StakeClaim {
  game: CasinoGame;
  roomId: string;
  userId: string;
  amount: number;
  /** Round / hand number, for the log line a human reconciles from. */
  round: number;
  /** The phase the room was in and what the amount is made of. */
  detail: string;
}

export interface ShutdownRefundSummary {
  game: CasinoGame;
  claims: number;
  amount: number;
  refunded: number;
  failed: number;
  /** Still awaiting the database when the deadline passed: may or may not have landed. */
  unconfirmed: number;
}

/**
 * The async stake work a module has in flight: debits awaiting the database
 * (whose handler refunds them itself once it sees the room is gone), refunds,
 * cash-outs and payout transactions. Shutdown waits for these too, within the
 * same deadline, so a refund that started just before the signal is not cut
 * off by `process.exit`.
 */
export class InFlight {
  private readonly pending = new Set<Promise<unknown>>();

  track<T>(work: Promise<T>): Promise<T> {
    this.pending.add(work);
    const done = () => {
      this.pending.delete(work);
    };
    work.then(done, done);
    return work;
  }

  get size(): number {
    return this.pending.size;
  }

  /** Resolves once nothing is in flight (work that settles may start more). */
  async drain(): Promise<void> {
    while (this.pending.size > 0) await Promise.allSettled([...this.pending]);
  }
}

/** One key per claim: a retry (or a hand re-run) of the same refund is a no-op. */
function idempotencyKeyFor(claim: StakeClaim, shutdownId: string): string {
  const key = `casino-shutdown:${claim.game}:${claim.roomId}:${claim.userId}:${shutdownId}`;
  // coin_transaction.idempotency_key is VARCHAR(128); user ids are not length-capped.
  if (key.length <= 128) return key;
  return `casino-shutdown:${createHash('sha256').update(key).digest('hex')}`;
}

const NOTES: Record<CasinoGame, string> = {
  blackjack: 'Blackjack stake refund (server restart)',
  roulette: 'Roulette stake refund (server restart)',
  baccarat: 'Baccarat stake refund (server restart)',
  holdem: "Hold'em cash out (server restart)",
};

async function creditClaim(claim: StakeClaim, idempotencyKey: string): Promise<void> {
  const opts = {
    type: 'WAGER' as const,
    entityType: claim.game,
    entityId: claim.roomId,
    note: NOTES[claim.game],
    idempotencyKey,
  };
  try {
    await creditCoinsOn(getPrismaClient(), claim.userId, claim.amount, opts);
  } catch (first) {
    // One retry. The key makes it safe even if the first attempt committed and
    // only its acknowledgement was lost: the ledger reports a replay instead.
    logger.warn({
      event: 'casino_shutdown_refund_retry',
      ...claim,
      idempotencyKey,
      error: String(first),
    });
    await creditCoinsOn(getPrismaClient(), claim.userId, claim.amount, opts);
  }
}

/**
 * Credit every claim and wait for the module's in-flight work, both bounded by
 * `deadlineMs`. Never throws: shutdown must keep going whatever the database
 * does. Every claim that failed, or had not finished by the deadline, is logged
 * at error level with game, roomId, userId, amount and the idempotency key — a
 * missing `coin_transaction` row with that key is a refund still owed, and
 * crediting it with the same key is safe to repeat.
 */
export async function settleShutdownClaims(
  game: CasinoGame,
  claims: StakeClaim[],
  inFlight: InFlight,
  deadlineMs: number = CASINO_SHUTDOWN_DEADLINE_MS,
): Promise<ShutdownRefundSummary> {
  const shutdownId = randomUUID().slice(0, 8);
  const status = new Map<StakeClaim, 'pending' | 'refunded' | 'failed'>();
  const keys = new Map<StakeClaim, string>();

  const refunds = claims.map((claim) => {
    const key = idempotencyKeyFor(claim, shutdownId);
    keys.set(claim, key);
    status.set(claim, 'pending');
    return creditClaim(claim, key).then(
      () => {
        status.set(claim, 'refunded');
      },
      (err: unknown) => {
        status.set(claim, 'failed');
        logger.error({
          event: 'casino_shutdown_refund_failed',
          ...claim,
          idempotencyKey: key,
          error: String(err),
        });
      },
    );
  });

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = await Promise.race([
    Promise.all([Promise.all(refunds), inFlight.drain()]).then(() => false),
    new Promise<boolean>((resolve) => {
      timer = setTimeout(() => resolve(true), deadlineMs);
    }),
  ]);
  if (timer) clearTimeout(timer);

  let refunded = 0;
  let failed = 0;
  let unconfirmed = 0;
  for (const claim of claims) {
    const s = status.get(claim);
    if (s === 'refunded') refunded++;
    else if (s === 'failed') failed++;
    else {
      unconfirmed++;
      logger.error({
        event: 'casino_shutdown_refund_unconfirmed',
        ...claim,
        idempotencyKey: keys.get(claim),
        deadlineMs,
      });
    }
  }
  if (timedOut && inFlight.size > 0) {
    // Their own error paths log the userId/amount when they fail; this only
    // says that some were still running when the process moved on.
    logger.error({
      event: 'casino_shutdown_inflight_unsettled',
      game,
      pending: inFlight.size,
      deadlineMs,
    });
  }

  const summary: ShutdownRefundSummary = {
    game,
    claims: claims.length,
    amount: claims.reduce((sum, c) => sum + c.amount, 0),
    refunded,
    failed,
    unconfirmed,
  };
  logger.info({ event: 'casino_shutdown_refunds', ...summary, timedOut });
  return summary;
}
