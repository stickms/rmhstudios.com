import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Moderation queue triage (s03-20): who may decide, that a decision touches only open reports and skips one decided
 * meanwhile, the caps, the bulk takedown refusal, the once-only reporter notification, and that the single-report
 * endpoint behaves as it did. Prisma is a small in-memory stand-in; nothing here touches a database.
 */

type Status = 'PENDING' | 'REVIEWING' | 'RESOLVED' | 'DISMISSED';
interface Row {
  id: string;
  reporterId: string;
  reason: string;
  details: string | null;
  entityType: string;
  entityId: string;
  targetUserId: string | null;
  status: Status;
  moderatorNote: string | null;
  resolvedById: string | null;
  resolvedAt: Date | null;
  withdrawnAt: Date | null;
  createdAt: Date;
}

const h = vi.hoisted(() => ({
  rows: [] as Row[],
  session: null as {
    user: {
      id: string;
      isAdmin: boolean;
    };
  } | null,
  beforeClaim: null as null | (() => void),
  notified: [] as string[][],
  audits: [] as {
    adminId: string;
    action: string;
    opts: Record<string, unknown>;
  }[],
  messages: [] as Record<string, unknown>[],
  takedowns: [] as Record<string, unknown>[],
  takedownFails: false,
  groupByArgs: [] as Record<string, unknown>[],
}));

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: vi.fn(async () => h.session),
    },
  },
}));

type Where = {
  id?:
    | string
    | {
        in: string[];
      };
  status?:
    | string
    | {
        in: string[];
      };
  entityType?: string;
  entityId?: string;
  reason?: {
    in: string[];
  };
  OR?: {
    entityType: string;
    entityId: string;
  }[];
};
const matches = (r: Row, w: Where) => {
  if (w.id !== undefined && (typeof w.id === 'string' ? r.id !== w.id : !w.id.in.includes(r.id))) return false;
  if (
    w.status !== undefined &&
    (typeof w.status === 'string' ? r.status !== w.status : !w.status.in.includes(r.status))
  )
    return false;
  if (w.entityType !== undefined && r.entityType !== w.entityType) return false;
  if (w.entityId !== undefined && r.entityId !== w.entityId) return false;
  if (w.reason && !w.reason.in.includes(r.reason)) return false;
  if (w.OR && !w.OR.some((o) => o.entityType === r.entityType && o.entityId === r.entityId)) return false;
  return true;
};

vi.mock('@/lib/prisma.server', () => {
  const contentReport = {
    findMany: vi.fn(async (args: { where: Where; take?: number }) =>
      h.rows
        .filter((r) => matches(r, args.where))
        .slice(0, args.take)
        .map((r) => ({
          ...r,
          reporter: {
            id: r.reporterId,
            name: 'Reporter',
            image: null,
            username: null,
          },
        })),
    ),
    updateMany: vi.fn(async (args: { where: Where; data: Partial<Row> }) => {
      // A real PrismaPromise runs when the transaction does: another moderator can win in between.
      const race = h.beforeClaim;
      h.beforeClaim = null;
      race?.();
      const hit = h.rows.filter((r) => matches(r, args.where));
      for (const r of hit) Object.assign(r, args.data);
      return {
        count: hit.length,
      };
    }),
    // The queue's group queries: answered from the same rows, by the grouping keys asked for.
    groupBy: vi.fn(async (args: { by: string[]; where: Where; having?: unknown; _count?: unknown }) => {
      h.groupByArgs.push(args as unknown as Record<string, unknown>);
      const live = h.rows.filter((r) => matches(r, args.where ?? {}));
      const keyOf = (r: Row) => args.by.map((k) => String(r[k as keyof Row])).join('|');
      const buckets = new Map<string, Row[]>();
      for (const r of live) buckets.set(keyOf(r), [...(buckets.get(keyOf(r)) ?? []), r]);
      const min =
        (
          args.having as
            | {
                id?: {
                  _count: {
                    gte: number;
                  };
                };
              }
            | undefined
        )?.id?._count.gte ?? 0;
      return [...buckets.values()]
        .filter((rs) => rs.length >= min)
        .map((rs) => ({
          ...Object.fromEntries(args.by.map((k) => [k, rs[0]![k as keyof Row]])),
          _count: {
            id: rs.length,
            _all: rs.length,
          },
          _min: {
            createdAt: new Date(Math.min(...rs.map((r) => r.createdAt.getTime()))),
          },
          _max: {
            createdAt: new Date(Math.max(...rs.map((r) => r.createdAt.getTime()))),
          },
        }));
    }),
  };
  return {
    prisma: {
      contentReport,
      // s03-04: the queue reads the reported members' moderator-note counts.
      moderatorNote: {
        groupBy: vi.fn(async () => []),
      },
      $transaction: vi.fn(async (ops: Promise<unknown>[] | unknown) => {
        if (!Array.isArray(ops)) return ops;
        return Promise.all(ops);
      }),
      rMHark: {
        updateMany: vi.fn(async (args: Record<string, unknown>) => {
          if (h.takedownFails) throw new Error('db down');
          h.takedowns.push(args);
          return {
            count: 1,
          };
        }),
        findMany: vi.fn(async () => [
          {
            id: 'p1',
            content: 'buy   my\nthing now',
          },
        ]),
      },
      rMHarkComment: {
        updateMany: vi.fn(async () => ({
          count: 1,
        })),
        findMany: vi.fn(async () => []),
      },
      user: {
        findMany: vi.fn(async () => []),
      },
    },
  };
});
vi.mock('@/lib/admin-audit.server', () => ({
  logAdminAction: vi.fn(async (adminId: string, action: string, opts: Record<string, unknown>) => {
    h.audits.push({
      adminId,
      action,
      opts,
    });
  }),
}));
vi.mock('@/lib/notifications.server', () => ({
  createNotification: vi.fn(async (input: Record<string, unknown>) => {
    h.messages.push(input);
  }),
}));
vi.mock('@/lib/moderation/my-reports.server', () => ({
  notifyReportersOfOutcome: vi.fn(async (ids: string[]) => {
    h.notified.push([...ids]);
    return ids.length;
  }),
}));
vi.mock('@/lib/profile/stamps.server', () => ({
  takedownStamp: vi.fn(),
}));
vi.mock('@/lib/profile/webrings.server', () => ({
  takedownRing: vi.fn(),
}));
vi.mock('@/lib/rmhmusic/learn/moderation.server', () => ({
  hideMusicContent: vi.fn(),
}));

