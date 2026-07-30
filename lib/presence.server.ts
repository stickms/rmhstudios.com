/**
 * Social presence: which people the viewer follows are online right now, and
 * what joinable room or activity (if any) they're in.
 *
 * Two surfaces read this and they have deliberately different scopes:
 *
 *  - {@link getOnlineFriends} — everyone the viewer **follows**, with the public
 *    RMHTube/RMHMusic room they're in (the "Friends online" sidebar widget).
 *  - {@link getActiveFriends} — the viewer's **mutuals** only, with rich §9
 *    activity and a one-tap join target (the Friends rail/sheet).
 *
 * They used to be two independent fan-outs over the same follow graph. The shared
 * part — resolving the graph and working out who in it is online — is now done
 * once by {@link onlineFollowIds} and cached per viewer; each surface then reads
 * only the rows it needs, at its own scope and limit. A desktop tab mounts both
 * widgets and reaches them through one `/api/pulse` request (see lib/pulse.ts), so
 * in practice they resolve against a single warm base.
 *
 * Deliberately NOT shared: the user-row fetch. The two surfaces select different
 * scopes (all follows vs. mutuals) with different limits, and folding them into
 * one capped base query would silently truncate the rail's mutuals for anyone with
 * more online follows than the cap.
 *
 * "Online" comes from the Redis presence set, not from `user.lastSeenAt` — see
 * `filterOnlineUsers` in hot-counters.server.ts for why that distinction matters.
 */

import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { userDisplaySelect, resolveUser } from '@/lib/user-display';
import { getFollowingIds } from '@/lib/social/follow-graph.server';
import { cached } from '@/lib/cached.server';
import {
  redisEnabled,
  redisGetJSON,
  redisMGetJSON,
  redisSetJSON,
  redisDel,
} from '@/lib/redis.server';
import { filterOnlineUsers } from '@/lib/hot-counters.server';
import { joinTargetFor, type PresenceActivity, type ActiveFriend } from '@/lib/presence-types';

const ONLINE_WINDOW_MS = 2 * 60 * 1000;

/**
 * The online-id resolution sits behind a ~minute-cadence per-viewer poll, so a
 * short read-through cache collapses the repeated work into one pass per viewer
 * per window while staying fresh enough that "who's online" isn't visibly stale.
 */
const ONLINE_IDS_TTL_MS = 15_000;

export interface OnlineFriend {
  user: ReturnType<typeof resolveUser>;
  /** A joinable public room the friend is in, or null. */
  activity: { kind: 'rmhtube' | 'rmhmusic'; label: string; href: string } | null;
}

interface OnlineFollows {
  ids: string[];
  /**
   * True when the Redis presence set answered, meaning `ids` is already exactly
   * the online subset. False when we fell back to the follow list unfiltered, in
   * which case the row queries must still apply the coarse `lastSeenAt` window.
   */
  precise: boolean;
}

/**
 * The viewer's follows who are online now. Cheap enough to cache aggressively:
 * the follow graph is already cached and the online test is two Redis commands
 * regardless of how many follows there are — no database read at all on the
 * Redis path.
 */
async function onlineFollowIds(viewerId: string): Promise<OnlineFollows> {
  return cached<OnlineFollows>(`presence:online-ids:${viewerId}`, ONLINE_IDS_TTL_MS, async () => {
    // Reuse the cached follow-graph reader instead of an unbounded raw findMany —
    // it's the same list the feed already keeps warm, invalidated on follow/block.
    const followingIds = await getFollowingIds(viewerId);
    if (followingIds.length === 0) return { ids: [], precise: true };

    const online = await filterOnlineUsers(followingIds);
    // Null means Redis is unavailable — fall back to the whole follow list and let
    // the row queries filter on `lastSeenAt` as they did before.
    if (online === null) return { ids: followingIds, precise: false };
    return { ids: online, precise: true };
  });
}

