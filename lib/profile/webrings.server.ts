/**
 * Server half of webrings (P6). Server-only.
 *
 * The ring order and the hop maths are the pure template in
 * `lib/profile/webring.ts`; this file supplies what the template deliberately
 * leaves to the caller — the member list, and the `eligible` predicate:
 *
 *   • not a deleted account (`banReason === 'account_deleted'`, the tombstone
 *     marker), not currently banned, not in a deletion grace window;
 *   • not blocked by, and not blocking, the viewer — a hop must never land on a
 *     profile the viewer cannot see.
 *
 * There is no "private profile" setting on this site (every profile is public),
 * so there is nothing to filter on for that part of the spec.
 */
import { prisma } from '@/lib/prisma.server';
import { userChipSelect, userDisplaySelect, resolveUser } from '@/lib/user-display';
import { DELETED_ACCOUNT_BAN_REASON } from '@/lib/account-lifecycle';
import { hops, randomHop, ringOrder, type RingMember } from '@/lib/profile/webring';
import { setProfileModules } from '@/lib/profile/plus.server';
import {
  RING_MAX_JOINED,
  RING_MAX_MEMBERS,
  RING_MAX_OWNED,
  RING_STRIP_MAX,
  ringSlugBase,
  type CreateRingInput,
  type RingDetail,
  type RingNeighbour,
  type RingStrip,
  type RingSummary,
} from '@/lib/profile/webrings';

export type RingResult<T> = { ok: true; value: T } | { ok: false; status: number; error: string };

/** Accounts that may appear in a ring at all, as a Prisma `where` fragment. */
function liveAccount(now: Date) {
  return {
    deletionScheduledAt: null,
    OR: [{ banReason: null }, { banReason: { not: DELETED_ACCOUNT_BAN_REASON } }],
    AND: [{ OR: [{ bannedUntil: null }, { bannedUntil: { lt: now } }] }],
  };
}

/** Ids the viewer has blocked or been blocked by. */
async function blockedEitherWay(viewerId: string | null): Promise<Set<string>> {
  if (!viewerId) return new Set();
  const rows = await prisma.userBlock.findMany({
    where: { OR: [{ blockerId: viewerId }, { blockedId: viewerId }] },
    select: { blockerId: true, blockedId: true },
    take: 2000,
  });
  const out = new Set<string>();
  for (const r of rows) out.add(r.blockerId === viewerId ? r.blockedId : r.blockerId);
  return out;
}

const toSummary = (r: {
  slug: string;
  name: string;
  description: string | null;
  memberCount: number;
}): RingSummary => ({
  slug: r.slug,
  name: r.name,
  description: r.description,
  memberCount: r.memberCount,
});

/* -------------------------------------------------------------------------- */
/* Directory                                                                  */
/* -------------------------------------------------------------------------- */

export async function listRings(
  viewerId: string | null,
): Promise<{ popular: RingSummary[]; mine: RingSummary[] }> {
  const [popular, mine] = await Promise.all([
    prisma.webring.findMany({
      where: { removedAt: null, memberCount: { gt: 0 } },
      orderBy: [{ memberCount: 'desc' }, { createdAt: 'desc' }],
      take: 30,
      select: { slug: true, name: true, description: true, memberCount: true },
    }),
    viewerId
      ? prisma.webringMember.findMany({
          where: { userId: viewerId, ring: { removedAt: null } },
          orderBy: { joinedAt: 'asc' },
          take: RING_MAX_JOINED,
          select: {
            ring: { select: { slug: true, name: true, description: true, memberCount: true } },
          },
        })
      : Promise.resolve([]),
  ]);
  return { popular: popular.map(toSummary), mine: mine.map((m) => toSummary(m.ring)) };
}

export async function getRingDetail(
  slug: string,
  viewerId: string | null,
  now: Date = new Date(),
): Promise<RingDetail | null> {
  const ring = await prisma.webring.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      memberCount: true,
      ownerId: true,
      removedAt: true,
    },
  });
  if (!ring || ring.removedAt) return null;

  const [memberRows, blocked] = await Promise.all([
    prisma.webringMember.findMany({
      where: { ringId: ring.id },
      orderBy: [{ joinedAt: 'asc' }, { userId: 'asc' }],
      take: RING_MAX_MEMBERS,
      select: { userId: true, joinedAt: true },
    }),
    blockedEitherWay(viewerId),
  ]);
  const candidateIds = memberRows.map((m) => m.userId).filter((id) => !blocked.has(id));
  const users = candidateIds.length
    ? await prisma.user.findMany({
        where: { id: { in: candidateIds }, ...liveAccount(now) },
        select: userDisplaySelect,
      })
    : [];
  const byId = new Map(users.map((u) => [u.id, u]));
  const joined = new Map(memberRows.map((m) => [m.userId, m.joinedAt]));
  const members = ringOrder(
    memberRows.map((m) => ({ userId: m.userId, joinedAt: m.joinedAt.getTime() })),
  )
    .filter((id) => byId.has(id))
    .map((id) => ({
      ...resolveUser(byId.get(id)!),
      joinedAt: joined.get(id)!.toISOString(),
    }));

  return {
    ...toSummary(ring),
    id: ring.id,
    isOwner: viewerId === ring.ownerId,
    isMember: viewerId ? memberRows.some((m) => m.userId === viewerId) : false,
    members,
  };
}

