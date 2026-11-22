/**
 * Search insights are a member's own data: the endpoint reads only the caller's applications and
 * events, answers 401 when signed out, and validates its query. Prisma is mocked; the handler is
 * driven directly.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handlersOf } from '@/lib/__tests__/api-handlers-of';

type Row = Record<string, unknown>;
const db = vi.hoisted(() => ({
  applications: [] as Row[],
  events: [] as Row[],
  prefs: [] as Row[],
  appWheres: [] as Row[],
  eventWheres: [] as Row[],
  prefWheres: [] as Row[],
}));
const getSession = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession,
    },
  },
}));
vi.mock('@/lib/rate-limit.server', async (orig) => ({
  ...(await orig<typeof import('@/lib/rate-limit.server')>()),
  checkRateLimit: vi.fn(async () => ({
    allowed: true,
  })),
}));
vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    ladderApplication: {
      findMany: vi.fn(
        async ({
          where,
        }: {
          where: {
            userId: string;
          };
        }) => {
          db.appWheres.push(where);
          return db.applications.filter((a) => a.userId === where.userId);
        },
      ),
    },
    ladderApplicationEvent: {
      findMany: vi.fn(
        async ({
          where,
        }: {
          where: {
            userId: string;
          };
        }) => {
          db.eventWheres.push(where);
          return db.events.filter((e) => e.userId === where.userId);
        },
      ),
    },
    ladderUserPrefs: {
      findUnique: vi.fn(
        async ({
          where,
        }: {
          where: {
            userId: string;
          };
        }) => {
          db.prefWheres.push(where);
          return db.prefs.find((p) => p.userId === where.userId) ?? null;
        },
      ),
    },
  },
}));
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: unknown) => ({
    options: config,
  }),
}));

import { route } from '@/lib/rmhladder/api/rmhladder.insights.server';

type H = (a: { request: Request; params: Record<string, string> }) => Promise<Response>;
const handlers = handlersOf<H>(route);
const headers = {
  cookie: 'better-auth.session_token=abc',
  'cf-connecting-ip': '1.2.3.4',
};
const get = (query = '') =>
  handlers.GET!({
    params: {},
    request: new Request(`https://x.test/api/rmhladder/insights${query}`, {
      headers,
    }),
  });
const signIn = (id: string) =>
  getSession.mockResolvedValue({
    user: {
      id,
    },
    session: {
      id: 's',
    },
  });

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);
const application = (userId: string, id: string, over: Row = {}): Row => ({
  id,
  userId,
  jobId: `job-${id}`,
  status: 'applied',
  appliedDate: daysAgo(40),
  createdAt: daysAgo(40),
  referralName: null,
  followUpDate: null,
  offer: null,
  job: {
    title: `Role ${id}`,
    programType: 'internship',
    sourcePlatform: 'greenhouse',
    company: {
      name: `Company ${id}`,
    },
  },
  ...over,
});

beforeEach(() => {
  db.appWheres = [];
  db.eventWheres = [];
  db.prefWheres = [];
  db.prefs = [
    {
      userId: 'u1',
      timezone: 'Not/AZone',
    },
  ];
  db.applications = [
    application('u1', 'mine-1'),
    application('u1', 'mine-2', {
      status: 'interviewing',
    }),
    application('u1', 'mine-3', {
      offer: {
        state: 'accepted',
      },
      status: 'offer',
    }),
    application('u2', 'theirs-1'),
    application('u2', 'theirs-2'),
  ];
  db.events = [
    {
      userId: 'u1',
      applicationId: 'mine-2',
      fromStatus: 'applied',
      toStatus: 'interviewing',
      createdAt: daysAgo(30),
    },
    {
      userId: 'u2',
      applicationId: 'theirs-1',
      fromStatus: 'applied',
      toStatus: 'offer',
      createdAt: daysAgo(30),
    },
  ];
  signIn('u1');
});

describe('GET /api/rmhladder/insights', () => {
  it('is a 401 when signed out and reads nothing', async () => {
    getSession.mockResolvedValue(null);
    expect((await get()).status).toBe(401);
    expect(db.appWheres).toHaveLength(0);
    expect(db.eventWheres).toHaveLength(0);
  });

  it("reads only the caller's applications, events and preferences", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(db.appWheres).toEqual([
      {
        userId: 'u1',
      },
    ]);
    expect(db.eventWheres).toHaveLength(1);
    expect(db.eventWheres[0]).toMatchObject({
      userId: 'u1',
      type: 'status_changed',
    });
    expect(db.prefWheres).toEqual([
      {
        userId: 'u1',
      },
    ]);
    const body = await res.json();
    // Three of u1's applications, none of u2's; u2's offer event never leaks into the funnel.
    expect(body.applications).toBe(3);
    expect(body.funnel.find((s: { id: string }) => s.id === 'offer').count).toBe(1);
    expect(JSON.stringify(body)).not.toContain('theirs');
    expect(body.outcomes).toMatchObject({
      offers: 1,
      accepted: 1,
    });
  });

  it('falls back to a valid time zone when the stored one is not', async () => {
    expect((await (await get()).json()).timeZone).toBe('America/New_York');
    db.prefs = [
      {
        userId: 'u1',
        timezone: 'Europe/Berlin',
      },
    ];
    expect((await (await get()).json()).timeZone).toBe('Europe/Berlin');
  });

  it('defaults to 90 days and 21 quiet days and applies the chosen ones', async () => {
    const body = await (await get()).json();
    expect(body).toMatchObject({
      range: '90d',
      quietDays: 21,
    });
    const chosen = await (await get('?range=1y&quietDays=30')).json();
    expect(chosen).toMatchObject({
      range: '1y',
      quietDays: 30,
    });
    expect(chosen.quiet.map((q: { applicationId: string }) => q.applicationId)).toEqual(['mine-1']);
  });

  it('bounds the event read by the range', async () => {
    await get('?range=all');
    await get('?range=90d');
    expect(db.eventWheres[0]).not.toHaveProperty('createdAt');
    expect(db.eventWheres[1]).toHaveProperty('createdAt.gte');
  });

  it.each(['?range=week', '?range=', '?quietDays=7', '?quietDays=21.5', '?quietDays=-1'])(
    'rejects the query %s with a 400',
    async (query) => {
      expect((await get(query)).status).toBe(400);
      expect(db.appWheres).toHaveLength(0);
    },
  );
});
