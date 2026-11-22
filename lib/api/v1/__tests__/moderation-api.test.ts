/**
 * Moderation through `/api/v1/communities/{slug}/modqueue*` and `/sanctions*` (`manage:moderation`), driven through
 * the real developer-API wrapper, the real v1 adapters, the real `decideModItem`, `sanction` and `lift` over mocked
 * Prisma. Held here: the scope (explicit-only), the moderator check on every call, the decision's side effects,
 * the site's role rules for sanctions, the `via: 'api'` marker, the error map and the hourly budgets.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handlersOf, type TestHandler } from '@/lib/__tests__/api-handlers-of';

type Row = Record<string, unknown>;
const h = vi.hoisted(() => ({
  key: { current: null as Record<string, unknown> | null },
  /** The key owner's role in community `club`: null = not a member. */
  role: { current: null as string | null },
  isPrivate: { current: false },
  members: new Map<string, string>(),
  handles: new Map<string, string>(),
  modItems: [] as Row[],
  posts: [] as Row[],
  bans: [] as Row[],
  rule: { current: null as null | { id: string; position: number; title: string; description: string | null } },
  resolveModItem: vi.fn(),
  enqueuePostAlert: vi.fn(),
  recordCitation: vi.fn(),
  notify: vi.fn(),
  logged: [] as Row[],
  created: [] as Row[],
}));

vi.mock('@/lib/communities/automod.server', async (orig) => ({
  ...(await orig<typeof import('@/lib/communities/automod.server')>()),
  resolveModItem: h.resolveModItem,
}));
vi.mock('@/lib/communities/rules.server', async (orig) => ({
  ...(await orig<typeof import('@/lib/communities/rules.server')>()),
  getRule: vi.fn(async (_c: string, id: string) => (h.rule.current?.id === id ? h.rule.current : null)),
  recordCitation: h.recordCitation,
}));
vi.mock('@/lib/communities/post-alerts.server', () => ({ enqueuePostAlert: h.enqueuePostAlert }));
vi.mock('@/lib/notifications.server', () => ({ createNotification: h.notify }));
vi.mock('@/lib/db/advisory-lock.server', () => ({ lockKey: vi.fn(async () => undefined) }));

vi.mock('@/lib/prisma.server', () => {
  const tx = {
    communityBan: {
      updateMany: vi.fn(async () => ({ count: 1 })),
      create: vi.fn(async ({ data }: { data: Row }) => {
        h.created.push(data);
        return { id: 'ban_new' };
      }),
    },
    communityModAction: {
      create: vi.fn(async ({ data }: { data: Row }) => {
        h.logged.push(data);
        return { id: 7n };
      }),
    },
  };
  return {
    prisma: {
      $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
      community: {
        findUnique: vi.fn(async ({ where }: { where: { slug?: string; id?: string } }) => {
          if (where.slug && where.slug !== 'club') return null;
          if (where.id && where.id !== 'c1') return null;
          return {
            id: 'c1',
            slug: 'club',
            name: 'The Club',
            isPrivate: h.isPrivate.current,
            createdById: 'owner_1',
            members: h.role.current ? [{ role: h.role.current }] : [],
          };
        }),
      },
      communityMember: {
        findUnique: vi.fn(async ({ where }: { where: { communityId_userId: { userId: string } } }) => {
          const role = h.members.get(where.communityId_userId.userId);
          return role ? { id: `m_${where.communityId_userId.userId}`, role } : null;
        }),
      },
      user: {
        findUnique: vi.fn(async ({ where }: { where: { handle?: string; id?: string } }) => {
          if (where.handle) {
            const id = h.handles.get(where.handle);
            return id ? { id } : null;
          }
          return where.id ? { id: where.id } : null;
        }),
        findMany: vi.fn(async () => []),
      },
      communityModItem: {
        findMany: vi.fn(async () => h.modItems),
        findUnique: vi.fn(
          async ({ where }: { where: { id: string } }) => h.modItems.find((i) => i.id === where.id) ?? null,
        ),
      },
      rMHark: { findMany: vi.fn(async () => h.posts) },
      communityRule: { findMany: vi.fn(async () => []) },
      communityBan: {
        findMany: vi.fn(async () => h.bans),
        findFirst: vi.fn(async ({ where }: { where: { id: string } }) => h.bans.find((b) => b.id === where.id) ?? null),
        updateMany: vi.fn(async () => ({ count: 1 })),
      },
      developerApiKey: { findUnique: vi.fn(async () => h.key.current), update: vi.fn(async () => ({})) },
      apiKeyRefusalDaily: { upsert: vi.fn(async () => ({})) },
      apiIdempotencyKey: {
        findUnique: vi.fn(async () => null),
        create: vi.fn(async () => ({})),
        deleteMany: vi.fn(),
      },
    },
  };
});
vi.mock('@/lib/entitlements', () => ({
  getUserTier: vi.fn(async () => 'starter'),
  hasApiAccess: () => true,
}));
vi.mock('@/lib/admin-audit.server', () => ({ getActiveBan: vi.fn(async () => null) }));
vi.mock('@/lib/redis.server', () => ({
  redisRateLimit: vi.fn(async () => null),
  redisIncrBy: vi.fn(async () => null),
}));
vi.mock('@/lib/api/usage.server', () => ({ recordUsage: vi.fn() }));
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: unknown) => ({ options: config }),
}));

