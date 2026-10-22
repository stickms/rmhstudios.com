/**
 * Private-community invite links and join requests: the privacy/auth contract.
 *
 * Prisma is stood in for here; the atomicity of `acceptInvite` under real
 * concurrency is covered by `testing/integration/communities-invites.test.ts` (real Postgres, in CI).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  invite: { count: vi.fn(), create: vi.fn(), findMany: vi.fn(), updateMany: vi.fn(), findFirst: vi.fn() },
  member: { findUnique: vi.fn(), findMany: vi.fn(), createMany: vi.fn() },
  community: { findUnique: vi.fn(), update: vi.fn() },
  request: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    upsert: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
  },
  executeRaw: vi.fn(),
  queryRaw: vi.fn(),
  notify: vi.fn(),
}));

/** `$transaction(cb)` hands the callback a client with the same mocks. */
vi.mock('@/lib/prisma.server', () => {
  const client = () => ({
    communityInvite: h.invite,
    communityMember: h.member,
    community: h.community,
    communityJoinRequest: h.request,
    $executeRaw: h.executeRaw,
    $queryRaw: h.queryRaw,
  });
  return {
    prisma: {
      ...client(),
      $transaction: async (cb: (tx: unknown) => unknown) => cb(client()),
    },
  };
});
vi.mock('@/lib/notifications.server', () => ({ createNotification: h.notify }));
vi.mock('@/lib/api/handler.server', () => ({
  defineHandler: (_o: unknown, fn: (c: unknown) => unknown) => fn,
}));
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: unknown) => ({ options: config }),
}));

import {
  INVITE_LIMITS,
  acceptInvite,
  createInvite,
  generateInviteCode,
  isInviteUsable,
  listInvites,
  revokeInvite,
} from '@/lib/communities/invites.server';
import {
  CANCELLED_COOLDOWN_MS,
  DENIED_COOLDOWN_MS,
  cancelRequest,
  decideRequest,
  listPendingRequests,
  markRemoved,
  requestToJoin,
} from '@/lib/communities/join-requests.server';

const COMMUNITY = { id: 'c1', slug: 's', name: 'Secret Club' };

beforeEach(() => {
  for (const group of [h.invite, h.member, h.community, h.request]) {
    for (const fn of Object.values(group)) (fn as ReturnType<typeof vi.fn>).mockReset();
  }
  h.executeRaw.mockReset();
  h.queryRaw.mockReset().mockResolvedValue([]);
  h.notify.mockReset().mockResolvedValue(undefined);
  h.member.findUnique.mockResolvedValue(null);
});

describe('invite codes', () => {
  it('are 192 random bits of URL-safe text, and do not repeat', () => {
    const codes = new Set(Array.from({ length: 2000 }, generateInviteCode));
    expect(codes.size).toBe(2000);
    for (const c of codes) expect(c).toMatch(/^[A-Za-z0-9_-]{32}$/); // 24 bytes -> 32 base64url chars
  });

  it('a community holds at most the cap of live links', async () => {
    h.invite.count.mockResolvedValue(INVITE_LIMITS.activePerCommunity);
    expect(await createInvite('c1', 'u1', {})).toEqual({ ok: false, reason: 'limit' });
    expect(h.invite.create).not.toHaveBeenCalled();
  });

  it('the cap counts only live links: revoked and expired ones do not use a slot', async () => {
    h.invite.count.mockResolvedValue(0);
    h.invite.create.mockResolvedValue(INVITE_ROW);
    await createInvite('c1', 'u1', {});
    expect(h.invite.count.mock.calls[0][0].where).toMatchObject({
      communityId: 'c1',
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }],
    });
  });

  it('the cap check and the insert run under the community row lock (no check-then-insert race)', async () => {
    h.invite.count.mockResolvedValue(INVITE_LIMITS.activePerCommunity - 1);
    h.invite.create.mockResolvedValue(INVITE_ROW);
    const order: string[] = [];
    h.queryRaw.mockImplementation(async () => void order.push('lock'));
    h.invite.count.mockImplementation(async () => {
      order.push('count');
      return INVITE_LIMITS.activePerCommunity - 1;
    });
    h.invite.create.mockImplementation(async () => {
      order.push('create');
      return INVITE_ROW;
    });
    expect((await createInvite('c1', 'u1', { maxUses: 3, expiresInDays: 7 })).ok).toBe(true);
    expect(order).toEqual(['lock', 'count', 'create']);
    const sql = (h.queryRaw.mock.calls[0][0] as string[]).join('?');
    expect(sql).toContain('FROM "community"');
    expect(sql).toContain('FOR UPDATE');
    expect(h.queryRaw.mock.calls[0][1]).toBe('c1');
    const data = h.invite.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ communityId: 'c1', createdById: 'u1', maxUses: 3 });
    expect(data.expiresAt).toBeInstanceOf(Date);
  });
});

