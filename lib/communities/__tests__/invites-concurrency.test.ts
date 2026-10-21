/**
 * `acceptInvite` under real concurrency, against a real Postgres.
 *
 * Opt-in (the main suite is database-free):
 *   RMH_TEST_DATABASE_URL=postgresql://… pnpm exec vitest run lib/communities/__tests__/invites-concurrency.test.ts
 * The database needs the schema (and at least 40 `user` rows, e.g. a copy of the
 * seeded perf dataset). It creates one throwaway community and deletes it after.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const URL = process.env.RMH_TEST_DATABASE_URL;

describe.skipIf(!URL)('acceptInvite concurrency (real database)', () => {
  let prisma: typeof import('@/lib/prisma.server').prisma;
  let acceptInvite: typeof import('@/lib/communities/invites.server').acceptInvite;
  let communityId = '';
  let userIds: string[] = [];

  beforeAll(async () => {
    process.env.DATABASE_URL = URL;
    ({ prisma } = await import('@/lib/prisma.server'));
    ({ acceptInvite } = await import('@/lib/communities/invites.server'));
    const users = await prisma.user.findMany({ select: { id: true }, take: 41 });
    expect(users.length).toBeGreaterThanOrEqual(41);
    const [owner, ...rest] = users;
    userIds = rest.map((u) => u.id);
    const c = await prisma.community.create({
      data: {
        slug: `ws4-conc-${Date.now()}`,
        name: 'ws4 concurrency',
        isPrivate: true,
        createdById: owner.id,
        members: { create: { userId: owner.id, role: 'ADMIN' } },
      },
    });
    communityId = c.id;
  });

  afterAll(async () => {
    if (communityId) await prisma.community.delete({ where: { id: communityId } });
    await prisma.$disconnect();
  });

  const mint = (data: { maxUses?: number | null; revokedAt?: Date | null; expiresAt?: Date | null }) =>
    prisma.communityInvite.create({
      data: { communityId, createdById: userIds[0], code: `c-${Math.random().toString(36).slice(2)}${Date.now()}`, ...data },
    });

  it('40 concurrent accepts of a maxUses=5 link let exactly 5 in and consume exactly 5 uses', async () => {
    const invite = await mint({ maxUses: 5 });
    const results = await Promise.all(userIds.slice(0, 40).map((u) => acceptInvite(communityId, u, invite.code)));
    expect(results.filter((r) => r.ok).length).toBe(5);
    expect(results.filter((r) => !r.ok).every((r) => !r.ok && r.reason === 'invalid')).toBe(true);
    const after = await prisma.communityInvite.findUnique({ where: { id: invite.id } });
    expect(after?.uses).toBe(5);
    const members = await prisma.communityMember.count({ where: { communityId } });
    expect(members).toBe(1 + 5);
    const community = await prisma.community.findUnique({ where: { id: communityId }, select: { memberCount: true } });
    expect(community?.memberCount).toBe(1 + 5); // default 1 for the owner, +5 accepted
  });

  it('a user accepting twice concurrently is one member and one use', async () => {
    const invite = await mint({ maxUses: null });
    const user = userIds[40 - 1];
    const before = await prisma.communityMember.count({ where: { communityId } });
    const results = await Promise.all([1, 2, 3, 4].map(() => acceptInvite(communityId, user, invite.code)));
    expect(results.every((r) => r.ok)).toBe(true);
    const after = await prisma.communityMember.count({ where: { communityId } });
    const row = await prisma.communityInvite.findUnique({ where: { id: invite.id } });
    expect(after - before).toBeLessThanOrEqual(1);
    expect(row?.uses).toBeLessThanOrEqual(1);
  });

  it('revoked, expired and exhausted codes are rejected identically', async () => {
    const revoked = await mint({ revokedAt: new Date() });
    const expired = await mint({ expiresAt: new Date(Date.now() - 1000) });
    const exhausted = await prisma.communityInvite.create({
      data: { communityId, createdById: userIds[0], code: `x-${Date.now()}`, maxUses: 1, uses: 1 },
    });
    const outcomes = await Promise.all(
      [revoked.code, expired.code, exhausted.code, 'no-such-code'].map((code) =>
        acceptInvite(communityId, userIds[1], code),
      ),
    );
    for (const o of outcomes) expect(o).toEqual({ ok: false, reason: 'invalid' });
  });
});
