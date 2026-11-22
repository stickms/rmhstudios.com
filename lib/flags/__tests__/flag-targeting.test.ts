/**
 * Flag targeting (s04-20): evaluation order with allow and deny lists, lists that never reach a client, admin-only
 * endpoints, the edit rules at the API, and the erasure SQL. Prisma is a small stand-in; no database.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handlersOf } from '@/lib/__tests__/api-handlers-of';
import { evaluateFlag, explainFlag, type FlagRecord } from '../evaluate';

interface Row {
  key: string;
  enabled: boolean;
  rolloutPercent: number;
  description: string;
  allowUserIds: string[];
  denyUserIds: string[];
}

const h = vi.hoisted(() => ({
  session: null as {
    user: {
      id: string;
      isAdmin: boolean;
    };
  } | null,
  flags: [] as unknown[],
  users: [] as {
    id: string;
    handle: string;
    name: string;
  }[],
  audits: [] as {
    adminId: string;
    action: string;
    targetId?: string;
    detail?: string;
  }[],
  findManyArgs: [] as unknown[],
  auditFindMany: [] as unknown[],
}));
const rows = () => h.flags as Row[];

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: vi.fn(async () => h.session),
    },
  },
}));
vi.mock('@/lib/admin-audit.server', () => ({
  logAdminAction: vi.fn(
    async (
      adminId: string,
      action: string,
      opts: {
        targetId?: string;
        detail?: string;
      },
    ) => {
      h.audits.push({
        adminId,
        action,
        ...opts,
      });
    },
  ),
}));
vi.mock('@/lib/prisma.server', () => {
  const userRow = (u: { id: string; handle: string; name: string }) => ({
    id: u.id,
    handle: u.handle,
    name: u.name,
    image: null,
    username: null,
    isVerified: false,
    isAdmin: false,
    isBot: false,
    profile: null,
    inventory: [],
  });
  const featureFlag = {
    findMany: vi.fn(async (args: unknown) => {
      h.findManyArgs.push(args);
      return rows();
    }),
    findUnique: vi.fn(
      async ({
        where,
      }: {
        where: {
          key: string;
        };
      }) => rows().find((r) => r.key === where.key) ?? null,
    ),
    update: vi.fn(
      async ({
        where,
        data,
      }: {
        where: {
          key: string;
        };
        data: Record<
          string,
          {
            set: string[];
          }
        >;
      }) => {
        const row = rows().find((r) => r.key === where.key)!;
        row.allowUserIds = data.allowUserIds!.set;
        row.denyUserIds = data.denyUserIds!.set;
        return row;
      },
    ),
  };
  const prisma = {
    featureFlag,
    user: {
      findMany: vi.fn(
        async ({
          where,
        }: {
          where: {
            id?: {
              in: string[];
            };
            handle?: {
              in: string[];
            };
          };
        }) =>
          h.users
            .filter((u) => (where.id ? where.id.in.includes(u.id) : where.handle!.in.includes(u.handle)))
            .map(userRow),
      ),
      findUnique: vi.fn(
        async ({
          where,
        }: {
          where: {
            handle: string;
          };
        }) => {
          const u = h.users.find((x) => x.handle === where.handle);
          return u ? userRow(u) : null;
        },
      ),
    },
    adminAuditLog: {
      findMany: vi.fn(async (args: unknown) => {
        h.auditFindMany.push(args);
        return [];
      }),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) =>
      fn({
        featureFlag,
        $executeRaw: vi.fn(async () => 1),
      }),
    ),
  };
  return {
    prisma,
  };
});

const { isFeatureEnabled, evaluateAllFlags, invalidateFlags } = await import('../flags.server');
const flagsRoute = (await import('@/lib/flags/api/flags.server')).route;
const adminFlagsRoute = (await import('@/lib/admin/api/admin.flags.server')).route;
const targetingRoute = (await import('@/lib/admin/api/admin.flags.$key.targeting.server')).route;
const checkRoute = (await import('@/lib/admin/api/admin.flags.$key.check.server')).route;
const historyRoute = (await import('@/lib/admin/api/admin.flags.$key.history.server')).route;

const row = (over: Partial<Row> = {}): Row => ({
  key: 'beta',
  enabled: true,
  rolloutPercent: 0,
  description: '',
  allowUserIds: [],
  denyUserIds: [],
  ...over,
});

const call = (route: unknown, method: string, path: string, params: Record<string, string>, body?: unknown) =>
  handlersOf(route)[method]!({
    request: new Request(`http://localhost${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        'cf-connecting-ip': `${Math.random()}`,
        cookie: 'better-auth.session_token=abc',
      },
      ...(body === undefined
        ? {}
        : {
            body: JSON.stringify(body),
          }),
    }),
    params,
  });

beforeEach(() => {
  h.session = {
    user: {
      id: 'admin-1',
      isAdmin: true,
    },
  };
  h.flags = [];
  h.users = [
    {
      id: 'u-ann',
      handle: 'ann',
      name: 'Ann',
    },
    {
      id: 'u-bo',
      handle: 'bo',
      name: 'Bo',
    },
  ];
  h.audits = [];
  h.findManyArgs = [];
  h.auditFindMany = [];
  invalidateFlags();
});

describe('evaluation order', () => {
  const flag = (over: Partial<FlagRecord> = {}): FlagRecord => ({
    key: 'beta',
    enabled: true,
    rolloutPercent: 0,
    ...over,
  });
  const t = {
    allow: new Set(['yes']),
    deny: new Set(['no', 'both']),
  };
  t.allow.add('both');

  it('not enabled is off for everyone, the allow list included', () => {
    expect(
      evaluateFlag(
        flag({
          enabled: false,
        }),
        'yes',
        t,
      ),
    ).toBe(false);
    expect(
      evaluateFlag(
        flag({
          enabled: false,
          rolloutPercent: 100,
        }),
        'yes',
        t,
      ),
    ).toBe(false);
    expect(evaluateFlag(undefined, 'yes', t)).toBe(false);
  });
  it('denied is off, even at 100% and even when also allowed', () => {
    expect(
      evaluateFlag(
        flag({
          rolloutPercent: 100,
        }),
        'no',
        t,
      ),
    ).toBe(false);
    expect(
      evaluateFlag(
        flag({
          rolloutPercent: 100,
        }),
        'both',
        t,
      ),
    ).toBe(false);
  });
  it('allowed is on at 0%', () => {
    expect(evaluateFlag(flag(), 'yes', t)).toBe(true);
  });
  it('anonymous is on only at 100%, whatever the lists hold', () => {
    expect(
      evaluateFlag(
        flag({
          rolloutPercent: 99,
        }),
        null,
        t,
      ),
    ).toBe(false);
    expect(
      evaluateFlag(
        flag({
          rolloutPercent: 100,
        }),
        undefined,
        t,
      ),
    ).toBe(true);
  });
  it('everyone else follows the bucket, and a call without lists is unchanged', () => {
    expect(evaluateFlag(flag(), 'stranger', t)).toBe(false);
    expect(
      evaluateFlag(
        flag({
          rolloutPercent: 100,
        }),
        'stranger',
        t,
      ),
    ).toBe(true);
    const r = explainFlag(
      flag({
        rolloutPercent: 50,
      }),
      'stranger',
      t,
    );
    expect(
      evaluateFlag(
        flag({
          rolloutPercent: 50,
        }),
        'stranger',
      ),
    ).toBe(r.on);
  });
});

describe('the cache', () => {
  it('a flag at 0% with one member allowed is on for that member only', async () => {
    h.flags = [
      row({
        allowUserIds: ['u-ann'],
      }),
    ];
    expect(await isFeatureEnabled('beta', 'u-ann')).toBe(true);
    expect(await isFeatureEnabled('beta', 'u-bo')).toBe(false);
    expect(await isFeatureEnabled('beta', null)).toBe(false);
  });
  it('a disabled flag stays off for its allow list', async () => {
    h.flags = [
      row({
        enabled: false,
        allowUserIds: ['u-ann'],
      }),
    ];
    expect(await isFeatureEnabled('beta', 'u-ann')).toBe(false);
  });
  it('a denied member is off at 100%', async () => {
    h.flags = [
      row({
        rolloutPercent: 100,
        denyUserIds: ['u-bo'],
      }),
    ];
    expect(await isFeatureEnabled('beta', 'u-bo')).toBe(false);
    expect(await isFeatureEnabled('beta', 'u-ann')).toBe(true);
  });
  it('loads the lists in the same single query', async () => {
    h.flags = [row()];
    await isFeatureEnabled('beta');
    await isFeatureEnabled('beta', 'u-ann');
    expect(h.findManyArgs).toHaveLength(1);
    expect(h.findManyArgs[0]).toMatchObject({
      select: {
        allowUserIds: true,
        denyUserIds: true,
      },
    });
  });
});

describe('lists never reach a client', () => {
  it('evaluateAllFlags returns booleans only', async () => {
    h.flags = [
      row({
        allowUserIds: ['u-ann'],
        denyUserIds: ['u-bo'],
      }),
    ];
    const out = await evaluateAllFlags('u-ann');
    expect(out).toEqual({
      beta: true,
    });
    expect(JSON.stringify(out)).not.toMatch(/u-ann|u-bo|allow|deny/);
  });
  it('GET /api/flags carries no list field or member id', async () => {
    h.flags = [
      row({
        allowUserIds: ['u-ann'],
        denyUserIds: ['u-bo'],
      }),
    ];
    const res = await call(flagsRoute, 'GET', '/api/flags', {});
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({
      flags: {
        beta: false,
      },
    });
    expect(text).not.toMatch(/u-ann|u-bo|allow|deny/i);
  });
  it('the flag record a client may hold has no list fields', () => {
    const record: FlagRecord = {
      key: 'k',
      enabled: true,
      rolloutPercent: 1,
    };
    expect(Object.keys(record).sort()).toEqual(['enabled', 'key', 'rolloutPercent']);
  });
  it('the admin flag list does not select the lists', async () => {
    h.flags = [row()];
    await call(adminFlagsRoute, 'GET', '/api/admin/flags', {});
    expect(h.findManyArgs[0]).toMatchObject({
      select: {
        key: true,
        enabled: true,
      },
    });
    expect(
      (
        h.findManyArgs[0] as {
          select: object;
        }
      ).select,
    ).not.toHaveProperty('allowUserIds');
    expect(
      (
        h.findManyArgs[0] as {
          select: object;
        }
      ).select,
    ).not.toHaveProperty('denyUserIds');
  });
});

describe('admin only', () => {
  const endpoints: [unknown, string, string, unknown?][] = [
    [targetingRoute, 'GET', '/api/admin/flags/beta/targeting'],
    [
      targetingRoute,
      'PUT',
      '/api/admin/flags/beta/targeting',
      {
        list: 'allow',
        add: ['ann'],
        remove: [],
      },
    ],
    [checkRoute, 'GET', '/api/admin/flags/beta/check?handle=ann'],
    [historyRoute, 'GET', '/api/admin/flags/beta/history'],
  ];
  it.each(endpoints)('refuses a member on %#', async (route, method, path, body) => {
    h.session = {
      user: {
        id: 'u-ann',
        isAdmin: false,
      },
    };
    expect(
      (
        await call(
          route,
          method,
          path,
          {
            key: 'beta',
          },
          body,
        )
      ).status,
    ).toBe(403);
  });
  it.each(endpoints)('refuses a signed-out caller on %#', async (route, method, path, body) => {
    h.session = null;
    expect(
      (
        await call(
          route,
          method,
          path,
          {
            key: 'beta',
          },
          body,
        )
      ).status,
    ).toBe(401);
  });
});

describe('editing the lists', () => {
  const put = (body: unknown) =>
    call(
      targetingRoute,
      'PUT',
      '/api/admin/flags/beta/targeting',
      {
        key: 'beta',
      },
      body,
    );

  it('adds a handle, resolves it to an id, and logs the handle', async () => {
    h.flags = [row()];
    const res = await put({
      list: 'allow',
      add: ['@Ann'],
      remove: [],
    });
    expect(res.status).toBe(200);
    expect(rows()[0]!.allowUserIds).toEqual(['u-ann']);
    const body = (await res.json()) as {
      allow: {
        id: string;
        handle: string;
      }[];
      deny: unknown[];
    };
    expect(body.allow.map((m) => m.handle)).toEqual(['ann']);
    expect(h.audits).toEqual([
      {
        adminId: 'admin-1',
        action: 'flag.targeting',
        targetType: 'feature_flag',
        targetId: 'beta',
        detail: 'allow +@ann',
      },
    ]);
  });
  it('a member added to one list leaves the other', async () => {
    h.flags = [
      row({
        denyUserIds: ['u-ann'],
      }),
    ];
    await put({
      list: 'allow',
      add: ['ann'],
      remove: [],
    });
    expect(rows()[0]).toMatchObject({
      allowUserIds: ['u-ann'],
      denyUserIds: [],
    });
    expect(h.audits[0]!.detail).toBe('allow +@ann; deny -@ann');
  });
  it('removes by id', async () => {
    h.flags = [
      row({
        allowUserIds: ['u-ann', 'u-bo'],
      }),
    ];
    await put({
      list: 'allow',
      add: [],
      remove: ['u-ann'],
    });
    expect(rows()[0]!.allowUserIds).toEqual(['u-bo']);
    expect(h.audits[0]!.detail).toBe('allow -@ann');
  });
  it('refuses an unknown handle with 404 and writes nothing', async () => {
    h.flags = [row()];
    const res = await put({
      list: 'allow',
      add: ['ann', 'nobody'],
      remove: [],
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({
      code: 'unknown-handle',
      handles: ['nobody'],
    });
    expect(rows()[0]!.allowUserIds).toEqual([]);
    expect(h.audits).toEqual([]);
  });
  it('refuses a list over 200 with 409', async () => {
    h.flags = [
      row({
        allowUserIds: Array.from(
          {
            length: 200,
          },
          (_, i) => `x${i}`,
        ),
      }),
    ];
    const res = await put({
      list: 'allow',
      add: ['ann'],
      remove: [],
    });
    expect(res.status).toBe(409);
    expect(rows()[0]!.allowUserIds).toHaveLength(200);
  });
  it('rejects an empty edit and an oversize one at the schema', async () => {
    h.flags = [row()];
    expect(
      (
        await put({
          list: 'allow',
          add: [],
          remove: [],
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await put({
          list: 'allow',
          add: Array.from(
            {
              length: 11,
            },
            (_, i) => `h${i}`,
          ),
          remove: [],
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await put({
          list: 'nope',
          add: ['ann'],
          remove: [],
        })
      ).status,
    ).toBe(400);
  });
  it('404s a flag that does not exist', async () => {
    expect(
      (
        await put({
          list: 'allow',
          add: ['ann'],
          remove: [],
        })
      ).status,
    ).toBe(404);
  });
  it('is live in this process at once', async () => {
    h.flags = [row()];
    expect(await isFeatureEnabled('beta', 'u-ann')).toBe(false);
    await put({
      list: 'allow',
      add: ['ann'],
      remove: [],
    });
    expect(await isFeatureEnabled('beta', 'u-ann')).toBe(true);
  });
});

describe('check and history', () => {
  it('explains a flag for a handle', async () => {
    h.flags = [
      row({
        allowUserIds: ['u-ann'],
      }),
    ];
    const ok = await call(checkRoute, 'GET', '/api/admin/flags/beta/check?handle=ann', {
      key: 'beta',
    });
    expect(await ok.json()).toMatchObject({
      on: true,
      reason: {
        code: 'allowed',
      },
      member: {
        handle: 'ann',
      },
    });
    const off = await call(checkRoute, 'GET', '/api/admin/flags/beta/check?handle=bo', {
      key: 'beta',
    });
    expect(await off.json()).toMatchObject({
      on: false,
      reason: {
        code: 'bucket',
        percent: 0,
      },
    });
  });
  it('does not return the lists from the check', async () => {
    h.flags = [
      row({
        allowUserIds: ['u-ann'],
        denyUserIds: ['u-bo'],
      }),
    ];
    const res = await call(checkRoute, 'GET', '/api/admin/flags/beta/check?handle=ann', {
      key: 'beta',
    });
    const text = await res.text();
    expect(text).not.toMatch(/u-bo|allowUserIds|denyUserIds/);
  });
  it('404s an unknown handle and a missing flag, and 400s a missing handle', async () => {
    h.flags = [row()];
    expect(
      (
        await call(checkRoute, 'GET', '/api/admin/flags/beta/check?handle=zed', {
          key: 'beta',
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await call(checkRoute, 'GET', '/api/admin/flags/gone/check?handle=ann', {
          key: 'gone',
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await call(checkRoute, 'GET', '/api/admin/flags/beta/check', {
          key: 'beta',
        })
      ).status,
    ).toBe(400);
  });
  it("reads this flag's audit entries, newest first, 21 to know there is more", async () => {
    const res = await call(historyRoute, 'GET', '/api/admin/flags/beta/history', {
      key: 'beta',
    });
    expect(await res.json()).toEqual({
      items: [],
      nextCursor: null,
    });
    expect(h.auditFindMany[0]).toMatchObject({
      where: {
        targetType: 'feature_flag',
        targetId: 'beta',
      },
      orderBy: [
        {
          createdAt: 'desc',
        },
        {
          id: 'desc',
        },
      ],
      take: 21,
    });
  });
});

describe('erasure schema', () => {
  it('matches the schema: @@map and the two columns exist', async () => {
    const { readFileSync } = await import('node:fs');
    const schema = readFileSync('prisma/schema/developer.prisma', 'utf8');
    const model = schema.slice(schema.indexOf('model FeatureFlag'), schema.indexOf('@@map("feature_flag")'));
    expect(model).toMatch(/\ballowUserIds\s+String\[\]/);
    expect(model).toMatch(/\bdenyUserIds\s+String\[\]/);
  });
});