const INVITE_ROW = {
  id: 1n,
  code: 'x'.repeat(32),
  maxUses: null,
  uses: 0,
  expiresAt: null,
  createdAt: new Date(),
  createdBy: { id: 'u1', name: null, handle: null },
};

describe('acceptInvite', () => {
  it('consumes the code with ONE conditional UPDATE that checks revoked, expiry and uses', async () => {
    h.executeRaw.mockResolvedValue(1);
    h.member.createMany.mockResolvedValue({ count: 1 });
    h.request.updateMany.mockResolvedValue({ count: 0 });
    const res = await acceptInvite('c1', 'u1', 'CODE');
    expect(res).toEqual({ ok: true, alreadyMember: false });

    expect(h.executeRaw).toHaveBeenCalledTimes(1);
    const sql = (h.executeRaw.mock.calls[0][0] as string[]).join('?');
    expect(sql).toContain('"uses" = "uses" + 1');
    expect(sql).toContain('"revokedAt" IS NULL');
    expect(sql).toContain('"expiresAt" > now()');
    expect(sql).toContain('"uses" < "maxUses"');
    // the code and the community are both bound parameters
    // The removal check is part of the SAME statement (no separate read to race).
    expect(sql).toContain('NOT EXISTS');
    expect(sql).toContain('"community_join_request"');
    expect(sql).toContain(`"status" = 'REMOVED'`);
    expect(h.executeRaw.mock.calls[0].slice(1)).toEqual(['CODE', 'c1', 'c1', 'u1']);
    expect(h.request.findFirst).not.toHaveBeenCalled();
    // A pending request is answered by being let in.
    expect(h.request.updateMany).toHaveBeenCalledWith({
      where: { communityId: 'c1', userId: 'u1', status: 'PENDING' },
      data: { status: 'APPROVED', decidedAt: expect.any(Date) },
    });
    expect(h.community.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { memberCount: { increment: 1 } },
    });
  });

  it('unknown, revoked, expired, exhausted and wrong-community codes all give the SAME generic result', async () => {
    h.executeRaw.mockResolvedValue(0); // the conditional UPDATE matched nothing, whatever the reason
    const results = await Promise.all(
      ['unknown', 'revoked', 'expired', 'exhausted', 'other-community'].map((c) => acceptInvite('c1', 'u1', c)),
    );
    for (const r of results) expect(r).toEqual({ ok: false, reason: 'invalid' });
    expect(h.member.createMany).not.toHaveBeenCalled(); // no membership without a consumed use
  });

  it('is idempotent for a member: no use consumed, no double count', async () => {
    h.member.findUnique.mockResolvedValue({ id: 'm1' });
    expect(await acceptInvite('c1', 'u1', 'CODE')).toEqual({ ok: true, alreadyMember: true });
    expect(h.executeRaw).not.toHaveBeenCalled();
    expect(h.community.update).not.toHaveBeenCalled();
  });

  it('rolls the use back when the user became a member concurrently', async () => {
    h.executeRaw.mockResolvedValue(1);
    h.member.createMany.mockResolvedValue({ count: 0 });
    expect(await acceptInvite('c1', 'u1', 'CODE')).toEqual({ ok: true, alreadyMember: true });
    expect(h.community.update).not.toHaveBeenCalled(); // not counted twice
  });
});

