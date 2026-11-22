/**
 * s08-09 recurring community threads. The endpoints are driven through their registered handlers and the cron
 * through `runDueRecurringThreads`, with a faked Prisma (stateful for templates) and faked gates.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown> & {
  id: string;
  communityId: string;
  createdById: string;
  nextAt: Date;
  active: boolean;
};

const h = vi.hoisted(() => ({
  userId: 'mod-a' as string,
  roles: new Map<string, string>(),
  threads: [] as Array<Record<string, unknown>>,
  calls: [] as string[],
  logged: [] as Array<Record<string, unknown>>,
  notified: [] as Array<Record<string, unknown>>,
  drafts: [] as Array<Record<string, unknown>>,
  published: [] as string[],
  seq: 0,
  gate: {
    kind: 'ok',
  } as {
    kind: 'ok' | 'refuse' | 'hold' | 'flag';
  },
  publishResult: 'post-1' as string | null,
  sanctioned: new Set<string>(),
  accountBanned: new Set<string>(),
  badFlairs: new Set<string>(['bad']),
}));

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: vi.fn(async () => ({
        user: {
          id: h.userId,
        },
        session: {
          id: 's1',
          userId: h.userId,
        },
      })),
    },
  },
}));

vi.mock('@/lib/prisma.server', () => {
  const rows = () => h.threads as unknown as Row[];
  const eq = (a: unknown, b: unknown) =>
    a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : a === b;
  const matches = (r: Row, where: Record<string, unknown>) =>
    Object.entries(where).every(([k, v]) => {
      const cur = (r as Record<string, unknown>)[k];
      if (v && typeof v === 'object' && !(v instanceof Date)) {
        const o = v as {
          lte?: Date;
          not?: unknown;
        };
        if (o.lte) return (cur as Date).getTime() <= o.lte.getTime();
        if ('not' in o) return cur !== o.not;
        return true;
      }
      return eq(cur, v);
    });
  const withAuthor = (r: Row) => ({
    ...r,
    createdBy: {
      id: r.createdById,
      name: r.createdById,
      handle: r.createdById,
    },
  });
  const prisma: Record<string, unknown> = {
    community: {
      findUnique: async ({
        where,
      }: {
        where: {
          slug?: string;
          id?: string;
        };
      }) => {
        const slug = where.slug ?? (where.id === 'cA' ? 'a' : null);
        if (slug !== 'a') return null;
        const role = h.roles.get(`cA:${h.userId}`);
        return {
          id: 'cA',
          slug: 'a',
          name: 'Art',
          isPrivate: false,
          members: role
            ? [
                {
                  role,
                },
              ]
            : [],
        };
      },
    },
    communityMember: {
      findUnique: async ({
        where,
      }: {
        where: {
          communityId_userId: {
            communityId: string;
            userId: string;
          };
        };
      }) => {
        const role = h.roles.get(`${where.communityId_userId.communityId}:${where.communityId_userId.userId}`);
        return role
          ? {
              role,
            }
          : null;
      },
      findMany: async () =>
        [...h.roles]
          .filter(([k, r]) => k.startsWith('cA:') && (r === 'MOD' || r === 'ADMIN'))
          .map(([k]) => ({
            userId: k.slice(3),
          })),
    },
    user: {
      findUnique: async ({
        where,
      }: {
        where: {
          id: string;
        };
      }) => ({
        bannedUntil: h.accountBanned.has(where.id) ? new Date('2027-01-01T00:00:00Z') : null,
      }),
    },
    scheduledPost: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        h.calls.push('scheduledPost.create');
        const row = {
          id: `sp${++h.seq}`,
          publishedId: null,
          ...data,
        };
        h.drafts.push(row);
        return row;
      },
      deleteMany: async ({
        where,
      }: {
        where: {
          id: string;
        };
      }) => {
        h.calls.push('scheduledPost.deleteMany');
        const before = h.drafts.length;
        h.drafts = h.drafts.filter((d) => d.id !== where.id);
        return {
          count: before - h.drafts.length,
        };
      },
    },
    communityPostFlair: {
      upsert: async () => ({}),
    },
    communityRecurringThread: {
      findMany: async ({ where }: { where: Record<string, unknown> }) =>
        rows()
          .filter((r) => matches(r, where))
          .map(withAuthor),
      findFirst: async ({ where }: { where: Record<string, unknown> }) => rows().find((r) => matches(r, where)) ?? null,
      count: async ({ where }: { where: Record<string, unknown> }) => rows().filter((r) => matches(r, where)).length,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        h.calls.push('thread.create');
        const row = {
          id: `t${++h.seq}`,
          active: true,
          pausedReason: null,
          lastPostId: null,
          lastPostedAt: null,
          failures: 0,
          flairId: null,
          weekday: null,
          dayOfMonth: null,
          ...data,
        } as unknown as Row;
        h.threads.push(row);
        return withAuthor(row);
      },
      update: async ({
        where,
        data,
      }: {
        where: {
          id: string;
        };
        data: Record<string, unknown>;
      }) => {
        const r = rows().find((x) => x.id === where.id)!;
        Object.assign(r, data);
        return withAuthor(r);
      },
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const hit = rows().filter((r) => matches(r, where));
        for (const r of hit) {
          for (const [k, v] of Object.entries(data)) {
            if (v && typeof v === 'object' && 'increment' in (v as object)) {
              (r as Record<string, unknown>)[k] =
                Number(r[k] ?? 0) +
                (
                  v as {
                    increment: number;
                  }
                ).increment;
            } else (r as Record<string, unknown>)[k] = v;
          }
        }
        return {
          count: hit.length,
        };
      },
      delete: async ({
        where,
      }: {
        where: {
          id: string;
        };
      }) => {
        h.threads = h.threads.filter((r) => r.id !== where.id);
        return {};
      },
    },
  };
  prisma.$transaction = async (fn: (tx: unknown) => unknown) => fn(prisma);
  return {
    prisma,
  };
});
vi.mock('@/lib/db/advisory-lock.server', () => ({
  lockKey: async (_tx: unknown, key: string) => {
    h.calls.push(`lock:${key}`);
  },
}));
vi.mock('@/lib/communities/modlog.server', () => ({
  logModAction: async (_tx: unknown, input: Record<string, unknown>) => {
    h.logged.push(input);
    return 1n;
  },
}));
vi.mock('@/lib/communities/bans.server', () => ({
  activeSanction: async (_c: string, userId: string) =>
    h.sanctioned.has(userId)
      ? {
          kind: 'ban',
          endsAt: null,
        }
      : null,
}));
vi.mock('@/lib/communities/flairs.server', () => ({
  flairBelongsTo: async (_c: string, id: string) => !h.badFlairs.has(id),
}));
vi.mock('@/lib/communities/post-gate.server', () => ({
  prepareCommunityPost: async (args: Record<string, unknown>) => {
    h.calls.push(`gate:${String(args.content)}`);
    if (h.gate.kind === 'refuse')
      return {
        ok: false,
        refusal: {
          status: 403,
          code: null,
          body: {
            error: 'no',
          },
        },
      };
    return {
      ok: true,
      held: h.gate.kind === 'hold',
      holdRule: 'AutoMod',
      flagRule: h.gate.kind === 'flag' ? 'rule' : null,
    };
  },
}));
vi.mock('@/lib/scheduled/publish.server', () => ({
  publishScheduledPost: async (sp: { id: string }) => {
    h.calls.push('publish');
    h.published.push(sp.id);
    return h.publishResult;
  },
}));
vi.mock('@/lib/notifications.server', () => ({
  createNotification: async (input: Record<string, unknown>) => {
    h.notified.push(input);
  },
}));

const { route: listRoute } = await import('@/lib/communities/api/communities.$slug.recurring.server');
const { route: itemRoute } = await import('@/lib/communities/api/communities.$slug.recurring.$id.server');
const { runDueRecurringThreads } = await import('@/lib/communities/recurring-jobs.server');

type Handler = (a: { request: Request; params: Record<string, string> }) => Promise<Response> | Response;
const call = (
  r: {
    handlers: Record<string, Handler | undefined>;
  },
  method: string,
  params: Record<string, string>,
  body?: unknown,
) =>
  r.handlers[method]!({
    request: new Request('https://rmhstudios.com/api/x', {
      method,
      headers: {
        cookie: 'better-auth.session_token=t',
        'x-forwarded-for': `203.0.113.${(h.seq % 200) + 1}`,
        'content-type': 'application/json',
      },
      ...(body === undefined
        ? {}
        : {
            body: JSON.stringify(body),
          }),
    }),
    params,
  });

const form = (over: Record<string, unknown> = {}) => ({
  title: 'Weekly showcase',
  body: 'Share what you made',
  cadence: 'weekly',
  weekday: 1,
  time: '09:00',
  timeZone: 'Europe/London',
  ...over,
});

const NOW = new Date('2026-11-23T10:00:00Z');
const seedThread = (over: Record<string, unknown> = {}): Row => {
  const row = {
    id: `t${++h.seq}`,
    communityId: 'cA',
    createdById: 'mod-a',
    title: 'Weekly showcase',
    body: 'Share what you made',
    flairId: null,
    cadence: 'weekly',
    weekday: 1,
    dayOfMonth: null,
    minuteOfDay: 540,
    timeZone: 'Europe/London',
    nextAt: new Date('2026-11-23T09:00:00Z'),
    active: true,
    pausedReason: null,
    lastPostId: null,
    lastPostedAt: null,
    failures: 0,
    ...over,
  } as Row;
  h.threads.push(row);
  return row;
};

beforeEach(() => {
  h.userId = 'mod-a';
  h.roles = new Map([
    ['cA:mod-a', 'MOD'],
    ['cA:mod-b', 'MOD'],
    ['cA:owner', 'ADMIN'],
    ['cA:member-1', 'MEMBER'],
  ]);
  h.threads = [];
  h.calls.length = 0;
  h.logged.length = 0;
  h.notified.length = 0;
  h.drafts = [];
  h.published.length = 0;
  h.seq = 0;
  h.gate = {
    kind: 'ok',
  };
  h.publishResult = 'post-1';
  h.sanctioned.clear();
  h.accountBanned.clear();
});

describe('moderators only', () => {
  it('a member and a stranger get 403 on every endpoint and nothing is written', async () => {
    const t = seedThread();
    for (const who of ['member-1', 'stranger']) {
      h.userId = who;
      const results = await Promise.all([
        call(listRoute, 'GET', {
          slug: 'a',
        }),
        call(
          listRoute,
          'POST',
          {
            slug: 'a',
          },
          form(),
        ),
        call(
          itemRoute,
          'PATCH',
          {
            slug: 'a',
            id: t.id,
          },
          {
            active: false,
          },
        ),
        call(itemRoute, 'DELETE', {
          slug: 'a',
          id: t.id,
        }),
        call(itemRoute, 'POST', {
          slug: 'a',
          id: t.id,
        }),
      ]);
      expect(results.map((r) => r.status)).toEqual([403, 403, 403, 403, 403]);
    }
    expect(h.threads).toHaveLength(1);
    expect(t.active).toBe(true);
    expect(h.drafts).toHaveLength(0);
  });

  it('a moderator lists the templates and the cap', async () => {
    seedThread();
    const res = await call(listRoute, 'GET', {
      slug: 'a',
    });
    const json = (await res.json()) as {
      threads: unknown[];
      maxActive: number;
    };
    expect(json.threads).toHaveLength(1);
    expect(json.maxActive).toBe(5);
  });
});

describe('text only', () => {
  it.each([
    ['imageUrls', ['https://x/y.png']],
    ['gifUrl', 'https://x/y.gif'],
    [
      'poll',
      {
        question: 'q',
        options: ['a', 'b'],
      },
    ],
  ])('refuses the media field %s', async (field, value) => {
    const res = await call(
      listRoute,
      'POST',
      {
        slug: 'a',
      },
      form({
        [field]: value,
      }),
    );
    expect(res.status).toBe(400);
    expect(h.threads).toHaveLength(0);
  });

  it('refuses an unknown zone, a missing weekday and text too long for one post', async () => {
    expect(
      (
        await call(
          listRoute,
          'POST',
          {
            slug: 'a',
          },
          form({
            timeZone: 'Mars/Base',
          }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await call(
          listRoute,
          'POST',
          {
            slug: 'a',
          },
          form({
            weekday: null,
          }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await call(
          listRoute,
          'POST',
          {
            slug: 'a',
          },
          form({
            body: 'x'.repeat(290),
          }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await call(
          listRoute,
          'POST',
          {
            slug: 'a',
          },
          form({
            flairId: 'bad',
          }),
        )
      ).status,
    ).toBe(400);
    expect(h.threads).toHaveLength(0);
  });
});

describe('the cap of five active templates', () => {
  it('takes the community lock before it counts and refuses a sixth', async () => {
    for (let i = 0; i < 5; i++) seedThread();
    h.calls.length = 0;
    const res = await call(
      listRoute,
      'POST',
      {
        slug: 'a',
      },
      form(),
    );
    expect(res.status).toBe(409);
    expect(
      (
        (await res.json()) as {
          code: string;
        }
      ).code,
    ).toBe('recurring_cap');
    expect(h.calls[0]).toBe('lock:recurring:cA');
    expect(h.calls).not.toContain('thread.create');
    expect(h.threads).toHaveLength(5);
  });

  it('a paused template does not count, and resuming into a full community is refused', async () => {
    for (let i = 0; i < 4; i++) seedThread();
    const paused = seedThread({
      active: false,
      pausedReason: 'manual',
    });
    const ok = await call(
      listRoute,
      'POST',
      {
        slug: 'a',
      },
      form(),
    );
    expect(ok.status).toBe(201);
    const resume = await call(
      itemRoute,
      'PATCH',
      {
        slug: 'a',
        id: paused.id,
      },
      {
        active: true,
      },
    );
    expect(resume.status).toBe(409);
    expect(paused.active).toBe(false);
  });
});

describe('editing and the mod log', () => {
  it('logs created, updated, paused and deleted, and saving makes the editor the author', async () => {
    const created = (await (
      await call(
        listRoute,
        'POST',
        {
          slug: 'a',
        },
        form(),
      )
    ).json()) as {
      thread: {
        id: string;
      };
    };
    const id = created.thread.id;
    h.userId = 'mod-b';
    const edited = await call(
      itemRoute,
      'PATCH',
      {
        slug: 'a',
        id,
      },
      form({
        title: 'Monthly thread',
      }),
    );
    expect(edited.status).toBe(200);
    expect(h.threads[0]!.createdById).toBe('mod-b');
    await call(
      itemRoute,
      'PATCH',
      {
        slug: 'a',
        id,
      },
      {
        active: false,
      },
    );
    expect(h.threads[0]!.active).toBe(false);
    await call(itemRoute, 'DELETE', {
      slug: 'a',
      id,
    });
    expect(h.threads).toHaveLength(0);
    expect(h.logged.map((l) => l.action)).toEqual([
      'recurring_created',
      'recurring_updated',
      'recurring_paused',
      'recurring_deleted',
    ]);
    expect(h.logged.every((l) => l.targetType === 'recurring' && l.targetId === id)).toBe(true);
  });

  it('a full edit resumes a paused template as the editor and resets its failures', async () => {
    const t = seedThread({
      active: false,
      pausedReason: 'author_not_moderator',
      failures: 2,
      createdById: 'ghost',
    });
    h.userId = 'mod-b';
    const res = await call(
      itemRoute,
      'PATCH',
      {
        slug: 'a',
        id: t.id,
      },
      form(),
    );
    expect(res.status).toBe(200);
    expect(t).toMatchObject({
      active: true,
      pausedReason: null,
      failures: 0,
      createdById: 'mod-b',
    });
  });
});

describe('the cron', () => {
  it('two runners post an occurrence once: the claim moves nextAt first', async () => {
    const t = seedThread();
    const [a, b] = await Promise.all([runDueRecurringThreads(NOW), runDueRecurringThreads(NOW)]);
    expect(a + b).toBe(1);
    expect(h.published).toHaveLength(1);
    expect((t.nextAt as Date).getTime()).toBeGreaterThan(NOW.getTime());
    expect(t.lastPostId).toBe('post-1');
  });

  it('a worker that was down for weeks posts once on recovery, never once per missed occurrence', async () => {
    const t = seedThread({
      nextAt: new Date('2026-10-05T09:00:00Z'),
    });
    expect(await runDueRecurringThreads(NOW)).toBe(1);
    expect(await runDueRecurringThreads(NOW)).toBe(0);
    expect(h.published).toHaveLength(1);
    // The Monday after 23 November 2026, 09:00 in London (GMT).
    expect((t.nextAt as Date).toISOString()).toBe('2026-11-30T09:00:00.000Z');
  });

  it('does not post a template that is not due yet or is paused', async () => {
    seedThread({
      nextAt: new Date('2026-11-30T09:00:00Z'),
    });
    seedThread({
      active: false,
    });
    expect(await runDueRecurringThreads(NOW)).toBe(0);
    expect(h.drafts).toHaveLength(0);
  });

  it('runs prepareCommunityPost before it creates anything, with the title and body', async () => {
    seedThread();
    await runDueRecurringThreads(NOW);
    expect(h.calls).toEqual(['gate:Weekly showcase\n\nShare what you made', 'scheduledPost.create', 'publish']);
    expect(h.drafts[0]).toMatchObject({
      userId: 'mod-a',
      communityId: 'cA',
      scheduledAt: NOW,
    });
  });

  it('pauses and tells the moderators when the gate refuses, creating nothing', async () => {
    const t = seedThread();
    h.gate = {
      kind: 'refuse',
    };
    expect(await runDueRecurringThreads(NOW)).toBe(0);
    expect(t).toMatchObject({
      active: false,
      pausedReason: 'gate_refused',
      failures: 1,
    });
    expect(h.drafts).toHaveLength(0);
    expect(h.published).toHaveLength(0);
    expect(h.notified.map((n) => n.userId).sort()).toEqual(['mod-a', 'mod-b', 'owner']);
    expect(h.notified[0]).toMatchObject({
      type: 'SYSTEM',
      entityType: 'community-recurring-paused',
      entityId: t.id,
    });
  });

  it.each([['hold'], ['flag']] as const)('pauses when AutoMod would %s the post', async (kind) => {
    const t = seedThread();
    h.gate = {
      kind,
    };
    await runDueRecurringThreads(NOW);
    expect(t).toMatchObject({
      active: false,
      pausedReason: 'held_by_automod',
    });
    expect(h.drafts).toHaveLength(0);
  });

  it('deletes its ScheduledPost row and pauses when publishing returns null', async () => {
    const t = seedThread();
    h.publishResult = null;
    await runDueRecurringThreads(NOW);
    expect(h.calls).toContain('scheduledPost.deleteMany');
    expect(h.drafts).toHaveLength(0);
    expect(t).toMatchObject({
      active: false,
      lastPostId: null,
    });
  });

  it('pauses and notifies when the author is no longer a moderator, and tells the moderators once', async () => {
    const t = seedThread({
      createdById: 'member-1',
    });
    await runDueRecurringThreads(NOW);
    await runDueRecurringThreads(NOW);
    expect(t).toMatchObject({
      active: false,
      pausedReason: 'author_not_moderator',
    });
    expect(h.drafts).toHaveLength(0);
    expect(h.notified).toHaveLength(3);
  });

  it('pauses when the author is sanctioned in the community or banned on the site', async () => {
    const a = seedThread();
    h.sanctioned.add('mod-a');
    await runDueRecurringThreads(NOW);
    expect(a).toMatchObject({
      active: false,
      pausedReason: 'author_sanctioned',
    });
    h.sanctioned.clear();
    const b = seedThread({
      createdById: 'mod-b',
    });
    h.accountBanned.add('mod-b');
    await runDueRecurringThreads(NOW);
    expect(b).toMatchObject({
      active: false,
      pausedReason: 'author_sanctioned',
    });
    expect(h.drafts).toHaveLength(0);
  });
});

describe('post now', () => {
  it('posts at once and leaves the schedule where it was', async () => {
    const t = seedThread({
      nextAt: new Date('2099-01-05T09:00:00Z'),
    });
    const res = await call(itemRoute, 'POST', {
      slug: 'a',
      id: t.id,
    });
    expect(res.status).toBe(200);
    expect(
      (
        (await res.json()) as {
          postId: string;
        }
      ).postId,
    ).toBe('post-1');
    expect((t.nextAt as Date).toISOString()).toBe('2099-01-05T09:00:00.000Z');
    expect(t.active).toBe(true);
  });

  it('pauses the template when it cannot post', async () => {
    const t = seedThread({
      createdById: 'member-1',
    });
    const res = await call(itemRoute, 'POST', {
      slug: 'a',
      id: t.id,
    });
    expect(res.status).toBe(409);
    expect(t.active).toBe(false);
  });
});
