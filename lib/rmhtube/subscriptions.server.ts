/**
 * Subscribing to an RMHTube host (s13-07), server only.
 *
 * - `subscribeToHost` / `unsubscribeFromHost`: the toggle behind `PUT|DELETE /api/rmhtube/subscribe/$channelId`. Both
 *   are idempotent. A subscribe is refused for yourself, a host who is blocked either way, banned, erased or pending
 *   deletion (all `NOT_FOUND`, so a block is never confirmed), and past {@link MAX_TUBE_SUBSCRIPTIONS} hosts (the cap
 *   is counted under `lockKey`, so two requests cannot both pass it).
 * - `listMySubscriptions`: the hosts the member follows, names joined now. Nobody can list a host's subscribers and no
 *   response carries a count.
 * - `audienceBatch` and `runTubePartyFanout`: when a host schedules a public party every subscriber is told once, on a
 *   durable `FanoutRun` of kind `tube-party` (subject: the room id), so a worker restart neither skips nor repeats a
 *   batch. Subscribers blocked either way with the host, banned, pending deletion, or already going are skipped.
 * - `exportTubeSubscriptions`: the member's own data for the account export. Erasure of `RmhTubeSubscription` stays
 *   `owner` (the open follows decision).
 */
import type { PgBoss } from 'pg-boss';
import { prisma } from '@/lib/prisma.server';
import { lockKey } from '@/lib/db/advisory-lock.server';
import { getBoss } from '@/lib/jobs/boss.server';
import { createNotification } from '@/lib/notifications.server';
import { notice } from '@/lib/notifications/notice-keys';
import { resolveUser, userDisplaySelect } from '@/lib/user-display';
import { runFanout, type FanoutBatch } from '@/lib/fanout/run.server';
import {
  MAX_TUBE_SUBSCRIPTIONS,
  PARTY_FANOUT_BATCH,
  PARTY_FANOUT_MAX,
  PARTY_FANOUT_QUEUE,
  PARTY_NOTICE_ENTITY,
  atSubscriptionCap,
  eligibleSubscribers,
  isHostReachable,
  partyFanoutJobKey,
  partyNoticeLink,
  type PartyFanoutJob,
  type TubeHostDTO,
} from '@/lib/rmhtube/subscriptions';

export { PARTY_FANOUT_QUEUE };

const reachableSelect = { ...userDisplaySelect, bannedUntil: true, deletionScheduledAt: true } as const;

export type SubscribeResult =
  | { ok: true; subscribed: true }
  | { ok: false; code: 'TUBE_SUBSCRIBE_SELF' | 'NOT_FOUND' }
  | { ok: false; code: 'TUBE_SUBSCRIBE_LIMIT'; max: number };

async function blockedEitherWay(a: string, b: string): Promise<boolean> {
  const hit = await prisma.userBlock.findFirst({
    where: {
      OR: [
        { blockerId: a, blockedId: b },
        { blockerId: b, blockedId: a },
      ],
    },
    select: { id: true },
  });
  return !!hit;
}

/** Follow a host's watch parties. Following twice is the same as once. */
export async function subscribeToHost(
  subscriberId: string,
  hostId: string,
  now: Date = new Date(),
): Promise<SubscribeResult> {
  if (hostId === subscriberId) return { ok: false, code: 'TUBE_SUBSCRIBE_SELF' };
  const host = await prisma.user.findUnique({
    where: { id: hostId },
    select: { id: true, bannedUntil: true, deletionScheduledAt: true },
  });
  if (!host || !isHostReachable(host, now)) return { ok: false, code: 'NOT_FOUND' };
  if (await blockedEitherWay(subscriberId, hostId)) return { ok: false, code: 'NOT_FOUND' };

  return prisma.$transaction(async (tx): Promise<SubscribeResult> => {
    await lockKey(tx, `tube-subscriptions:${subscriberId}`);
    const existing = await tx.rmhTubeSubscription.findUnique({
      where: { subscriberId_channelId: { subscriberId, channelId: hostId } },
      select: { id: true },
    });
    if (existing) return { ok: true, subscribed: true };
    const count = await tx.rmhTubeSubscription.count({ where: { subscriberId } });
    if (atSubscriptionCap(count)) return { ok: false, code: 'TUBE_SUBSCRIBE_LIMIT', max: MAX_TUBE_SUBSCRIPTIONS };
    await tx.rmhTubeSubscription.create({ data: { subscriberId, channelId: hostId } });
    return { ok: true, subscribed: true };
  });
}

