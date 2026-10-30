/**
 * Data for the Steam-style community pages: Community Home, a player's profile
 * and a group. Everything here is read-only and public data except playtime,
 * which goes through `canViewPlaytime` like every other read of it.
 */

import { prisma } from '@/lib/prisma.server';
import { userDisplaySelect, resolveUserDisplay } from '@/lib/user-display';
import { ACHIEVEMENTS } from '@/lib/achievements/catalog';
import { getProfile } from '@/lib/profile.server';
import { trendingTitles } from '@/lib/games/trending.server';
import { getFriendActivity, getNowPlayingFor } from '@/lib/games/activity.server';
import { getLook, getShowcase } from '@/lib/games/showcase.server';
import { parseBackground, parseFrame, unlocksFromBadges } from '@/lib/games/customize';
import { badgeKey } from '@/lib/games/showcase';
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
  ShowcaseEditorData,
  LookEditorData,
  ProfileLook,
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

  const [listed, myMemberships, trending24, reviewRows, friends] = await Promise.all([
    listCommunities({ userId: viewerId }),
    viewerId
      ? prisma.communityMember.findMany({
          where: { userId: viewerId, community: { isPrivate: false } },
          orderBy: { joinedAt: 'desc' },
          take: 8,
          select: { community: { select: GROUP_SELECT } },
        })
      : Promise.resolve([]),
    trendingTitles(),
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
  for (const row of trending24) {
    const title = titles.get(row.gameId);
    if (!title) continue;
    trending.push({ ...title, players: row.players, seconds: row.seconds });
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

  const [owner, achievementRows, memberships, follows, reviewCount, badgeRows, showcase, lookRow] = await Promise.all([
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
      take: 200,
      select: { gameId: true, foil: true, level: true },
    }),
    getShowcase(ownerId),
    getLook(ownerId),
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
  // Every achievement they have unlocked, newest first.
  const unlocked: ProfileAchievement[] = [];
  for (const row of achievementRows) {
    const def = byId.get(row.achievementId);
    if (!def || !row.unlockedAt) continue;
    unlocked.push({
      id: def.id,
      name: def.name,
      description: def.description,
      tier: def.tier,
      target: def.target,
      unlockedAt: row.unlockedAt.toISOString(),
    });
  }
  const allBadges = badgeRows.flatMap((b): (ProfileBadge & { key: string })[] => {
    const title = titles.get(b.gameId);
    return title ? [{ ...title, level: b.level, foil: b.foil, key: badgeKey(b.gameId, b.foil) }] : [];
  });

  // The showcase they chose, else their most recent. Chosen order is kept.
  const chosenAch = showcase.achievements.flatMap((id) => unlocked.find((a) => a.id === id) ?? []);
  const chosenBadges = showcase.badges.flatMap((k) => allBadges.find((b) => b.key === k) ?? []);
  const recentAchievements = chosenAch.length > 0 ? chosenAch : unlocked.slice(0, 6);
  const shownBadges = chosenBadges.length > 0 ? chosenBadges : allBadges.slice(0, 12);
  const showcaseEditor: ShowcaseEditorData | null = profile.isOwnProfile
    ? {
        selected: {
          achievements: chosenAch.map((a) => a.id),
          badges: chosenBadges.map((b) => b.key),
        },
        achievements: unlocked,
        badges: allBadges,
      }
    : null;

  // Background and frame: only if the member still owns what they chose (badges never go
  // away, but the rule is cheap to hold at read time too).
  const unlocks = unlocksFromBadges(badgeRows);
  const bgChoice = lookRow.background && unlocks.backgrounds.includes(lookRow.background) ? parseBackground(lookRow.background) : null;
  const frChoice = lookRow.frame && unlocks.frames.includes(lookRow.frame) ? parseFrame(lookRow.frame) : null;
  const look: ProfileLook = {
    background: bgChoice && titles.get(bgChoice.gameId) ? { ...bgChoice, title: (titles.get(bgChoice.gameId) as TitleRef).title, hue: (titles.get(bgChoice.gameId) as TitleRef).hue } : null,
    frame: frChoice && titles.get(frChoice.gameId) ? { ...frChoice, title: (titles.get(frChoice.gameId) as TitleRef).title, hue: (titles.get(frChoice.gameId) as TitleRef).hue } : null,
  };
  const lookEditor: LookEditorData | null = profile.isOwnProfile
    ? {
        selected: { background: look.background ? lookRow.background : null, frame: look.frame ? lookRow.frame : null },
        backgrounds: unlocks.backgrounds.flatMap((key) => {
          const p = parseBackground(key);
          const t = p && titles.get(p.gameId);
          return p && t ? [{ key, title: t.title, hue: t.hue, foil: p.foil }] : [];
        }),
        frames: unlocks.frames.flatMap((key) => {
          const p = parseFrame(key);
          const t = p && titles.get(p.gameId);
          return p && t ? [{ key, title: t.title, hue: t.hue, level: p.level }] : [];
        }),
      }
    : null;

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
    achievementsUnlocked: unlocked.length,
    achievementsTotal: ACHIEVEMENTS.length,
    recentAchievements,
    games,
    friends: follows.map((f) => personRef(f.following as DisplayUser)),
    groups: memberships.map((m) => groupRef(m.community)),
    badges: shownBadges.map(({ key: _key, ...b }) => b),
    reviewCount,
    nowPlaying: await getNowPlayingFor(
      viewerId,
      { id: ownerId, playtimePrivacy: owner?.playtimePrivacy ?? 'private' },
      viewerFollowsOwner,
    ),
    showcaseEditor,
    look,
    lookEditor,
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
