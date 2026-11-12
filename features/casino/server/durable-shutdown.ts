/**
 * Casino — hub shutdown for a game whose tables are on the durable store
 * (third-pass audit OP3): save instead of refund.
 *
 * The caller has already, synchronously and before anything awaited (so before
 * `io.close()` runs the disconnect fan-out): marked its module closed, stopped
 * every timer, taken a snapshot of every table and emptied its maps. From then
 * on no handler, timer or disconnect can change a table or move its coins, so
 * the snapshots are what the next process continues from.
 *
 * What is still in flight needs no claim:
 *  - a debit that has not landed on a seat is not in a snapshot; its handler
 *    sees the room is gone and refunds it itself;
 *  - a settlement transaction is in its snapshot as "settling"; the next
 *    process either finds its payout rows or runs the settlement again, and
 *    the per-stake keys make every credit that already landed a no-op.
 *
 * A stake is saved or refunded, never both. If the store does not acknowledge
 * the write (rejected, or no answer in half the deadline), `claimsFor` names
 * every unsettled stake and each is refunded under its `<game>-return:<stakeId>`
 * key. The store may still hold the table (the write landed after all, or an
 * older coalesced save is there): restore looks those keys up and empties any
 * seat that has one (`stake-ledger.ts`).
 */

import { logger } from '../../../server/socket-server/logger';
import {
  settleShutdownClaims,
  type CasinoGame,
  type InFlight,
  type ShutdownRefundSummary,
  type StakeClaim,
} from './casino-shutdown';
import type { TablePersistence } from './table-persistence';

export async function saveTablesOrRefund<T extends { roomId: string }>(
  game: CasinoGame,
  tables: TablePersistence,
  stored: T[],
  claimsFor: (table: T) => StakeClaim[],
  inFlight: InFlight,
  deadlineMs: number,
): Promise<ShutdownRefundSummary> {
  const startedAt = Date.now();
  const outcome = await tables.saveAtShutdown(
    stored.map((t) => ({ id: t.roomId, data: t })),
    deadlineMs / 2,
  );
  const remainingMs = Math.max(0, deadlineMs - (Date.now() - startedAt));

  if (outcome !== 'saved') {
    const claims = stored.flatMap(claimsFor);
    logger.error({ event: 'casino_tables_not_saved_refunding', game, outcome, tables: stored.length, claims: claims.length });
    return settleShutdownClaims(game, claims, inFlight, remainingMs);
  }
  // Nothing to refund; still wait (inside the deadline) for in-flight work.
  const summary = await settleShutdownClaims(game, [], inFlight, remainingMs);
  return { ...summary, saved: stored.length };
}
