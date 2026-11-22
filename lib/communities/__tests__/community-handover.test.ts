import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DELETED_ACCOUNT_BAN_REASON } from '@/lib/account-lifecycle';

/**
 * Community ownership handover (s04-17) against an in-memory Prisma double. The double runs transactions one at a
 * time, which is what the advisory lock does in Postgres, and compare-and-set `updateMany` claims behave as in SQL.
 */

type Row = Record<string, unknown>;

const db = vi.hoisted(() => {
  const state = {
    communities: [] as Row[],
    members: [] as Row[],
    users: [] as Row[],
    blocks: [] as Row[],
    handovers: [] as Row[],
    modLog: [] as Row[],
    audit: [] as Row[],
    notified: [] as Row[],
    locks: [] as string[],
    /** Runs once before the next handover claim (`updateMany`), to simulate a racing writer. */
    beforeClaim: null as null | (() => void),
    seq: 0,
  };
  return state;
});

function matches(row: Row, where: Row | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([k, v]) => {
    if (k === 'OR') return (v as Row[]).some((w) => matches(row, w));
    const val = row[k];
    if (v && typeof v === 'object' && !(v instanceof Date)) {
      const c = v as Record<string, unknown>;
      if ('in' in c) return (c.in as unknown[]).includes(val);
      if ('gt' in c) return (val as Date).getTime() > (c.gt as Date).getTime();
      if ('lte' in c) return (val as Date).getTime() <= (c.lte as Date).getTime();
      if ('not' in c) return val !== c.not;
      return matches(row, c);
    }
    return val === v;
  });
}

const chip = (id: unknown) => {
  const u = db.users.find((x) => x.id === id);
  return u ? { id: u.id, name: u.name, handle: u.handle, image: null } : null;
};
const withUsers = (h: Row | undefined) => (h ? { ...h, from: chip(h.fromId), to: chip(h.toId) } : null);

const tx = {
  community: {
    findUnique: async ({ where }: { where: Row }) => {
      const c = db.communities.find((x) => matches(x, where));
      if (!c) return null;
      const owner = db.users.find((u) => u.id === c.createdById);
      return { ...c, createdBy: owner };
    },
    updateMany: async ({ where, data }: { where: Row; data: Row }) => {
      const hit = db.communities.filter((x) => matches(x, where));
      hit.forEach((x) => Object.assign(x, data));
      return { count: hit.length };
    },
  },
  communityMember: {
    findMany: async ({ where }: { where: Row }) => {
      const { user: _ignored, ...rest } = where;
      return db.members
        .filter((m) => matches(m, rest))
        .filter((m) => {
          const u = db.users.find((x) => x.id === m.userId)!;
          return !u.bannedUntil || (u.bannedUntil as Date).getTime() <= NOW.getTime();
        })
        .map((m) => ({ ...m, user: chip(m.userId) }));
    },
    findUnique: async ({ where }: { where: { communityId_userId: Row } }) =>
      db.members.find((m) => matches(m, where.communityId_userId)) ?? null,
    updateMany: async ({ where, data }: { where: Row; data: Row }) => {
      const hit = db.members.filter((x) => matches(x, where));
      hit.forEach((x) => Object.assign(x, data));
      return { count: hit.length };
    },
  },
  user: {
    findUnique: async ({ where }: { where: Row }) => db.users.find((u) => matches(u, where)) ?? null,
  },
  userBlock: {
    findMany: async () => db.blocks,
    findFirst: async ({ where }: { where: Row }) => db.blocks.find((b) => matches(b, where)) ?? null,
  },
  communityHandover: {
    findMany: async ({ where }: { where: Row }) => db.handovers.filter((h) => matches(h, where)),
    findFirst: async ({ where }: { where: Row }) =>
      withUsers([...db.handovers].reverse().find((h) => matches(h, where))),
    create: async ({ data }: { data: Row }) => {
      const row = { id: `h${++db.seq}`, status: 'pending', createdAt: new Date(), decidedAt: null, ...data };
      db.handovers.push(row);
      return withUsers(row);
    },
    updateMany: async ({ where, data }: { where: Row; data: Row }) => {
      const hook = db.beforeClaim;
      db.beforeClaim = null;
      hook?.();
      const hit = db.handovers.filter((x) => matches(x, where));
      hit.forEach((x) => Object.assign(x, data));
      return { count: hit.length };
    },
  },
  communityModAction: {
    create: async ({ data }: { data: Row }) => {
      db.modLog.push(data);
      return { id: BigInt(db.modLog.length) };
    },
  },
  adminAuditLog: {
    create: async ({ data }: { data: Row }) => {
      db.audit.push(data);
      return data;
    },
  },
};