/** Stop following. Not following is the same as having stopped. */
export async function unsubscribeFromHost(subscriberId: string, hostId: string): Promise<void> {
  await prisma.rmhTubeSubscription.deleteMany({ where: { subscriberId, channelId: hostId } });
}

/** Which of `hostIds` the member follows (the buttons' initial state). */
export async function subscribedAmong(subscriberId: string, hostIds: readonly string[]): Promise<Set<string>> {
  if (hostIds.length === 0) return new Set();
  const rows = await prisma.rmhTubeSubscription.findMany({
    where: { subscriberId, channelId: { in: [...hostIds] } },
    select: { channelId: true },
  });
  return new Set(rows.map((r) => r.channelId));
}

/** The hosts the member follows, newest first, names as they are now. Hosts who are gone or blocked are left out. */
export async function listMySubscriptions(subscriberId: string, now: Date = new Date()): Promise<TubeHostDTO[]> {
  const rows = await prisma.rmhTubeSubscription.findMany({
    where: { subscriberId },
    orderBy: { createdAt: 'desc' },
    take: MAX_TUBE_SUBSCRIPTIONS,
    select: { channel: { select: reachableSelect } },
  });
  const hosts = rows.map((r) => r.channel).filter((c) => isHostReachable(c, now));
  if (hosts.length === 0) return [];
  const blocks = await prisma.userBlock.findMany({
    where: {
      OR: [
        { blockerId: subscriberId, blockedId: { in: hosts.map((h) => h.id) } },
        { blockedId: subscriberId, blockerId: { in: hosts.map((h) => h.id) } },
      ],
    },
    select: { blockerId: true, blockedId: true },
  });
  const blocked = new Set(blocks.map((b) => (b.blockerId === subscriberId ? b.blockedId : b.blockerId)));
  return hosts
    .filter((h) => !blocked.has(h.id))
    .map((h) => ({ id: h.id, name: resolveUser(h).name, handle: h.handle }));
}

/** The member's own data for the account export: the hosts they follow, names as they are now. */
export async function exportTubeSubscriptions(
  userId: string,
): Promise<{ hostId: string; name: string | null; handle: string | null; subscribedAt: string }[]> {
  const rows = await prisma.rmhTubeSubscription.findMany({
    where: { subscriberId: userId },
    orderBy: { createdAt: 'asc' },
    select: { channelId: true, createdAt: true, channel: { select: userDisplaySelect } },
  });
  return rows.map((r) => ({
    hostId: r.channelId,
    name: resolveUser(r.channel).name,
    handle: r.channel.handle,
    subscribedAt: r.createdAt.toISOString(),
  }));
}

/* ── The party notice ───────────────────────────────────────────────────── */

/**
 * The next batch of a host's audience strictly after `after` (a subscriber id), already filtered: not blocked either
 * way with the host, not banned or pending deletion, not already going to the party.
 */
export async function audienceBatch(
  hostId: string,
  roomId: string,
  after: string | null,
  take: number,
  now: Date = new Date(),
): Promise<FanoutBatch> {
  const rows = await prisma.rmhTubeSubscription.findMany({
    where: { channelId: hostId, ...(after ? { subscriberId: { gt: after } } : {}) },
    orderBy: { subscriberId: 'asc' },
    take,
    select: { subscriberId: true, subscriber: { select: { id: true, bannedUntil: true, deletionScheduledAt: true } } },
  });
  if (rows.length === 0) return { recipients: [], collapse: [], lastId: null, scanned: 0, done: true };
  const ids = rows.map((r) => r.subscriberId);
  const [blocks, going] = await Promise.all([
    prisma.userBlock.findMany({
      where: {
        OR: [
          { blockerId: hostId, blockedId: { in: ids } },
          { blockedId: hostId, blockerId: { in: ids } },
        ],
      },
      select: { blockerId: true, blockedId: true },
    }),
    prisma.rmhTubeRoomRsvp.findMany({ where: { roomId, userId: { in: ids } }, select: { userId: true } }),
  ]);
  const recipients = eligibleSubscribers(
    rows.map((r) => r.subscriber),
    {
      blocked: new Set(
        (blocks as { blockerId: string; blockedId: string }[]).map((b) =>
          b.blockerId === hostId ? b.blockedId : b.blockerId,
        ),
      ),
      going: new Set((going as { userId: string }[]).map((g) => g.userId)),
      now,
    },
  );
  return {
    recipients,
    collapse: [],
    lastId: rows[rows.length - 1]!.subscriberId,
    scanned: rows.length,
    done: rows.length < take,
  };
}

