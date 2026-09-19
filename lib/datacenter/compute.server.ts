/**
 * Selling compute, and reading the estate's real load (W2). Server-only.
 *
 * The capacity meters on `/rmh-datacenter` used to be drawn from a static
 * file. These are the numbers underneath them: what the platform has actually
 * spent on AI this month, how many images it has generated, how many vibe
 * pages exist. The fiction now reports the infrastructure.
 */

import { prisma } from '@/lib/prisma.server';
import { debitCoins } from '@/lib/economy/ledger.server';
import { AppError } from '@/lib/errors/codes';
import {
  MAX_PACKS_PER_MONTH,
  monthKey,
  packById,
  totalGrants,
  utilisation,
} from '@/lib/datacenter/compute';

/** One meter on the page. */
export interface Meter {
  id: string;
  used: number;
  capacity: number;
  utilisation: number;
}

/**
 * The estate's load, from the ledgers that already record it.
 *
 * Platform-wide rather than per-member: this is the DATACENTER's own reading,
 * and a capacity meter that showed one visitor's usage would be describing a
 * different building to every reader.
 *
 * Capacities are deliberately round numbers rather than a contracted figure
 * from `campuses.ts`: those are facilities facts about a fictional estate, and
 * conflating them with a real quota would make both harder to trust.
 */
export async function readLoad(now: Date = new Date()): Promise<Meter[]> {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const [aiSpend, images, vibePages, grantedMicros] = await Promise.all([
    prisma.aiUsage.aggregate({
      where: { createdAt: { gte: monthStart } },
      _sum: { costMicros: true },
    }),
    // ImageGenBudget is keyed by UTC day with a `count`, not a running total,
    // so the month's figure is a sum over this month's rows.
    prisma.imageGenBudget.aggregate({
      where: { day: { gte: monthKey(now) } },
      _sum: { count: true },
    }),
    prisma.vibePage.count(),
    prisma.computeGrant.aggregate({
      where: { month: monthKey(now) },
      _sum: { aiMicros: true },
    }),
  ]);

  // Headroom is the platform's own budget plus everything members have bought
  // on top of it — so a busy month where people bought capacity reads as more
  // capacity, which is what buying it means.
  const aiCapacity = 200_000_000 + Number(grantedMicros._sum.aiMicros ?? 0);
  const aiUsed = Number(aiSpend._sum.costMicros ?? 0);
  const imagesUsed = images._sum.count ?? 0;

  return [
    { id: 'compute', used: aiUsed, capacity: aiCapacity, utilisation: utilisation(aiUsed, aiCapacity) },
    {
      id: 'render',
      used: imagesUsed,
      capacity: 50_000,
      utilisation: utilisation(imagesUsed, 50_000),
    },
    {
      id: 'hosting',
      used: vibePages,
      capacity: 25_000,
      utilisation: utilisation(vibePages, 25_000),
    },
  ];
}

/** What one member holds this month. */
export async function grantsFor(userId: string, now: Date = new Date()) {
  const rows = await prisma.computeGrant.findMany({
    where: { userId, month: monthKey(now) },
    select: { aiMicros: true, imageGens: true, librarySlots: true, coinsPaid: true, createdAt: true },
  });
  return { packs: rows.length, ...totalGrants(rows) };
}

/**
 * Buy a pack.
 *
 * The debit and the grant are one transaction: a member whose coins left and
 * whose compute did not arrive has no way to tell the difference from being
 * robbed, and a support ticket cannot distinguish it either.
 *
 * The debit is typed PURCHASE, not WAGER — buying compute is not a bet, so the
 * responsible-play check (W8) correctly does not gate it. That distinction is
 * the whole reason W8 keys on the ledger type rather than on the route.
 */
export async function buyPack(
  userId: string,
  packId: string,
  now: Date = new Date(),
): Promise<{ packs: number; aiMicros: number; imageGens: number; librarySlots: number }> {
  const pack = packById(packId);
  if (!pack) throw new AppError('NOT_FOUND');

  const month = monthKey(now);

  return prisma.$transaction(async (tx) => {
    const held = await tx.computeGrant.count({ where: { userId, month } });
    if (held >= MAX_PACKS_PER_MONTH) {
      throw new AppError('QUOTA_EXCEEDED', { limit: MAX_PACKS_PER_MONTH });
    }

    await debitCoins(userId, pack.coins, {
      tx,
      type: 'PURCHASE',
      entityType: 'compute-pack',
      entityId: pack.id,
      note: `RMH Datacenter — ${pack.name}`,
      // One pack per member per pack-type per minute is a duplicate submit,
      // not a second purchase. Coarse on purpose: a member who genuinely wants
      // two waits a minute, and nobody double-charges in the meantime.
      idempotencyKey: `compute:${userId}:${pack.id}:${Math.floor(now.getTime() / 60_000)}`,
    });

    await tx.computeGrant.create({
      data: {
        userId,
        month,
        aiMicros: pack.aiMicros,
        imageGens: pack.imageGens,
        librarySlots: pack.librarySlots,
        coinsPaid: pack.coins,
      },
    });

    const rows = await tx.computeGrant.findMany({
      where: { userId, month },
      select: { aiMicros: true, imageGens: true, librarySlots: true },
    });
    return { packs: rows.length, ...totalGrants(rows) };
  });
}

/**
 * NOTE: the ceiling itself is computed in `lib/ai/budget.server.ts`, which now
 * adds this month's grants to the tier allowance. It is there rather than here
 * because that is where every AI route already asks the question, and a second
 * answer in a second file is how two ceilings that nearly agree get shipped.
 */
