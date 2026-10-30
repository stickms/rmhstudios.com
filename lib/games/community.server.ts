/**
 * Data for the Steam-style community pages: Community Home, a player's profile
 * and a group. Everything here is read-only and public data except playtime,
 * which goes through `canViewPlaytime` like every other read of it.
 */

import { prisma } from '@/lib/prisma.server';
import { userDisplaySelect, resolveUserDisplay } from '@/lib/user-display';
import { ACHIEVEMENTS } from '@/lib/achievements/catalog';
import { getProfile } from '@/lib/profile.server';
import { getFriendActivity, getNowPlayingFor } from '@/lib/games/activity.server';
import { listCommunities } from '@/lib/communities.server';
import { listCuratedBuilds } from '@/lib/builds/curated';
import { canViewPlaytime, isPlaytimePrivacy } from '@/lib/playtime/privacy';
import { levelInfo } from '@/lib/xp/levels';
import type {
  CommunityHomeData,
  GroupMember,
  GroupRef,
  PersonRef,
  ProfileAchievement,
  ProfileBadge,
  ProfileGame,
  RecentReview,
  SteamGroup,
  SteamProfile,
  TitleRef,
  TrendingTitle,
} from '@/lib/games/community-types';

const TWO_WEEKS_MS = 14 * 86_400_000;

function titleIndex(): Map<string, TitleRef> {
  return new Map(
    listCuratedBuilds().map((b) => [
      b.id,
      { id: b.id, title: b.title, thumbnailUrl: b.thumbnailUrl, hue: b.hue },
    ]),
  );
}

type DisplayUser = Parameters<typeof resolveUserDisplay>[0] & {
  id: string;
  handle: string | null;
};

function personRef(u: DisplayUser): PersonRef {
  const d = resolveUserDisplay(u);
  return { userId: u.id, handle: u.handle, name: d.name ?? u.handle ?? 'Player', image: d.image ?? null };
}

function groupRef(c: {
  slug: string;
  name: string;
  icon: string | null;
  color: string | null;
  memberCount: number;
}): GroupRef {
  return { slug: c.slug, name: c.name, icon: c.icon, color: c.color, memberCount: c.memberCount };
}

const GROUP_SELECT = { slug: true, name: true, icon: true, color: true, memberCount: true } as const;

/** Community Home: popular groups, the viewer's groups, what is being played, newest reviews. */
export async function getCommunityHome(viewerId: string | null): Promise<CommunityHomeData> {
  const since = new Date(Date.now() - TWO_WEEKS_MS);
  const titles = titleIndex();

  const [listed, myMemberships, trendingRows, reviewRows, friends] = await Promise.all([
    listCommunities({ userId: viewerId }),
    viewerId
      ? prisma.communityMember.findMany({
          where: { userId: viewerId, community: { isPrivate: false } },
          orderBy: { joinedAt: 'desc' },
          take: 8,
          select: { community: { select: GROUP_SELECT } },
        })
      : Promise.resolve([]),
    // Only players whose setting is `public` count towards a title's trend: a
    // community-wide number must not leak a follower-only or private player.
    prisma.gamePlaytimeDay.groupBy({
      by: ['gameId'],
      where: { day: { gte: since }, user: { playtimePrivacy: 'public' } },
      _sum: { seconds: true },
      _count: { userId: true },
      orderBy: { _sum: { seconds: 'desc' } },
      take: 24,
    }),
    prisma.gameReview.findMany({
      where: { body: { not: null } },
      orderBy: { createdAt: 'desc' },
      take: 6,
      select: {
        id: true,
        gameId: true,
        stars: true,
        body: true,
        createdAt: true,
        user: { select: userDisplaySelect },
      },
    }),
    viewerId ? getFriendActivity(viewerId) : Promise.resolve(null),
  ]);

  const trending: TrendingTitle[] = [];
  for (const row of trendingRows) {
    const title = titles.get(row.gameId);
    if (!title) continue;
    trending.push({
      ...title,
      players: row._count.userId,
      seconds: row._sum.seconds ?? 0,
    });
    if (trending.length === 8) break;
  }

  const reviews: RecentReview[] = reviewRows.flatMap((r) => {
    const title = titles.get(r.gameId);
    if (!title) return [];
    return [
      {
        id: r.id,
        gameId: r.gameId,
        gameTitle: title.title,
        stars: r.stars,
        body: r.body,
        createdAt: r.createdAt.toISOString(),
        author: personRef(r.user as DisplayUser),
      },
    ];
  });

  return {
    signedIn: !!viewerId,
    groups: listed
      .filter((c) => !c.locked)
      .slice(0, 10)
      .map(groupRef),
    trending,
    reviews,
    myGroups: myMemberships.map((m) => groupRef(m.community)),
    friends,
  };
}

