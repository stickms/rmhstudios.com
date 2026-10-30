/**
 * Fetching for "playing now" and friend activity. Friends are the members the viewer
 * follows. The assembly and the privacy rule live in `activity.ts` (pure, tested); this
 * module only reads rows.
 */

import { prisma } from '@/lib/prisma.server';
import { listCuratedBuilds } from '@/lib/builds/curated';
import { ACHIEVEMENTS } from '@/lib/achievements/catalog';
import { userDisplaySelect, resolveUserDisplay } from '@/lib/user-display';
import { NOW_PLAYING_WINDOW_S, assembleActivity } from '@/lib/games/activity';
import type { FriendActivity, NowPlaying } from '@/lib/games/activity-types';
import { canViewPlaytime, isPlaytimePrivacy } from '@/lib/playtime/privacy';

const DAY_MS = 86_400_000;
const FEED_DAYS = 14;
const PLAYED_DAYS = 7;
const FRIENDS_CONSIDERED = 200;

const titleNames = () => new Map(listCuratedBuilds().map((b) => [b.id, b.title]));
const windowStart = () => new Date(Date.now() - NOW_PLAYING_WINDOW_S * 1000);

/** What one member is playing this minute, if the viewer may see it. */
export async function getNowPlayingFor(
  viewerId: string | null,
  owner: { id: string; playtimePrivacy: string },
  viewerFollowsOwner: boolean,
): Promise<NowPlaying | null> {
  const setting = isPlaytimePrivacy(owner.playtimePrivacy) ? owner.playtimePrivacy : 'private';
  if (!canViewPlaytime(setting, { viewerId, ownerId: owner.id, viewerFollowsOwner })) return null;
  const row = await prisma.gamePlaytime.findFirst({
    where: { userId: owner.id, lastHeartbeatAt: { gte: windowStart() } },
    orderBy: { lastHeartbeatAt: 'desc' },
    select: { gameId: true },
  });
  if (!row) return null;
  const title = titleNames().get(row.gameId);
  return title ? { gameId: row.gameId, title } : null;
}

/** Who the viewer follows is in a game right now, and what they have been up to lately. */
export async function getFriendActivity(viewerId: string): Promise<FriendActivity> {
  const follows = await prisma.follow.findMany({
    where: { followerId: viewerId },
    orderBy: { createdAt: 'desc' },
    take: FRIENDS_CONSIDERED,
    select: { following: { select: { ...userDisplaySelect, playtimePrivacy: true } } },
  });
  const people = new Map<string, { userId: string; handle: string | null; name: string; image: string | null; playtimePrivacy: string }>();
  for (const f of follows) {
    const u = f.following as unknown as Parameters<typeof resolveUserDisplay>[0] & {
      id: string;
      handle: string | null;
      playtimePrivacy: string;
    };
    const d = resolveUserDisplay(u);
    people.set(u.id, {
      userId: u.id,
      handle: u.handle,
      name: d.name ?? u.handle ?? 'Player',
      image: d.image ?? null,
      playtimePrivacy: u.playtimePrivacy,
    });
  }
  const ids = [...people.keys()];
  if (ids.length === 0) return { inGame: [], events: [] };

  const since = new Date(Date.now() - FEED_DAYS * DAY_MS);
  const playedSince = new Date(Date.now() - PLAYED_DAYS * DAY_MS);
  const [achievements, badges, reviews, threads, played, live] = await Promise.all([
    prisma.userAchievement.findMany({
      where: { userId: { in: ids }, unlockedAt: { gte: since } },
      orderBy: { unlockedAt: 'desc' },
      take: 40,
      select: { userId: true, achievementId: true, unlockedAt: true },
    }),
    prisma.gameBadge.findMany({
      where: { userId: { in: ids }, craftedAt: { gte: since } },
      orderBy: { craftedAt: 'desc' },
      take: 40,
      select: { userId: true, gameId: true, foil: true, level: true, craftedAt: true },
    }),
    prisma.gameReview.findMany({
      where: { userId: { in: ids }, createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: 40,
      select: { userId: true, gameId: true, stars: true, createdAt: true },
    }),
    prisma.gameThread.findMany({
      where: { authorId: { in: ids }, createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: 40,
      select: { id: true, authorId: true, gameId: true, title: true, createdAt: true },
    }),
    prisma.gamePlaytimeDay.findMany({
      where: { userId: { in: ids }, day: { gte: playedSince } },
      take: 600,
      select: { userId: true, gameId: true, day: true, seconds: true },
    }),
    prisma.gamePlaytime.findMany({
      where: { userId: { in: ids }, lastHeartbeatAt: { gte: windowStart() } },
      orderBy: { lastHeartbeatAt: 'desc' },
      select: { userId: true, gameId: true },
    }),
  ]);

  const titles = titleNames();
  const catalog = new Map(ACHIEVEMENTS.map((a) => [a.id, a.name]));
  const events = assembleActivity({
    viewerId,
    people,
    titles,
    achievementName: (id) => catalog.get(id) ?? null,
    achievements: achievements.flatMap((a) =>
      a.unlockedAt ? [{ userId: a.userId, achievementId: a.achievementId, unlockedAt: a.unlockedAt }] : [],
    ),
    badges,
    reviews,
    threads: threads.map((t) => ({ userId: t.authorId, gameId: t.gameId, id: t.id, title: t.title, createdAt: t.createdAt })),
    played,
    limit: 40,
  });

  // In-game now: one entry per person (their most recent beat), if they let followers see it.
  const seen = new Set<string>();
  const inGame: FriendActivity['inGame'] = [];
  for (const l of live) {
    const p = people.get(l.userId);
    const title = titles.get(l.gameId);
    if (!p || !title || seen.has(l.userId)) continue;
    const setting = isPlaytimePrivacy(p.playtimePrivacy) ? p.playtimePrivacy : 'private';
    if (!canViewPlaytime(setting, { viewerId, ownerId: l.userId, viewerFollowsOwner: true })) continue;
    seen.add(l.userId);
    inGame.push({
      user: { userId: p.userId, handle: p.handle, name: p.name, image: p.image },
      game: { gameId: l.gameId, title },
    });
  }
  return { inGame, events };
}