describe('join requests', () => {
  it('approve creates the membership and counts it; deny does not', async () => {
    h.request.findFirst.mockResolvedValue({ userId: 'req' });
    h.request.updateMany.mockResolvedValue({ count: 1 });
    h.member.createMany.mockResolvedValue({ count: 1 });

    expect(await decideRequest(COMMUNITY, 7n, 'mod', 'approve')).toEqual({ ok: true, decision: 'approve' });
    expect(h.member.createMany).toHaveBeenCalledWith({
      data: [{ communityId: 'c1', userId: 'req' }],
      skipDuplicates: true,
    });
    expect(h.community.update).toHaveBeenCalledTimes(1);
    expect(h.notify.mock.calls[0][0]).toMatchObject({ userId: 'req', entityType: 'community-join-decision' });

    h.member.createMany.mockClear();
    h.community.update.mockClear();
    expect(await decideRequest(COMMUNITY, 7n, 'mod', 'deny')).toEqual({ ok: true, decision: 'deny' });
    expect(h.member.createMany).not.toHaveBeenCalled();
    expect(h.community.update).not.toHaveBeenCalled();
    expect(h.request.updateMany.mock.calls[1][0].data.status).toBe('DENIED');
  });

  it('a request that is missing or already decided changes nothing', async () => {
    h.request.findFirst.mockResolvedValue(null);
    expect(await decideRequest(COMMUNITY, 7n, 'mod', 'approve')).toEqual({ ok: false });
    h.request.findFirst.mockResolvedValue({ userId: 'req' });
    h.request.updateMany.mockResolvedValue({ count: 0 }); // another moderator got there first
    expect(await decideRequest(COMMUNITY, 7n, 'mod', 'approve')).toEqual({ ok: false });
    expect(h.member.createMany).not.toHaveBeenCalled();
    expect(h.notify).not.toHaveBeenCalled();
  });

  it('a member cannot request; a pending request is idempotent; a denied one waits out the cooldown', async () => {
    h.member.findUnique.mockResolvedValue({ id: 'm' });
    expect(await requestToJoin(COMMUNITY, 'u', 'U', null)).toEqual({ ok: false, reason: 'member' });

    h.member.findUnique.mockResolvedValue(null);
    h.request.findUnique.mockResolvedValue({ status: 'PENDING', decidedAt: null });
    expect(await requestToJoin(COMMUNITY, 'u', 'U', null)).toEqual({ ok: true, status: 'PENDING' });
    expect(h.request.upsert).not.toHaveBeenCalled();

    const denied = new Date(Date.now() - DENIED_COOLDOWN_MS / 2);
    h.request.findUnique.mockResolvedValue({ status: 'DENIED', decidedAt: denied });
    const res = await requestToJoin(COMMUNITY, 'u', 'U', null);
    expect(res).toMatchObject({ ok: false, reason: 'cooldown' });
    expect(h.request.upsert).not.toHaveBeenCalled();

    h.request.findUnique.mockResolvedValue({
      status: 'DENIED',
      decidedAt: new Date(Date.now() - DENIED_COOLDOWN_MS - 1000),
    });
    h.member.findMany.mockResolvedValue([{ userId: 'mod1' }, { userId: 'mod2' }]);
    expect(await requestToJoin(COMMUNITY, 'u', 'U', ' hi ')).toEqual({ ok: true, status: 'PENDING' });
    expect(h.request.upsert.mock.calls[0][0].update).toMatchObject({ status: 'PENDING', message: 'hi' });
    // owner/moderators are told
    expect(h.notify).toHaveBeenCalledTimes(2);
    expect(h.notify.mock.calls[0][0]).toMatchObject({ entityType: 'community-join-request', type: 'SYSTEM' });
  });
});