let queue: Promise<unknown> = Promise.resolve();
const prismaMock = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('@/lib/prisma.server', () => ({
  get prisma() {
    return prismaMock.current;
  },
}));
vi.mock('@/lib/db/advisory-lock.server', () => ({
  lockKey: async (_tx: unknown, key: string) => {
    db.locks.push(key);
  },
}));
vi.mock('@/lib/notifications.server', () => ({
  createNotification: async (input: Row) => {
    db.notified.push(input);
  },
}));

const { offerHandover, cancelHandover, respondHandover, assignOwnerAsAdmin, getHandoverStatus } =
  await import('@/lib/communities/handover.server');

prismaMock.current = {
  ...tx,
  $transaction: (fn: (t: typeof tx) => Promise<unknown>) => {
    const run = queue.then(() => fn(tx));
    queue = run.catch(() => undefined);
    return run;
  },
};

const NOW = new Date('2026-11-24T12:00:00Z');
const DAY = 86_400_000;
const community = { id: 'c1', slug: 'club', name: 'The Club' };

const user = (id: string, extra: Row = {}): Row => ({
  id,
  name: id,
  handle: id,
  bannedUntil: null,
  banReason: null,
  ...extra,
});

beforeEach(() => {
  db.communities = [{ id: 'c1', createdById: 'owner' }];
  db.members = [
    { communityId: 'c1', userId: 'owner', role: 'ADMIN' },
    { communityId: 'c1', userId: 'mod', role: 'MOD' },
    { communityId: 'c1', userId: 'mod2', role: 'MOD' },
    { communityId: 'c1', userId: 'plain', role: 'MEMBER' },
  ];
  db.users = ['owner', 'mod', 'mod2', 'plain', 'admin'].map((id) => user(id));
  db.blocks = [];
  db.handovers = [];
  db.modLog = [];
  db.audit = [];
  db.notified = [];
  db.locks = [];
  db.beforeClaim = null;
  db.seq = 0;
});

const role = (id: string) => db.members.find((m) => m.userId === id)?.role;
const owner = () => db.communities[0]!.createdById;

