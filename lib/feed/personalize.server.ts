/**
 * Viewer interest profile for the personalized "For You" ranking (#11).
 *
 * Derived from cheap signals the read path can afford: the viewer's most
 * recent likes. We tally which authors and which topics (#hashtags) they
 * engage with, normalize to 0..1 weights, and hand them to the ranking
 * function as a gentle personalization boost. Pure-DB, no ML infra.
 *
 * The profile is small and recomputed per first-page fetch; results are
 * cached briefly per user so rapid pagination/refresh doesn't re-query.
 */

import { prisma } from '@/lib/prisma.server';
import { extractTags } from './ranking';
import { lruL1 } from '@/lib/cached.server';
import { redisEnabled, redisGetJSON, redisSetJSON } from '@/lib/redis.server';

export interface InterestProfile {
  authorAffinity: Map<string, number>;
  topicInterest: Map<string, number>;
}

const EMPTY: InterestProfile = { authorAffinity: new Map(), topicInterest: new Map() };

// Per-user L1 cache. In-process on purpose (`lruL1`): the value holds Maps, which do not survive the JSON round trip
// of the shared cache's Redis layer, and this module already keeps its own serialised copy in Redis (`redisKey`).
// Bounded and TTL-swept, unlike the plain Map it replaced, which only ever grew.
const profileL1 = lruL1('interest-profile', { maxEntries: 5000 });
const TTL_MS = 5 * 60 * 1000;
const SAMPLE_SIZE = 80;
const cacheKey = (userId: string) => `interest-profile:${userId}`;

function normalize(counts: Map<string, number>): Map<string, number> {
  let max = 0;
  for (const v of counts.values()) if (v > max) max = v;
  if (max === 0) return counts;
  const out = new Map<string, number>();
  for (const [k, v] of counts) out.set(k, v / max);
  return out;
}

// Maps don't survive JSON, so (de)serialize to entry arrays for the cache.
type SerializedProfile = { a: [string, number][]; t: [string, number][] };
const serialize = (p: InterestProfile): SerializedProfile => ({
  a: [...p.authorAffinity],
  t: [...p.topicInterest],
});
const deserialize = (s: SerializedProfile): InterestProfile => ({
  authorAffinity: new Map(s.a),
  topicInterest: new Map(s.t),
});
const redisKey = (userId: string) => `interest:${userId}`;

export async function buildInterestProfile(userId: string | null): Promise<InterestProfile> {
  if (!userId) return EMPTY;

  // L1: per-instance cache.
  const cached = profileL1.get<InterestProfile>(cacheKey(userId));
  if (cached) return cached;

  // L2: shared Redis cache (cross-instance) when configured.
  if (redisEnabled()) {
    const hit = await redisGetJSON<SerializedProfile>(redisKey(userId));
    if (hit) {
      const profile = deserialize(hit);
      profileL1.set(cacheKey(userId), profile, TTL_MS);
      return profile;
    }
  }

  try {
    const likes = await prisma.rMHarkLike.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: SAMPLE_SIZE,
      select: {
        rmhark: { select: { userId: true, content: true } },
      },
    });

    const authorCounts = new Map<string, number>();
    const topicCounts = new Map<string, number>();
    for (const l of likes) {
      const author = l.rmhark?.userId;
      if (author && author !== userId) {
        authorCounts.set(author, (authorCounts.get(author) ?? 0) + 1);
      }
      const content = l.rmhark?.content;
      if (content) {
        for (const tag of extractTags(content)) {
          topicCounts.set(tag, (topicCounts.get(tag) ?? 0) + 1);
        }
      }
    }

    const profile: InterestProfile = {
      authorAffinity: normalize(authorCounts),
      topicInterest: normalize(topicCounts),
    };
    profileL1.set(cacheKey(userId), profile, TTL_MS);
    if (redisEnabled()) await redisSetJSON(redisKey(userId), serialize(profile), TTL_MS);
    return profile;
  } catch (err) {
    console.error('[personalize] buildInterestProfile failed:', err);
    return EMPTY;
  }
}
