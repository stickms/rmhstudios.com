/**
 * s07-13 admin batch lookup, through the real endpoint wrapper with Prisma and the rate limiter
 * stood in for: non-admins are refused, 51 items are refused, repeats collapse, order is kept, one
 * audit row covers the batch and never holds an e-mail address, the GET refuses an e-mail address,
 * the batch is charged per item, resolution is five at a time, and the response is not cacheable.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Rec = Record<string, unknown>;

const h = vi.hoisted(() => ({
  session: null as {
    user: {
      id: string;
      isAdmin: boolean;
    };
  } | null,
  audits: [] as Rec[],
  charges: 0,
  chargeLimit: Infinity,
  inFlight: 0,
  maxInFlight: 0,
  userReads: [] as unknown[],
  failFor: [] as string[],
  people: {} as Record<string, Rec>,
}));

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: vi.fn(async () => h.session),
    },
  },
}));

vi.mock('@/lib/rate-limit.server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/rate-limit.server')>()),
  withRateLimitAsync: vi.fn(async () => null),
  checkRateLimit: vi.fn(async () => {
    h.charges++;
    return h.charges > h.chargeLimit
      ? {
          allowed: false,
          limit: 60,
          remaining: 0,
          reset: Date.now() + 1000,
          retryAfter: 7,
        }
      : {
          allowed: true,
          limit: 60,
          remaining: 1,
          reset: Date.now() + 1000,
          retryAfter: 0,
        };
  }),
}));

vi.mock('@/lib/prisma.server', () => {
  const none = async () => null;
  const user = async (a: { where: Rec }) => {
    h.userReads.push(a.where);
    h.inFlight++;
    h.maxInFlight = Math.max(h.maxInFlight, h.inFlight);
    await new Promise((r) => setTimeout(r, 5));
    h.inFlight--;
    if (h.failFor.some((f) => JSON.stringify(a.where).includes(f))) throw new Error('db down for bad@example.com');
    const key = String(a.where.email ?? a.where.handle ?? '').toLowerCase();
    return h.people[key] ?? null;
  };
  const model = () => ({
    findUnique: none,
    findFirst: none,
  });
  const prisma: Rec = {
    user: {
      findUnique: user,
      findFirst: user,
    },
    adminAuditLog: {
      create: vi.fn(async (a: { data: Rec }) => {
        h.audits.push(a.data);
        return a.data;
      }),
    },
  };
  for (const m of [
    'rMHark',
    'rMHarkComment',
    'community',
    'event',
    'tournament',
    'userBuild',
    'gameReplay',
    'contentReport',
    'moderatorNote',
    'outboxEvent',
    'gameJam',
    'libraryDocument',
    'newsArticle',
    'blogPost',
  ])
    prisma[m] = model();
  prisma.$transaction = async (fn: (tx: Rec) => Promise<unknown>) => fn(prisma);
  return {
    prisma,
  };
});

type Handlers = Record<string, (a: { request: Request; params: Record<string, string> }) => Promise<Response>>;

async function post(body: unknown) {
  const { route } = await import('@/lib/admin/api/admin.lookup.server');
  const res = await (route.handlers as Handlers).POST!({
    request: new Request('https://rmhstudios.com/api/admin/lookup', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: 'better-auth.session_token=abc',
      },
      body: JSON.stringify(body),
    }),
    params: {},
  });
  return {
    status: res.status,
    headers: res.headers,
    json: (await res.json().catch(() => null)) as {
      groups: Array<{
        input: string;
        outcome: string;
        inputKind: string;
        results: Array<{
          kind: string;
          id: string;
        }>;
      }>;
    } | null,
  };
}

async function get(q: string) {
  const { route } = await import('@/lib/admin/api/admin.lookup.server');
  const res = await (route.handlers as Handlers).GET!({
    request: new Request(`https://rmhstudios.com/api/admin/lookup?q=${encodeURIComponent(q)}`, {
      headers: {
        cookie: 'better-auth.session_token=abc',
      },
    }),
    params: {},
  });
  return {
    status: res.status,
    text: await res.text(),
  };
}

const asAdmin = () => {
  h.session = {
    user: {
      id: 'admin-1',
      isAdmin: true,
    },
  };
};

beforeEach(() => {
  h.session = null;
  h.audits.length = 0;
  h.charges = 0;
  h.chargeLimit = Infinity;
  h.inFlight = 0;
  h.maxInFlight = 0;
  h.userReads.length = 0;
  h.people = {
    'alice@example.com': {
      id: 'c000000000000000000000001',
      name: 'Alice',
      handle: 'alice',
      username: 'alice',
      createdAt: new Date(),
      bannedUntil: null,
      isBot: false,
      isAdmin: false,
    },
  };
});

describe('POST /api/admin/lookup', () => {
  it('refuses a non-admin and an anonymous caller', async () => {
    expect(
      (
        await post({
          items: ['alice'],
        })
      ).status,
    ).toBe(401);
    h.session = {
      user: {
        id: 'u-1',
        isAdmin: false,
      },
    };
    expect(
      (
        await post({
          items: ['alice'],
        })
      ).status,
    ).toBe(403);
    expect(h.audits).toHaveLength(0);
  });

  it('refuses 51 items, an empty batch and an over-long item', async () => {
    asAdmin();
    const many = Array.from(
      {
        length: 51,
      },
      (_, i) => `user${i}`,
    );
    expect(
      (
        await post({
          items: many,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await post({
          items: ['  ', ''],
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await post({
          items: ['x'.repeat(501)],
        })
      ).status,
    ).toBe(400);
    expect(h.audits).toHaveLength(0);
  });

  it('collapses duplicates, drops blanks and keeps the order', async () => {
    asAdmin();
    const r = await post({
      items: ['zed@example.com', ' alice@example.com ', '', 'zed@example.com', 'alice@example.com'],
    });
    expect(r.status).toBe(200);
    expect(r.json?.groups.map((g) => g.input)).toEqual(['zed@example.com', 'alice@example.com']);
    expect(r.json?.groups[0]?.outcome).toBe('not-found');
    expect(r.json?.groups[1]?.results[0]?.kind).toBe('user');
  });

  it('writes one audit row per batch that never holds an e-mail address', async () => {
    asAdmin();
    await post({
      items: ['alice@example.com', 'zed@example.com', 'c000000000000000000000009'],
    });
    expect(h.audits).toHaveLength(1);
    const row = h.audits[0]!;
    expect(row.action).toBe('admin.lookup.batch');
    expect(row.detail).toBe('items=3 kinds=email:2,id:1 matched=1');
    expect(JSON.stringify(row)).not.toMatch(/@|example/);
  });

  it('charges the 60-a-minute budget once per item and refuses when it runs out', async () => {
    asAdmin();
    await post({
      items: ['a@example.com', 'b@example.com', 'c@example.com'],
    });
    expect(h.charges).toBe(3);
    h.charges = 0;
    h.audits.length = 0;
    h.chargeLimit = 2;
    const r = await post({
      items: ['a@example.com', 'b@example.com', 'c@example.com'],
    });
    expect(r.status).toBe(429);
    expect(r.headers.get('retry-after')).toBe('7');
    expect(h.audits).toHaveLength(0);
  });

  it('resolves at most five items at once', async () => {
    asAdmin();
    const items = Array.from(
      {
        length: 30,
      },
      (_, i) => `person${i}@example.com`,
    );
    const r = await post({
      items,
    });
    expect(r.json?.groups).toHaveLength(30);
    expect(h.maxInFlight).toBeLessThanOrEqual(5);
    expect(h.maxInFlight).toBeGreaterThan(1);
  });

  it('isolates a failing item: the batch still answers and nothing is logged or audited with the address', async () => {
    asAdmin();
    h.failFor = ['bad@example.com'];
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const r = await post({
      items: ['ok@example.com', 'bad@example.com', 'other@example.com'],
    });
    h.failFor = [];
    expect(r.status).toBe(200);
    expect(r.json?.groups.map((g) => g.outcome)).toEqual(['not-found', 'error', 'not-found']);
    expect(JSON.stringify([log.mock.calls, h.audits])).not.toContain('bad@example.com');
    log.mockRestore();
  });

  it('is never cached', async () => {
    asAdmin();
    const r = await post({
      items: ['alice@example.com'],
    });
    expect(r.headers.get('cache-control')).toBe('no-store');
  });
});

describe('GET /api/admin/lookup (deprecated)', () => {
  it('refuses an e-mail address with 400 USE_POST and never looks it up', async () => {
    asAdmin();
    const r = await get('alice@example.com');
    expect(r.status).toBe(400);
    expect(r.text).toContain('USE_POST');
    expect(r.text).not.toContain('alice');
    expect(h.userReads).toHaveLength(0);
    expect(h.audits).toHaveLength(0);
  });

  it('still answers a handle', async () => {
    asAdmin();
    expect((await get('@alice')).status).toBe(200);
  });
});

describe('the page', () => {
  it('never writes an e-mail address to the address: only a single non-e-mail item sets ?q=', async () => {
    const { readFileSync } = await import('node:fs');
    const batch = readFileSync('components/admin/LookupBatch.tsx', 'utf8');
    // The one navigation that writes a query is guarded by the e-mail classification.
    expect(batch).toMatch(/classifyLookup\(\s*only,?\s*\)\.type\s*!==\s*'email'/);
    expect(batch.match(/q: only/g)).toHaveLength(1);
    const route = readFileSync('app/routes/_site/admin/lookup.tsx', 'utf8');
    expect(route).toMatch(/\.type\s*!==\s*'email'/);
    expect(route).toContain('replace: true');
    const field = readFileSync('components/admin/LookupField.tsx', 'utf8');
    expect(field).toContain('lookupItems');
    // No page code calls the GET endpoint any more.
    for (const src of [batch, route, field]) expect(src).not.toContain('adminLookupApi');
  });
});
