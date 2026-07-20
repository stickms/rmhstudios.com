/**
 * Creator Studio — membership tiers (platform-expansion §3).
 *
 * A creator can define up to {@link MAX_TIERS} membership tiers, each with a
 * coin price (per 30 days) and an ordered set of perk keys. Supporters join a
 * tier with coins, which extends an active {@link CreatorMembership} by 30 days
 * and writes a `MEMBERSHIP` ledger row (counted by the existing earnings
 * derivation — see `lib/creator/earnings.server.ts`, which we deliberately do
 * not touch).
 *
 * The coin transfer reuses the shared escrow primitives (`debitCoins` /
 * `creditCoins`) so the debit, counterparty credit, and ledger row commit
 * atomically, guarding against overdraft under concurrency.
 */

import { prisma } from '@/lib/prisma.server';
import { debitCoins, creditCoins, EscrowError } from '@/lib/wager/escrow.server';
import { createNotification } from '@/lib/notifications.server';
import type { CreatorTier, Prisma } from '@prisma/client';

export const MAX_TIERS = 3;
export const TIER_PRICE_MIN = 100;
export const TIER_PRICE_MAX = 10_000;

/** Membership period, in days — a join grants 30 days of access. */
const MEMBERSHIP_PERIOD_DAYS = 30;

/** Fixed perk enum. Stored in `CreatorTier.perks` as an ordered `string[]`. */
export type PerkKey = 'badge' | 'posts' | 'chat' | 'early_builds';
export const PERK_KEYS: PerkKey[] = ['badge', 'posts', 'chat', 'early_builds'];

/** A tier flattened for the wire (perks narrowed + validated to `PerkKey[]`). */
export interface SerializedTier {
  id: string;
  name: string;
  priceCoins: number;
  perks: PerkKey[];
  sortOrder: number;
  active: boolean;
}

/** Shape accepted by {@link saveTiers} (one row of the editor form). */
export interface TierInput {
  id?: string;
  name: string;
  priceCoins: number;
  perks: string[];
  sortOrder: number;
}

/** Typed error surfaced by the tier/join flows; API routes map `code` → status. */
export class TierError extends Error {
  constructor(
    message: string,
    public readonly code: 'INVALID' | 'NOT_FOUND' | 'SELF' | 'INSUFFICIENT_COINS',
  ) {
    super(message);
    this.name = 'TierError';
  }
}

/**
 * Coerce an arbitrary `perks` JSON value into a deduped, order-preserving list
 * of valid {@link PerkKey}s. Unknown entries are dropped so a stale/garbage
 * `perks` blob can never leak a non-enum key downstream.
 */
function normalizePerks(raw: unknown): PerkKey[] {
  if (!Array.isArray(raw)) return [];
  const out: PerkKey[] = [];
  for (const p of raw) {
    if (typeof p === 'string' && (PERK_KEYS as string[]).includes(p) && !out.includes(p as PerkKey)) {
      out.push(p as PerkKey);
    }
  }
  return out;
}

export function serializeTier(tier: CreatorTier): SerializedTier {
  return {
    id: tier.id,
    name: tier.name,
    priceCoins: tier.priceCoins,
    perks: normalizePerks(tier.perks),
    sortOrder: tier.sortOrder,
    active: tier.active,
  };
}

/** A creator's active tiers, cheapest-first (by `sortOrder`). */
export async function listTiers(creatorId: string): Promise<SerializedTier[]> {
  const rows = await prisma.creatorTier.findMany({
    where: { creatorId, active: true },
    orderBy: { sortOrder: 'asc' },
  });
  return rows.map(serializeTier);
}

/**
 * Replace a creator's tier set from the studio editor. Validates the count
 * (1–{@link MAX_TIERS}), price bounds, and perk keys, then reconciles:
 * - rows present with a known id → updated (re-activated if needed);
 * - rows without an id (or an id that isn't the caller's) → created fresh;
 * - previously-active rows that are gone → **deactivated** if they still back a
 *   membership (so members keep their tier reference), else hard-deleted.
 *
 * Returns the resulting active tiers. `creatorId` is trusted (the API route
 * sets it from the session), so tier ownership is scoped to it throughout.
 */
export async function saveTiers(creatorId: string, tiers: TierInput[]): Promise<SerializedTier[]> {
  if (!Array.isArray(tiers) || tiers.length === 0 || tiers.length > MAX_TIERS) {
    throw new TierError(`Provide between 1 and ${MAX_TIERS} tiers`, 'INVALID');
  }

  const cleaned = tiers.map((t, i) => {
    const name = String(t.name ?? '').trim();
    if (!name || name.length > 40) {
      throw new TierError('Each tier needs a name of 1–40 characters', 'INVALID');
    }
    if (
      !Number.isInteger(t.priceCoins) ||
      t.priceCoins < TIER_PRICE_MIN ||
      t.priceCoins > TIER_PRICE_MAX
    ) {
      throw new TierError(
        `Tier price must be between ${TIER_PRICE_MIN} and ${TIER_PRICE_MAX} coins`,
        'INVALID',
      );
    }
    return {
      id: typeof t.id === 'string' && t.id ? t.id : undefined,
      name,
      priceCoins: t.priceCoins,
      perks: normalizePerks(t.perks),
      sortOrder: Number.isInteger(t.sortOrder) ? t.sortOrder : i,
    };
  });

  const saved = await prisma.$transaction(async (tx) => {
    const existing = await tx.creatorTier.findMany({ where: { creatorId } });
    const existingIds = new Set(existing.map((e) => e.id));
    const keepIds = new Set(cleaned.filter((c) => c.id && existingIds.has(c.id)).map((c) => c.id as string));

    // Retire tiers the editor dropped. Keep the row (deactivated) if a
    // membership still points at it so the FK/history survives; else delete.
    for (const ex of existing) {
      if (!ex.active || keepIds.has(ex.id)) continue;
      const memberCount = await tx.creatorMembership.count({ where: { tierId: ex.id } });
      if (memberCount > 0) {
        await tx.creatorTier.update({ where: { id: ex.id }, data: { active: false } });
      } else {
        await tx.creatorTier.delete({ where: { id: ex.id } });
      }
    }

    const result: CreatorTier[] = [];
    for (const c of cleaned) {
      if (c.id && existingIds.has(c.id)) {
        result.push(
          await tx.creatorTier.update({
            where: { id: c.id },
            data: {
              name: c.name,
              priceCoins: c.priceCoins,
              perks: c.perks as Prisma.InputJsonValue,
              sortOrder: c.sortOrder,
              active: true,
            },
          }),
        );
      } else {
        result.push(
          await tx.creatorTier.create({
            data: {
              creatorId,
              name: c.name,
              priceCoins: c.priceCoins,
              perks: c.perks as Prisma.InputJsonValue,
              sortOrder: c.sortOrder,
            },
          }),
        );
      }
    }
    return result;
  });

  return saved.sort((a, b) => a.sortOrder - b.sortOrder).map(serializeTier);
}

