/**
 * Per-community posting settings (S2 verification, N1 flair-required, N2 star
 * threshold). Server-only. Cached briefly because the gate reads them on every
 * post/comment in a community; mutations bust the local entry.
 */
import { prisma } from '@/lib/prisma.server';
import { apiCache } from '@/lib/cache';
import {
  isVerificationLevel,
  normalizeVerificationRule,
  type VerificationRule,
} from '@/lib/communities/verification';

export interface CommunitySettings {
  verification: VerificationRule;
  flairRequired: boolean;
  starThreshold: number;
}

const TTL_MS = 30_000;
const key = (communityId: string) => `community:settings:${communityId}`;

export async function getCommunitySettings(communityId: string): Promise<CommunitySettings | null> {
  const hit = apiCache.get<CommunitySettings>(key(communityId));
  if (hit) return hit;
  const row = await prisma.community.findUnique({
    where: { id: communityId },
    select: {
      verificationLevel: true,
      verificationValue: true,
      flairRequired: true,
      starThreshold: true,
    },
  });
  if (!row) return null;
  const level = isVerificationLevel(row.verificationLevel) ? row.verificationLevel : 'none';
  const settings: CommunitySettings = {
    verification: normalizeVerificationRule(level, row.verificationValue),
    flairRequired: row.flairRequired,
    starThreshold: row.starThreshold,
  };
  apiCache.set(key(communityId), settings, TTL_MS);
  return settings;
}

export async function updateCommunitySettings(
  communityId: string,
  patch: {
    verificationLevel?: string;
    verificationValue?: number;
    flairRequired?: boolean;
    starThreshold?: number;
  },
): Promise<CommunitySettings | null> {
  const data: Record<string, unknown> = {};
  if (patch.verificationLevel !== undefined || patch.verificationValue !== undefined) {
    const current = await getCommunitySettings(communityId);
    if (!current) return null;
    const level =
      patch.verificationLevel !== undefined && isVerificationLevel(patch.verificationLevel)
        ? patch.verificationLevel
        : current.verification.level;
    const rule = normalizeVerificationRule(
      level,
      patch.verificationValue ?? current.verification.value,
    );
    data.verificationLevel = rule.level;
    data.verificationValue = rule.value;
  }
  if (patch.flairRequired !== undefined) data.flairRequired = patch.flairRequired;
  if (patch.starThreshold !== undefined) data.starThreshold = patch.starThreshold;
  if (Object.keys(data).length > 0) {
    await prisma.community.update({ where: { id: communityId }, data });
  }
  apiCache.invalidate(key(communityId));
  return getCommunitySettings(communityId);
}
