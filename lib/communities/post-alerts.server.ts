/**
 * Community post alerts — server only.
 *
 * A member can turn on "all new posts" for a community (`CommunityMember.postAlerts`). When a post becomes visible in
 * the community (created unheld, approved from the mod queue, or published from the schedule) the request only calls
 * {@link enqueuePostAlert}; the `communities.post-alerts` work queue (run by the jobs worker, `server/jobs/index.ts`)
 * calls {@link runPostAlertFanout}, which:
 *
 *  - re-reads the post and does nothing when it is gone, held, removed or its author is banned;
 *  - runs on a durable `FanoutRun` (`lib/fanout/run.server.ts`): a lease, a recipient cursor and counters, so a retried
 *    or duplicated job never notifies twice and a worker killed mid-send resumes after its last batch (the
 *    `CommunityPostAlertRun` row is still written for the code that reads it);
 *  - reads the community's opted-in members in batches of 500 by id cursor (at most 5 000 per post), drops the author,
 *    blocks either way, members who muted the author and banned members, and collapses a burst: a member with an
 *    unread alert for this community from the last 30 minutes gets that alert reworded instead of a new one;
 *  - notifies the rest through `createNotification`, so notification preferences, quiet hours and push apply.
 */
import type { PgBoss } from 'pg-boss';
import { prisma } from '@/lib/prisma.server';
import { userDisplaySelect } from '@/lib/user-display';
import { getBoss } from '@/lib/jobs/boss.server';
import { createNotification } from '@/lib/notifications.server';
import { runFanout } from '@/lib/fanout/run.server';
import {
  ALERT_BATCH_SIZE,
  COMMUNITY_POST_ENTITY,
  MAX_ALERT_RECIPIENTS,
  alertLink,
  alertPreview,
  collapseSince,
  collapsedPreview,
  filterRecipients,
  isBannedNow,
  isPostAlertLevel,
  isTooLargeForAlerts,
  postAlertJobKey,
  splitByCollapse,
  type PostAlertJob,
  type PostAlertLevel,
} from '@/lib/communities/post-alerts';
import type { PostAlertsDTO } from '@/lib/communities/post-alerts.contract';

export const POST_ALERT_QUEUE = 'communities.post-alerts';

/* ── The setting ────────────────────────────────────────────────────────── */

/** The member's setting, or null when they are not a member of the community. */
export async function getPostAlerts(communityId: string, userId: string): Promise<PostAlertsDTO | null> {
  const member = await prisma.communityMember.findUnique({
    where: {
      communityId_userId: {
        communityId,
        userId,
      },
    },
    select: {
      postAlerts: true,
      community: {
        select: {
          memberCount: true,
        },
      },
    },
  });
  if (!member) return null;
  return {
    level: isPostAlertLevel(member.postAlerts) ? member.postAlerts : 'off',
    tooLarge: isTooLargeForAlerts(member.community.memberCount),
  };
}

/** Set the member's setting. Null when they are not a member (nothing is written for a non-member). */
export async function setPostAlerts(
  communityId: string,
  userId: string,
  level: PostAlertLevel,
): Promise<PostAlertsDTO | null> {
  const updated = await prisma.communityMember.updateMany({
    where: {
      communityId,
      userId,
    },
    data: {
      postAlerts: level,
    },
  });
  if (updated.count === 0) return null;
  return getPostAlerts(communityId, userId);
}

/** The member's own data for the account export: the communities they asked to be alerted for. */
export async function exportPostAlerts(userId: string): Promise<
  {
    communityId: string;
    communityName: string;
    level: PostAlertLevel;
  }[]
> {
  const rows = await prisma.communityMember.findMany({
    where: {
      userId,
      postAlerts: 'all',
    },
    select: {
      communityId: true,
      community: {
        select: {
          name: true,
        },
      },
    },
    orderBy: {
      joinedAt: 'asc',
    },
  });
  return rows.map((r) => ({
    communityId: r.communityId,
    communityName: r.community.name,
    level: 'all',
  }));
}

/* ── Enqueue (the web tier) ─────────────────────────────────────────────── */

/**
 * Queue the fan-out for a post that has just become visible in a community. Keyed by post id, so enqueueing twice is
 * one job. A queue that is down is logged, never thrown: the post is already published.
 */
export async function enqueuePostAlert(postId: string): Promise<void> {
  try {
    const boss = await getBoss();
    if (!boss) throw new Error('queue unavailable');
    const job: PostAlertJob = {
      postId,
    };
    await boss.send(POST_ALERT_QUEUE, job, {
      singletonKey: postAlertJobKey(postId),
      retryLimit: 3,
      retryDelay: 60,
    });
  } catch (error) {
    console.error('[communities] could not queue the post alert fan-out:', error);
  }
}

/* ── Fan-out (the jobs worker) ──────────────────────────────────────────── */

export interface FanoutResult {
  /** New notifications written. */
  notified: number;
  /** Members whose recent unread alert was reworded instead. */
  collapsed: number;
}

const NONE: FanoutResult = {
  notified: 0,
  collapsed: 0,
};