/**
 * Row-level presence gate.
 *
 * `nobody` is an explicit opt-out of every presence surface, so it is honoured
 * here rather than in one caller: both surfaces show presence, and a filter that
 * lived in only one of them would be a trap for the next reader. `mutuals` and
 * `followers` both admit a viewer who follows the target, and every caller has
 * already narrowed to people the viewer follows, so nothing further is needed.
 *
 * A user with no profile row has no setting and takes the visible default.
 */
function visibilityFilter(): Prisma.UserWhereInput {
  return {
    OR: [{ profile: null }, { profile: { presenceVisibility: { not: 'nobody' } } }],
  };
}

/** Shared where-clause for "these ids, online, visible, not a bot". */
function onlineRowsWhere(follows: OnlineFollows, ids: string[]): Prisma.UserWhereInput {
  return {
    id: { in: ids },
    isBot: false,
    ...visibilityFilter(),
    // Only on the fallback path: when the Redis set answered, `ids` is already the
    // online subset, and re-filtering on the throttled column would drop most of
    // them (lastSeenAt reaches Postgres about once every 5 minutes).
    ...(follows.precise ? {} : { lastSeenAt: { gte: new Date(Date.now() - ONLINE_WINDOW_MS) } }),
  };
}

/**
 * Followed users who are online, each with the public room they're in. Excludes
 * anyone who set presence visibility to `nobody`.
 */
export async function getOnlineFriends(viewerId: string, limit = 12): Promise<OnlineFriend[]> {
  const follows = await onlineFollowIds(viewerId);
  if (follows.ids.length === 0) return [];

  const online = await prisma.user.findMany({
    where: onlineRowsWhere(follows, follows.ids),
    select: { ...userDisplaySelect, lastSeenAt: true },
    orderBy: { lastSeenAt: 'desc' },
    take: limit,
  });
  if (online.length === 0) return [];

  const onlineIds = online.map((u) => u.id);

  // Active room memberships (leftAt null, room still open + public) so we can
  // show "watching together" / "in a listening room" with a join link.
  const [tubeMembers, musicMembers] = await Promise.all([
    prisma.rmhTubeRoomMember.findMany({
      where: {
        userId: { in: onlineIds },
        leftAt: null,
        room: { closedAt: null, isPublic: true },
      },
      select: { userId: true, roomId: true },
    }),
    prisma.rmhMusicRoomMember.findMany({
      where: { userId: { in: onlineIds }, leftAt: null, room: { isPublic: true } },
      select: { userId: true, room: { select: { code: true } } },
    }),
  ]);

  const tubeByUser = new Map(tubeMembers.map((m) => [m.userId, m.roomId]));
  const musicByUser = new Map(musicMembers.map((m) => [m.userId, m.room.code]));

  return online.map((u) => {
    let activity: OnlineFriend['activity'] = null;
    const tubeRoom = tubeByUser.get(u.id);
    const musicRoom = musicByUser.get(u.id);
    if (tubeRoom) {
      activity = { kind: 'rmhtube', label: 'Watching together', href: `/rmhtube/${tubeRoom}` };
    } else if (musicRoom) {
      activity = { kind: 'rmhmusic', label: 'In a listening room', href: `/rmhmusic/${musicRoom}` };
    }
    return { user: resolveUser(u), activity };
  });
}

// ─── Rich presence activity (§9) ─────────────────────────────────────────────
//
// Activity is ephemeral — it expires with the heartbeat window so a crash/kill
// never leaks a stale "in a match". Backed by Redis when available (shared
// across instances) with an in-process fallback for single-node/dev.

const ACTIVITY_TTL_MS = ONLINE_WINDOW_MS;
const activityKey = (userId: string) => `presence:activity:${userId}`;

/** In-process fallback store (used only when Redis is unconfigured). */
const localActivity = new Map<string, { activity: PresenceActivity; expires: number }>();

/**
 * Set (or clear, with `null`) a user's current activity. Called **server-side
 * only** by the surfaces the user is in (game match join/leave, room join/leave,
 * space join/leave) — never client-asserted. Best-effort; never throws into the
 * caller's transition.
 */
