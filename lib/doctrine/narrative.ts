/**
 * Doctrine Engine — Narrative Control System
 *
 * Feature flags as disclosures. Features are not released — they are disclosed.
 */

import { prisma } from '@/lib/prisma.server';
import { apiCache } from '@/lib/cache';
import type { DisclosureStatus, TierId } from './types';
import { TIER_HIERARCHY } from './constants';

/**
 * Check if a feature (identified by disclosure codename) is available.
 */
export async function isFeatureDisclosed(codename: string): Promise<boolean> {
  const cacheKey = `doctrine:disclosure:status:${codename}`;
  const cached = apiCache.get<string>(cacheKey);
  if (cached !== undefined) return cached === 'DISCLOSED';

  const disclosure = await prisma.doctrineDisclosure.findFirst({
    where: { codename },
    select: { status: true },
  });

  const status = disclosure?.status ?? 'UNKNOWN';
  apiCache.set(cacheKey, status, 300_000); // 5 minute cache

  return status === 'DISCLOSED';
}

/**
 * Get disclosures visible to a user based on their tier.
 */
export async function getDisclosuresForTier(userTier: TierId) {
  const cacheKey = `doctrine:disclosures:${userTier}`;
  const cached = apiCache.get<Awaited<ReturnType<typeof fetchDisclosures>>>(cacheKey);
  if (cached) return cached;

  const result = await fetchDisclosures(userTier);
  apiCache.set(cacheKey, result, 60_000);
  return result;
}

async function fetchDisclosures(userTier: TierId) {
  const tierLevel = TIER_HIERARCHY[userTier];

  // Operators see all (CLASSIFIED, TEASED, DISCLOSED)
  // Insiders see TEASED + DISCLOSED
  // Public sees only DISCLOSED
  const statusFilter: DisclosureStatus[] = [];
  if (tierLevel >= TIER_HIERARCHY.OPERATOR) {
    statusFilter.push('CLASSIFIED', 'TEASED', 'DISCLOSED', 'ARCHIVED');
  } else if (tierLevel >= TIER_HIERARCHY.INSIDER) {
    statusFilter.push('TEASED', 'DISCLOSED', 'ARCHIVED');
  } else {
    statusFilter.push('DISCLOSED', 'ARCHIVED');
  }

  return prisma.doctrineDisclosure.findMany({
    where: { status: { in: statusFilter } },
    orderBy: { createdAt: 'desc' },
    include: { reactions: true },
  });
}

/**
 * Transition a disclosure through its lifecycle.
 */
export async function transitionDisclosure(
  id: string,
  newStatus: DisclosureStatus,
) {
  const now = new Date();
  const updateData: Record<string, unknown> = { status: newStatus };

  if (newStatus === 'TEASED') updateData.teasedAt = now;
  if (newStatus === 'DISCLOSED') updateData.disclosedAt = now;

  const disclosure = await prisma.doctrineDisclosure.update({
    where: { id },
    data: updateData,
  });

  // Invalidate all disclosure caches
  apiCache.invalidatePrefix('doctrine:disclosure');
  apiCache.invalidatePrefix('doctrine:disclosures');

  return disclosure;
}

/**
 * Create a new classified disclosure.
 */
export async function createDisclosure(data: {
  codename: string;
  publicTitle: string;
  content: string;
  narrative: string;
  minTierTeaser?: TierId;
  scheduledAt?: Date;
  mediaUrls?: string[];
}) {
  return prisma.doctrineDisclosure.create({
    data: {
      codename: data.codename,
      publicTitle: data.publicTitle,
      content: data.content,
      narrative: data.narrative,
      minTierTeaser: data.minTierTeaser ?? 'OPERATOR',
      scheduledAt: data.scheduledAt ?? null,
      mediaUrls: data.mediaUrls ?? [],
    },
  });
}