describe('offering ownership', () => {
  it('lets the owner offer to a moderator, takes the lock, expires in 7 days and notifies them', async () => {
    const r = await offerHandover({ community, ownerId: 'owner', toId: 'mod', now: NOW });
    expect(r.ok).toBe(true);
    expect(db.locks).toContain('community-handover:c1');
    expect(db.handovers).toHaveLength(1);
    expect((db.handovers[0]!.expiresAt as Date).getTime()).toBe(NOW.getTime() + 7 * DAY);
    expect(db.notified[0]).toMatchObject({ userId: 'mod', entityType: 'community_handover', entityId: 'c1' });
    expect(owner()).toBe('owner');
  });

  it('refuses anyone but the owner, including a moderator and the offered member', async () => {
    for (const actor of ['mod', 'plain', 'mod2']) {
      const r = await offerHandover({ community, ownerId: actor, toId: 'mod2', now: NOW });
      expect(r).toEqual({ ok: false, code: 'not-owner' });
    }
    expect(db.handovers).toHaveLength(0);
  });

  it('refuses a recipient who is not a moderator, the owner themself, a banned moderator and a blocked pair', async () => {
    expect(await offerHandover({ community, ownerId: 'owner', toId: 'plain', now: NOW })).toEqual({
      ok: false,
      code: 'not-moderator',
    });
    expect(await offerHandover({ community, ownerId: 'owner', toId: 'owner', now: NOW })).toEqual({
      ok: false,
      code: 'self',
    });
    db.users.find((u) => u.id === 'mod')!.bannedUntil = new Date(NOW.getTime() + DAY);
    expect(await offerHandover({ community, ownerId: 'owner', toId: 'mod', now: NOW })).toEqual({
      ok: false,
      code: 'recipient-banned',
    });
    db.blocks = [{ blockerId: 'mod2', blockedId: 'owner' }];
    expect(await offerHandover({ community, ownerId: 'owner', toId: 'mod2', now: NOW })).toEqual({
      ok: false,
      code: 'blocked',
    });
    expect(db.handovers).toHaveLength(0);
  });

  it('allows one pending offer, but replaces an expired one', async () => {
    await offerHandover({ community, ownerId: 'owner', toId: 'mod', now: NOW });
    expect(await offerHandover({ community, ownerId: 'owner', toId: 'mod2', now: NOW })).toEqual({
      ok: false,
      code: 'pending-exists',
    });
    const later = new Date(NOW.getTime() + 8 * DAY);
    const again = await offerHandover({ community, ownerId: 'owner', toId: 'mod2', now: later });
    expect(again.ok).toBe(true);
    expect(db.handovers.map((h) => h.status)).toEqual(['cancelled', 'pending']);
  });

  it('reads an expired offer as expired for the owner, and shows the recipient nothing', async () => {
    await offerHandover({ community, ownerId: 'owner', toId: 'mod', now: NOW });
    const later = new Date(NOW.getTime() + 8 * DAY);
    const asOwner = await getHandoverStatus('c1', 'owner', 'owner', NOW);
    expect(asOwner.offer?.state).toBe('pending');
    expect(asOwner.candidates.map((c) => c.id).sort()).toEqual(['mod', 'mod2']);
    expect((await getHandoverStatus('c1', 'owner', 'owner', later)).offer?.state).toBe('expired');
    expect((await getHandoverStatus('c1', 'owner', 'mod', later)).offer).toBeNull();
    expect((await getHandoverStatus('c1', 'owner', 'mod', NOW)).viewer).toBe('recipient');
    expect((await getHandoverStatus('c1', 'owner', 'plain', NOW)).viewer).toBe('other');
  });
});