export interface PartyFanoutResult {
  /** Notices written (members skipped as already told by an earlier runner count). */
  notified: number;
}

/**
 * The job: tell a host's subscribers about a public party they scheduled. Re-reads the party and does nothing when it
 * is gone, private, closed, already past, or its host is banned or pending deletion.
 */
export async function runTubePartyFanout(roomId: string, now: Date = new Date()): Promise<PartyFanoutResult> {
  const room = await prisma.rmhTubeRoom.findUnique({
    where: { id: roomId },
    select: {
      id: true,
      name: true,
      hostId: true,
      isPublic: true,
      closedAt: true,
      scheduledFor: true,
      host: { select: reachableSelect },
    },
  });
  if (!room?.scheduledFor || !room.isPublic || room.closedAt) return { notified: 0 };
  if (room.scheduledFor.getTime() <= now.getTime() || !isHostReachable(room.host, now)) return { notified: 0 };

  const hostId = room.hostId;
  const startsAt = room.scheduledFor;
  const preview = notice('tube-party-scheduled', {
    host: resolveUser(room.host).name ?? room.host.handle ?? 'Someone',
    title: room.name?.trim() || 'Watch party',
    startsAt,
  });
  const link = partyNoticeLink(roomId);

  const totals = await runFanout(
    {
      kind: 'tube-party',
      subjectId: roomId,
      delivery: { type: 'SYSTEM', entityType: PARTY_NOTICE_ENTITY, entityId: roomId, link },
      async step(after, scanned) {
        const take = Math.min(PARTY_FANOUT_BATCH, PARTY_FANOUT_MAX - scanned);
        if (take <= 0) return { recipients: [], collapse: [], lastId: null, scanned: 0, done: true };
        const batch = await audienceBatch(hostId, roomId, after, take, now);
        return scanned + batch.scanned >= PARTY_FANOUT_MAX ? { ...batch, done: true } : batch;
      },
      async send(recipients) {
        // createNotification applies each member's preferences, quiet hours and push, one recipient at a time.
        for (const userId of recipients) {
          await createNotification({
            userId,
            type: 'SYSTEM',
            category: 'events',
            entityType: PARTY_NOTICE_ENTITY,
            entityId: roomId,
            preview,
            link,
          });
        }
      },
    },
    now,
  );
  return { notified: totals?.sent ?? 0 };
}

/**
 * Queue the fan-out for a public party that has just been scheduled. Called after `scheduleParty`'s transaction
 * commits. Keyed by room, so queueing twice is one job; a queue that is down is logged, never thrown (the party exists).
 */
export async function enqueueTubePartyFanout(roomId: string): Promise<void> {
  try {
    const boss = await getBoss();
    if (!boss) throw new Error('queue unavailable');
    const job: PartyFanoutJob = { roomId };
    await boss.send(PARTY_FANOUT_QUEUE, job, {
      singletonKey: partyFanoutJobKey(roomId),
      retryLimit: 3,
      retryDelay: 60,
    });
  } catch (error) {
    console.error('[rmhtube] could not queue the party fan-out:', error);
  }
}

export async function registerTubePartyFanoutWorker(boss: PgBoss): Promise<void> {
  await boss.createQueue(PARTY_FANOUT_QUEUE);
  await boss.work<PartyFanoutJob>(PARTY_FANOUT_QUEUE, async (jobs) => {
    // A throw makes pg-boss retry per the send options; the run row's lease and told-ids rule make the retry safe.
    for (const job of jobs) await runTubePartyFanout(job.data.roomId);
  });
}