const { KEY_PREFIX } = await import('@/lib/api/developer-auth.server');
const { hourlyBudgetExceeded } = await import('@/lib/api/v1/moderation.server');
const { toPublicEntry } = await import('@/lib/communities/modlog');
const routes = {
  queue: handlersOf<TestHandler>((await import('../../../../app/routes/api/v1/communities/$slug/modqueue')).Route),
  item: handlersOf<TestHandler>(
    (await import('../../../../app/routes/api/v1/communities/$slug/modqueue/$itemId')).Route,
  ),
  sanctions: handlersOf<TestHandler>((await import('../../../../app/routes/api/v1/communities/$slug/sanctions')).Route),
  sanction: handlersOf<TestHandler>(
    (await import('../../../../app/routes/api/v1/communities/$slug/sanctions/$id')).Route,
  ),
};

const OWNER = 'mod_1';
const BEARER = `Bearer ${KEY_PREFIX}${'k'.repeat(24)}`;
const keyFor = (scopes: string[]) => ({
  id: 'key_1',
  userId: OWNER,
  revokedAt: null,
  expiresAt: null,
  scopes,
  testMode: false,
  allowedCidrs: [] as string[],
  rateLimitPerMinute: null,
  user: { id: OWNER, banReason: null },
});

function call(
  handler: TestHandler | undefined,
  method: string,
  path: string,
  params: Record<string, string>,
  body?: unknown,
) {
  if (!handler) throw new Error(`no ${method} handler`);
  return handler({
    request: new Request(`https://rmhstudios.com${path}`, {
      method,
      headers: {
        authorization: BEARER,
        'cf-connecting-ip': '203.0.113.9',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    params,
  });
}

const list = (qs = '') => call(routes.queue.GET, 'GET', `/api/v1/communities/club/modqueue${qs}`, { slug: 'club' });
const decide = (body: unknown, itemId = 'q1') =>
  call(routes.item.POST, 'POST', `/api/v1/communities/club/modqueue/${itemId}`, { slug: 'club', itemId }, body);
const listSanctions = (qs = '') =>
  call(routes.sanctions.GET, 'GET', `/api/v1/communities/club/sanctions${qs}`, { slug: 'club' });
const sanctionMember = (body: unknown) =>
  call(routes.sanctions.POST, 'POST', '/api/v1/communities/club/sanctions', { slug: 'club' }, body);
const lift = (id: string) =>
  call(routes.sanction.DELETE, 'DELETE', `/api/v1/communities/club/sanctions/${id}`, { slug: 'club', id });

const code = async (r: Response) => (await r.json()).error.code as string;

const item = (over: Row = {}): Row => ({
  id: 'q1',
  entityType: 'rmhark',
  entityId: 'p1',
  postId: 'p1',
  action: 'hold',
  ruleName: 'New account links',
  snapshot: 'Check out my site',
  payload: null,
  status: 'PENDING',
  createdAt: new Date('2026-11-22T09:30:00Z'),
  authorId: 'author_1',
  author: {
    id: 'author_1',
    name: 'Author',
    image: null,
    username: 'author',
    handle: 'author',
    isVerified: false,
    isAdmin: false,
    isBot: false,
    profile: null,
    inventory: [],
  },
  ...over,
});

beforeEach(() => {
  h.key.current = keyFor(['manage:moderation']);
  h.role.current = 'MOD';
  h.isPrivate.current = false;
  h.members = new Map([['member_1', 'MEMBER']]);
  h.handles = new Map([
    ['member_1', 'member_1'],
    ['mod_2', 'mod_2'],
    ['owner', 'owner_1'],
    ['stranger', 'stranger_1'],
  ]);
  h.modItems = [item()];
  h.posts = [];
  h.bans = [];
  h.rule.current = { id: 'r1', position: 3, title: 'Be kind', description: null };
  h.resolveModItem.mockReset().mockImplementation(async (_c: string, _i: string, d: string) => ({
    status: d === 'approve' ? 'APPROVED' : 'REMOVED',
  }));
  h.enqueuePostAlert.mockReset().mockResolvedValue(undefined);
  h.recordCitation.mockReset().mockResolvedValue(undefined);
  h.notify.mockReset().mockResolvedValue(undefined);
  h.logged = [];
  h.created = [];
});

describe('the explicit manage:moderation scope', () => {
  it.each([['*'], ['manage:*'], ['read:*', 'write:*', 'manage:*'], ['read:communities', 'write:communities']])(
    'a key holding %s but not manage:moderation is 403 insufficient_scope on every endpoint',
    async (...scopes) => {
      h.key.current = keyFor(scopes);
      const res = await Promise.all([
        list(),
        decide({ decision: 'approve' }),
        listSanctions(),
        sanctionMember({ handle: 'member_1', kind: 'timeout' }),
        lift('ban1'),
      ]);
      for (const r of res) {
        expect(r.status).toBe(403);
        expect(await code(r)).toBe('insufficient_scope');
      }
      expect(h.resolveModItem).not.toHaveBeenCalled();
      expect(h.created).toHaveLength(0);
    },
  );

  it('a key that names manage:moderation (with or without wildcards) is let in', async () => {
    h.key.current = keyFor(['*', 'manage:moderation']);
    expect((await list()).status).toBe(200);
  });
});

describe('the moderator check', () => {
  it('a member who is not a moderator is 403 not_moderator, on reads and writes', async () => {
    h.role.current = 'MEMBER';
    for (const r of [
      await list(),
      await decide({ decision: 'approve' }),
      await listSanctions(),
      await sanctionMember({ handle: 'member_1', kind: 'timeout' }),
      await lift('ban1'),
    ]) {
      expect(r.status).toBe(403);
      expect(await code(r)).toBe('not_moderator');
    }
    expect(h.resolveModItem).not.toHaveBeenCalled();
  });

  it('a demoted moderator is refused on the very next call', async () => {
    expect((await list()).status).toBe(200);
    h.role.current = 'MEMBER';
    const r = await list();
    expect(r.status).toBe(403);
    expect(await code(r)).toBe('not_moderator');
  });

  it("a private community's queue is not found by a non-member, and 403 for a member who is not a moderator", async () => {
    h.isPrivate.current = true;
    h.role.current = null;
    expect((await list()).status).toBe(404);
    h.role.current = 'MEMBER';
    expect((await list()).status).toBe(403);
  });

  it('an unknown community is 404', async () => {
    const r = await call(routes.queue.GET, 'GET', '/api/v1/communities/nowhere/modqueue', { slug: 'nowhere' });
    expect(r.status).toBe(404);
  });
});

describe('the mod queue', () => {
  it('lists items with the key owner as viewer and a keyset cursor', async () => {
    h.modItems = [item({ id: 'q1' }), item({ id: 'q2' }), item({ id: 'q3' })];
    const r = await list('?limit=2');
    const body = await r.json();
    expect(r.status).toBe(200);
    expect(body.data.map((i: Row) => i.id)).toEqual(['q1', 'q2']);
    expect(body.nextCursor).toBe('q2');
    expect(body.data[0]).toMatchObject({ type: 'post', action: 'hold', status: 'PENDING', text: 'Check out my site' });
  });

  it('serialises a held post through the API serialiser: text, content warning, GIF description, quiet counts', async () => {
    h.posts = [
      {
        id: 'p1',
        content: 'Held words',
        createdAt: new Date('2026-11-22T09:30:00Z'),
        likeCount: 4,
        commentCount: 1,
        repostCount: 0,
        viewCount: 9,
        imageUrls: [],
        imageAlts: [],
        gifUrl: 'https://media.example/x.gif',
        gifAlt: 'A cat',
        isSensitive: true,
        contentWarning: 'Spoilers',
        user: { ...(item().author as Row), profile: { displayName: null, customImage: null, hideCountsOnMine: true } },
      },
    ];
    const body = await (await list()).json();
    expect(body.data[0].text).toBe('Held words');
    expect(body.data[0].post).toMatchObject({
      content: 'Held words',
      sensitive: true,
      contentWarning: 'Spoilers',
      gifAlt: 'A cat',
      metrics: { likes: null, comments: null, reposts: null, views: null },
    });
  });

  it("a held comment's text comes from its payload", async () => {
    h.modItems = [
      item({ entityType: 'comment', entityId: null, payload: { content: 'Held comment', parentId: null } }),
    ];
    const body = await (await list()).json();
    expect(body.data[0]).toMatchObject({ type: 'comment', text: 'Held comment', post: null });
  });

  it('rejects an unknown view', async () => {
    expect((await list('?view=all')).status).toBe(400);
  });
});

describe('deciding an item', () => {
  it('approving a held post queues its alerts and tells the log it came through the API', async () => {
    const r = await decide({ decision: 'approve' });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ id: 'q1', status: 'APPROVED' });
    expect(h.resolveModItem).toHaveBeenCalledWith('c1', 'q1', 'approve', OWNER, { via: 'api' });
    expect(h.enqueuePostAlert).toHaveBeenCalledWith('p1');
  });

  it('removing with a rule records the citation and notifies the author, naming the rule', async () => {
    const r = await decide({ decision: 'remove', rule_id: 'r1', message: 'Keep promotion to the weekly thread.' });
    expect(r.status).toBe(200);
    expect(h.resolveModItem).toHaveBeenCalledWith('c1', 'q1', 'remove', OWNER, {
      rule: { id: 'r1', title: 'Be kind' },
      reason: 'Keep promotion to the weekly thread.',
      via: 'api',
    });
    expect(h.recordCitation).toHaveBeenCalledWith('q1', expect.objectContaining({ id: 'r1' }));
    expect(h.notify).toHaveBeenCalledTimes(1);
    const sent = h.notify.mock.calls[0]?.[0] as { userId: string; preview: string };
    expect(sent.userId).toBe('author_1');
    expect(sent.preview).toContain('Be kind');
    expect(h.enqueuePostAlert).not.toHaveBeenCalled();
  });

  it('a rule of another community is 400 rule_not_found and nothing is resolved', async () => {
    const r = await decide({ decision: 'remove', rule_id: 'other' });
    expect(r.status).toBe(400);
    expect(await code(r)).toBe('rule_not_found');
    expect(h.resolveModItem).not.toHaveBeenCalled();
  });

  it('an item that was already decided is 409 item_resolved', async () => {
    const { AutomodError } = await import('@/lib/communities/automod.server');
    h.resolveModItem.mockRejectedValue(new AutomodError('Already resolved', 409));
    const r = await decide({ decision: 'approve' });
    expect(r.status).toBe(409);
    expect(await code(r)).toBe('item_resolved');
    expect(h.enqueuePostAlert).not.toHaveBeenCalled();
  });

  it('an unknown item is 404', async () => {
    const { AutomodError } = await import('@/lib/communities/automod.server');
    h.resolveModItem.mockRejectedValue(new AutomodError('Item not found', 404));
    expect((await decide({ decision: 'approve' }, 'nope')).status).toBe(404);
  });

  it('takes no moderator id from the body, and refuses an invalid decision', async () => {
    expect((await decide({ decision: 'approve', moderator_id: 'someone' })).status).toBe(200);
    expect(h.resolveModItem.mock.calls[0]?.[3]).toBe(OWNER);
    expect((await decide({ decision: 'ban' })).status).toBe(400);
    expect((await decide({})).status).toBe(400);
  });
});

describe('sanctions', () => {
  it("a moderator times a member out: the sanction is the key owner's, logged with via api, and the member is told", async () => {
    const r = await sanctionMember({
      handle: '@member_1',
      kind: 'timeout',
      duration: '1h',
      rule_id: 'r1',
      reason: 'Twice.',
    });
    expect(r.status).toBe(201);
    const body = await r.json();
    expect(body).toMatchObject({ id: 'ban_new', kind: 'timeout' });
    expect(h.created[0]).toMatchObject({
      communityId: 'c1',
      userId: 'member_1',
      kind: 'timeout',
      ruleId: 'r1',
      reason: 'Twice.',
      createdById: OWNER,
    });
    expect(h.logged[0]).toMatchObject({
      actorId: OWNER,
      action: 'member_timed_out',
      targetUserId: 'member_1',
      ruleTitle: 'Be kind',
      detail: { duration: '1h', via: 'api' },
    });
    expect(h.notify).toHaveBeenCalledWith(expect.objectContaining({ userId: 'member_1', entityType: 'community_ban' }));
  });

  it('the duration defaults by kind and must suit it', async () => {
    expect((await sanctionMember({ handle: 'member_1', kind: 'timeout' })).status).toBe(201);
    expect(h.logged[0]).toMatchObject({ detail: { duration: '1d', via: 'api' } });
    const bad = await sanctionMember({ handle: 'member_1', kind: 'timeout', duration: 'forever' });
    expect(bad.status).toBe(400);
  });

  it("a moderator's key cannot sanction another moderator: 409 sanction_refused with the site's reason", async () => {
    h.members.set('mod_2', 'MOD');
    const r = await sanctionMember({ handle: 'mod_2', kind: 'ban', duration: '7d' });
    expect(r.status).toBe(409);
    const body = await r.json();
    expect(body.error.code).toBe('sanction_refused');
    expect(body.error.message).toBe('Only the owner can sanction a mod');
    expect(h.created).toHaveLength(0);
  });

  it("the owner's key can sanction a moderator", async () => {
    h.role.current = 'ADMIN';
    h.members.set('mod_2', 'MOD');
    const r = await sanctionMember({ handle: 'mod_2', kind: 'timeout', duration: '1h' });
    expect(r.status).toBe(201);
    expect(h.created[0]).toMatchObject({ userId: 'mod_2', createdById: OWNER });
  });

  it('nobody can sanction the owner, not even the owner', async () => {
    h.members.set('owner_1', 'ADMIN');
    for (const role of ['MOD', 'ADMIN']) {
      h.role.current = role;
      const r = await sanctionMember({ handle: 'owner', kind: 'ban', duration: 'forever' });
      expect(r.status).toBe(409);
      expect((await r.json()).error.message).toBe("The owner can't be banned or timed out");
    }
    expect(h.created).toHaveLength(0);
  });

  it('an unknown handle is 404, a timeout of a non-member is 404, an unknown rule is 400 rule_not_found', async () => {
    expect((await sanctionMember({ handle: 'ghost', kind: 'ban' })).status).toBe(404);
    expect((await sanctionMember({ handle: 'stranger', kind: 'timeout' })).status).toBe(404);
    const r = await sanctionMember({ handle: 'member_1', kind: 'timeout', rule_id: 'other' });
    expect(r.status).toBe(400);
    expect(await code(r)).toBe('rule_not_found');
  });

  it('a ban of someone who is not a member is allowed, as on the site', async () => {
    const r = await sanctionMember({ handle: 'stranger', kind: 'ban', duration: '30d' });
    expect(r.status).toBe(201);
    expect(h.logged[0]).toMatchObject({ action: 'member_banned', detail: { duration: '30d', via: 'api' } });
  });

  it('takes no moderator id and no user id from the body', async () => {
    const r = await sanctionMember({ handle: 'member_1', kind: 'timeout', created_by: 'x', userId: 'other' });
    expect(r.status).toBe(201);
    expect(h.created[0]).toMatchObject({ userId: 'member_1', createdById: OWNER });
  });

  it('lists active sanctions with the private reason, paged', async () => {
    h.bans = [
      {
        id: 'b1',
        kind: 'timeout',
        endsAt: new Date('2026-11-23T09:30:00Z'),
        createdAt: new Date('2026-11-22T09:30:00Z'),
        liftedAt: null,
        reason: 'Twice.',
        ruleId: null,
        createdById: OWNER,
        user: { id: 'member_1', name: 'M', handle: 'member_1' },
      },
    ];
    const r = await listSanctions('?active=true');
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.data[0]).toMatchObject({
      id: 'b1',
      kind: 'timeout',
      reason: 'Twice.',
      member: { handle: 'member_1' },
      liftedAt: null,
    });
    expect(body.nextCursor).toBeNull();
    expect((await listSanctions('?active=maybe')).status).toBe(400);
  });

  it('lifts a sanction as the key owner, logged with via api; an unknown one is 404', async () => {
    h.bans = [{ id: 'b1', userId: 'member_1', kind: 'timeout' }];
    const r = await lift('b1');
    expect(r.status).toBe(204);
    expect(h.logged[0]).toMatchObject({
      action: 'ban_lifted',
      actorId: OWNER,
      detail: { kind: 'timeout', via: 'api' },
    });
    expect((await lift('nope')).status).toBe(404);
  });
});

describe('limits', () => {
  it('allows 120 decisions and 30 sanctions per key per hour, then 429', async () => {
    for (let i = 0; i < 120; i++) expect(await hourlyBudgetExceeded('key_budget', 'decision')).toBe(false);
    expect(await hourlyBudgetExceeded('key_budget', 'decision')).toBe(true);
    for (let i = 0; i < 30; i++) expect(await hourlyBudgetExceeded('key_budget', 'sanction')).toBe(false);
    expect(await hourlyBudgetExceeded('key_budget', 'sanction')).toBe(true);
    // another key has its own hour
    expect(await hourlyBudgetExceeded('key_other', 'sanction')).toBe(false);
  });
});

describe('the public log', () => {
  it('never carries the via marker', () => {
    const entry = toPublicEntry({
      id: 1n,
      action: 'content_removed',
      targetType: 'post',
      ruleTitle: 'Be kind',
      reason: null,
      createdAt: new Date('2026-11-22T09:30:00Z'),
      detail: { via: 'api' },
    } as Parameters<typeof toPublicEntry>[0]);
    expect(JSON.stringify(entry)).not.toContain('api');
  });
});
