/**
 * Per-community posting settings (S2 verification, N1 flair-required, N2 star
 * threshold). Server-only. Cached briefly because the gate reads them on every
 * post/comment in a community; mutations bust the local entry.
 */
import { prisma } from '@/lib/prisma.server';
import { logModAction } from '@/lib/communities/modlog.server';
import { cached, invalidateCached } from '@/lib/cached.server';
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
  return cached(
    key(communityId),
    TTL_MS,
    async () => {
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
      return settings;
    },
    { l2: false, shouldCache: (v) => v != null },
  );
}

export async function updateCommunitySettings(
  communityId: string,
  patch: {
    verificationLevel?: string;
    verificationValue?: number;
    flairRequired?: boolean;
    starThreshold?: number;
    publicModLog?: boolean;
  },
  actorId: string,
): Promise<CommunitySettings | null> {
  const found = await prisma.$transaction(async (tx) => {
    const row = await tx.community.findUnique({
      where: { id: communityId },
      select: {
        verificationLevel: true,
        verificationValue: true,
        flairRequired: true,
        starThreshold: true,
        publicModLog: true,
      },
    });
    if (!row) return false;
    const data: Record<string, unknown> = {};
    const changed: string[] = [];
    if (patch.verificationLevel !== undefined || patch.verificationValue !== undefined) {
      const currentLevel = isVerificationLevel(row.verificationLevel) ? row.verificationLevel : 'none';
      const current = normalizeVerificationRule(currentLevel, row.verificationValue);
      const level =
        patch.verificationLevel !== undefined && isVerificationLevel(patch.verificationLevel)
          ? patch.verificationLevel
          : current.level;
      const rule = normalizeVerificationRule(level, patch.verificationValue ?? current.value);
      if (rule.level !== row.verificationLevel || rule.value !== row.verificationValue) {
        data.verificationLevel = rule.level;
        data.verificationValue = rule.value;
        changed.push('verification');
      }
    }
    if (patch.flairRequired !== undefined && patch.flairRequired !== row.flairRequired) {
      data.flairRequired = patch.flairRequired;
      changed.push('flairRequired');
    }
    if (patch.starThreshold !== undefined && patch.starThreshold !== row.starThreshold) {
      data.starThreshold = patch.starThreshold;
      changed.push('starThreshold');
    }
    if (patch.publicModLog !== undefined && patch.publicModLog !== row.publicModLog) {
      data.publicModLog = patch.publicModLog;
      changed.push('publicModLog');
    }
    if (changed.length > 0) {
      await tx.community.update({ where: { id: communityId }, data });
      await logModAction(tx, {
        communityId,
        actorId,
        action: 'settings_changed',
        detail: { fields: changed },
      });
    }
    return true;
  });
  void invalidateCached(key(communityId));
  return found ? getCommunitySettings(communityId) : null;
}