export async function setActivity(
  userId: string,
  activity: PresenceActivity | null,
): Promise<void> {
  try {
    if (redisEnabled()) {
      if (activity) await redisSetJSON(activityKey(userId), activity, ACTIVITY_TTL_MS);
      else await redisDel(activityKey(userId));
      return;
    }
    if (activity) localActivity.set(userId, { activity, expires: Date.now() + ACTIVITY_TTL_MS });
    else localActivity.delete(userId);
  } catch (err) {
    console.error('[presence] setActivity failed:', err);
  }
}

/** Read one user's live activity (or null if idle/expired). */
export async function getActivity(userId: string): Promise<PresenceActivity | null> {
  if (redisEnabled()) return (await redisGetJSON<PresenceActivity>(activityKey(userId))) ?? null;
  const entry = localActivity.get(userId);
  if (!entry) return null;
  if (entry.expires < Date.now()) {
    localActivity.delete(userId);
    return null;
  }
  return entry.activity;
}

/**
 * Batch-read activities for a set of users into a Map (missing = idle). One MGET
 * rather than a GET per user — this runs for every row of the Friends rail.
 */
async function getActivities(userIds: string[]): Promise<Map<string, PresenceActivity>> {
  const out = new Map<string, PresenceActivity>();
  if (userIds.length === 0) return out;

  if (redisEnabled()) {
    const values = await redisMGetJSON<PresenceActivity>(userIds.map(activityKey));
    if (values) {
      values.forEach((activity, i) => {
        if (activity) out.set(userIds[i], activity);
      });
      return out;
    }
  }

  // Redis off (or the MGET failed) — read the in-process fallback store.
  for (const id of userIds) {
    const a = await getActivity(id);
    if (a) out.set(id, a);
  }
  return out;
}

/**
 * The viewer's **mutuals** who are online now, with rich activity + a joinable
 * target, each filtered through the *target's* presence visibility/detail. The
 * base set is mutuals only, so non-mutuals never appear regardless of settings
 * (§9 default scope).
 */
export async function getActiveFriends(viewerId: string, limit = 20): Promise<ActiveFriend[]> {
  const follows = await onlineFollowIds(viewerId);
  if (follows.ids.length === 0) return [];

  // Mutuals = people the viewer follows who follow the viewer back. Checked
  // against the *online* subset rather than the whole follow list, so on the Redis
  // path this is a small indexed read instead of a 5000-wide IN list.
  const backEdges = await prisma.follow.findMany({
    where: { followerId: { in: follows.ids }, followingId: viewerId },
    select: { followerId: true },
  });
  if (backEdges.length === 0) return [];
  const mutualIds = backEdges.map((f) => f.followerId);

  const online = await prisma.user.findMany({
    where: onlineRowsWhere(follows, mutualIds),
    select: {
      ...userDisplaySelect,
      lastSeenAt: true,
      profile: {
        select: {
          displayName: true,
          customImage: true,
          presenceVisibility: true,
          presenceDetail: true,
        },
      },
    },
    orderBy: { lastSeenAt: 'desc' },
    take: limit,
  });
  if (online.length === 0) return [];

  const activities = await getActivities(online.map((u) => u.id));

  const result: ActiveFriend[] = online.map((u) => {
    const detail = u.profile?.presenceDetail ?? true;
    const activity = detail ? (activities.get(u.id) ?? null) : null;
    const resolved = resolveUser(u);
    return {
      user: {
        id: resolved.id,
        name: resolved.name,
        handle: resolved.handle ?? null,
        username: resolved.username ?? null,
        image: resolved.image,
      },
      activity,
      joinable: joinTargetFor(activity),
    };
  });

  // In-something first (a live activity is the useful, actionable state), then
  // by recency (the query already ordered by lastSeenAt desc).
  result.sort((a, b) => Number(Boolean(b.activity)) - Number(Boolean(a.activity)));
  return result;
}
