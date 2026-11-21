/**
 * Compare the viewer's achievements with another member's (sprint 04, feature 11). No persistence: it reads both
 * members through `listAchievements`, reads rarity once and diffs in `compare.ts`.
 */
import { prisma } from '@/lib/prisma.server';
import { ACHIEVEMENTS } from '@/lib/achievements/catalog';
import { listAchievements } from '@/lib/achievements.server';
import { isBlockedPair } from '@/lib/messages/send.server';
import { resolveUserDisplay, userDisplaySelect } from '@/lib/user-display';
import {
  buildCompareRows,
  type CompareMember,
  type CompareResponse,
} from '@/lib/achievements/compare';

/**
 * `null` is the one "not found" answer: an unknown member, a blocked pair in either direction, a banned member, an
 * account that is leaving and the viewer themselves are indistinguishable from each other and from a typo.
 */
export async function compareAchievements(
  viewerId: string,
  withIdOrHandle: string,
): Promise<CompareResponse | null> {
  const [viewer, other] = await Promise.all([
    prisma.user.findUnique({ where: { id: viewerId }, select: userDisplaySelect }),
    prisma.user.findFirst({
      where: { OR: [{ id: withIdOrHandle }, { handle: withIdOrHandle }] },
      select: { ...userDisplaySelect, bannedUntil: true, deletionScheduledAt: true },
    }),
  ]);
  if (!viewer || !other || other.id === viewer.id) return null;
  if (other.deletionScheduledAt) return null;
  if (other.bannedUntil && other.bannedUntil.getTime() > Date.now()) return null;
  if (await isBlockedPair(viewer.id, other.id)) return null;

  const [mine, theirs, rarity] = await Promise.all([
    listAchievements(viewer.id),
    listAchievements(other.id),
    prisma.achievementRarity.findMany({ select: { achievementId: true, pct: true } }),
  ]);
  if (!mine || !theirs) return null;

  return {
    you: member(viewer, mine.stats),
    them: member(other, theirs.stats),
    rows: buildCompareRows(
      ACHIEVEMENTS,
      mine,
      theirs,
      Object.fromEntries(rarity.map((r) => [r.achievementId, r.pct])),
    ),
  };
}

function member(
  user: Parameters<typeof resolveUserDisplay>[0] & { id: string; handle: string | null },
  stats: { unlocked: number; total: number },
): CompareMember {
  const display = resolveUserDisplay(user);
  return {
    id: user.id,
    name: display.name,
    handle: user.handle,
    image: display.image,
    unlocked: stats.unlocked,
    total: stats.total,
  };
}