describe('removal and cancellation are remembered', () => {
  it('a removed member holding a live invite is refused (generic invalid): the UPDATE matches nothing', async () => {
    h.executeRaw.mockResolvedValue(0); // NOT EXISTS (REMOVED row) is false -> no row consumed
    expect(await acceptInvite('c1', 'u1', 'LIVE-MULTI-USE-CODE')).toEqual({ ok: false, reason: 'invalid' });
    expect(h.executeRaw.mock.calls[0].slice(1)).toEqual(['LIVE-MULTI-USE-CODE', 'c1', 'c1', 'u1']);
    expect(h.member.createMany).not.toHaveBeenCalled();
    expect(h.community.update).not.toHaveBeenCalled();
  });

  it('markRemoved upserts a REMOVED row carrying the deciding moderator', async () => {
    await markRemoved(
      { communityJoinRequest: h.request } as unknown as Parameters<typeof markRemoved>[0],
      'c1',
      'u1',
      'mod',
    );
    const arg = h.request.upsert.mock.calls[0][0];
    expect(arg.create).toMatchObject({ status: 'REMOVED', decidedById: 'mod' });
    expect(arg.update).toMatchObject({ status: 'REMOVED', decidedById: 'mod' });
    expect(arg.create.decidedAt).toBeInstanceOf(Date);
  });

  it('a removed user waits out the cooldown before asking again; no moderator is notified', async () => {
    h.request.findUnique.mockResolvedValue({
      status: 'REMOVED',
      decidedAt: new Date(Date.now() - DENIED_COOLDOWN_MS / 2),
    });
    expect(await requestToJoin(COMMUNITY, 'u', 'U', null)).toMatchObject({ ok: false, reason: 'cooldown' });
    expect(h.request.upsert).not.toHaveBeenCalled();
    expect(h.notify).not.toHaveBeenCalled();
  });

  it('cancel keeps a CANCELLED row, and a quick re-request is refused without notifying moderators', async () => {
    h.request.updateMany.mockResolvedValue({ count: 1 });
    await cancelRequest('c1', 'u');
    expect(h.request.deleteMany).not.toHaveBeenCalled();
    expect(h.request.updateMany.mock.calls[0][0]).toMatchObject({
      where: { status: 'PENDING' },
      data: { status: 'CANCELLED' },
    });

    h.request.findUnique.mockResolvedValue({ status: 'CANCELLED', decidedAt: new Date() });
    expect(await requestToJoin(COMMUNITY, 'u', 'U', null)).toMatchObject({ ok: false, reason: 'cooldown' });
    expect(h.request.upsert).not.toHaveBeenCalled();
    expect(h.notify).not.toHaveBeenCalled();

    // after the short cooldown a new request goes through
    h.request.findUnique.mockResolvedValue({
      status: 'CANCELLED',
      decidedAt: new Date(Date.now() - CANCELLED_COOLDOWN_MS - 1000),
    });
    h.member.findMany.mockResolvedValue([{ userId: 'mod1' }]);
    expect(await requestToJoin(COMMUNITY, 'u', 'U', null)).toEqual({ ok: true, status: 'PENDING' });
    expect(h.notify).toHaveBeenCalledTimes(1);
  });
});

