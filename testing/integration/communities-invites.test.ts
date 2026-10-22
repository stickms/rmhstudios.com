/**
 * Community invites and join requests under real concurrency, on a real
 * Postgres: the conditional-UPDATE consume in `acceptInvite`, its rollback, and
 * the races between accepting a link and a moderator's decision or removal.
 *
 * Moved here from lib/communities/__tests__ (where it was gated on an
 * RMH_TEST_DATABASE_URL and 42 pre-seeded users, so it never ran). It seeds its
 * own users and community and deletes them after, so it runs in the `integration`
 * job's throwaway database like every other file in this directory.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/prisma.server';
import { acceptInvite } from '@/lib/communities/invites.server';
import { decideRequest, markRemoved } from '@/lib/communities/join-requests.server';
import { deleteUsers, seedUsers, uniq } from './lib/seed';

let users: string[] = [];
let owner = '';
let pool: string[] = [];
let community: { id: string; slug: string; name: string };
let n = 0;

const mint = (data: { maxUses?: number | null; revokedAt?: Date | null; expiresAt?: Date | null; uses?: number }) =>
  prisma.communityInvite.create({
    data: { communityId: community.id, createdById: owner, code: `${uniq('code')}-${n++}`, ...data },
  });
const memberCount = () =>
  prisma.community.findUniqueOrThrow({ where: { id: community.id }, select: { memberCount: true } }).then((c) => c.memberCount);

beforeAll(async () => {
  users = await seedUsers('inv', 90);
  [owner, ...pool] = users;
  const c = await prisma.community.create({
    data: {
      slug: uniq('conc'),
      name: 'integration invites',
      isPrivate: true,
      createdById: owner,
      members: { create: { userId: owner, role: 'ADMIN' } },
    },
  });
  community = { id: c.id, slug: c.slug, name: c.name };
});

afterAll(async () => {
  await deleteUsers(users); // cascades to the community, its invites, members and requests
  await prisma.$disconnect();
});

describe('acceptInvite concurrency', () => {
  it('40 concurrent accepts of a maxUses=5 link let exactly 5 in and consume exactly 5 uses', async () => {
    const invite = await mint({ maxUses: 5 });
    const before = await memberCount();
    const results = await Promise.all(pool.slice(0, 40).map((u) => acceptInvite(community.id, u, invite.code)));
    expect(results.filter((r) => r.ok).length).toBe(5);
    expect(results.filter((r) => !r.ok).every((r) => !r.ok && r.reason === 'invalid')).toBe(true);
    const after = await prisma.communityInvite.findUnique({ where: { id: invite.id } });
    expect(after?.uses).toBe(5);
    expect(await prisma.communityMember.count({ where: { communityId: community.id, userId: { in: pool.slice(0, 40) } } })).toBe(5);
    expect(await memberCount()).toBe(before + 5);
  });

  it('a user accepting twice concurrently is one member and one use', async () => {
    const invite = await mint({ maxUses: null });
    const user = pool[40];
    const before = await memberCount();
    const results = await Promise.all([1, 2, 3, 4].map(() => acceptInvite(community.id, user, invite.code)));
    expect(results.every((r) => r.ok)).toBe(true);
    expect(await prisma.communityMember.count({ where: { communityId: community.id, userId: user } })).toBe(1);
    expect((await prisma.communityInvite.findUnique({ where: { id: invite.id } }))?.uses).toBe(1);
    expect(await memberCount()).toBe(before + 1);
  });

  it('revoked, expired and exhausted codes are rejected identically', async () => {
    const revoked = await mint({ revokedAt: new Date() });
    const expired = await mint({ expiresAt: new Date(Date.now() - 1000) });
    const exhausted = await mint({ maxUses: 1, uses: 1 });
    const outcomes = await Promise.all(
      [revoked.code, expired.code, exhausted.code, 'no-such-code'].map((code) => acceptInvite(community.id, pool[41], code)),
    );
    for (const o of outcomes) expect(o).toEqual({ ok: false, reason: 'invalid' });
  });
});

describe('acceptInvite rollback', () => {
  it('a membership insert that fails rolls back the consumed use', async () => {
    const victim = pool[42];
    const fn = `${uniq('fail').replace(/-/g, '_')}_fn`;
    // A real database error at the membership insert, after the `uses + 1` UPDATE ran.
    await prisma.$executeRawUnsafe(
      `CREATE FUNCTION ${fn}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
         IF NEW."userId" = '${victim}' THEN RAISE EXCEPTION 'integration: membership insert refused'; END IF;
         RETURN NEW; END $$`,
    );
    await prisma.$executeRawUnsafe(`CREATE TRIGGER ${fn} BEFORE INSERT ON community_member FOR EACH ROW EXECUTE FUNCTION ${fn}()`);
    try {
      const invite = await mint({ maxUses: 3 });
      const before = await memberCount();
      await expect(acceptInvite(community.id, victim, invite.code)).rejects.toThrow();
      expect((await prisma.communityInvite.findUnique({ where: { id: invite.id } }))?.uses).toBe(0);
      expect(await prisma.communityMember.count({ where: { communityId: community.id, userId: victim } })).toBe(0);
      expect(await memberCount()).toBe(before);
      // The use was not burnt: the same link still admits someone else.
      expect(await acceptInvite(community.id, pool[43], invite.code)).toEqual({ ok: true, alreadyMember: false });
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${fn} ON community_member`);
      await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS ${fn}()`);
    }
  });
});

describe('acceptInvite racing a moderator', () => {
  it('accept racing approve of the same pending request: one member, counted once, request APPROVED', async () => {
    for (let i = 0; i < 10; i++) {
      const user = pool[44 + i];
      const invite = await mint({ maxUses: null });
      const request = await prisma.communityJoinRequest.create({ data: { communityId: community.id, userId: user } });
      const before = await memberCount();
      const [accepted, decided] = await Promise.all([
        acceptInvite(community.id, user, invite.code),
        decideRequest(community, request.id, owner, 'approve'),
      ]);
      expect(accepted.ok).toBe(true);
      expect(decided.ok === true || decided.ok === false).toBe(true); // either order is fine
      expect(await prisma.communityMember.count({ where: { communityId: community.id, userId: user } })).toBe(1);
      expect(await memberCount()).toBe(before + 1);
      expect((await prisma.communityJoinRequest.findUniqueOrThrow({ where: { id: request.id } })).status).toBe('APPROVED');
      // Whoever got in first, at most one use was consumed.
      expect((await prisma.communityInvite.findUniqueOrThrow({ where: { id: invite.id } })).uses).toBeLessThanOrEqual(1);
    }
  });

  it('a removal racing the removed member accepting a live link keeps them out', async () => {
    for (let i = 0; i < 10; i++) {
      const user = pool[54 + i];
      const invite = await mint({ maxUses: null });
      await prisma.communityMember.create({ data: { communityId: community.id, userId: user } });
      await prisma.community.update({ where: { id: community.id }, data: { memberCount: { increment: 1 } } });
      const before = await memberCount();
      // The removal route's own transaction: delete the member, decrement, record REMOVED.
      const removal = prisma.$transaction([
        prisma.communityMember.deleteMany({ where: { communityId: community.id, userId: user } }),
        prisma.community.update({ where: { id: community.id }, data: { memberCount: { decrement: 1 } } }),
        markRemoved(prisma, community.id, user, owner),
      ]);
      const [accepted] = await Promise.all([acceptInvite(community.id, user, invite.code), removal]);
      expect(accepted.ok === true || accepted.ok === false).toBe(true);
      expect((await prisma.communityJoinRequest.findUniqueOrThrow({ where: { communityId_userId: { communityId: community.id, userId: user } } })).status).toBe('REMOVED');
      expect(await prisma.communityMember.count({ where: { communityId: community.id, userId: user } })).toBe(0);
      expect(await memberCount()).toBe(before - 1);
    }
  });

  it('once a REMOVED row is committed the same live link is refused and consumes no use', async () => {
    const user = pool[64];
    const invite = await mint({ maxUses: 5 });
    await markRemoved(prisma, community.id, user, owner);
    expect(await acceptInvite(community.id, user, invite.code)).toEqual({ ok: false, reason: 'invalid' });
    expect((await prisma.communityInvite.findUniqueOrThrow({ where: { id: invite.id } })).uses).toBe(0);
    expect(await prisma.communityMember.count({ where: { communityId: community.id, userId: user } })).toBe(0);
  });
});