describe('answering an offer', () => {
  beforeEach(async () => {
    await offerHandover({ community, ownerId: 'owner', toId: 'mod', now: NOW });
    db.notified = [];
  });

  it('accept swaps the roles, moves createdById, logs it and notifies the previous owner', async () => {
    const r = await respondHandover({ community, userId: 'mod', action: 'accept', now: NOW });
    expect(r.ok).toBe(true);
    expect(owner()).toBe('mod');
    expect(role('mod')).toBe('ADMIN');
    expect(role('owner')).toBe('MOD');
    expect(db.handovers[0]).toMatchObject({ status: 'accepted' });
    expect(db.modLog).toEqual([
      expect.objectContaining({
        communityId: 'c1',
        action: 'ownership_transferred',
        actorId: 'owner',
        targetUserId: 'mod',
        targetType: 'member',
      }),
    ]);
    expect(db.notified[0]).toMatchObject({ userId: 'owner' });
  });

  it('refuses an accept or decline from anyone the offer is not addressed to', async () => {
    for (const who of ['mod2', 'owner', 'plain']) {
      for (const action of ['accept', 'decline'] as const) {
        const r = await respondHandover({ community, userId: who, action, now: NOW });
        expect(r.ok).toBe(false);
      }
    }
    expect(owner()).toBe('owner');
    expect(db.handovers[0]!.status).toBe('pending');
  });

  it('refuses a moderator who was demoted, removed, banned or blocked the owner since the offer', async () => {
    db.members.find((m) => m.userId === 'mod')!.role = 'MEMBER';
    expect(await respondHandover({ community, userId: 'mod', action: 'accept', now: NOW })).toEqual({
      ok: false,
      code: 'not-moderator',
    });
    db.members.find((m) => m.userId === 'mod')!.role = 'MOD';
    db.users.find((u) => u.id === 'mod')!.bannedUntil = new Date(NOW.getTime() + DAY);
    expect((await respondHandover({ community, userId: 'mod', action: 'accept', now: NOW })).ok).toBe(false);
    db.users.find((u) => u.id === 'mod')!.bannedUntil = null;
    db.blocks = [{ blockerId: 'owner', blockedId: 'mod' }];
    expect((await respondHandover({ community, userId: 'mod', action: 'accept', now: NOW })).ok).toBe(false);
    expect(owner()).toBe('owner');
    expect(role('owner')).toBe('ADMIN');
    expect(db.handovers[0]!.status).toBe('pending');
    expect(db.modLog).toHaveLength(0);
  });

  it('refuses an expired offer and an offer from someone who is no longer the owner', async () => {
    const later = new Date(NOW.getTime() + 8 * DAY);
    expect(await respondHandover({ community, userId: 'mod', action: 'accept', now: later })).toEqual({
      ok: false,
      code: 'expired',
    });
    db.communities[0]!.createdById = 'mod2';
    expect(await respondHandover({ community, userId: 'mod', action: 'accept', now: NOW })).toEqual({
      ok: false,
      code: 'owner-changed',
    });
  });

  it('decline ends the offer, changes no role and tells the owner', async () => {
    const r = await respondHandover({ community, userId: 'mod', action: 'decline', now: NOW });
    expect(r.ok).toBe(true);
    expect(db.handovers[0]).toMatchObject({ status: 'declined' });
    expect(owner()).toBe('owner');
    expect(role('mod')).toBe('MOD');
    expect(db.notified[0]).toMatchObject({ userId: 'owner' });
    expect(await respondHandover({ community, userId: 'mod', action: 'accept', now: NOW })).toEqual({
      ok: false,
      code: 'no-offer',
    });
  });

  it('cancel by the owner ends the offer and tells the moderator; only the owner can cancel', async () => {
    expect(await cancelHandover({ community, ownerId: 'mod', now: NOW })).toEqual({ ok: false, code: 'not-owner' });
    expect((await cancelHandover({ community, ownerId: 'owner', now: NOW })).ok).toBe(true);
    expect(db.handovers[0]!.status).toBe('cancelled');
    expect(db.notified[0]).toMatchObject({ userId: 'mod' });
    expect(await cancelHandover({ community, ownerId: 'owner', now: NOW })).toEqual({ ok: false, code: 'no-offer' });
  });

  it('a racing cancel and accept leave exactly one owner', async () => {
    const [c, a] = await Promise.all([
      cancelHandover({ community, ownerId: 'owner', now: NOW }),
      respondHandover({ community, userId: 'mod', action: 'accept', now: NOW }),
    ]);
    expect([c.ok, a.ok].filter(Boolean)).toHaveLength(1);
    const admins = db.members.filter((m) => m.role === 'ADMIN').map((m) => m.userId);
    expect(admins).toEqual([owner()]);
    expect(db.modLog).toHaveLength(a.ok ? 1 : 0);
  });

  it('an accept whose claim loses to a cancel that landed after its reads changes nothing', async () => {
    db.beforeClaim = () => {
      db.handovers[0]!.status = 'cancelled';
    };
    const r = await respondHandover({ community, userId: 'mod', action: 'accept', now: NOW });
    expect(r).toEqual({ ok: false, code: 'no-offer' });
    expect(owner()).toBe('owner');
    expect(role('owner')).toBe('ADMIN');
    expect(role('mod')).toBe('MOD');
    expect(db.modLog).toHaveLength(0);
  });

  it('two accepts of one offer produce one transfer', async () => {
    const [a, b] = await Promise.all([
      respondHandover({ community, userId: 'mod', action: 'accept', now: NOW }),
      respondHandover({ community, userId: 'mod', action: 'accept', now: NOW }),
    ]);
    expect([a.ok, b.ok].sort()).toEqual([false, true]);
    expect(db.modLog).toHaveLength(1);
    expect(db.members.filter((m) => m.role === 'ADMIN')).toHaveLength(1);
  });
});