describe('only the owner and moderators manage invites and requests', () => {
  type Handler = (ctx: Record<string, unknown>) => Promise<Response>;
  const route = async (mod: string, method: string): Promise<Handler> =>
    ((await import(/* @vite-ignore */ mod)) as {
      Route: { options: { server: { handlers: Record<string, Handler> } } };
    }).Route.options.server.handlers[method];

  beforeEach(() => {
    h.community.findUnique.mockResolvedValue({
      id: 'c1',
      slug: 's',
      name: 'N',
      isPrivate: true,
      members: [],
    });
  });

  const asRole = (role: string | null) =>
    h.community.findUnique.mockResolvedValue({
      id: 'c1',
      slug: 's',
      name: 'N',
      isPrivate: true,
      members: role ? [{ role }] : [],
    });

  const calls: [string, string, Record<string, unknown>][] = [
    ['@/app/routes/api/communities/$slug/invites', 'GET', {}],
    ['@/app/routes/api/communities/$slug/invites', 'POST', { body: {} }],
    ['@/app/routes/api/communities/$slug/invites/$id', 'DELETE', { params: { slug: 's', id: '1' } }],
    ['@/app/routes/api/communities/$slug/join-requests', 'GET', {}],
    [
      '@/app/routes/api/communities/$slug/join-requests/$id',
      'POST',
      { params: { slug: 's', id: '1' }, body: { decision: 'approve' } },
    ],
  ];

  it.each(calls)('%s %s: 403 for a plain member, a stranger and 404 for a missing community', async (mod, method, extra) => {
    const fn = await route(mod, method);
    const ctx = { params: { slug: 's' }, userId: 'u', session: { user: { id: 'u' } }, ...extra };
    for (const role of ['MEMBER', null]) {
      asRole(role);
      expect((await fn(ctx)).status).toBe(403);
    }
    h.community.findUnique.mockResolvedValue(null);
    expect((await fn(ctx)).status).toBe(404);
    // nothing was touched on behalf of a non-moderator
    expect(h.invite.create).not.toHaveBeenCalled();
    expect(h.invite.updateMany).not.toHaveBeenCalled();
    expect(h.invite.findMany).not.toHaveBeenCalled();
    expect(h.request.updateMany).not.toHaveBeenCalled();
    expect(h.request.findMany).not.toHaveBeenCalled();
  });

  it('a moderator and the owner can create, list, revoke, and decide', async () => {
    h.invite.count.mockResolvedValue(0);
    h.invite.findMany.mockResolvedValue([]);
    h.invite.updateMany.mockResolvedValue({ count: 1 });
    h.invite.create.mockResolvedValue({
      id: 1n,
      code: 'x'.repeat(32),
      maxUses: null,
      uses: 0,
      expiresAt: null,
      createdAt: new Date(),
      createdBy: { id: 'u', name: null, handle: null },
    });
    h.request.findMany.mockResolvedValue([]);
    h.request.findFirst.mockResolvedValue({ userId: 'req' });
    h.request.updateMany.mockResolvedValue({ count: 1 });
    h.member.createMany.mockResolvedValue({ count: 1 });
    for (const role of ['MOD', 'ADMIN']) {
      asRole(role);
      for (const [mod, method, extra] of calls) {
        const fn = await route(mod, method);
        const res = await fn({
          params: { slug: 's' },
          userId: 'u',
          session: { user: { id: 'u' } },
          ...extra,
        });
        expect(res.status, `${role} ${method} ${mod}`).toBeLessThan(300);
      }
    }
  });

  it('only a private community has invite links', async () => {
    h.community.findUnique.mockResolvedValue({
      id: 'c1',
      slug: 's',
      name: 'N',
      isPrivate: false,
      members: [{ role: 'ADMIN' }],
    });
    const fn = await route('@/app/routes/api/communities/$slug/invites', 'POST');
    expect((await fn({ params: { slug: 's' }, userId: 'u', body: {} })).status).toBe(400);
  });
});

describe('join route', () => {
  type Handler = (ctx: Record<string, unknown>) => Promise<Response>;
  it('a private community without a valid invite is a generic 404; with one it joins', async () => {
    const POST = ((await import('@/app/routes/api/communities/$slug/join')) as unknown as {
      Route: { options: { server: { handlers: { POST: Handler } } } };
    }).Route.options.server.handlers.POST;
    h.community.findUnique.mockResolvedValue({ id: 'c1', createdById: 'owner', isPrivate: true });
    const ctx = { params: { slug: 's' }, session: { user: { id: 'stranger' } } };

    const none = await POST({ ...ctx, body: undefined });
    expect(none.status).toBe(404);
    h.executeRaw.mockResolvedValue(0);
    const bad = await POST({ ...ctx, body: { invite: 'nope' } });
    expect(bad.status).toBe(404);
    expect(await bad.json()).toEqual(await none.clone().json()); // one generic body, whatever the reason

    h.executeRaw.mockResolvedValue(1);
    h.member.createMany.mockResolvedValue({ count: 1 });
    h.request.updateMany.mockResolvedValue({ count: 0 });
    const ok = await POST({ ...ctx, body: { invite: 'good' } });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ joined: true });
  });

  it('an invite is join-only: repeating it as a member keeps the membership', async () => {
    const POST = ((await import('@/app/routes/api/communities/$slug/join')) as unknown as {
      Route: { options: { server: { handlers: { POST: Handler } } } };
    }).Route.options.server.handlers.POST;
    h.community.findUnique.mockResolvedValue({ id: 'c1', createdById: 'owner', isPrivate: true });
    h.member.findUnique.mockResolvedValue({ id: 'm1' });
    const res = await POST({
      params: { slug: 's' },
      session: { user: { id: 'member' } },
      body: { invite: 'good' },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ joined: true });
    expect(h.executeRaw).not.toHaveBeenCalled();
    expect(h.community.update).not.toHaveBeenCalled();
  });
});

