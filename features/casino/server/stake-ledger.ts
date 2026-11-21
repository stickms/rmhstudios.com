/**
 * Casino — what the ledger says became of a stake (third-pass audit OP3).
 *
 * A durable table names each seat's stake for a round with a `stakeId` and
 * moves its coins under two idempotency keys built from it:
 *
 *   `<game>-payout:<stakeId>`  the round's settlement credited this stake;
 *   `<game>-return:<stakeId>`  the stake was given back unplayed (the player
 *                              left or cleared during betting, or the table
 *                              could not be saved at shutdown).
 *
 * Restore reads both for every staked seat it is about to bring back, because
 * the stored copy of a table can be older than either row:
 *
 *  - a `return` row: the seat's stake is gone; the seat comes back empty;
 *  - a `payout` row on ANY seat: the round was settled (one transaction pays
 *    the whole table), so the stored round is not played again. Without this a
 *    round whose saves had all failed was replayed after a crash, and a seat
 *    could put a new stake (a double, a split, another bet) on a round that
 *    had already paid.
 *
 * A seat the settlement paid nothing has no row: a round in which every seat
 * lost leaves no trace here (the ledger holds no zero-amount rows).
 */

// Relative, never `@/`: this module is bundled into the socket hub
// (server/CLAUDE.md gotcha 7). `escrow-core` imports no client and no `.server`
// module, so the read runs on the hub's own Prisma client.
import { getPrismaClient } from '../../../server/socket-server/prisma-client';
import { readSettledKeys } from '../../../lib/economy/escrow-core';
import type { StakeFate, StakeKeys } from './stake-keys';

/** The fate of each stake that has one. Throws if the ledger cannot be read. */
export async function readStakeFates(keys: StakeKeys, stakeIds: Iterable<string>): Promise<Map<string, StakeFate>> {
  const byKey = new Map<string, [stakeId: string, fate: StakeFate]>();
  for (const id of stakeIds) {
    byKey.set(keys.returned(id), [id, 'returned']);
    byKey.set(keys.payout(id), [id, 'paid']);
  }
  const fates = new Map<string, StakeFate>();
  // No ids, no query: `readSettledKeys` returns [] for an empty map without
  // touching the client.
  if (byKey.size === 0) return fates;
  for (const [stakeId, fate] of await readSettledKeys(getPrismaClient(), byKey)) {
    fates.set(stakeId, fate);
  }
  return fates;
}