export async function runPostAlertFanout(postId: string, now: Date = new Date()): Promise<FanoutResult> {
  const post = await prisma.rMHark.findFirst({
    where: { id: postId, deletedAt: null, communityId: { not: null } },
    select: {
      id: true,
      userId: true,
      communityId: true,
      user: { select: { ...userDisplaySelect, bannedUntil: true } },
      community: { select: { name: true } },
    },
  });
  if (!post?.communityId || !post.community) return NONE;
  if (isBannedNow(post.user.bannedUntil, now)) return NONE;
  const communityId = post.communityId;
  const communityName = post.community.name;
  const authorId = post.userId;

  // Compatibility: `CommunityPostAlertRun` is still written (other code reads it); the `FanoutRun` is the authority.
  await prisma.communityPostAlertRun.createMany({ data: [{ postId }], skipDuplicates: true });

  const authorName = post.user.profile?.displayName ?? post.user.name ?? post.user.handle ?? 'Someone';
  const preview = alertPreview(authorName, communityName);
  const link = alertLink(post.user, postId);

  // The unread alert id of each member of the batch being sent, set by `step` for `send`'s reword.
  let unreadByUser = new Map<string, string>();
  const totals = await runFanout(
    {
      kind: 'post-alert',
      subjectId: postId,
      delivery: { type: 'SYSTEM', entityType: COMMUNITY_POST_ENTITY, entityId: communityId, link },
      async step(after, scanned) {
        const take = Math.min(ALERT_BATCH_SIZE, MAX_ALERT_RECIPIENTS - scanned);
        if (take <= 0) return { recipients: [], collapse: [], lastId: null, scanned: 0, done: true };
        const members = await prisma.communityMember.findMany({
          where: {
            communityId,
            postAlerts: 'all',
            userId: { not: authorId, ...(after ? { gt: after } : {}) },
          },
          orderBy: { userId: 'asc' },
          take,
          select: { userId: true, user: { select: { bannedUntil: true } } },
        });
        if (members.length === 0) return { recipients: [], collapse: [], lastId: null, scanned: 0, done: true };
        const lastId = members[members.length - 1]!.userId;
        const done = members.length < take || scanned + members.length >= MAX_ALERT_RECIPIENTS;
        const ids = members.map((m) => m.userId);
        const [blocks, mutes, recent] = await Promise.all([
          prisma.userBlock.findMany({
            where: {
              OR: [
                { blockerId: authorId, blockedId: { in: ids } },
                { blockedId: authorId, blockerId: { in: ids } },
              ],
            },
            select: { blockerId: true, blockedId: true },
          }),
          prisma.userMute.findMany({
            where: { mutedId: authorId, muterId: { in: ids } },
            select: { muterId: true },
          }),
          prisma.notification.findMany({
            where: {
              userId: { in: ids },
              type: 'SYSTEM',
              entityType: COMMUNITY_POST_ENTITY,
              entityId: communityId,
              read: false,
              createdAt: { gte: collapseSince(now) },
            },
            select: { id: true, userId: true },
          }),
        ]);
        const recipients = filterRecipients(
          members.map((m) => ({ userId: m.userId, bannedUntil: m.user.bannedUntil })),
          {
            authorId,
            blockedWithAuthor: new Set(blocks.map((b) => (b.blockerId === authorId ? b.blockedId : b.blockerId))),
            mutedAuthor: new Set(mutes.map((m) => m.muterId)),
            now,
          },
        );
        unreadByUser = new Map(recent.map((n) => [n.userId, n.id] as const));
        const { fresh, collapsed } = splitByCollapse(recipients, new Set(unreadByUser.keys()));
        return { recipients: fresh, collapse: collapsed, lastId, scanned: members.length, done };
      },
      async send(fresh, collapsed) {
        // A burst: the member's unread alert now says "New posts in …"; no second notification, no second push.
        if (collapsed.length > 0) {
          const ids = collapsed.map((id) => unreadByUser.get(id)).filter((id): id is string => !!id);
          if (ids.length > 0) {
            await prisma.notification.updateMany({
              where: { id: { in: ids } },
              data: { preview: collapsedPreview(communityName) },
            });
          }
        }
        // createNotification applies each member's preferences, quiet hours and push, one recipient at a time.
        for (const userId of fresh) {
          await createNotification({
            userId,
            type: 'SYSTEM',
            entityType: COMMUNITY_POST_ENTITY,
            entityId: communityId,
            preview,
            link,
          });
        }
      },
    },
    now,
  );
  return totals ? { notified: totals.sent, collapsed: totals.collapsed } : NONE;
}

export async function registerCommunityPostAlertWorker(boss: PgBoss): Promise<void> {
  await boss.createQueue(POST_ALERT_QUEUE);
  await boss.work<PostAlertJob>(POST_ALERT_QUEUE, async (jobs) => {
    // A throw makes pg-boss retry per the send options; the claim row makes the retry safe.
    for (const job of jobs) await runPostAlertFanout(job.data.postId);
  });
}