/* -------------------------------------------------------------------------- */
/* Create / join / leave / delete                                             */
/* -------------------------------------------------------------------------- */

async function uniqueSlug(name: string): Promise<string> {
  const base = ringSlugBase(name);
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = attempt === 0 ? base : `${base}-${Math.random().toString(36).slice(2, 6)}`;
    const taken = await prisma.webring.findUnique({ where: { slug }, select: { id: true } });
    if (!taken) return slug;
  }
  return `${base}-${Date.now().toString(36)}`;
}

export async function createRing(
  userId: string,
  input: CreateRingInput,
): Promise<RingResult<RingSummary>> {
  const [owned, joined] = await Promise.all([
    prisma.webring.count({ where: { ownerId: userId, removedAt: null } }),
    prisma.webringMember.count({ where: { userId } }),
  ]);
  if (owned >= RING_MAX_OWNED) {
    return { ok: false, status: 409, error: `You can run up to ${RING_MAX_OWNED} webrings.` };
  }
  if (joined >= RING_MAX_JOINED) {
    return { ok: false, status: 409, error: `You can be in up to ${RING_MAX_JOINED} webrings.` };
  }
  const slug = await uniqueSlug(input.name);
  const ring = await prisma.webring.create({
    data: {
      slug,
      name: input.name,
      description: input.description?.trim() || null,
      ownerId: userId,
      memberCount: 1,
      members: { create: { userId } },
    },
    select: { slug: true, name: true, description: true, memberCount: true },
  });
  await setProfileModules(userId, { webrings: true });
  return { ok: true, value: toSummary(ring) };
}

export async function joinRing(userId: string, slug: string): Promise<RingResult<true>> {
  const ring = await prisma.webring.findUnique({
    where: { slug },
    select: { id: true, removedAt: true, memberCount: true },
  });
  if (!ring || ring.removedAt) return { ok: false, status: 404, error: 'Ring not found.' };

  const outcome = await prisma.$transaction(async (tx) => {
    const already = await tx.webringMember.findUnique({
      where: { ringId_userId: { ringId: ring.id, userId } },
      select: { userId: true },
    });
    if (already) return 'already' as const;
    const [mine, size] = await Promise.all([
      tx.webringMember.count({ where: { userId } }),
      tx.webringMember.count({ where: { ringId: ring.id } }),
    ]);
    if (mine >= RING_MAX_JOINED) return 'joined-cap' as const;
    if (size >= RING_MAX_MEMBERS) return 'ring-full' as const;
    await tx.webringMember.create({ data: { ringId: ring.id, userId } });
    await tx.webring.update({ where: { id: ring.id }, data: { memberCount: { increment: 1 } } });
    return 'joined' as const;
  });
  if (outcome === 'joined-cap') {
    return { ok: false, status: 409, error: `You can be in up to ${RING_MAX_JOINED} webrings.` };
  }
  if (outcome === 'ring-full') return { ok: false, status: 409, error: 'This ring is full.' };
  if (outcome === 'joined') await setProfileModules(userId, { webrings: true });
  return { ok: true, value: true };
}

export async function leaveRing(userId: string, slug: string): Promise<void> {
  const ring = await prisma.webring.findUnique({ where: { slug }, select: { id: true } });
  if (!ring) return;
  await prisma.$transaction(async (tx) => {
    const res = await tx.webringMember.deleteMany({ where: { ringId: ring.id, userId } });
    if (res.count > 0) {
      await tx.webring.update({ where: { id: ring.id }, data: { memberCount: { decrement: 1 } } });
    }
  });
  const left = await prisma.webringMember.count({ where: { userId, ring: { removedAt: null } } });
  if (left === 0) await setProfileModules(userId, { webrings: false });
}

/** The owner closes their ring; members' strips disappear with it. */
export async function deleteOwnRing(userId: string, slug: string): Promise<boolean> {
  const ring = await prisma.webring.findUnique({
    where: { slug },
    select: { id: true, ownerId: true },
  });
  if (!ring || ring.ownerId !== userId) return false;
  await prisma.webring.delete({ where: { id: ring.id } });
  return true;
}

