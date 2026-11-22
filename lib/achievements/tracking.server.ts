/**
 * Achievement tracking (feature 19): persistence and the milestone notices. The rules live in `tracking.ts`.
 *
 * `onProgress` is called by the engine after progress moves and must never throw into it: achievement progress is
 * best-effort and may not fail the game action that triggered it.
 */
import { notice } from '@/lib/notifications/notice-keys';
import { prisma } from '@/lib/prisma.server';
import { getAchievement } from '@/lib/achievements/catalog';
import { createNotification } from '@/lib/notifications.server';
import { MAX_TRACKED, crossedThreshold, percent } from '@/lib/achievements/tracking';

export type TrackResult = 'ok' | 'unknown' | 'unlocked' | 'limit';

/** A secret achievement is "unknown": tracking one would reveal that it exists. */
export async function track(userId: string, achievementId: string): Promise<TrackResult> {
  const def = getAchievement(achievementId);
  if (!def || def.secret) return 'unknown';

  return prisma.$transaction(async (tx) => {
    // Serialise this member's tracks: the count below and the insert must not interleave with another request's, or
    // two at four would both pass and leave six.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`achievement-track:${userId}`}, 0))`;

    const row = await tx.userAchievement.findUnique({
      where: {
        userId_achievementId: {
          userId,
          achievementId,
        },
      },
      select: {
        unlockedAt: true,
      },
    });
    if (row?.unlockedAt) return 'unlocked';

    const key = {
      userId_achievementId: {
        userId,
        achievementId,
      },
    };
    if (
      await tx.achievementTrack.findUnique({
        where: key,
        select: {
          achievementId: true,
        },
      })
    )
      return 'ok';
    if (
      (await tx.achievementTrack.count({
        where: {
          userId,
        },
      })) >= MAX_TRACKED
    )
      return 'limit';
    await tx.achievementTrack.create({
      data: {
        userId,
        achievementId,
      },
    });
    return 'ok';
  });
}

export async function untrack(userId: string, achievementId: string): Promise<void> {
  await prisma.achievementTrack.deleteMany({
    where: {
      userId,
      achievementId,
    },
  });
}

/** The caller's tracked ids (oldest first) and the holder share of every achievement, for sorting by rarity. */
export async function listTracked(userId: string): Promise<{
  max: number;
  tracked: string[];
  rarity: Record<string, number>;
}> {
  const [rows, rarityRows] = await Promise.all([
    prisma.achievementTrack.findMany({
      where: {
        userId,
      },
      orderBy: {
        createdAt: 'asc',
      },
      select: {
        achievementId: true,
      },
    }),
    prisma.achievementRarity.findMany({
      select: {
        achievementId: true,
        pct: true,
      },
    }),
  ]);
  return {
    max: MAX_TRACKED,
    tracked: rows.map((r) => r.achievementId),
    rarity: Object.fromEntries(rarityRows.map((r) => [r.achievementId, r.pct])),
  };
}

/**
 * Called after an achievement's progress moved from `prev` to `next`. One lookup of the member's track row; nothing
 * more for an achievement they do not track. Reaching the target ends the tracking; crossing 50 % or 90 % notifies
 * once per threshold (the `notifiedPct` claim is atomic, so two simultaneous moves cannot both announce it).
 */
export async function onProgress(userId: string, achievementId: string, prev: number, next: number): Promise<void> {
  try {
    const def = getAchievement(achievementId);
    if (!def || next === prev) return;
    const key = {
      userId_achievementId: {
        userId,
        achievementId,
      },
    };
    const row = await prisma.achievementTrack.findUnique({
      where: key,
      select: {
        notifiedPct: true,
      },
    });
    if (!row) return;

    if (next >= def.target) {
      await prisma.achievementTrack.deleteMany({
        where: {
          userId,
          achievementId,
        },
      });
      return;
    }
    const milestone = crossedThreshold(percent(prev, def.target), percent(next, def.target));
    if (!milestone || milestone <= row.notifiedPct) return;

    const claim = await prisma.achievementTrack.updateMany({
      where: {
        userId,
        achievementId,
        notifiedPct: {
          lt: milestone,
        },
      },
      data: {
        notifiedPct: milestone,
      },
    });
    if (claim.count === 0) return;

    await createNotification({
      userId,
      type: 'SYSTEM',
      entityType: 'achievement',
      entityId: achievementId,
      preview:
        milestone === 90
          ? notice('achievement-almost', { name: def.name })
          : notice('achievement-halfway', { name: def.name }),
      link: '/progress?tab=achievements',
    });
  } catch (err) {
    console.error('[achievements] tracking failed:', err);
  }
}
