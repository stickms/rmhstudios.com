/**
 * Everything the library detail pane shows about one title beyond its hub: the
 * viewer's time, the title's achievements, who they follow plays it, and the
 * community that is its home. One call so the route loader fans out in parallel.
 */

import { prisma } from '@/lib/prisma.server';
import { ACHIEVEMENTS } from '@/lib/achievements/catalog';
import { listAchievements } from '@/lib/achievements.server';
import { achievementsForTitle } from '@/lib/games/achievement-groups';
import type { DetailAchievement, DetailCommunity, LibraryExtras } from '@/lib/games/detail-types';
import { getActivity, listFriendsWhoPlay, listTopPlayers } from '@/lib/playtime/playtime.server';

async function titleAchievements(
  viewerId: string | null,
  gameId: string,
): Promise<DetailAchievement[]> {
  if (achievementsForTitle(gameId, ACHIEVEMENTS).length === 0) return [];
  if (!viewerId) {
    // Signed out: the definitions, all locked. Hidden ones stay hidden.
    return achievementsForTitle(gameId, ACHIEVEMENTS)
      .filter((d) => !d.secret)
      .map((d) => ({
        id: d.id,
        name: d.name,
        description: d.description,
        icon: d.icon,
        tier: d.tier,
        target: d.target,
        progress: 0,
        unlocked: false,
      }));
  }
  // `listAchievements` masks a hidden achievement the viewer has not unlocked.
  const payload = await listAchievements(viewerId);
  return achievementsForTitle(gameId, payload?.achievements ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    description: a.description,
    icon: a.icon,
    tier: a.tier,
    target: a.target,
    progress: a.progress,
    unlocked: a.unlocked,
  }));
}

async function titleCommunities(gameId: string): Promise<DetailCommunity[]> {
  return prisma.community.findMany({
    where: { gameId, isPrivate: false },
    orderBy: { memberCount: 'desc' },
    take: 6,
    select: { slug: true, name: true, icon: true, color: true, memberCount: true },
  });
}

export async function getLibraryExtras(
  viewerId: string | null,
  gameId: string,
): Promise<LibraryExtras> {
  const [activity, achievements, friends, topPlayers, communities] = await Promise.all([
    viewerId ? getActivity(viewerId, gameId) : Promise.resolve(null),
    titleAchievements(viewerId, gameId),
    listFriendsWhoPlay(viewerId, gameId),
    listTopPlayers(viewerId, gameId),
    titleCommunities(gameId),
  ]);
  return { activity, achievements, friends, topPlayers, communities };
}
