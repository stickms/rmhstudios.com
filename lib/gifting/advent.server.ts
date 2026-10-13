/**
 * Advent calendar (G2) — server side.
 *
 * ── Money ───────────────────────────────────────────────────────────────────
 * A FAUCET (registered as `advent-door` in lib/economy/flows.ts): ADVENT_COINS
 * per member per day, Dec 1–24 only. Once-per-day is enforced twice: the
 * `advent_claim` unique key, and the ledger idempotency key
 * `advent:<user>:<year>:<door>` — so even two racing requests pay one door once.
 */
import { prisma } from '@/lib/prisma.server';
import { awardCoins } from '@/lib/coins.server';
import { ADVENT_COINS, adventDoorFor, adventRefId, type AdventState } from '@/lib/gifting/advent';

export async function getAdventState(userId: string, now = new Date()): Promise<AdventState> {
  const year = now.getUTCFullYear();
  const rows = await prisma.adventClaim.findMany({
    where: { userId, year },
    select: { door: true },
    orderBy: { door: 'asc' },
  });
  return { year, today: adventDoorFor(now), opened: rows.map((r) => r.door), coins: ADVENT_COINS };
}

export type AdventClaimResult =
  | { ok: true; door: number; coins: number }
  | { ok: false; error: 'closed' | 'already-opened' | 'failed' };

export async function claimAdventDoor(
  userId: string,
  now = new Date(),
): Promise<AdventClaimResult> {
  const door = adventDoorFor(now);
  if (door === null) return { ok: false, error: 'closed' };
  const year = now.getUTCFullYear();

  const existing = await prisma.adventClaim.findUnique({
    where: { userId_year_door: { userId, year, door } },
    select: { id: true },
  });
  if (existing) return { ok: false, error: 'already-opened' };

  const paid = await awardCoins(userId, ADVENT_COINS, {
    type: 'REWARD',
    note: `Advent calendar, door ${door}`,
    entityType: 'advent',
    entityId: `${year}-${door}`,
    idempotencyKey: adventRefId(userId, year, door),
  });
  if (!paid) return { ok: false, error: 'failed' };

  try {
    await prisma.adventClaim.create({ data: { userId, year, door, coins: ADVENT_COINS } });
  } catch (err) {
    // A racing request created the row; the idempotency key already stopped a second payout.
    if ((err as { code?: string }).code === 'P2002') return { ok: false, error: 'already-opened' };
    throw err;
  }
  return { ok: true, door, coins: ADVENT_COINS };
}
