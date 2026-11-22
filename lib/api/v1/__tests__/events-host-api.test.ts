/**
 * Hosting through `/api/v1/events*` (`manage:events`), driven through the real developer-API wrapper, the real
 * v1 adapters and the real `postUpdate` over mocked Prisma: the site's create / edit / cancel functions are
 * mocked (their rules are the site's own and tested there), so this holds what the API adds: the scope, the key
 * owner as host, the community slug, the error map, visibility before hosting rights, and the update post
 * reaching `postUpdate` and the fan-out queue.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handlersOf, type TestHandler } from '@/lib/__tests__/api-handlers-of';
import { EventError } from '@/lib/events/event-error';

type Row = Record<string, unknown> & {
  id: string;
};
const h = vi.hoisted(() => ({
  events: [] as Row[],
  updates: [] as Row[],
  communities: [] as {
    id: string;
    slug: string;
  }[],
  key: {
    current: null as Record<string, unknown> | null,
  },
  canView: vi.fn(),
  createEvent: vi.fn(),
  updateEvent: vi.fn(),
  cancelEvent: vi.fn(),
  canManage: vi.fn(),
  boss: {
    send: vi.fn(),
  },
  createdUpdates: [] as Row[],
  recentUpdates: [] as {
    createdAt: Date;
  }[],
}));

vi.mock('@/lib/events.server', async (orig) => ({
  ...(await orig<typeof import('@/lib/events.server')>()),
  canViewEvent: h.canView,
  createEvent: h.createEvent,
  updateEvent: h.updateEvent,
  cancelEvent: h.cancelEvent,
}));
vi.mock('@/lib/events/cohosts.server', () => ({
  canManageEvent: h.canManage,
}));
vi.mock('@/lib/jobs/boss.server', () => ({
  getBoss: vi.fn(async () => h.boss),
}));
vi.mock('@/lib/db/advisory-lock.server', () => ({
  lockKey: vi.fn(async () => undefined),
}));

vi.mock('@/lib/prisma.server', () => {
  const findEvent = async ({
    where,
  }: {
    where: {
      id: string;
    };
  }) => h.events.find((e) => e.id === where.id) ?? null;
  const tx = {
    event: {
      findUnique: findEvent,
    },
    eventUpdate: {
      findMany: vi.fn(async () => h.recentUpdates),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = {
          id: 'upd_new',
          createdAt: new Date('2026-11-22T10:00:00Z'),
          ...data,
        };
        h.createdUpdates.push(row);
        return row;
      }),
    },
  };
  return {
    prisma: {
      $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
      event: {
        findFirst: vi.fn(findEvent),
        findUnique: vi.fn(findEvent),
      },
      community: {
        findUnique: vi.fn(
          async ({
            where,
          }: {
            where: {
              slug: string;
            };
          }) => h.communities.find((c) => c.slug === where.slug) ?? null,
        ),
      },
      rsvp: {
        findMany: vi.fn(async () => []),
      },
      eventCohost: {
        findMany: vi.fn(async () => []),
      },
      eventUpdate: {
        findMany: vi.fn(async () => h.updates),
      },
      user: {
        findMany: vi.fn(async () => []),
      },
      developerApiKey: {
        findUnique: vi.fn(async () => h.key.current),
        update: vi.fn(async () => ({})),
      },
      apiKeyRefusalDaily: {
        upsert: vi.fn(async () => ({})),
      },
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
vi.mock('@/lib/admin-audit.server', () => ({
  getActiveBan: vi.fn(async () => null),
}));
vi.mock('@/lib/redis.server', () => ({
  redisRateLimit: vi.fn(async () => null),
  redisIncrBy: vi.fn(async () => null),
}));
vi.mock('@/lib/api/usage.server', () => ({
  recordUsage: vi.fn(),
}));
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: unknown) => ({
    options: config,
  }),
}));

const { KEY_PREFIX } = await import('@/lib/api/developer-auth.server');
const { UPDATE_FANOUT_QUEUE } = await import('@/lib/events/updates');
const routes = {
  list: handlersOf<TestHandler>((await import('../../../../app/routes/api/v1/events')).Route),
  one: handlersOf<TestHandler>((await import('../../../../app/routes/api/v1/events/$id')).Route),
  cancel: handlersOf<TestHandler>((await import('../../../../app/routes/api/v1/events/$id/cancel')).Route),
  updates: handlersOf<TestHandler>((await import('../../../../app/routes/api/v1/events/$id/updates')).Route),
};

const OWNER = 'owner_1';
const HOST = 'host_1';
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
  user: {
    id: OWNER,
    banReason: null,
  },
});

const person = (id: string): Row => ({
  id,
  name: id,
  image: null,
  username: id,
  handle: id,
  isVerified: false,
  isAdmin: false,
  isBot: false,
  profile: null,
  inventory: [],
});

function event(
  over: Partial<Row> & {
    id: string;
  },
): Row {
  return {
    owner: 'USER',
    hostId: OWNER,
    communityId: null,
    kind: 'event',
    title: `Event ${over.id}`,
    description: '',
    startsAt: new Date('2026-12-03T19:00:00Z'),
    endsAt: null,
    venueKind: 'URL',
    venueRef: null,
    href: null,
    capacity: null,
    visibility: 'PUBLIC',
    canceledAt: null,
    recurrence: null,
    recurUntil: null,
    recurTz: null,
    rotatingHostIds: [],
    pollId: null,
    host: person(OWNER),
    community: null,
    ...over,
  };
}

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
        ...(body === undefined
          ? {}
          : {
              'content-type': 'application/json',
            }),
      },
      ...(body === undefined
        ? {}
        : {
            body: JSON.stringify(body),
          }),
    }),
    params,
  });
}

const create = (body: unknown) => call(routes.list.POST, 'POST', '/api/v1/events', {}, body);
const edit = (id: string, body: unknown) => call(routes.one.PATCH, 'PATCH', `/api/v1/events/${id}`, { id }, body);
const cancel = (id: string) => call(routes.cancel.POST, 'POST', `/api/v1/events/${id}/cancel`, { id }, {});
const postUpdate = (id: string, body: unknown) =>
  call(routes.updates.POST, 'POST', `/api/v1/events/${id}/updates`, { id }, body);

const MINIMAL = {
  title: 'Game night',
  starts_at: '2026-12-03T19:00:00Z',
  venue_kind: 'URL',
  venue: 'https://example.com/room',
};

beforeEach(() => {
  h.events = [event({ id: 'e1' })];
  h.updates = [];
  h.communities = [{ id: 'c1', slug: 'chess-club' }];
  h.key.current = keyFor(['read:events', 'manage:events']);
  h.canView.mockReset().mockResolvedValue(true);
  h.createEvent.mockReset().mockResolvedValue({ id: 'e1' });
  h.updateEvent.mockReset().mockResolvedValue({ id: 'e1' });
  h.cancelEvent.mockReset().mockResolvedValue({ id: 'e1' });
  h.canManage.mockReset().mockResolvedValue('host');
  h.boss.send.mockReset().mockResolvedValue('job');
  h.createdUpdates = [];
  h.recentUpdates = [];
});

describe('the manage:events scope', () => {
  it('write:events alone cannot host: every hosting call is 403 insufficient_scope', async () => {
    h.key.current = keyFor(['read:events', 'write:events']);
    const res = await Promise.all([
      create(MINIMAL),
      edit('e1', { title: 'New title' }),
      cancel('e1'),
      postUpdate('e1', { body: 'Doors at 18:45.' }),
    ]);
    for (const r of res) {
      expect(r.status).toBe(403);
      expect((await r.json()).error.code).toBe('insufficient_scope');
    }
    expect(h.createEvent).not.toHaveBeenCalled();
    expect(h.updateEvent).not.toHaveBeenCalled();
    expect(h.cancelEvent).not.toHaveBeenCalled();
    expect(h.createdUpdates).toHaveLength(0);
  });

  it('reading updates needs only read:events', async () => {
    h.key.current = keyFor(['read:events']);
    const r = await call(routes.updates.GET, 'GET', '/api/v1/events/e1/updates', { id: 'e1' });
    expect(r.status).toBe(200);
  });

  it.each([['manage:*'], ['*']])('a %s key can host', async (scope) => {
    h.key.current = keyFor([scope]);
    expect((await create(MINIMAL)).status).toBe(201);
  });
});

describe('POST /events', () => {
  it('creates as the key owner and answers 201 with the event as GET returns it', async () => {
    const r = await create({ ...MINIMAL, description: 'Bring a controller.', capacity: 12, visibility: 'private' });
    expect(r.status).toBe(201);
    const body = await r.json();
    expect(body.id).toBe('e1');
    expect(body).toHaveProperty('nextOccurrences');
    expect(h.createEvent).toHaveBeenCalledTimes(1);
    expect(h.createEvent.mock.calls[0]?.[0]).toMatchObject({
      hostId: OWNER,
      communityId: null,
      title: 'Game night',
      venueKind: 'URL',
      venueRef: 'https://example.com/room',
      capacity: 12,
      visibility: 'PRIVATE',
      recurrence: null,
    });
    expect(h.createEvent.mock.calls[0]?.[0].startsAt).toEqual(new Date('2026-12-03T19:00:00Z'));
  });

  it('refuses a host id and any other unknown field', async () => {
    for (const extra of [{ host_id: 'someone_else' }, { hostId: 'someone_else' }, { communityId: 'c1' }]) {
      const r = await create({ ...MINIMAL, ...extra });
      expect(r.status).toBe(400);
    }
    expect(h.createEvent).not.toHaveBeenCalled();
  });

  it('validates the body: dates need an offset, repeat needs a zone, titles are bounded', async () => {
    for (const bad of [
      { ...MINIMAL, starts_at: '2026-12-03' },
      { ...MINIMAL, title: 'x' },
      { ...MINIMAL, venue_kind: 'MOON' },
      { ...MINIMAL, repeat: 'W' },
      { ...MINIMAL, capacity: 0 },
      { ...MINIMAL, starts_at: '1970-01-01T00:00:00Z' },
      { ...MINIMAL, starts_at: '2400-01-01T00:00:00Z' },
    ]) {
      expect((await create(bad)).status).toBe(400);
    }
    expect(h.createEvent).not.toHaveBeenCalled();
  });

  it('takes from the site event-create bucket of the key owner (event-create:<userId>)', async () => {
    const { createBudgetExceeded } = await import('@/lib/api/v1/events.server');
    const { rateLimit, RATE_LIMIT_MULTIPLIER } = await import('@/lib/rate-limit');
    const allowed = Math.ceil(10 * RATE_LIMIT_MULTIPLIER);
    // The site's create handler spends the same bucket; the API sees what it spent.
    for (let i = 0; i < allowed; i++) rateLimit('budget_user', { limit: 10, windowMs: 60_000, prefix: 'event-create' });
    expect(await createBudgetExceeded('budget_user')).toBe(true);
    expect(await createBudgetExceeded('someone_else')).toBe(false);
  });

  it('passes a weekly repeat without host rotation', async () => {
    await create({ ...MINIMAL, repeat: 'W', repeat_tz: 'America/New_York', repeat_until: '2027-03-01T00:00:00Z' });
    expect(h.createEvent.mock.calls[0]?.[0].recurrence).toEqual({
      rule: 'W',
      tz: 'America/New_York',
      until: new Date('2027-03-01T00:00:00Z'),
      rotatingHostIds: [],
    });
  });

  it('resolves the community slug on the server', async () => {
    const r = await create({ ...MINIMAL, community: 'chess-club' });
    expect(r.status).toBe(201);
    expect(h.createEvent.mock.calls[0]?.[0].communityId).toBe('c1');
  });

  it('an unknown community is 404', async () => {
    const r = await create({ ...MINIMAL, community: 'nope' });
    expect(r.status).toBe(404);
    expect(h.createEvent).not.toHaveBeenCalled();
  });

  it('a community event by a non-moderator is 403 forbidden (the site decides)', async () => {
    h.createEvent.mockRejectedValue(new EventError('FORBIDDEN'));
    const r = await create({ ...MINIMAL, community: 'chess-club' });
    expect(r.status).toBe(403);
    expect((await r.json()).error.code).toBe('forbidden');
  });

  it.each([
    ['INVALID_DATES', 400, 'invalid_dates'],
    ['INVALID_VENUE_URL', 400, 'invalid_venue_url'],
    ['INVALID_RECURRENCE', 400, 'invalid_recurrence'],
  ] as const)('%s maps to %s', async (code, status, apiCode) => {
    h.createEvent.mockRejectedValue(new EventError(code));
    const r = await create(MINIMAL);
    expect(r.status).toBe(status);
    expect((await r.json()).error.code).toBe(apiCode);
  });

  it('never echoes an unexpected error', async () => {
    h.createEvent.mockRejectedValue(new Error('connection string postgres://secret'));
    const r = await create(MINIMAL);
    expect(r.status).toBe(500);
    expect(JSON.stringify(await r.json())).not.toContain('postgres');
  });
});

describe('PATCH /events/{id}', () => {
  it('edits through updateEvent as the key owner with only the fields sent', async () => {
    const r = await edit('e1', { title: 'Game night (online)', ends_at: null, capacity: 20 });
    expect(r.status).toBe(200);
    expect(h.updateEvent).toHaveBeenCalledWith({
      id: 'e1',
      hostId: OWNER,
      title: 'Game night (online)',
      endsAt: null,
      capacity: 20,
    });
  });

  it('repeat: null clears the repeat rule', async () => {
    await edit('e1', { repeat: null });
    expect(h.updateEvent.mock.calls[0]?.[0]).toMatchObject({ recurrence: null });
  });

  it('an empty body is 400', async () => {
    expect((await edit('e1', {})).status).toBe(400);
    expect(h.updateEvent).not.toHaveBeenCalled();
  });

  it('an event the key owner cannot see is 404 and never reaches updateEvent', async () => {
    h.canView.mockResolvedValue(false);
    const r = await edit('e1', { title: 'Mine now' });
    expect(r.status).toBe(404);
    expect(h.updateEvent).not.toHaveBeenCalled();
  });

  it('an event that does not exist is 404', async () => {
    expect((await edit('missing', { title: 'Whatever' })).status).toBe(404);
  });

  it('an event they see but do not host is 403 not_host', async () => {
    h.events = [event({ id: 'e1', hostId: HOST, host: person(HOST) })];
    h.updateEvent.mockRejectedValue(new EventError('FORBIDDEN'));
    const r = await edit('e1', { title: 'Not mine' });
    expect(r.status).toBe(403);
    expect((await r.json()).error.code).toBe('not_host');
  });
});

describe('POST /events/{id}/cancel', () => {
  it('cancels through cancelEvent as the host', async () => {
    const r = await cancel('e1');
    expect(r.status).toBe(200);
    expect(h.cancelEvent).toHaveBeenCalledWith('e1', OWNER);
  });

  it('canceling twice is 409 already_canceled', async () => {
    h.events = [event({ id: 'e1', canceledAt: new Date('2026-11-20T00:00:00Z') })];
    const r = await cancel('e1');
    expect(r.status).toBe(409);
    expect((await r.json()).error.code).toBe('already_canceled');
    expect(h.cancelEvent).not.toHaveBeenCalled();
  });

  it('a co-host or guest who sees the event gets 403 not_host', async () => {
    h.events = [event({ id: 'e1', hostId: HOST, host: person(HOST) })];
    const r = await cancel('e1');
    expect(r.status).toBe(403);
    expect((await r.json()).error.code).toBe('not_host');
    expect(h.cancelEvent).not.toHaveBeenCalled();
  });

  it('an invisible event is 404', async () => {
    h.canView.mockResolvedValue(false);
    expect((await cancel('e1')).status).toBe(404);
    expect(h.cancelEvent).not.toHaveBeenCalled();
  });
});

describe('updates', () => {
  it('posting calls postUpdate (insert as the key owner) and queues the fan-out', async () => {
    const r = await postUpdate('e1', { body: '  Doors at 18:45.  ' });
    expect(r.status).toBe(201);
    expect(await r.json()).toMatchObject({ id: 'upd_new', body: 'Doors at 18:45.', occurrence: null });
    expect(h.createdUpdates).toHaveLength(1);
    expect(h.createdUpdates[0]).toMatchObject({ eventId: 'e1', authorId: OWNER, body: 'Doors at 18:45.' });
    expect(h.boss.send).toHaveBeenCalledTimes(1);
    expect(h.boss.send.mock.calls[0]?.[0]).toBe(UPDATE_FANOUT_QUEUE);
    expect(h.boss.send.mock.calls[0]?.[1]).toEqual({ updateId: 'upd_new' });
  });

  it('someone who cannot manage the event is 403 not_host and nothing is stored or queued', async () => {
    h.canManage.mockResolvedValue(null);
    const r = await postUpdate('e1', { body: 'Hello' });
    expect(r.status).toBe(403);
    expect((await r.json()).error.code).toBe('not_host');
    expect(h.createdUpdates).toHaveLength(0);
    expect(h.boss.send).not.toHaveBeenCalled();
  });

  it('an invisible event is 404 before any hosting check', async () => {
    h.canView.mockResolvedValue(false);
    expect((await postUpdate('e1', { body: 'Hello' })).status).toBe(404);
    expect(h.canManage).not.toHaveBeenCalled();
  });

  it('a canceled event is 409 canceled', async () => {
    h.events = [event({ id: 'e1', canceledAt: new Date('2026-11-20T00:00:00Z') })];
    const r = await postUpdate('e1', { body: 'Hello' });
    expect(r.status).toBe(409);
    expect((await r.json()).error.code).toBe('canceled');
    expect(h.boss.send).not.toHaveBeenCalled();
  });

  it('the site rate limit on updates is 429 rate_limited', async () => {
    const now = Date.now();
    h.recentUpdates = [1, 2, 3].map((n) => ({ createdAt: new Date(now - n * 1000) }));
    const r = await postUpdate('e1', { body: 'Again' });
    expect(r.status).toBe(429);
    expect((await r.json()).error.code).toBe('rate_limited');
    expect(h.createdUpdates).toHaveLength(0);
  });

  it('validates the body', async () => {
    for (const bad of [{}, { body: '' }, { body: 'x'.repeat(501) }, { body: 'ok', authorId: 'x' }]) {
      expect((await postUpdate('e1', bad)).status).toBe(400);
    }
  });

  it('lists the live updates for anyone who can see the event, and 404 for anyone who cannot', async () => {
    h.updates = [
      {
        id: 'u1',
        body: 'Doors at 18:45.',
        occurrenceAt: null,
        createdAt: new Date('2026-11-22T10:00:00Z'),
        authorId: HOST,
      },
    ];
    const ok = await call(routes.updates.GET, 'GET', '/api/v1/events/e1/updates', { id: 'e1' });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({
      data: [{ id: 'u1', body: 'Doors at 18:45.', occurrence: null, createdAt: '2026-11-22T10:00:00.000Z' }],
    });
    h.canView.mockResolvedValue(false);
    const no = await call(routes.updates.GET, 'GET', '/api/v1/events/e1/updates', { id: 'e1' });
    expect(no.status).toBe(404);
  });
});
