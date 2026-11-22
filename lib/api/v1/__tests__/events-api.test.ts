/**
 * `/api/v1/events*` and `/api/v1/me/events`, driven through the real developer-API wrapper, the real
 * `canViewEvent` and the site's real expansion over an in-memory event store: scopes per route, a private
 * event and a private community's event invisible to a stranger, the guest list for the host and co-hosts
 * only, the RSVP going through the site's `rsvp` (waitlist when full, banned owners refused), an
 * idempotent replay, the 31-day window, cursor paging and skipped / moved dates.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handlersOf, type TestHandler } from '@/lib/__tests__/api-handlers-of';
import { EventError } from '@/lib/events/event-error';

type Row = Record<string, unknown> & {
  id: string;
};
const h = vi.hoisted(() => ({
  events: [] as Row[],
  rsvps: [] as Row[],
  cohosts: [] as Row[],
  overrides: [] as Row[],
  updates: [] as Row[],
  members: [] as {
    communityId: string;
    userId: string;
  }[],
  communities: [] as {
    id: string;
    isPrivate: boolean;
  }[],
  users: [] as Row[],
  key: {
    current: null as Record<string, unknown> | null,
  },
  ban: {
    current: null as unknown,
  },
  idem: new Map<
    string,
    {
      requestHash: string;
      responseBody: string;
      statusCode: number;
    }
  >(),
  rsvp: vi.fn(),
  unrsvp: vi.fn(),
}));

vi.mock('@/lib/events.server', async (orig) => ({
  ...(await orig<typeof import('@/lib/events.server')>()),
  rsvp: h.rsvp,
  unrsvp: h.unrsvp,
}));

vi.mock('@/lib/prisma.server', () => {
  const inList = (v: unknown, list: unknown) =>
    !list ||
    (
      list as {
        in?: unknown[];
      }
    ).in?.includes(v) !== false;
  return {
    prisma: {
      event: {
        findMany: vi.fn(async () => h.events),
        findFirst: vi.fn(
          async ({
            where,
          }: {
            where: {
              id: string;
            };
          }) => h.events.find((e) => e.id === where.id) ?? null,
        ),
      },
      rsvp: {
        findMany: vi.fn(
          async ({ where, select }: { where: Record<string, unknown>; select?: Record<string, unknown> }) => {
            let rows = h.rsvps;
            if (where.userId) {
              rows = rows.filter((r) => r.userId === where.userId && r.status !== 'waitlist');
              return rows.map((r) => ({
                ...r,
                event: h.events.find((e) => e.id === r.eventId),
              }));
            }
            const ids =
              (where.eventId as
                | {
                    in?: string[];
                  }
                | string
                | undefined) ?? undefined;
            rows = rows.filter((r) => (typeof ids === 'string' ? r.eventId === ids : inList(r.eventId, ids)));
            if (where.status)
              rows = rows.filter((r) =>
                (
                  where.status as {
                    in: string[];
                  }
                ).in.includes(r.status as string),
              );
            if (where.occurrenceAt instanceof Date)
              rows = rows.filter((r) => (r.occurrenceAt as Date).getTime() === (where.occurrenceAt as Date).getTime());
            void select;
            return rows;
          },
        ),
        count: vi.fn(
          async ({
            where,
          }: {
            where: {
              eventId: string;
              userId: string;
            };
          }) => h.rsvps.filter((r) => r.eventId === where.eventId && r.userId === where.userId).length,
        ),
      },
      eventCohost: {
        findMany: vi.fn(
          async ({
            where,
          }: {
            where: {
              eventId: {
                in: string[];
              };
            };
          }) =>
            h.cohosts
              .filter((c) => where.eventId.in.includes(c.eventId as string) && c.status === 'accepted')
              .map((c) => ({
                ...c,
                user: h.users.find((u) => u.id === c.userId),
              })),
        ),
        findUnique: vi.fn(
          async ({
            where,
          }: {
            where: {
              eventId_userId: {
                eventId: string;
                userId: string;
              };
            };
          }) =>
            h.cohosts.find(
              (c) => c.eventId === where.eventId_userId.eventId && c.userId === where.eventId_userId.userId,
            ) ?? null,
        ),
        count: vi.fn(
          async ({
            where,
          }: {
            where: {
              eventId: string;
              userId: string;
            };
          }) => h.cohosts.filter((c) => c.eventId === where.eventId && c.userId === where.userId).length,
        ),
      },
      availabilityPoll: {
        findUnique: vi.fn(async () => null),
      },
      community: {
        findUnique: vi.fn(
          async ({
            where,
          }: {
            where: {
              id: string;
            };
          }) => {
            const c = h.communities.find((x) => x.id === where.id);
            return (
              c && {
                ...c,
                members: undefined,
                __id: where.id,
              }
            );
          },
        ),
      },
      communityMember: {
        findFirst: vi.fn(async () => null),
      },
      eventOccurrenceOverride: {
        findMany: vi.fn(async () => h.overrides),
      },
      eventUpdate: {
        findMany: vi.fn(async () => h.updates),
      },
      user: {
        findMany: vi.fn(
          async ({
            where,
          }: {
            where: {
              id: {
                in: string[];
              };
            };
          }) => h.users.filter((u) => where.id.in.includes(u.id)),
        ),
      },
      developerApiKey: {
        findUnique: vi.fn(async () => h.key.current),
        update: vi.fn(async () => ({})),
      },
      apiKeyRefusalDaily: {
        upsert: vi.fn(async () => ({})),
      },
      apiIdempotencyKey: {
        findUnique: vi.fn(
          async ({
            where,
          }: {
            where: {
              keyId_idempotency: {
                idempotency: string;
              };
            };
          }) => h.idem.get(where.keyId_idempotency.idempotency) ?? null,
        ),
        create: vi.fn(
          async ({
            data,
          }: {
            data: {
              idempotency: string;
              requestHash: string;
              responseBody: string;
              statusCode: number;
            };
          }) => {
            h.idem.set(data.idempotency, data);
            return {};
          },
        ),
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
  getActiveBan: vi.fn(async () => h.ban.current),
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
const routes = {
  list: handlersOf<TestHandler>((await import('../../../../app/routes/api/v1/events')).Route),
  one: handlersOf<TestHandler>((await import('../../../../app/routes/api/v1/events/$id')).Route),
  attendees: handlersOf<TestHandler>((await import('../../../../app/routes/api/v1/events/$id/attendees')).Route),
  rsvp: handlersOf<TestHandler>((await import('../../../../app/routes/api/v1/events/$id/rsvp')).Route),
  mine: handlersOf<TestHandler>((await import('../../../../app/routes/api/v1/me/events')).Route),
};

const OWNER = 'owner_1';
const HOST = 'host_1';
const BEARER = `Bearer ${KEY_PREFIX}${'k'.repeat(24)}`;
const WHOLE = new Date(0);
const FROM = '2026-12-01T00:00:00Z';
const TO = '2026-12-29T00:00:00Z';

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
    hostId: HOST,
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
    host: person(HOST),
    community: null,
    ...over,
  };
}

function call(
  handler: TestHandler | undefined,
  method: string,
  path: string,
  params: Record<string, string> = {},
  body?: unknown,
  headers: Record<string, string> = {},
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
        ...headers,
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
const get = (h2: TestHandler | undefined, path: string, params: Record<string, string> = {}) =>
  call(h2, 'GET', path, params);

beforeEach(() => {
  h.events = [];
  h.rsvps = [];
  h.cohosts = [];
  h.overrides = [];
  h.updates = [];
  h.members = [];
  h.communities = [];
  h.users = [person(HOST), person(OWNER), person('g1'), person('g2'), person('g3'), person('co1')];
  h.key.current = keyFor(['read:events', 'write:events']);
  h.ban.current = null;
  h.idem.clear();
  h.rsvp.mockReset();
  h.unrsvp.mockReset();
});

describe('scopes', () => {
  it('every route refuses a key without its scope', async () => {
    h.events = [
      event({
        id: 'e1',
      }),
    ];
    h.key.current = keyFor(['read:study']);
    const calls = [
      get(routes.list.GET, '/api/v1/events'),
      get(routes.one.GET, '/api/v1/events/e1', {
        id: 'e1',
      }),
      get(routes.attendees.GET, '/api/v1/events/e1/attendees', {
        id: 'e1',
      }),
      get(routes.mine.GET, '/api/v1/me/events'),
      call(
        routes.rsvp.PUT,
        'PUT',
        '/api/v1/events/e1/rsvp',
        {
          id: 'e1',
        },
        {
          status: 'going',
        },
      ),
      call(routes.rsvp.DELETE, 'DELETE', '/api/v1/events/e1/rsvp', {
        id: 'e1',
      }),
    ];
    for (const r of await Promise.all(calls)) expect(r.status).toBe(403);
    expect(h.rsvp).not.toHaveBeenCalled();
    expect(h.unrsvp).not.toHaveBeenCalled();
  });

  it('read:events cannot write, write:events cannot read, wildcards satisfy both', async () => {
    h.key.current = keyFor(['read:events']);
    expect(
      (
        await call(
          routes.rsvp.PUT,
          'PUT',
          '/api/v1/events/e1/rsvp',
          {
            id: 'e1',
          },
          {
            status: 'going',
          },
        )
      ).status,
    ).toBe(403);
    h.key.current = keyFor(['write:events']);
    expect((await get(routes.list.GET, '/api/v1/events')).status).toBe(403);
    h.key.current = keyFor(['read:*']);
    expect((await get(routes.list.GET, '/api/v1/events')).status).toBe(200);
    h.key.current = keyFor(['*']);
    h.rsvp.mockResolvedValue({
      goingCount: 1,
      maybeCount: 0,
      viewerRsvp: 'going',
    });
    expect(
      (
        await call(
          routes.rsvp.PUT,
          'PUT',
          '/api/v1/events/e1/rsvp',
          {
            id: 'e1',
          },
          {
            status: 'going',
          },
        )
      ).status,
    ).toBe(200);
  });
});

describe('visibility is the site rule', () => {
  it('a private event is invisible to a non-guest and visible to a guest', async () => {
    h.events = [
      event({
        id: 'priv',
        visibility: 'PRIVATE',
      }),
      event({
        id: 'pub',
      }),
    ];
    const ids = async () =>
      (
        (await (await get(routes.list.GET, `/api/v1/events?from=${FROM}&to=${TO}`)).json()) as {
          data: {
            id: string;
          }[];
        }
      ).data.map((e) => e.id);
    expect(await ids()).toEqual(['pub']);
    expect(
      (
        await get(routes.one.GET, '/api/v1/events/priv', {
          id: 'priv',
        })
      ).status,
    ).toBe(404);
    h.rsvps = [
      {
        id: 'r',
        eventId: 'priv',
        userId: OWNER,
        status: 'going',
        occurrenceAt: WHOLE,
        everyTime: false,
      },
    ];
    expect((await ids()).sort()).toEqual(['priv', 'pub']);
    expect(
      (
        await get(routes.one.GET, '/api/v1/events/priv', {
          id: 'priv',
        })
      ).status,
    ).toBe(200);
  });

  it('a draft is never visible, even to its host', async () => {
    h.events = [
      event({
        id: 'd',
        visibility: 'DRAFT',
        hostId: OWNER,
      }),
    ];
    expect(
      (
        await get(routes.one.GET, '/api/v1/events/d', {
          id: 'd',
        })
      ).status,
    ).toBe(404);
  });

  it('a private community needs membership, as on the site', async () => {
    h.communities = [
      {
        id: 'c1',
        isPrivate: true,
      },
    ];
    h.events = [
      event({
        id: 'ce',
        communityId: 'c1',
        community: {
          id: 'c1',
          slug: 'c',
          name: 'C',
        },
      }),
    ];
    expect(
      (
        await get(routes.one.GET, '/api/v1/events/ce', {
          id: 'ce',
        })
      ).status,
    ).toBe(404);
    const { prisma } = await import('@/lib/prisma.server');
    vi.mocked(prisma.community.findUnique).mockResolvedValueOnce({
      id: 'c1',
      isPrivate: true,
      members: [
        {
          id: 'm',
        },
      ],
    } as never);
    expect(
      (
        await get(routes.one.GET, '/api/v1/events/ce', {
          id: 'ce',
        })
      ).status,
    ).toBe(200);
  });
});

describe('attendees', () => {
  beforeEach(() => {
    h.events = [
      event({
        id: 'e1',
      }),
    ];
    h.rsvps = [
      {
        id: 'a',
        eventId: 'e1',
        userId: 'g1',
        status: 'going',
        occurrenceAt: WHOLE,
        everyTime: false,
      },
      {
        id: 'b',
        eventId: 'e1',
        userId: 'g2',
        status: 'maybe',
        occurrenceAt: WHOLE,
        everyTime: false,
      },
      {
        id: 'c',
        eventId: 'e1',
        userId: 'g3',
        status: 'going',
        occurrenceAt: WHOLE,
        everyTime: false,
      },
    ];
  });

  it('a guest gets the counts from the event and a 403 from the guest list', async () => {
    const res = await get(routes.attendees.GET, '/api/v1/events/e1/attendees', {
      id: 'e1',
    });
    expect(res.status).toBe(403);
    const ev = (await (
      await get(routes.one.GET, '/api/v1/events/e1', {
        id: 'e1',
      })
    ).json()) as {
      counts: unknown;
    };
    expect(ev.counts).toEqual({
      going: 2,
      maybe: 1,
      waitlisted: 0,
    });
  });

  it('the host reads handle, name and status and nothing more', async () => {
    h.events = [
      event({
        id: 'e1',
        hostId: OWNER,
      }),
    ];
    const body = (await (
      await get(routes.attendees.GET, '/api/v1/events/e1/attendees', {
        id: 'e1',
      })
    ).json()) as {
      data: Record<string, unknown>[];
    };
    expect(body.data.map((a) => Object.keys(a).sort())).toEqual(Array(3).fill(['handle', 'id', 'name', 'status']));
    expect(body.data.map((a) => a.status)).toEqual(['going', 'maybe', 'going']);
  });

  it('an accepted co-host reads it, an invited one does not', async () => {
    h.cohosts = [
      {
        id: 'x',
        eventId: 'e1',
        userId: OWNER,
        status: 'invited',
      },
    ];
    expect(
      (
        await get(routes.attendees.GET, '/api/v1/events/e1/attendees', {
          id: 'e1',
        })
      ).status,
    ).toBe(403);
    h.cohosts = [
      {
        id: 'x',
        eventId: 'e1',
        userId: OWNER,
        status: 'accepted',
      },
    ];
    expect(
      (
        await get(routes.attendees.GET, '/api/v1/events/e1/attendees', {
          id: 'e1',
        })
      ).status,
    ).toBe(200);
  });

  it('pages by cursor without repeating or skipping a guest', async () => {
    h.events = [
      event({
        id: 'e1',
        hostId: OWNER,
      }),
    ];
    const first = (await (
      await get(routes.attendees.GET, '/api/v1/events/e1/attendees?limit=2', {
        id: 'e1',
      })
    ).json()) as {
      data: {
        id: string;
      }[];
      nextCursor: string;
    };
    expect(first.data).toHaveLength(2);
    const second = (await (
      await get(routes.attendees.GET, `/api/v1/events/e1/attendees?limit=2&cursor=${first.nextCursor}`, {
        id: 'e1',
      })
    ).json()) as {
      data: {
        id: string;
      }[];
      nextCursor: string | null;
    };
    expect([...first.data, ...second.data].map((a) => a.id)).toEqual(['g1', 'g2', 'g3']);
    expect(second.nextCursor).toBeNull();
  });
});

describe('window and paging', () => {
  it('refuses a window over 31 days, an inverted one and a malformed date', async () => {
    for (const q of [
      'from=2026-12-01&to=2027-01-05',
      'from=2026-12-10&to=2026-12-01',
      'from=yesterday',
      'to=2026-12-01T00:00:00',
    ]) {
      expect((await get(routes.list.GET, `/api/v1/events?${q}`)).status).toBe(400);
    }
    expect((await get(routes.list.GET, '/api/v1/events?from=2026-12-01&to=2027-01-01')).status).toBe(200);
    expect((await get(routes.mine.GET, '/api/v1/me/events?from=2026-12-01&to=2027-02-01')).status).toBe(400);
  });

  it('pages occurrences by cursor in start order', async () => {
    h.events = [1, 2, 3].map((n) =>
      event({
        id: `e${n}`,
        startsAt: new Date(`2026-12-0${n}T10:00:00Z`),
      }),
    );
    const a = (await (await get(routes.list.GET, `/api/v1/events?from=${FROM}&to=${TO}&limit=2`)).json()) as {
      data: {
        id: string;
      }[];
      nextCursor: string;
    };
    expect(a.data.map((e) => e.id)).toEqual(['e1', 'e2']);
    const b = (await (
      await get(routes.list.GET, `/api/v1/events?from=${FROM}&to=${TO}&limit=2&cursor=${a.nextCursor}`)
    ).json()) as {
      data: {
        id: string;
      }[];
      nextCursor: string | null;
    };
    expect(b.data.map((e) => e.id)).toEqual(['e3']);
    expect(b.nextCursor).toBeNull();
    expect((await get(routes.list.GET, '/api/v1/events?cursor=!!!')).status).toBe(400);
  });
});

describe('repeating events and overrides', () => {
  const weekly = () =>
    event({
      id: 'w',
      recurrence: 'W',
      recurTz: 'UTC',
      startsAt: new Date('2026-12-03T19:00:00Z'),
      endsAt: new Date('2026-12-03T21:00:00Z'),
    });
  const ov = (kind: string, at: string, extra: Record<string, unknown> = {}) => ({
    id: `o-${at}`,
    eventId: 'w',
    occurrenceAt: new Date(at),
    kind,
    startsAt: null,
    endsAt: null,
    note: null,
    updatedAt: new Date('2026-11-20T00:00:00Z'),
    ...extra,
  });

  it('lists the dates, with a moved one shown moved and a skipped one gone', async () => {
    h.events = [weekly()];
    h.overrides = [
      ov('move', '2026-12-10T19:00:00Z', {
        startsAt: new Date('2026-12-11T18:00:00Z'),
        endsAt: new Date('2026-12-11T20:00:00Z'),
        note: 'Friday this week',
      }),
      ov('skip', '2026-12-17T19:00:00Z'),
    ];
    const res = (await (await get(routes.list.GET, `/api/v1/events?from=${FROM}&to=${TO}`)).json()) as {
      data: {
        startsAt: string;
        occurrence: string;
        state: string;
        note: string | null;
        timeZone: string;
      }[];
    };
    expect(res.data.map((d) => [d.occurrence, d.startsAt, d.state])).toEqual([
      ['2026-12-03T19:00:00.000Z', '2026-12-03T19:00:00.000Z', 'normal'],
      ['2026-12-10T19:00:00.000Z', '2026-12-11T18:00:00.000Z', 'moved'],
      ['2026-12-24T19:00:00.000Z', '2026-12-24T19:00:00.000Z', 'normal'],
    ]);
    expect(res.data[1]?.note).toBe('Friday this week');
    expect(res.data[0]?.timeZone).toBe('UTC');
  });

  it('counts a date by the standing and per-date answers, and /me/events lists the answered dates', async () => {
    h.events = [weekly()];
    h.rsvps = [
      {
        id: '1',
        eventId: 'w',
        userId: OWNER,
        status: 'going',
        occurrenceAt: WHOLE,
        everyTime: true,
      },
      {
        id: '2',
        eventId: 'w',
        userId: 'g1',
        status: 'maybe',
        occurrenceAt: new Date('2026-12-10T19:00:00Z'),
        everyTime: false,
      },
      {
        id: '3',
        eventId: 'w',
        userId: OWNER,
        status: 'no',
        occurrenceAt: new Date('2026-12-10T19:00:00Z'),
        everyTime: false,
      },
    ];
    const res = (await (await get(routes.list.GET, `/api/v1/events?from=${FROM}&to=${TO}`)).json()) as {
      data: {
        occurrence: string;
        counts: {
          going: number;
          maybe: number;
        };
        yourRsvp: string | null;
      }[];
    };
    expect(res.data.map((d) => [d.counts.going, d.counts.maybe, d.yourRsvp])).toEqual([
      [1, 0, 'going'],
      [0, 1, null],
      [1, 0, 'going'],
      [1, 0, 'going'],
    ]);
    const mine = (await (await get(routes.mine.GET, `/api/v1/me/events?from=${FROM}&to=${TO}`)).json()) as {
      data: {
        occurrence: string;
      }[];
    };
    expect(mine.data.map((d) => d.occurrence)).toEqual([
      '2026-12-03T19:00:00.000Z',
      '2026-12-17T19:00:00.000Z',
      '2026-12-24T19:00:00.000Z',
    ]);
  });

  it('the event endpoint shows the next dates after overrides and the latest updates', async () => {
    h.events = [weekly()];
    h.overrides = [ov('skip', '2026-12-17T19:00:00Z')];
    h.updates = [
      {
        id: 'u1',
        body: 'Doors at 18:45',
        occurrenceAt: null,
        createdAt: new Date('2026-11-22T10:00:00Z'),
      },
    ];
    const res = (await (
      await get(routes.one.GET, '/api/v1/events/w', {
        id: 'w',
      })
    ).json()) as {
      nextOccurrences: {
        occurrence: string;
      }[];
      updates: {
        body: string;
      }[];
    };
    expect(res.nextOccurrences.length).toBeGreaterThan(2);
    expect(res.nextOccurrences.map((o) => o.occurrence)).not.toContain('2026-12-17T19:00:00.000Z');
    expect(res.updates.map((u) => u.body)).toEqual(['Doors at 18:45']);
  });
});

describe('RSVP through the site path', () => {
  const put = (body: unknown, headers: Record<string, string> = {}) =>
    call(
      routes.rsvp.PUT,
      'PUT',
      '/api/v1/events/e1/rsvp',
      {
        id: 'e1',
      },
      body,
      headers,
    );

  it('runs the site rsvp and returns the resulting state', async () => {
    h.rsvp.mockResolvedValue({
      goingCount: 5,
      maybeCount: 1,
      viewerRsvp: 'going',
      waitlistCount: 0,
      viewerWaitlistPosition: null,
    });
    const res = await put({
      status: 'going',
    });
    expect(res.status).toBe(200);
    expect(h.rsvp).toHaveBeenCalledWith('e1', OWNER, 'going', {
      everyTime: undefined,
      occurrenceAt: undefined,
    });
    expect(await res.json()).toMatchObject({
      eventId: 'e1',
      status: 'going',
      counts: {
        going: 5,
        maybe: 1,
        waitlisted: 0,
      },
    });
  });

  it('answers waitlisted when a one-off event is full', async () => {
    h.rsvp.mockRejectedValueOnce(new EventError('CAPACITY_FULL'));
    h.rsvp.mockResolvedValueOnce({
      goingCount: 10,
      maybeCount: 0,
      viewerRsvp: 'waitlist',
      waitlistCount: 2,
      viewerWaitlistPosition: 2,
    });
    const res = await put({
      status: 'going',
    });
    expect(h.rsvp).toHaveBeenLastCalledWith('e1', OWNER, 'waitlist', expect.anything());
    expect(await res.json()).toMatchObject({
      status: 'waitlisted',
      waitlistPosition: 2,
    });
  });

  it('a full repeating event is a 409 (no waitlist), and a closed one stays closed', async () => {
    h.rsvp.mockRejectedValueOnce(new EventError('CAPACITY_FULL'));
    h.rsvp.mockRejectedValueOnce(new EventError('FORBIDDEN'));
    expect(
      (
        await put({
          status: 'going',
        })
      ).status,
    ).toBe(409);
    h.rsvp.mockRejectedValueOnce(new EventError('CAPACITY_FULL'));
    h.rsvp.mockRejectedValueOnce(new EventError('WAITLIST_CLOSED'));
    expect(
      (
        await put({
          status: 'going',
        })
      ).status,
    ).toBe(409);
    h.rsvp.mockRejectedValueOnce(new EventError('NOT_FOUND'));
    expect(
      (
        await put({
          status: 'maybe',
        })
      ).status,
    ).toBe(404);
  });

  it("a member banned or timed out of the event's community is a 403 with the end (s07-10, BAN_ENFORCEMENT_PATHS)", async () => {
    h.rsvp.mockRejectedValueOnce(
      new EventError('COMMUNITY_SANCTIONED', {
        kind: 'timeout',
        endsAt: new Date('2026-12-01T14:30:00Z'),
      }),
    );
    const res = await put({
      status: 'going',
    });
    expect(res.status).toBe(403);
    const body = JSON.stringify(await res.json());
    expect(body).toContain('forbidden');
    expect(body).toContain('You are timed out of this community until 1 Dec 2026, 14:30 UTC.');
    // A refused RSVP is never retried as a waitlist request.
    expect(h.rsvp).toHaveBeenCalledTimes(1);
  });

  it('validates the body: status, occurrence, unknown fields', async () => {
    for (const body of [
      {
        status: 'waitlist',
      },
      {
        status: 'going',
        occurrence: 'soon',
      },
      {
        status: 'going',
        userId: 'x',
      },
      {},
    ]) {
      expect((await put(body)).status).toBe(400);
    }
    expect(h.rsvp).not.toHaveBeenCalled();
  });

  it('refuses a banned owner before anything is written', async () => {
    h.ban.current = {
      reason: 'x',
    };
    const res = await put({
      status: 'going',
    });
    expect(res.status).toBe(403);
    expect(h.rsvp).not.toHaveBeenCalled();
  });

  it('DELETE runs the site unrsvp with the date and scope', async () => {
    h.unrsvp.mockResolvedValue({
      goingCount: 4,
      maybeCount: 1,
      viewerRsvp: null,
      waitlistCount: 0,
    });
    const res = await call(
      routes.rsvp.DELETE,
      'DELETE',
      '/api/v1/events/e1/rsvp?occurrence=2026-12-10T19:00:00Z&everyTime=true',
      {
        id: 'e1',
      },
    );
    expect(h.unrsvp).toHaveBeenCalledWith('e1', OWNER, {
      scope: 'all',
      occurrenceAt: new Date('2026-12-10T19:00:00Z'),
    });
    expect(await res.json()).toMatchObject({
      status: 'none',
    });
  });

  it('an Idempotency-Key replay answers from the first response and does not RSVP twice', async () => {
    h.rsvp.mockResolvedValue({
      goingCount: 5,
      maybeCount: 0,
      viewerRsvp: 'going',
    });
    const first = await put(
      {
        status: 'going',
      },
      {
        'idempotency-key': 'k-1',
      },
    );
    const replay = await put(
      {
        status: 'going',
      },
      {
        'idempotency-key': 'k-1',
      },
    );
    expect(replay.headers.get('Idempotency-Replayed')).toBe('true');
    expect(await replay.text()).toBe(await first.text());
    expect(h.rsvp).toHaveBeenCalledTimes(1);
    const other = await put(
      {
        status: 'maybe',
      },
      {
        'idempotency-key': 'k-1',
      },
    );
    expect(other.status).toBe(409);
  });
});

describe('source scans', () => {
  const read = (p: string) => readFileSync(join(__dirname, '..', '..', '..', '..', p), 'utf8');

  it('the event readers apply overrides and are registered', async () => {
    const { OCCURRENCE_READ_PATHS } = await import('@/lib/events/occurrences');
    expect(OCCURRENCE_READ_PATHS).toContain('lib/api/v1/events.server.ts');
    expect(read('lib/api/v1/events.server.ts')).toMatch(/applyOverrides\(/);
  });

  it('takes no userId from the request and has no raw SQL', () => {
    const src = read('lib/api/v1/events.server.ts');
    expect(src).not.toMatch(/\$queryRaw|\$executeRaw/);
    for (const f of ['events', 'events/$id', 'events/$id/attendees', 'events/$id/rsvp', 'me/events']) {
      expect(read(`app/routes/api/v1/${f}.ts`)).toMatch(/scope:\s*'(read|write):events'/);
    }
  });
});