/** Moderation takedown (report resolved with "remove content"). Keeps the row for audit. */
export async function takedownRing(ringId: string, now: Date = new Date()): Promise<void> {
  await prisma.webring.updateMany({
    where: { id: ringId, removedAt: null },
    data: { removedAt: now },
  });
}

/* -------------------------------------------------------------------------- */
/* The profile strip                                                          */
/* -------------------------------------------------------------------------- */

interface RingContext {
  ring: RingSummary & { id: string };
  /** Join order, with every member this viewer may not be sent to removed. */
  order: string[];
  people: Map<string, RingNeighbour>;
}

/**
 * Load a ring's members and reduce them to the ones `viewerId` may be sent to.
 * `keep` is a member that stays in the order whatever its eligibility (the
 * profile being viewed — the template allows `current` to be ineligible).
 */
async function loadContexts(
  ringIds: string[],
  viewerId: string | null,
  keep: string | null,
  now: Date,
): Promise<Map<string, RingContext>> {
  if (ringIds.length === 0) return new Map();
  const [rings, memberRows, blocked] = await Promise.all([
    prisma.webring.findMany({
      where: { id: { in: ringIds }, removedAt: null },
      select: { id: true, slug: true, name: true, description: true, memberCount: true },
    }),
    prisma.webringMember.findMany({
      where: { ringId: { in: ringIds } },
      orderBy: [{ joinedAt: 'asc' }, { userId: 'asc' }],
      take: RING_MAX_MEMBERS * ringIds.length,
      select: { ringId: true, userId: true, joinedAt: true },
    }),
    blockedEitherWay(viewerId),
  ]);
  const unique = [...new Set(memberRows.map((m) => m.userId))].filter((id) => !blocked.has(id));
  const users = unique.length
    ? await prisma.user.findMany({
        where: { id: { in: unique }, ...liveAccount(now) },
        select: { ...userChipSelect },
      })
    : [];
  const people = new Map<string, RingNeighbour>(
    users.map((u) => [u.id, { id: u.id, handle: u.handle, name: u.name }]),
  );

  const byRing = new Map<string, RingMember[]>();
  for (const m of memberRows) {
    const list = byRing.get(m.ringId) ?? [];
    list.push({ userId: m.userId, joinedAt: m.joinedAt.getTime() });
    byRing.set(m.ringId, list);
  }
  const out = new Map<string, RingContext>();
  for (const ring of rings) {
    const order = ringOrder(byRing.get(ring.id) ?? []).filter(
      (id) => people.has(id) || id === keep,
    );
    out.set(ring.id, { ring: { id: ring.id, ...toSummary(ring) }, order, people });
  }
  return out;
}

/** The `← prev · ring · next →` strips for a member's profile (at most three). */
export async function ringStripsFor(
  profileUserId: string,
  viewerId: string | null,
  now: Date = new Date(),
): Promise<RingStrip[]> {
  const memberships = await prisma.webringMember.findMany({
    where: { userId: profileUserId, ring: { removedAt: null } },
    orderBy: { joinedAt: 'asc' },
    take: RING_STRIP_MAX,
    select: { ringId: true },
  });
  const contexts = await loadContexts(
    memberships.map((m) => m.ringId),
    viewerId,
    profileUserId,
    now,
  );
  const strips: RingStrip[] = [];
  for (const { ringId } of memberships) {
    const ctx = contexts.get(ringId);
    if (!ctx) continue;
    const eligible = (id: string) => ctx.people.has(id);
    const h = hops(ctx.order, profileUserId, eligible);
    // A ring with nobody else eligible hides its strip (the template's rule).
    if (!h || (!h.prev && !h.next)) continue;
    strips.push({
      ...ctx.ring,
      position: h.position,
      size: h.size,
      prev: h.prev ? (ctx.people.get(h.prev) ?? null) : null,
      next: h.next ? (ctx.people.get(h.next) ?? null) : null,
    });
  }
  return strips;
}

/** Where a random hop from `fromUserId` lands, or null if nobody else is eligible. */
export async function randomRingHop(
  slug: string,
  fromUserId: string,
  viewerId: string | null,
  rand: () => number = Math.random,
  now: Date = new Date(),
): Promise<RingNeighbour | null> {
  const ring = await prisma.webring.findUnique({
    where: { slug },
    select: { id: true, removedAt: true },
  });
  if (!ring || ring.removedAt) return null;
  const contexts = await loadContexts([ring.id], viewerId, fromUserId, now);
  const ctx = contexts.get(ring.id);
  if (!ctx) return null;
  const target = randomHop(ctx.order, fromUserId, (id) => ctx.people.has(id), rand);
  return target ? (ctx.people.get(target) ?? null) : null;
}