/**
 * Join (or renew) a creator's tier with coins. Single transaction: atomic
 * debit of the supporter, credit of the creator, a `MEMBERSHIP` ledger row, and
 * an upsert of the unique `(creatorId, supporterId)` membership with the tier
 * and a fresh 30-day expiry (renewing early stacks onto the remaining time).
 * Notifies the creator afterward (best-effort).
 *
 * Throws {@link TierError} on self-join, unknown/inactive tier, or insufficient
 * coins.
 */
export async function joinTier(
  supporterId: string,
  creatorId: string,
  tierId: string,
): Promise<{ expiresAt: Date; priceCoins: number; tierName: string }> {
  if (supporterId === creatorId) {
    throw new TierError('You cannot support yourself', 'SELF');
  }

  const tier = await prisma.creatorTier.findFirst({
    where: { id: tierId, creatorId, active: true },
  });
  if (!tier) throw new TierError('That tier is not available', 'NOT_FOUND');
  const price = tier.priceCoins;

  const now = new Date();
  try {
    const expiresAt = await prisma.$transaction(async (tx) => {
      await debitCoins(tx, supporterId, price);
      await creditCoins(tx, creatorId, price);
      await tx.coinTransaction.create({
        data: {
          senderId: supporterId,
          recipientId: creatorId,
          amount: price,
          type: 'MEMBERSHIP',
          entityType: 'membership',
          entityId: creatorId,
          note: `Joined ${tier.name}`.slice(0, 280),
        },
      });

      const existing = await tx.creatorMembership.findUnique({
        where: { creatorId_supporterId: { creatorId, supporterId } },
        select: { expiresAt: true },
      });
      const base = existing && existing.expiresAt > now ? existing.expiresAt : now;
      const nextExpiry = new Date(base.getTime() + MEMBERSHIP_PERIOD_DAYS * 24 * 60 * 60 * 1000);

      await tx.creatorMembership.upsert({
        where: { creatorId_supporterId: { creatorId, supporterId } },
        create: { creatorId, supporterId, priceCoins: price, tierId, startedAt: now, expiresAt: nextExpiry },
        update: { priceCoins: price, tierId, expiresAt: nextExpiry },
      });
      return nextExpiry;
    });

    void createNotification({
      userId: creatorId,
      actorId: supporterId,
      type: 'SYSTEM',
      entityType: 'membership',
      entityId: tier.id,
      preview: `You have a new ${tier.name} supporter!`,
      link: '/creator-studio',
    }).catch(() => {});

    return { expiresAt, priceCoins: price, tierName: tier.name };
  } catch (error) {
    if (error instanceof EscrowError) {
      if (error.code === 'INSUFFICIENT_COINS') {
        throw new TierError('Not enough coins', 'INSUFFICIENT_COINS');
      }
      throw new TierError('Invalid tier price', 'INVALID');
    }
    throw error;
  }
}

/**
 * True when `viewerId` holds an active (unexpired) membership of `creatorId`.
 * Used by the feed audience predicate for `SUPPORTERS`-only posts (wired by the
 * feed integrator) — deliberately does NOT treat the creator as their own
 * supporter; callers handle the author case separately.
 */
export async function isSupporterOf(
  viewerId: string | null | undefined,
  creatorId: string,
): Promise<boolean> {
  if (!viewerId) return false;
  const membership = await prisma.creatorMembership.findUnique({
    where: { creatorId_supporterId: { creatorId, supporterId: viewerId } },
    select: { expiresAt: true },
  });
  return !!membership && membership.expiresAt.getTime() > Date.now();
}

/**
 * Which of `viewerIds` are active supporters of `creatorId`, as a Set — a
 * batched lookup for rendering supporter badges next to authors within a
 * creator's own threads without an N+1.
 */
export async function getSupporterBadgeMap(
  viewerIds: string[],
  creatorId: string,
): Promise<Set<string>> {
  const ids = Array.from(new Set(viewerIds.filter(Boolean)));
  if (ids.length === 0) return new Set();
  const rows = await prisma.creatorMembership.findMany({
    where: { creatorId, supporterId: { in: ids }, expiresAt: { gt: new Date() } },
    select: { supporterId: true },
  });
  return new Set(rows.map((r) => r.supporterId));
}
