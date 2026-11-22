/** GET /api/developer/keys, shared with the /developer route loader (redesign audit B4). */
import { prisma } from '@/lib/prisma.server';
import { getUserTier, hasApiAccess } from '@/lib/entitlements';
import { ALL_SCOPES } from '@/lib/api/scopes';
import { tierMinuteLimit } from '@/lib/api/tier-limits';
import { getKeyRefusalSummaries } from '@/lib/api/key-refusals.server';

/** The viewer's live keys (metadata only, no secrets) and whether their tier may create more. */
export async function listDeveloperKeysView(userId: string) {
  // Independent reads: the tier lookup doesn't gate the key list.
  const [tier, keys] = await Promise.all([
    getUserTier(userId),
    prisma.developerApiKey.findMany({
      where: { userId, revokedAt: null },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        prefix: true,
        lastFour: true,
        scopes: true,
        testMode: true,
        expiresAt: true,
        lastUsedAt: true,
        createdAt: true,
        allowedCidrs: true,
        rateLimitPerMinute: true,
        suspendedAt: true,
        suspendReason: true,
      },
    }),
  ]);
  const refusals = await getKeyRefusalSummaries(keys.filter((k) => k.allowedCidrs.length > 0).map((k) => k.id));
  return {
    keys: keys.map((k) => ({
      ...k,
      refusals: refusals.get(k.id) ?? { count: 0, lastPrefix: null },
    })),
    maxRateLimitPerMinute: tierMinuteLimit(tier),
    hasApiAccess: hasApiAccess(tier),
    tier,
    availableScopes: ALL_SCOPES,
  };
}