describe('invite lifecycle', () => {
  it('revokeInvite revokes a live link once; a second call or another community changes nothing', async () => {
    h.invite.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    expect(await revokeInvite('c1', 5n)).toBe(true);
    expect(await revokeInvite('c1', 5n)).toBe(false);
    expect(h.invite.updateMany.mock.calls[0][0]).toMatchObject({
      where: { id: 5n, communityId: 'c1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it('isInviteUsable: active, expired, exhausted, revoked/unknown', async () => {
    h.invite.findFirst.mockResolvedValue({ maxUses: null, uses: 9 });
    expect(await isInviteUsable('c1', 'CODE')).toBe(true);
    h.invite.findFirst.mockResolvedValue({ maxUses: 3, uses: 2 });
    expect(await isInviteUsable('c1', 'CODE')).toBe(true);
    h.invite.findFirst.mockResolvedValue({ maxUses: 3, uses: 3 }); // exhausted
    expect(await isInviteUsable('c1', 'CODE')).toBe(false);
    h.invite.findFirst.mockResolvedValue(null); // revoked / expired / unknown / other community
    expect(await isInviteUsable('c1', 'CODE')).toBe(false);
    // revoked and expired are excluded in the query itself
    expect(h.invite.findFirst.mock.calls[0][0].where).toMatchObject({
      code: 'CODE',
      communityId: 'c1',
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }],
    });
  });

  it('listInvites labels active / expired / exhausted and hides revoked links', async () => {
    const past = new Date(Date.now() - 1000);
    const future = new Date(Date.now() + 3600_000);
    h.invite.findMany.mockResolvedValue([
      { ...INVITE_ROW, id: 3n },
      { ...INVITE_ROW, id: 2n, expiresAt: past },
      { ...INVITE_ROW, id: 1n, expiresAt: future, maxUses: 2, uses: 2 },
    ]);
    const out = await listInvites('c1');
    expect(out.map((i) => [i.id, i.state])).toEqual([
      ['3', 'active'],
      ['2', 'expired'],
      ['1', 'exhausted'],
    ]);
    expect(h.invite.findMany.mock.calls[0][0].where).toEqual({ communityId: 'c1', revokedAt: null });
  });
});

describe('join-request state machine, more', () => {
  it('a REMOVED row with no decidedAt carries no cooldown (nothing to compute it from)', async () => {
    h.request.findUnique.mockResolvedValue({ status: 'REMOVED', decidedAt: null });
    h.member.findMany.mockResolvedValue([]);
    expect(await requestToJoin(COMMUNITY, 'u', 'U', null)).toEqual({ ok: true, status: 'PENDING' });
    expect(h.request.upsert).toHaveBeenCalledTimes(1);
  });

  it('approving a requester who is already a member does not count them twice', async () => {
    h.request.findFirst.mockResolvedValue({ userId: 'req' });
    h.request.updateMany.mockResolvedValue({ count: 1 });
    h.member.createMany.mockResolvedValue({ count: 0 }); // skipDuplicates: already in
    expect(await decideRequest(COMMUNITY, 7n, 'mod', 'approve')).toEqual({ ok: true, decision: 'approve' });
    expect(h.community.update).not.toHaveBeenCalled();
  });

  it('listPendingRequests: pending only, oldest first, bounded, ids as strings', async () => {
    h.request.findMany.mockResolvedValue([
      {
        id: 12n,
        message: 'hi',
        createdAt: new Date('2026-01-01T00:00:00Z'),
        user: { id: 'u', name: 'U', handle: 'u', image: null },
      },
    ]);
    const out = await listPendingRequests('c1');
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: '12', message: 'hi', createdAt: '2026-01-01T00:00:00.000Z' });
    expect(h.request.findMany.mock.calls[0][0]).toMatchObject({
      where: { communityId: 'c1', status: 'PENDING' },
      orderBy: { id: 'asc' },
      take: 100,
    });
  });
});
