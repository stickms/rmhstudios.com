/**
 * s08-08 developer API oversight, through the real endpoint wrapper with Prisma stood in for by a
 * small in-memory key table: admins only; the list reads aggregates for the page's own key ids;
 * suspend needs a reason and audits inside the transaction; lifting restores; a cap is audited;
 * nothing secret is ever in a row.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface Key {
  id: string;
  userId: string;
  name: string;
  prefix: string;
  lastFour: string | null;
  hashedKey: string;
  scopes: string[];
  testMode: boolean;
  allowedCidrs: string[];
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  suspendedAt: Date | null;
  suspendReason: string | null;
  rateLimitPerMinute: number | null;
  adminRateLimitPerMinute: number | null;
}

const h = vi.hoisted(() => ({
  session: null as {
    user: {
      id: string;
      isAdmin: boolean;
    };
  } | null,
  keys: [] as Key[],
  audits: [] as {
    adminId: string;
    action: string;
    opts: Record<string, unknown>;
  }[],
  notices: [] as Record<string, unknown>[],
  failAudit: false,
  usageGroupBy: [] as Array<Record<string, unknown>>,
  calls: [] as Array<{
    model: string;
    op: string;
    args: Record<string, unknown>;
  }>,
}));

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: vi.fn(async () => h.session),
    },
  },
}));
vi.mock('@/lib/admin-audit.server', () => ({
  recordAdminActionIn: vi.fn(async (_tx: unknown, adminId: string, action: string, opts: Record<string, unknown>) => {
    if (h.failAudit) throw new Error('audit down');
    h.audits.push({
      adminId,
      action,
      opts,
    });
  }),
}));
vi.mock('@/lib/notifications.server', () => ({
  createNotification: vi.fn(async (n: Record<string, unknown>) => {
    h.notices.push(n);
  }),
}));

function record(model: string, op: string, args: Record<string, unknown>) {
  h.calls.push({
    model,
    op,
    args,
  });
}

vi.mock('@/lib/prisma.server', () => {
  const developerApiKey = {
    findUnique: vi.fn(
      async (a: {
        where: {
          id: string;
        };
      }) => h.keys.find((k) => k.id === a.where.id) ?? null,
    ),
    findMany: vi.fn(
      async (a: {
        where: {
          id?: {
            in: string[];
          };
        };
      }) => {
        record('developerApiKey', 'findMany', a);
        // The page's "no usage in the window" read: every key in this table has usage.
        if (JSON.stringify(a.where).includes('"usage"')) return [];
        const ids = a.where.id?.in;
        return h.keys
          .filter((k) => !ids || ids.includes(k.id))
          .map((k) => ({
            ...k,
            user: {
              id: k.userId,
              handle: `h-${k.userId}`,
              name: 'N',
            },
          }));
      },
    ),
    updateMany: vi.fn(
      async (a: {
        where: {
          id: string;
          revokedAt?: null;
          suspendedAt?: null | {
            not: null;
          };
        };
        data: Partial<Key>;
      }) => {
        const k = h.keys.find((x) => x.id === a.where.id);
        if (!k)
          return {
            count: 0,
          };
        if (a.where.revokedAt === null && k.revokedAt)
          return {
            count: 0,
          };
        if (a.where.suspendedAt === null && k.suspendedAt)
          return {
            count: 0,
          };
        if (a.where.suspendedAt && typeof a.where.suspendedAt === 'object' && !k.suspendedAt)
          return {
            count: 0,
          };
        Object.assign(k, a.data);
        return {
          count: 1,
        };
      },
    ),
    update: vi.fn(
      async (a: {
        where: {
          id: string;
        };
        data: Partial<Key>;
      }) => {
        Object.assign(
          h.keys.find((x) => x.id === a.where.id)!,
          a.data,
        );
        return {};
      },
    ),
  };
  const prisma = {
    developerApiKey,
    apiUsageDaily: {
      groupBy: vi.fn(async (a: Record<string, unknown>) => {
        record('apiUsageDaily', 'groupBy', a);
        return h.usageGroupBy;
      }),
    },
    apiKeyRefusalDaily: {
      groupBy: vi.fn(async (a: Record<string, unknown>) => {
        record('apiKeyRefusalDaily', 'groupBy', a);
        return [];
      }),
    },
    webhookEndpoint: {
      groupBy: vi.fn(async (a: Record<string, unknown>) => {
        record('webhookEndpoint', 'groupBy', a);
        return [];
      }),
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      const snapshot = h.keys.map((k) => ({
        ...k,
      }));
      const audits = h.audits.length;
      try {
        return await fn(prisma);
      } catch (e) {
        h.keys = snapshot;
        h.audits.length = audits;
        throw e;
      }
    },
  };
  return {
    prisma,
  };
});

const key = (over: Partial<Key> = {}): Key => ({
  id: 'k1',
  userId: 'u1',
  name: 'My bot',
  prefix: 'rmh_live_abcde',
  lastFour: 'wxyz',
  hashedKey: 'HASH',
  scopes: ['read:profile'],
  testMode: false,
  allowedCidrs: ['203.0.113.0/24'],
  createdAt: new Date('2026-11-01T00:00:00Z'),
  lastUsedAt: null,
  expiresAt: null,
  revokedAt: null,
  suspendedAt: null,
  suspendReason: null,
  rateLimitPerMinute: null,
  adminRateLimitPerMinute: null,
  ...over,
});

type Json = Record<string, unknown>;
type Handler = (a: { request: Request; params: Record<string, string> }) => Promise<Response>;

async function call(
  method: 'GET' | 'PATCH',
  params: Record<string, string>,
  opts: {
    query?: string;
    body?: unknown;
  } = {},
) {
  const mod =
    method === 'GET'
      ? await import('@/lib/admin/api/admin.api-keys.server')
      : await import('@/lib/admin/api/admin.api-keys.$id.server');
  const handlers = mod.route.handlers as Record<string, Handler>;
  const res = await handlers[method]!({
    request: new Request(`https://rmhstudios.com/api/admin/api-keys${opts.query ?? ''}`, {
      method,
      headers: {
        'content-type': 'application/json',
        'cf-connecting-ip': `${Math.random()}`,
        cookie: 'better-auth.session_token=abc',
      },
      ...(opts.body === undefined
        ? {}
        : {
            body: JSON.stringify(opts.body),
          }),
    }),
    params,
  });
  return {
    status: res.status,
    json: (await res.json().catch(() => null)) as Json | null,
  };
}

const admin = () => {
  h.session = {
    user: {
      id: 'admin-1',
      isAdmin: true,
    },
  };
};

beforeEach(() => {
  h.session = null;
  h.keys = [key()];
  h.audits = [];
  h.notices = [];
  h.failAudit = false;
  h.usageGroupBy = [];
  h.calls = [];
});

describe('admin only', () => {
  it('refuses a signed-out caller and a member on both endpoints', async () => {
    expect((await call('GET', {})).status).toBe(401);
    h.session = {
      user: {
        id: 'u9',
        isAdmin: false,
      },
    };
    expect((await call('GET', {})).status).toBe(403);
    const patch = await call(
      'PATCH',
      {
        id: 'k1',
      },
      {
        body: {
          suspend: {
            reason: 'scraping every profile',
          },
        },
      },
    );
    expect(patch.status).toBe(403);
    expect(h.keys[0]!.suspendedAt).toBeNull();
    expect(h.audits).toEqual([]);
  });
});

describe('list', () => {
  it('reads usage, refusals and webhooks for the page ids only, never a key hash or range', async () => {
    admin();
    h.usageGroupBy = [
      {
        keyId: 'k1',
        _sum: {
          units: 10,
        },
      },
    ];
    const out = await call('GET', {});
    expect(out.status).toBe(200);
    const body = JSON.stringify(out.json);
    expect(body).not.toContain('HASH');
    expect(body).not.toContain('203.0.113');
    expect(out.json).toMatchObject({
      keys: [
        {
          id: 'k1',
          allowedCidrCount: 1,
          status: 'active',
          owner: {
            handle: 'h-u1',
          },
        },
      ],
    });
    const perPage = h.calls.filter((c) => ['apiKeyRefusalDaily', 'webhookEndpoint'].includes(c.model));
    expect(perPage).toHaveLength(2);
    for (const c of h.calls.filter((x) => x.model === 'apiKeyRefusalDaily')) {
      expect(JSON.stringify(c.args)).toContain('"keyId":{"in":["k1"]}');
    }
  });

  it('rejects an e-mail in the owner filter and a malformed cursor', async () => {
    admin();
    expect(
      (
        await call(
          'GET',
          {},
          {
            query: '?owner=a%40b.co',
          },
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await call(
          'GET',
          {},
          {
            query: '?cursor=zzz',
          },
        )
      ).status,
    ).toBe(400);
  });
});

describe('suspend, lift and cap', () => {
  it('requires a reason of 10 to 500 characters', async () => {
    admin();
    for (const reason of ['', 'too short', 'x'.repeat(501)]) {
      expect(
        (
          await call(
            'PATCH',
            {
              id: 'k1',
            },
            {
              body: {
                suspend: {
                  reason,
                },
              },
            },
          )
        ).status,
      ).toBe(400);
    }
    expect(
      (
        await call(
          'PATCH',
          {
            id: 'k1',
          },
          {
            body: {},
          },
        )
      ).status,
    ).toBe(400);
    expect(h.keys[0]!.suspendedAt).toBeNull();
  });

  it('refuses the reserved deletion-hold reason, trimmed and in any case', async () => {
    admin();
    for (const reason of ['Account deletion requested', '  account DELETION requested  ']) {
      expect((await call('PATCH', { id: 'k1' }, { body: { suspend: { reason } } })).status).toBe(400);
    }
    expect(h.keys[0]!.suspendedAt).toBeNull();
  });

  it('suspends, audits in the transaction, and tells the owner once', async () => {
    admin();
    const out = await call(
      'PATCH',
      {
        id: 'k1',
      },
      {
        body: {
          suspend: {
            reason: 'scraping every profile',
          },
        },
      },
    );
    expect(out.status).toBe(200);
    expect(h.keys[0]).toMatchObject({
      suspendReason: 'scraping every profile',
    });
    expect(h.keys[0]!.suspendedAt).toBeInstanceOf(Date);
    expect(h.audits).toEqual([
      expect.objectContaining({
        adminId: 'admin-1',
        action: 'api_key.suspend',
      }),
    ]);
    expect(h.notices).toEqual([
      expect.objectContaining({
        userId: 'u1',
        type: 'SYSTEM',
        entityType: 'api-key-suspended',
        entityId: 'k1',
      }),
    ]);
    const again = await call(
      'PATCH',
      {
        id: 'k1',
      },
      {
        body: {
          suspend: {
            reason: 'scraping every profile',
          },
        },
      },
    );
    expect(again.status).toBe(409);
    expect(h.notices).toHaveLength(1);
    expect(h.audits).toHaveLength(1);
  });

  it('rolls the change back when the audit write fails, and sends no notice', async () => {
    admin();
    h.failAudit = true;
    await expect(
      call(
        'PATCH',
        {
          id: 'k1',
        },
        {
          body: {
            suspend: {
              reason: 'scraping every profile',
            },
          },
        },
      ),
    ).resolves.toMatchObject({
      status: 500,
    });
    expect(h.keys[0]!.suspendedAt).toBeNull();
    expect(h.notices).toEqual([]);
  });

  it('lifts a suspension without touching the key, audits it and sends the restored notice', async () => {
    admin();
    h.keys = [
      key({
        suspendedAt: new Date(),
        suspendReason: 'scraping every profile',
      }),
    ];
    const out = await call(
      'PATCH',
      {
        id: 'k1',
      },
      {
        body: {
          suspend: null,
        },
      },
    );
    expect(out.status).toBe(200);
    expect(h.keys[0]).toMatchObject({
      suspendedAt: null,
      suspendReason: null,
      hashedKey: 'HASH',
    });
    expect(h.audits[0]).toMatchObject({
      action: 'api_key.lift_suspension',
    });
    expect(h.notices[0]).toMatchObject({
      entityType: 'api-key-restored',
    });
    expect(
      (
        await call(
          'PATCH',
          {
            id: 'k1',
          },
          {
            body: {
              suspend: null,
            },
          },
        )
      ).status,
    ).toBe(409);
  });

  it('sets and removes the admin cap with an audit row and no notice', async () => {
    admin();
    expect(
      (
        await call(
          'PATCH',
          {
            id: 'k1',
          },
          {
            body: {
              adminRateLimitPerMinute: 30,
            },
          },
        )
      ).status,
    ).toBe(200);
    expect(h.keys[0]!.adminRateLimitPerMinute).toBe(30);
    expect(h.audits[0]).toMatchObject({
      action: 'api_key.set_cap',
    });
    expect(h.notices).toEqual([]);
    expect(
      (
        await call(
          'PATCH',
          {
            id: 'k1',
          },
          {
            body: {
              adminRateLimitPerMinute: null,
            },
          },
        )
      ).status,
    ).toBe(200);
    expect(h.keys[0]!.adminRateLimitPerMinute).toBeNull();
    for (const bad of [0, 601, 1.5]) {
      expect(
        (
          await call(
            'PATCH',
            {
              id: 'k1',
            },
            {
              body: {
                adminRateLimitPerMinute: bad,
              },
            },
          )
        ).status,
      ).toBe(400);
    }
  });

  it('answers 404 for a revoked or unknown key', async () => {
    admin();
    h.keys = [
      key({
        revokedAt: new Date(),
      }),
    ];
    expect(
      (
        await call(
          'PATCH',
          {
            id: 'k1',
          },
          {
            body: {
              suspend: {
                reason: 'scraping every profile',
              },
            },
          },
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await call(
          'PATCH',
          {
            id: 'nope',
          },
          {
            body: {
              adminRateLimitPerMinute: 5,
            },
          },
        )
      ).status,
    ).toBe(404);
  });
});