describe('after the transfer', () => {
  it('the leave rule follows createdById: the previous owner may leave, the new owner may not', async () => {
    await offerHandover({ community, ownerId: 'owner', toId: 'mod', now: NOW });
    await respondHandover({ community, userId: 'mod', action: 'accept', now: NOW });
    // communities.$slug.join.server.ts reads createdById at request time and refuses only that member.
    const creator = db.communities[0]!.createdById;
    expect(creator === 'owner').toBe(false);
    expect(creator === 'mod').toBe(true);
    expect(role('owner')).toBe('MOD');
  });
});

describe('site admin assignment', () => {
  const asDeleted = () =>
    Object.assign(
      db.users.find((u) => u.id === 'owner')!,
      {
        banReason: DELETED_ACCOUNT_BAN_REASON,
        bannedUntil: new Date('9999-12-31T00:00:00Z'),
      },
    );

  it('is refused while the owner is an active account', async () => {
    expect(await assignOwnerAsAdmin({ community, adminId: 'admin', toId: 'mod', now: NOW })).toEqual({
      ok: false,
      code: 'owner-active',
    });
    expect(owner()).toBe('owner');
    expect(db.audit).toHaveLength(0);
  });

  it('is refused when the owner was banned and the ban has ended', async () => {
    db.users.find((u) => u.id === 'owner')!.bannedUntil = new Date(NOW.getTime() - DAY);
    expect((await assignOwnerAsAdmin({ community, adminId: 'admin', toId: 'mod', now: NOW })).ok).toBe(false);
  });

  it('works for a deleted owner: roles move, offers close, and the admin and mod logs record it', async () => {
    await offerHandover({ community, ownerId: 'owner', toId: 'mod2', now: NOW });
    asDeleted();
    const r = await assignOwnerAsAdmin({ community, adminId: 'admin', toId: 'mod', now: NOW });
    expect(r.ok).toBe(true);
    expect(owner()).toBe('mod');
    expect(role('mod')).toBe('ADMIN');
    expect(role('owner')).toBe('MOD');
    expect(db.handovers[0]!.status).toBe('cancelled');
    expect(db.audit[0]).toMatchObject({ adminId: 'admin', action: 'community.assign-owner', targetId: 'c1' });
    expect(db.modLog[0]).toMatchObject({ action: 'ownership_transferred', actorId: 'admin', detail: { via: 'admin' } });
  });

  it('works for a banned owner but only to a moderator who is not banned', async () => {
    db.users.find((u) => u.id === 'owner')!.bannedUntil = new Date(NOW.getTime() + DAY);
    expect((await assignOwnerAsAdmin({ community, adminId: 'admin', toId: 'plain', now: NOW })).ok).toBe(false);
    db.users.find((u) => u.id === 'mod')!.bannedUntil = new Date(NOW.getTime() + DAY);
    expect((await assignOwnerAsAdmin({ community, adminId: 'admin', toId: 'mod', now: NOW })).ok).toBe(false);
    expect((await assignOwnerAsAdmin({ community, adminId: 'admin', toId: 'mod2', now: NOW })).ok).toBe(true);
    expect(owner()).toBe('mod2');
  });
});
