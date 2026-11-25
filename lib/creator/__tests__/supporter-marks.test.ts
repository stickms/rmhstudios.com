/**
 * Supporter marks (sprint 14 #13): only the post's author, with the switch on, is told which repliers hold an active
 * membership of them. Anyone else gets `null` and no membership query is made.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  profile: null as { showSupporterMarks: boolean } | null,
  memberships: [] as { creatorId: string; supporterId: string; expiresAt: Date }[],
  profileReads: 0,
  membershipReads: [] as unknown[],
}));

vi.mock('@/lib/prisma.server', async () => ({
  prisma: (await import('@/lib/db/query-shape')).shapeChecked({
    userProfile: {
      findUnique: async () => {
        h.profileReads += 1;
        return h.profile;
      },
    },
    creatorMembership: {
      findMany: async (args: {
        where: { creatorId: string; supporterId: { in: string[] }; expiresAt: { gt: Date } };
      }) => {
        h.membershipReads.push(args);
        const { creatorId, supporterId, expiresAt } = args.where;
        return h.memberships
          .filter(
            (m) => m.creatorId === creatorId && supporterId.in.includes(m.supporterId) && m.expiresAt > expiresAt.gt,
          )
          .map((m) => ({ supporterId: m.supporterId }));
      },
    },
  }),
}));

const { supporterMarksFor } = await import('../supporter-marks.server');

const day = 86_400_000;
const post = { userId: 'creator' };

beforeEach(() => {
  h.profile = { showSupporterMarks: true };
  h.profileReads = 0;
  h.membershipReads = [];
  h.memberships = [
    { creatorId: 'creator', supporterId: 'active', expiresAt: new Date(Date.now() + day) },
    { creatorId: 'creator', supporterId: 'expired', expiresAt: new Date(Date.now() - day) },
    { creatorId: 'other-creator', supporterId: 'elsewhere', expiresAt: new Date(Date.now() + day) },
  ];
});

describe('supporterMarksFor', () => {
  it('gives the author the set of repliers with an active membership', async () => {
    const marks = await supporterMarksFor('creator', post, ['active', 'expired', 'elsewhere', 'stranger']);
    expect(marks).toEqual(new Set(['active']));
  });

  it('excludes an expired membership and one held with a different creator', async () => {
    const marks = await supporterMarksFor('creator', post, ['expired', 'elsewhere']);
    expect(marks).toEqual(new Set());
  });

  it('reads memberships once for the page, scoped to the author', async () => {
    await supporterMarksFor('creator', post, ['active', 'active', 'expired']);
    expect(h.membershipReads).toHaveLength(1);
    expect(h.membershipReads[0]).toMatchObject({ where: { creatorId: 'creator' } });
  });

  it('marks nobody for an author with no profile row yet (the switch defaults on)', async () => {
    h.profile = null;
    expect(await supporterMarksFor('creator', post, ['active'])).toEqual(new Set(['active']));
  });

  it('never marks the author as their own supporter', async () => {
    h.memberships.push({ creatorId: 'creator', supporterId: 'creator', expiresAt: new Date(Date.now() + day) });
    expect(await supporterMarksFor('creator', post, ['creator', 'active'])).toEqual(new Set(['active']));
  });

  it.each([
    ['signed out', null],
    ['undefined', undefined],
    ['a supporter', 'active'],
    ['another replier', 'stranger'],
  ])('is null for %s, and reads nothing', async (_name, viewer) => {
    expect(await supporterMarksFor(viewer, post, ['active', 'expired'])).toBeNull();
    expect(h.profileReads).toBe(0);
    expect(h.membershipReads).toHaveLength(0);
  });

  it('is null with the switch off, and never looks up memberships', async () => {
    h.profile = { showSupporterMarks: false };
    expect(await supporterMarksFor('creator', post, ['active'])).toBeNull();
    expect(h.membershipReads).toHaveLength(0);
  });

  it('answers an empty set without a membership query when there are no repliers', async () => {
    expect(await supporterMarksFor('creator', post, [])).toEqual(new Set());
    expect(h.membershipReads).toHaveLength(0);
  });
});
