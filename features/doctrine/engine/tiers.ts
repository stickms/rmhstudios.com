/**
 * Doctrine Engine — Tier System
 *
 * Access control based on user subscription tier.
 */

import { prisma } from '@/lib/prisma.server';
import {
  cached,
  invalidateCached,
} from '@/lib/cached.server';
import {
  TIER_HIERARCHY,
  TIERS,
} from './constants';
import type { TierId } from './types';

/**
 * Check if a user's tier meets the minimum required tier.
 */
export function checkTierAccess(
  userTier: TierId,
  requiredTier: TierId,
): boolean {
  return (
    TIER_HIERARCHY[
      userTier
    ] >=
    TIER_HIERARCHY[
      requiredTier
    ]
  );
}

/**
 * Get the user's current tier.
 */
export async function getUserTier(
  userId: string,
): Promise<TierId> {
  const cacheKey = `doctrine:tier:${userId}`;
  return cached(
    cacheKey,
    300_000,
    async () => {
      const user =
        await prisma.user.findUnique(
          {
            where:
              {
                id: userId,
              },
            select:
              {
                doctrineTier: true,
              },
          },
        );

      const tier =
        (user?.doctrineTier ??
          'PUBLIC') as TierId;
      return tier;
    },
    {
      l2: false,
    },
  );
}

/**
 * Upgrade or change a user's tier. Admin-only operation.
 */
export async function setUserTier(
  userId: string,
  newTier: TierId,
) {
  await prisma.user.update(
    {
      where:
        {
          id: userId,
        },
      data: {
        doctrineTier:
          newTier,
        doctrineTierChangedAt:
          new Date(),
      },
    },
  );

  void invalidateCached(
    `doctrine:tier:${userId}`,
  );
  return {
    userId,
    tier: newTier,
    tierName:
      TIERS[
        newTier
      ]
        .name,
  };
}

/**
 * Get tier definition for display.
 */
export function getTierDefinition(
  tier: TierId,
) {
  return TIERS[
    tier
  ];
}