/** A player's Steam-style profile, or null if nobody answers to the id/handle. */
export async function getSteamProfile(
  viewerId: string | null,
  idOrHandle: string,
): Promise<SteamProfile | null> {
  const profile = await getProfile(idOrHandle, { id: viewerId, isAdmin: false });
  if (!profile) return null;
  const ownerId = profile.id;
  const since = new Date(Date.now() - TWO_WEEKS_MS);
  const titles = titleIndex();

  const [owner, achievementRows, memberships, follows, reviewCount, badgeRows] = await Promise.all([
    prisma.user.findUnique({
      where: { id: ownerId },
      select: { playtimePrivacy: true, profile: { select: { xp: true } } },
    }),
    prisma.userAchievement.findMany({
      where: { userId: ownerId, unlockedAt: { not: null } },
      orderBy: { unlockedAt: 'desc' },
      select: { achievementId: true, unlockedAt: true },
    }),
    prisma.communityMember.findMany({
      where: { userId: ownerId, community: { isPrivate: false } },
      orderBy: { joinedAt: 'desc' },
      take: 6,
      select: { community: { select: GROUP_SELECT } },
    }),
    prisma.follow.findMany({
      where: { followerId: ownerId },
      orderBy: { createdAt: 'desc' },
      take: 9,
      select: { following: { select: userDisplaySelect } },
    }),
    prisma.gameReview.count({ where: { userId: ownerId } }),
    prisma.gameBadge.findMany({
      where: { userId: ownerId },
      orderBy: { craftedAt: 'desc' },
      take: 12,
      select: { gameId: true, foil: true, level: true },
    }),
  ]);

  const setting = isPlaytimePrivacy(owner?.playtimePrivacy) ? owner.playtimePrivacy : 'private';
  const viewerFollowsOwner = profile.isFollowing;
  const showGames = canViewPlaytime(setting, { viewerId, ownerId, viewerFollowsOwner });

  let games: SteamProfile['games'] = null;
  if (showGames) {
    const [rows, recent] = await Promise.all([
      prisma.gamePlaytime.findMany({
        where: { userId: ownerId },
        orderBy: { lastPlayedAt: 'desc' },
        select: { gameId: true, totalSeconds: true, lastPlayedAt: true },
      }),
      prisma.gamePlaytimeDay.groupBy({
        by: ['gameId'],
        where: { userId: ownerId, day: { gte: since } },
        _sum: { seconds: true },
      }),
    ]);
    const twoWeeks = new Map(recent.map((r) => [r.gameId, r._sum.seconds ?? 0]));
    const known = rows.filter((r) => titles.has(r.gameId));
    const list: ProfileGame[] = known.slice(0, 5).map((r) => ({
      ...(titles.get(r.gameId) as TitleRef),
      totalSeconds: r.totalSeconds,
      last2WeeksSeconds: twoWeeks.get(r.gameId) ?? 0,
      lastPlayedAt: r.lastPlayedAt.toISOString(),
    }));
    games = {
      played: known.length,
      totalSeconds: known.reduce((n, r) => n + r.totalSeconds, 0),
      last2WeeksSeconds: [...twoWeeks.entries()]
        .filter(([id]) => titles.has(id))
        .reduce((n, [, s]) => n + s, 0),
      recent: list,
    };
  }

  const byId = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));
  const recentAchievements: ProfileAchievement[] = [];
  for (const row of achievementRows) {
    const def = byId.get(row.achievementId);
    if (!def || !row.unlockedAt) continue;
    recentAchievements.push({
      id: def.id,
      name: def.name,
      description: def.description,
      tier: def.tier,
      target: def.target,
      unlockedAt: row.unlockedAt.toISOString(),
    });
    if (recentAchievements.length === 6) break;
  }

  const lv = levelInfo(owner?.profile?.xp ?? 0);
  return {
    id: ownerId,
    handle: profile.handle,
    name: profile.name ?? profile.handle ?? 'Player',
    image: profile.image,
    bio: profile.bio,
    location: profile.location,
    pronouns: profile.pronouns,
    joinedAt: profile.createdAt,
    isOnline: profile.isOnline,
    isVerified: profile.isVerified,
    isOwnProfile: profile.isOwnProfile,
    isFollowing: profile.isFollowing,
    followerCount: profile.followerCount,
    followingCount: profile.followingCount,
    level: lv.level,
    levelProgress: lv.progress,
    achievementsUnlocked: achievementRows.filter((r) => byId.has(r.achievementId)).length,
    achievementsTotal: ACHIEVEMENTS.length,
    recentAchievements,
    games,
    friends: follows.map((f) => personRef(f.following as DisplayUser)),
    groups: memberships.map((m) => groupRef(m.community)),
    badges: badgeRows.flatMap((b): ProfileBadge[] => {
      const title = titles.get(b.gameId);
      return title ? [{ ...title, level: b.level, foil: b.foil }] : [];
    }),
    reviewCount,
    nowPlaying: await getNowPlayingFor(
      viewerId,
      { id: ownerId, playtimePrivacy: owner?.playtimePrivacy ?? 'private' },
      viewerFollowsOwner,
    ),
  };
}

/** A public group (a Community): header, the title it belongs to, and its members. */
export async function getSteamGroup(
  viewerId: string | null,
  slug: string,
): Promise<SteamGroup | null> {
  const community = await prisma.community.findUnique({
    where: { slug },
    select: {
      id: true,
      ...GROUP_SELECT,
      description: true,
      createdAt: true,
      isPrivate: true,
      gameId: true,
    },
  });
  // A private group's page is members-only on the main site; it has no public
  // Steam-style page at all.
  if (!community || community.isPrivate) return null;

  const [members, mine] = await Promise.all([
    prisma.communityMember.findMany({
      where: { communityId: community.id },
      orderBy: [{ role: 'desc' }, { joinedAt: 'asc' }],
      take: 24,
      select: { role: true, user: { select: userDisplaySelect } },
    }),
    viewerId
      ? prisma.communityMember.findUnique({
          where: { communityId_userId: { communityId: community.id, userId: viewerId } },
          select: { role: true },
        })
      : Promise.resolve(null),
  ]);

  const game = community.gameId ? (titleIndex().get(community.gameId) ?? null) : null;
  const staff: GroupMember[] = members.map((m) => ({
    ...personRef(m.user as DisplayUser),
    role: m.role,
  }));
  return {
    ...groupRef(community),
    description: community.description,
    createdAt: community.createdAt.toISOString(),
    joined: !!mine,
    role: mine?.role ?? null,
    signedIn: !!viewerId,
    game,
    members: staff,
  };
}
