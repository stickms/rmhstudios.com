/**
 * Private-community invite links and join requests: the privacy/auth contract.
 *
 * Prisma is stood in for here; the atomicity of `acceptInvite` under real
 * concurrency is covered by `invites-concurrency.test.ts` (opt-in, needs a DB).
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
} from '@/lib/communities/invites.server';
import { DENIED_COOLDOWN_MS, decideRequest, requestToJoin } from '@/lib/communities/join-requests.server';

const COMMUNITY = { id: 'c1', slug: 's', name: 'Secret Club' };

beforeEach(() => {
  for (const group of [h.invite, h.member, h.community, h.request]) {
    for (const fn of Object.values(group)) (fn as ReturnType<typeof vi.fn>).mockReset();
  }
  h.executeRaw.mockReset();
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
});

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
    expect(h.executeRaw.mock.calls[0].slice(1)).toEqual(['CODE', 'c1']);
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