import { route as decideRoute } from '@/lib/admin/api/admin.reports.groups.decide.server';
import { route as groupsRoute } from '@/lib/admin/api/admin.reports.groups.server';
import { route as singleRoute } from '@/lib/admin/api/admin.reports.$id.server';
import { listReportGroups } from '@/lib/moderation/triage.server';
import { parseTriageFilters } from '@/lib/moderation/triage';

const ADMIN = {
  user: {
    id: 'mod1',
    isAdmin: true,
  },
};
const MEMBER = {
  user: {
    id: 'u1',
    isAdmin: false,
  },
};

const call = (
  route: {
    handlers: Record<string, unknown>;
  },
  method: 'GET' | 'POST',
  url: string,
  body?: unknown,
  params = {},
) => {
  const handler = route.handlers[method] as (a: {
    request: Request;
    params: Record<string, string>;
  }) => Promise<Response>;
  return handler({
    request: new Request(`https://rmhstudios.com${url}`, {
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
};
const decide = (body: unknown) => call(decideRoute, 'POST', '/api/admin/reports/groups/decide', body);

let seq = 0;
function report(over: Partial<Row> = {}): Row {
  seq += 1;
  return {
    id: `r${seq}`,
    reporterId: `reporter${seq}`,
    reason: 'SPAM',
    details: null,
    entityType: 'rmhark',
    entityId: 'p1',
    targetUserId: 'author',
    status: 'PENDING',
    moderatorNote: null,
    resolvedById: null,
    resolvedAt: null,
    withdrawnAt: null,
    createdAt: new Date(Date.UTC(2026, 10, 1, 0, seq)),
    ...over,
  };
}
const fill = (n: number, over: Partial<Row> = {}) =>
  Array.from(
    {
      length: n,
    },
    () => report(over),
  );
const target = (entityId = 'p1', entityType = 'rmhark') => ({
  entityType,
  entityId,
});

beforeEach(() => {
  seq = 0;
  h.rows = [];
  h.session = ADMIN;
  h.beforeClaim = null;
  h.notified = [];
  h.audits = [];
  h.messages = [];
  h.takedowns = [];
  h.takedownFails = false;
  h.groupByArgs = [];
});

describe('who may use the queue', () => {
  it('refuses a signed-in non-admin on every endpoint and changes nothing', async () => {
    h.session = MEMBER;
    h.rows = fill(2);
    expect((await call(groupsRoute, 'GET', '/api/admin/reports/groups')).status).toBe(403);
    expect(
      (
        await decide({
          targets: [target()],
          action: 'resolve',
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await call(
          singleRoute,
          'POST',
          '/api/admin/reports/r1',
          {
            action: 'resolve',
          },
          {
            id: 'r1',
          },
        )
      ).status,
    ).toBe(403);
    expect(h.rows.every((r) => r.status === 'PENDING')).toBe(true);
    expect(h.notified).toEqual([]);
  });

  it('answers 401 to a signed-out caller', async () => {
    h.session = null;
    expect(
      (
        await decide({
          targets: [target()],
          action: 'dismiss',
        })
      ).status,
    ).toBe(401);
  });
});

describe('deciding a group', () => {
  it('decides all forty reports on a post, notifies every reporter once and audits once', async () => {
    h.rows = fill(40);
    const res = await decide({
      targets: [target()],
      action: 'resolve',
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: true,
      decided: 40,
      skipped: 0,
      takedownFailed: 0,
    });
    expect(h.rows.every((r) => r.status === 'RESOLVED' && r.resolvedById === 'mod1' && r.resolvedAt)).toBe(true);
    expect(h.notified).toHaveLength(1);
    expect(new Set(h.notified[0]).size).toBe(40);
    expect(h.audits).toHaveLength(1);
    expect(h.audits[0]).toMatchObject({
      action: 'report.resolve',
      opts: {
        targetType: 'rmhark',
        targetId: 'p1',
        detail: '40 reports',
      },
    });
  });

  it('decides only open reports: a decided one and another target stay as they were', async () => {
    h.rows = [
      ...fill(3),
      report({
        status: 'DISMISSED',
      }),
      report({
        entityId: 'p2',
      }),
    ];
    const res = await decide({
      targets: [target()],
      action: 'dismiss',
    });
    expect(await res.json()).toMatchObject({
      decided: 3,
      skipped: 0,
    });
    expect(h.rows.map((r) => r.status)).toEqual(['DISMISSED', 'DISMISSED', 'DISMISSED', 'DISMISSED', 'PENDING']);
    expect(h.notified[0]).toHaveLength(3);
  });

  it('skips a report another moderator decided between the read and the claim', async () => {
    h.rows = fill(3);
    h.beforeClaim = () => {
      h.rows[1]!.status = 'RESOLVED';
    };
    const res = await decide({
      targets: [target()],
      action: 'dismiss',
    });
    expect(await res.json()).toMatchObject({
      decided: 2,
      skipped: 1,
    });
    expect(h.rows[1]!.status).toBe('RESOLVED');
    expect(h.rows[1]!.resolvedById).toBeNull();
    expect(h.notified[0]).toEqual(['r1', 'r3']);
  });

  it('writes one audit row per group when several are decided together', async () => {
    h.rows = [
      ...fill(2),
      ...fill(1, {
        entityId: 'p2',
      }),
    ];
    await decide({
      targets: [target('p1'), target('p2')],
      action: 'dismiss',
    });
    expect(h.audits.map((a) => [a.opts.targetId, a.opts.detail])).toEqual([
      ['p1', '2 reports'],
      ['p2', undefined],
    ]);
  });

  it('decides nothing and notifies no one when the group has no open reports', async () => {
    h.rows = fill(2, {
      status: 'RESOLVED',
    });
    const res = await decide({
      targets: [target()],
      action: 'resolve',
    });
    expect(await res.json()).toEqual({
      success: true,
      decided: 0,
      skipped: 0,
      takedownFailed: 0,
    });
    expect(h.notified).toEqual([]);
  });

  it('messages the reported author once per group, not once per report', async () => {
    h.rows = fill(4);
    await decide({
      targets: [target()],
      action: 'resolve',
      message: 'Please read the rules.',
    });
    expect(h.messages).toHaveLength(1);
    expect(h.messages[0]).toMatchObject({
      userId: 'author',
      preview: expect.objectContaining({ key: 'report-decision', params: { message: 'Please read the rules.' } }),
    });
  });
});

describe('caps and bulk takedown', () => {
  it('refuses more than 50 groups', async () => {
    const targets = Array.from(
      {
        length: 51,
      },
      (_, i) => target(`p${i}`),
    );
    expect(
      (
        await decide({
          targets,
          action: 'dismiss',
        })
      ).status,
    ).toBe(400);
  });

  it('refuses more than 1,000 reports and decides none of them', async () => {
    h.rows = fill(1001);
    const res = await decide({
      targets: [target()],
      action: 'dismiss',
    });
    expect(res.status).toBe(400);
    expect(h.rows.every((r) => r.status === 'PENDING')).toBe(true);
    expect(h.notified).toEqual([]);
  });

  it('accepts exactly 1,000 reports', async () => {
    h.rows = fill(1000);
    expect(
      (
        await decide({
          targets: [target()],
          action: 'dismiss',
        })
      ).status,
    ).toBe(200);
    expect(h.notified[0]).toHaveLength(1000);
  });

  it('refuses a takedown in bulk, and an author message with it', async () => {
    h.rows = [
      ...fill(2),
      ...fill(2, {
        entityId: 'p2',
      }),
    ];
    const both = [target('p1'), target('p2')];
    expect(
      (
        await decide({
          targets: both,
          action: 'resolve',
          deleteContent: true,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await decide({
          targets: both,
          action: 'resolve',
          message: 'hi',
        })
      ).status,
    ).toBe(400);
    expect(h.takedowns).toEqual([]);
    expect(h.rows.every((r) => r.status === 'PENDING')).toBe(true);
  });

  it('takes the content down once for a single group and resolves its reports', async () => {
    h.rows = fill(3);
    const res = await decide({
      targets: [target()],
      action: 'resolve',
      deleteContent: true,
    });
    expect(await res.json()).toMatchObject({
      decided: 3,
    });
    // One takedown is two writes to the post (hide it, stamp it as moderator-removed), however many reports.
    expect(h.takedowns).toHaveLength(2);
    expect(h.audits[0]?.opts.detail).toBe('3 reports, content removed');
  });

  it('leaves the reports open when the takedown fails', async () => {
    h.rows = fill(3);
    h.takedownFails = true;
    const res = await decide({
      targets: [target()],
      action: 'resolve',
      deleteContent: true,
    });
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('db down');
    expect(h.rows.every((r) => r.status === 'PENDING')).toBe(true);
    expect(h.notified).toEqual([]);
  });
});

describe('the single-report endpoint is unchanged', () => {
  const act = (id: string, body: unknown) =>
    call(singleRoute, 'POST', `/api/admin/reports/${id}`, body, {
      id,
    });

  it('resolves one report, notifies its reporter and writes the per-report audit row', async () => {
    h.rows = fill(2);
    const res = await act('r1', {
      action: 'resolve',
      deleteContent: true,
    });
    expect(await res.json()).toEqual({
      success: true,
      status: 'RESOLVED',
    });
    expect(h.rows.map((r) => r.status)).toEqual(['RESOLVED', 'PENDING']);
    expect(h.notified).toEqual([['r1']]);
    expect(h.audits[0]).toMatchObject({
      action: 'report.resolve',
      opts: {
        detail: 'content removed',
      },
    });
  });

  it('marks a report reviewing without a resolver or a notification', async () => {
    h.rows = fill(1);
    expect(
      await (
        await act('r1', {
          action: 'review',
        })
      ).json(),
    ).toEqual({
      success: true,
      status: 'REVIEWING',
    });
    expect(h.rows[0]).toMatchObject({
      resolvedById: null,
      resolvedAt: null,
    });
    expect(h.notified).toEqual([]);
  });

  it('answers 404 for an unknown report and 409 for one that is already decided', async () => {
    h.rows = fill(1, {
      status: 'DISMISSED',
    });
    expect(
      (
        await act('nope', {
          action: 'resolve',
        })
      ).status,
    ).toBe(404);
    const res = await act('r1', {
      action: 'resolve',
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: 'Report is already dismissed',
    });
  });

  it('answers 409 when another moderator wins the race', async () => {
    h.rows = fill(1);
    h.beforeClaim = () => {
      h.rows[0]!.status = 'RESOLVED';
    };
    const res = await act('r1', {
      action: 'dismiss',
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: 'Report was updated by someone else',
    });
  });

  it('answers 500 and leaves the report open when the takedown fails', async () => {
    h.rows = fill(1);
    h.takedownFails = true;
    expect(
      (
        await act('r1', {
          action: 'resolve',
          deleteContent: true,
        })
      ).status,
    ).toBe(500);
    expect(h.rows[0]!.status).toBe('PENDING');
  });
});

describe('the grouped list', () => {
  it('groups in SQL by target with the filters, the minimum and the ordering', async () => {
    h.rows = [
      ...fill(3),
      ...fill(1, {
        entityId: 'p2',
        reason: 'HATE',
      }),
    ];
    const page = await listReportGroups(
      parseTriageFilters({
        reasons: 'SPAM,NOPE',
        min: '2',
        sort: 'most',
        entityType: 'rmhark',
      }),
    );
    const [, paged] = h.groupByArgs;
    expect(paged).toMatchObject({
      by: ['entityType', 'entityId'],
      where: {
        status: 'PENDING',
        entityType: 'rmhark',
        reason: {
          in: ['SPAM'],
        },
      },
      having: {
        id: {
          _count: {
            gte: 2,
          },
        },
      },
      take: 26,
      skip: 0,
    });
    expect(page.groups).toHaveLength(1);
    expect(page.groups[0]).toMatchObject({
      entityId: 'p1',
      count: 3,
      preview: 'buy my thing now',
    });
    expect(page.nextCursor).toBeNull();
  });
});
