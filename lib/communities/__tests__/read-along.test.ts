/**
 * s11-09 read-alongs. The endpoints are driven through their registered handlers and the job through
 * `runDueReadAlongParts`, with a faked, stateful Prisma and faked gates (membership, bans, AutoMod, publishing).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ReadAlongPageDTO, ReadAlongSummaryDTO } from '@/lib/communities/read-along';

/** A row of the fake tables: the columns the tests read, and whatever else a row carries. */
interface Row {
  id: string;
  readAlongId: string;
  position: number;
  label: string;
  opensAt: Date;
  postedAt: Date | null;
  postId: string | null;
  userId: string;
  createdById: string;
  status: string;
  [column: string]: unknown;
}

const h = vi.hoisted(() => ({
  userId: 'mod-a' as string | null,
  roles: new Map<string, string>(),
  alongs: [] as Array<Record<string, unknown>>,
  parts: [] as Array<Record<string, unknown>>,
  readers: [] as Array<Record<string, unknown>>,
  drafts: [] as Array<Record<string, unknown>>,
  logged: [] as Array<Record<string, unknown>>,
  notified: [] as Array<Record<string, unknown>>,
  gateCalls: [] as string[],
  lockCalls: [] as string[],
  seq: 0,
  gate: 'ok' as 'ok' | 'refuse' | 'hold' | 'flag',
  publishResult: 'post-1' as string | null,
  sanction: new Map<string, { kind: 'ban' | 'timeout'; endsAt: Date | null }>(),
  accountBanned: new Set<string>(),
  deletionScheduled: new Set<string>(),
  locks: new Map<string, Promise<void>>(),
  books: new Map<string, Record<string, unknown>>(),
}));

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: vi.fn(async () =>
        h.userId ? { user: { id: h.userId }, session: { id: 's1', userId: h.userId } } : null,
      ),
    },
  },
}));

vi.mock('@/lib/prisma.server', () => {
  const eq = (a: unknown, b: unknown) =>
    a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : a === b;
  const matches = (r: Row, where: Record<string, unknown>): boolean =>
    Object.entries(where).every(([k, v]) => {
      if (k === 'readAlong' && v && typeof v === 'object') {
        const parent = h.alongs.find((a) => a.id === r.readAlongId) as Row | undefined;
        return parent ? matches(parent, v as Record<string, unknown>) : false;
      }
      if (k === 'user') {
        // "still a member of the community": the one relation filter the code uses on readers
        const some = (v as { communityMembers?: { some: { communityId: string } } }).communityMembers?.some;
        return some ? h.roles.has(`${some.communityId}:${r.userId}`) : true;
      }
      const cur = r[k];
      if (v && typeof v === 'object' && !(v instanceof Date)) {
        const o = v as { in?: unknown[]; not?: unknown; lte?: Date; lt?: Date };
        if (o.in) return o.in.includes(cur);
        if ('not' in o) return !eq(cur, o.not);
        if (o.lte) return cur instanceof Date && cur.getTime() <= o.lte.getTime();
        if (o.lt) return cur instanceof Date && cur.getTime() < o.lt.getTime();
        return true;
      }
      return eq(cur, v);
    });
  const partsOf = (id: unknown) =>
    (h.parts as Row[]).filter((p) => p.readAlongId === id).sort((a, b) => a.position - b.position);
  const shape = (r: Row, include?: Record<string, unknown>): Row => {
    const out: Row = { ...r };
    if (include?.parts) out.parts = partsOf(r.id).map((p) => ({ ...p }));
    if (include?._count) out._count = { readers: (h.readers as Row[]).filter((x) => x.readAlongId === r.id).length };
    if (include?.createdBy)
      out.createdBy = { id: r.createdById, name: r.createdById, handle: r.createdById, image: null };
    if (include?.readAlong) {
      const parent = (h.alongs as Row[]).find((a) => a.id === r.readAlongId)!;
      out.readAlong = {
        ...parent,
        community: { name: 'Art', slug: 'a' },
        createdBy: { deletionScheduledAt: h.deletionScheduled.has(String(parent.createdById)) ? new Date() : null },
      };
    }
    return out;
  };
  const patch = (r: Row, data: Record<string, unknown>) => {
    for (const [k, v] of Object.entries(data)) r[k] = v;
  };
  const communityRow = (key: { slug?: string; id?: string }) => {
    const table: Record<string, { id: string; slug: string; isPrivate: boolean }> = {
      a: { id: 'cA', slug: 'a', isPrivate: false },
      p: { id: 'cP', slug: 'p', isPrivate: true },
    };
    const found = Object.values(table).find((c) => c.slug === key.slug || c.id === key.id);
    if (!found) return null;
    const role = h.roles.get(`${found.id}:${h.userId}`);
    return { ...found, name: 'Art', icon: null, members: role ? [{ role }] : [] };
  };

  const prisma: Record<string, unknown> = {
    community: { findUnique: async ({ where }: { where: { slug?: string; id?: string } }) => communityRow(where) },
    communityMember: {
      findUnique: async ({ where }: { where: { communityId_userId: { communityId: string; userId: string } } }) => {
        const role = h.roles.get(`${where.communityId_userId.communityId}:${where.communityId_userId.userId}`);
        return role ? { id: 'm', role } : null;
      },
    },
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => ({
        bannedUntil: h.accountBanned.has(where.id) ? new Date('2099-01-01T00:00:00Z') : null,
      }),
    },
    scheduledPost: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `sp${++h.seq}`, publishedId: null, ...data };
        h.drafts.push(row);
        return row;
      },
      deleteMany: async ({ where }: { where: { id: string } }) => {
        const before = h.drafts.length;
        h.drafts = h.drafts.filter((d) => d.id !== where.id);
        return { count: before - h.drafts.length };
      },
    },
    readAlong: {
      findMany: async ({ where, include }: { where: Record<string, unknown>; include?: Record<string, unknown> }) =>
        (h.alongs as Row[]).filter((r) => matches(r, where)).map((r) => shape(r, include)),
      findFirst: async ({ where, include }: { where: Record<string, unknown>; include?: Record<string, unknown> }) => {
        const r = (h.alongs as Row[]).find((x) => matches(x, where));
        return r ? shape(r, include) : null;
      },
      findUnique: async ({ where }: { where: { id: string } }) => {
        const r = (h.alongs as Row[]).find((x) => x.id === where.id);
        return r ? shape(r) : null;
      },
      count: async ({ where }: { where: Record<string, unknown> & { id?: { not: string } } }) => {
        // yield, so a check-then-insert without the lock would let two callers both pass
        await new Promise((r) => setTimeout(r, 2));
        return (h.alongs as Row[]).filter((r) => matches(r, where)).length;
      },
      create: async ({ data, include }: { data: Partial<Row>; include?: Record<string, unknown> }) => {
        const { parts, ...rest } = data;
        await new Promise((r) => setTimeout(r, 2));
        const row = { id: `ra${++h.seq}`, pausedReason: null, createdAt: new Date(), ...rest } as Row;
        h.alongs.push(row);
        for (const p of (parts as { create: Partial<Row>[] }).create) {
          h.parts.push({
            id: `rp${++h.seq}`,
            readAlongId: row.id,
            postId: null,
            postedAt: null,
            notifiedAt: null,
            ...p,
          });
        }
        return shape(row, include);
      },
      update: async ({
        where,
        data,
        include,
      }: {
        where: { id: string };
        data: Row;
        include?: Record<string, unknown>;
      }) => {
        const r = (h.alongs as Row[]).find((x) => x.id === where.id)!;
        patch(r, data);
        return shape(r, include);
      },
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Row }) => {
        const hit = (h.alongs as Row[]).filter((r) => matches(r, where));
        hit.forEach((r) => patch(r, data));
        return { count: hit.length };
      },
    },
    readAlongPart: {
      findMany: async ({
        where,
        take,
        include,
      }: {
        where: Record<string, unknown>;
        take?: number;
        include?: Record<string, unknown>;
      }) =>
        (h.parts as Row[])
          .filter((p) => matches(p, where))
          .sort((a, b) => a.opensAt.getTime() - b.opensAt.getTime())
          .slice(0, take ?? 1000)
          .map((p) => shape(p, include)),
      count: async ({ where }: { where: Record<string, unknown> }) =>
        (h.parts as Row[]).filter((p) => matches(p, where)).length,
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Row }) => {
        const hit = (h.parts as Row[]).filter((p) => matches(p, where));
        hit.forEach((p) => patch(p, data));
        return { count: hit.length };
      },
      deleteMany: async ({ where }: { where: Record<string, unknown> }) => {
        const before = h.parts.length;
        h.parts = h.parts.filter((p) => !matches(p as Row, where));
        return { count: before - h.parts.length };
      },
      createMany: async ({ data }: { data: Partial<Row>[] }) => {
        for (const p of data)
          h.parts.push({ id: `rp${++h.seq}`, postId: null, postedAt: null, notifiedAt: null, ...p });
        return { count: data.length };
      },
    },
    readAlongReader: {
      findMany: async ({ where, take }: { where: Record<string, unknown>; take?: number }) =>
        (h.readers as Row[])
          .filter((r) => matches(r, where))
          .slice(0, take ?? 5000)
          .map((r) => ({ ...r, user: { id: r.userId, name: r.userId, handle: r.userId, image: null } })),
      findUnique: async ({ where }: { where: { readAlongId_userId: { readAlongId: string; userId: string } } }) => {
        const k = where.readAlongId_userId;
        return (
          ((h.readers as Row[]).find((r) => r.readAlongId === k.readAlongId && r.userId === k.userId) as
            Row | undefined) ?? null
        );
      },
      count: async ({ where }: { where: Record<string, unknown> }) =>
        (h.readers as Row[]).filter((r) => matches(r, where)).length,
      create: async ({ data }: { data: Row }) => {
        h.readers.push({ lastPartDone: 0, joinedAt: new Date(), ...data });
        return data;
      },
      update: async ({
        where,
        data,
      }: {
        where: { readAlongId_userId: { readAlongId: string; userId: string } };
        data: Row;
      }) => {
        const k = where.readAlongId_userId;
        const r = (h.readers as Row[]).find((x) => x.readAlongId === k.readAlongId && x.userId === k.userId)!;
        patch(r, data);
        return r;
      },
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Row }) => {
        const hit = (h.readers as Row[]).filter((r) => matches(r, where));
        hit.forEach((r) => patch(r, data));
        return { count: hit.length };
      },
      deleteMany: async ({ where }: { where: Record<string, unknown> }) => {
        const before = h.readers.length;
        h.readers = h.readers.filter((r) => !matches(r as Row, where));
        return { count: before - h.readers.length };
      },
    },
  };
  // A transaction holds the locks it took until it ends, like `pg_advisory_xact_lock`.
  prisma.$transaction = async (fn: (tx: unknown) => unknown) => {
    const tx = Object.create(prisma) as Record<string, unknown> & { __release?: Array<() => void> };
    tx.__release = [];
    try {
      return await fn(tx);
    } finally {
      for (const release of tx.__release) release();
    }
  };
  return { prisma };
});
vi.mock('@/lib/db/advisory-lock.server', () => ({
  lockKey: async (tx: { __release: Array<() => void> }, key: string) => {
    h.lockCalls.push(key);
    const previous = h.locks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const mine = new Promise<void>((resolve) => (release = resolve));
    h.locks.set(
      key,
      previous.then(() => mine),
    );
    await previous;
    tx.__release.push(release);
  },
}));
vi.mock('@/lib/communities/modlog.server', () => ({
  logModAction: async (_tx: unknown, input: Record<string, unknown>) => {
    h.logged.push(input);
    return 1n;
  },
}));
vi.mock('@/lib/communities/bans.server', () => ({
  activeSanction: async (_c: string, userId: string) => h.sanction.get(userId) ?? null,
}));
vi.mock('@/lib/communities/post-gate.server', () => ({
  prepareCommunityPost: async (args: Record<string, unknown>) => {
    h.gateCalls.push(String(args.content));
    if (h.gate === 'refuse') return { ok: false, refusal: { status: 403, code: null, body: { error: 'no' } } };
    return { ok: true, held: h.gate === 'hold', holdRule: 'AutoMod', flagRule: h.gate === 'flag' ? 'rule' : null };
  },
}));
vi.mock('@/lib/scheduled/publish.server', () => ({
  publishScheduledPost: async () => h.publishResult,
}));
vi.mock('@/lib/notifications.server', () => ({
  createNotification: async (input: Record<string, unknown>) => {
    h.notified.push(input);
  },
}));
vi.mock('@/lib/library/library.server', () => ({
  getBook: async (slug: string) => h.books.get(slug) ?? undefined,
  listAllBooks: async () => [...h.books.values()],
}));

const { route: listRoute } = await import('@/lib/communities/api/communities.$slug.read-alongs.server');
const { route: itemRoute } = await import('@/lib/communities/api/communities.$slug.read-alongs.$id.server');
const { route: joinRoute } = await import('@/lib/communities/api/communities.$slug.read-alongs.$id.join.server');
const { route: progressRoute } =
  await import('@/lib/communities/api/communities.$slug.read-alongs.$id.progress.server');
const { runDueReadAlongParts } = await import('@/lib/communities/read-along-jobs.server');
const { MAX_READERS } = await import('@/lib/communities/read-along');

type Handler = (a: { request: Request; params: Record<string, string> }) => Promise<Response> | Response;
let ip = 0;
const call = (
  r: { handlers: Record<string, Handler | undefined> },
  method: string,
  params: Record<string, string>,
  body?: unknown,
) =>
  r.handlers[method]!({
    request: new Request('https://rmhstudios.com/api/x', {
      method,
      headers: {
        cookie: 'better-auth.session_token=t',
        'x-forwarded-for': `203.0.113.${(++ip % 250) + 1}`,
        'content-type': 'application/json',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    params,
  });

const json = async <T = Record<string, unknown>>(res: Response) => (await res.json()) as T;
const pageOf = async (res: Response) => (await json<{ readAlong: ReadAlongPageDTO }>(res)).readAlong;

const NOW = new Date('2026-12-07T10:00:00Z');
const FUTURE_DAY = '2026-12-14';

const startBody = (over: Record<string, unknown> = {}) => ({
  docSlug: 'moby',
  startDay: FUTURE_DAY,
  weekday: 1,
  time: '09:00',
  timeZone: 'Europe/London',
  parts: [
    { label: 'Part 1', startPage: 1, endPage: 50 },
    { label: 'Part 2', startPage: 51, endPage: 100 },
    { label: 'Part 3', startPage: 101, endPage: 150 },
    { label: 'Part 4', startPage: 151, endPage: 200 },
  ],
  ...over,
});

/** Start in the future relative to the real clock: the start handler compares with `Date.now()`. */
const futureDay = () => {
  const d = new Date(Date.now() + 10 * 86_400_000);
  return d.toISOString().slice(0, 10);
};

const seedAlong = (over: Record<string, unknown> = {}, opens: Date[] = [new Date('2026-12-07T09:00:00Z')]) => {
  const id = `ra${++h.seq}`;
  const row = {
    id,
    communityId: 'cA',
    createdById: 'mod-a',
    docSlug: 'moby',
    bookTitle: 'Moby Dick',
    weekday: 1,
    minuteOfDay: 540,
    timeZone: 'Europe/London',
    status: 'active',
    pausedReason: null,
    createdAt: new Date('2026-11-30T00:00:00Z'),
    ...over,
  };
  h.alongs.push(row);
  opens.forEach((opensAt, i) =>
    h.parts.push({
      id: `rp${++h.seq}`,
      readAlongId: id,
      position: i + 1,
      label: `Part ${i + 1}`,
      startPage: i * 50 + 1,
      endPage: (i + 1) * 50,
      opensAt,
      postId: null,
      postedAt: null,
      notifiedAt: null,
    }),
  );
  // A read-along row, not a part: it shares only `id` with the part-shaped Row the fakes are typed by.
  return row as unknown as Row;
};
const partsOf = (id: string) => (h.parts as Row[]).filter((p) => p.readAlongId === id);

beforeEach(() => {
  h.userId = 'mod-a';
  h.roles = new Map([
    ['cA:mod-a', 'MOD'],
    ['cA:mod-b', 'MOD'],
    ['cA:owner', 'ADMIN'],
    ['cA:member-1', 'MEMBER'],
    ['cA:member-2', 'MEMBER'],
    ['cA:member-3', 'MEMBER'],
    ['cA:banned', 'MEMBER'],
    ['cP:mod-a', 'MOD'],
    ['cP:member-1', 'MEMBER'],
  ]);
  h.alongs = [];
  h.parts = [];
  h.readers = [];
  h.drafts = [];
  h.logged.length = 0;
  h.notified.length = 0;
  h.gateCalls.length = 0;
  h.lockCalls.length = 0;
  h.locks.clear();
  h.seq = 0;
  h.gate = 'ok';
  h.publishResult = 'post-1';
  h.sanction.clear();
  h.accountBanned.clear();
  h.deletionScheduled.clear();
  h.books = new Map([
    ['moby', { slug: 'moby', title: 'Moby Dick', pages: 200, format: 'pdf', toc: [] }],
    ['tiny', { slug: 'tiny', title: 'One page', pages: 1, format: 'pdf', toc: [] }],
  ]);
});

describe('starting a read-along', () => {
  it('a member and a stranger get 403 on every moderator endpoint and nothing is written', async () => {
    const ra = seedAlong({}, [new Date(Date.now() + 86_400_000)]);
    for (const who of ['member-1', 'stranger']) {
      h.userId = who;
      const results = await Promise.all([
        call(listRoute, 'POST', { slug: 'a' }, startBody({ startDay: futureDay() })),
        call(itemRoute, 'PATCH', { slug: 'a', id: ra.id }, { action: 'cancel' }),
        call(itemRoute, 'PATCH', { slug: 'a', id: ra.id }, { action: 'resume' }),
      ]);
      expect(results.map((r) => r.status)).toEqual([403, 403, 403]);
    }
    expect(h.alongs).toHaveLength(1);
    expect(ra.status).toBe('active');
    expect(h.logged).toHaveLength(0);
  });

  it('a moderator starts a read-along of a book in four weekly parts and the start is logged', async () => {
    const res = await call(listRoute, 'POST', { slug: 'a' }, startBody({ startDay: futureDay() }));
    expect(res.status).toBe(201);
    const { readAlong } = await json<{ readAlong: ReadAlongSummaryDTO }>(res);
    expect(readAlong).toMatchObject({ bookTitle: 'Moby Dick', status: 'active', partCount: 4, openedCount: 0 });
    const parts = partsOf(readAlong.id).sort((a, b) => a.position - b.position);
    expect(parts.map((p) => p.position)).toEqual([1, 2, 3, 4]);
    // weekly, at the same London wall time
    for (let i = 1; i < parts.length; i++) {
      const gap = parts[i]!.opensAt.getTime() - parts[i - 1]!.opensAt.getTime();
      expect(Math.abs(gap - 7 * 86_400_000)).toBeLessThanOrEqual(3_600_000);
    }
    expect(h.logged[0]).toMatchObject({
      action: 'read_along_started',
      targetType: 'read_along',
      targetId: readAlong.id,
      communityId: 'cA',
    });
    expect(h.alongs[0]).toMatchObject({ createdById: 'mod-a', docSlug: 'moby', status: 'active' });
  });

  it('refuses a book that is not in the library, one too short to split, and a start in the past', async () => {
    const unknown = await call(listRoute, 'POST', { slug: 'a' }, startBody({ docSlug: 'nope', startDay: futureDay() }));
    expect(unknown.status).toBe(404);
    const tiny = await call(listRoute, 'POST', { slug: 'a' }, startBody({ docSlug: 'tiny', startDay: futureDay() }));
    expect(tiny.status).toBe(404);
    const past = await call(listRoute, 'POST', { slug: 'a' }, startBody({ startDay: '2020-01-06' }));
    expect(past.status).toBe(400);
    expect(h.alongs).toHaveLength(0);
  });

  it('refuses parts outside the book, overlapping parts and too few parts', async () => {
    const out = await call(
      listRoute,
      'POST',
      { slug: 'a' },
      startBody({
        startDay: futureDay(),
        parts: [
          { label: 'A', startPage: 1, endPage: 100 },
          { label: 'B', startPage: 101, endPage: 999 },
        ],
      }),
    );
    const overlap = await call(
      listRoute,
      'POST',
      { slug: 'a' },
      startBody({
        startDay: futureDay(),
        parts: [
          { label: 'A', startPage: 1, endPage: 100 },
          { label: 'B', startPage: 90, endPage: 150 },
        ],
      }),
    );
    const one = await call(
      listRoute,
      'POST',
      { slug: 'a' },
      startBody({ startDay: futureDay(), parts: [{ label: 'A', startPage: 1, endPage: 100 }] }),
    );
    expect([out.status, overlap.status, one.status]).toEqual([400, 400, 400]);
    expect(h.alongs).toHaveLength(0);
  });

  it('allows two active read-alongs and refuses a third with the cap code', async () => {
    seedAlong({}, [new Date(Date.now() + 86_400_000)]);
    seedAlong({}, [new Date(Date.now() + 86_400_000)]);
    const res = await call(listRoute, 'POST', { slug: 'a' }, startBody({ startDay: futureDay() }));
    expect(res.status).toBe(409);
    expect(await json(res)).toMatchObject({ code: 'READ_ALONG_CAP', max: 2 });
    expect(h.alongs).toHaveLength(2);
  });

  it('a paused read-along does not count toward the cap', async () => {
    seedAlong({ status: 'paused', pausedReason: 'gate_refused' }, [new Date(Date.now() + 86_400_000)]);
    seedAlong({}, [new Date(Date.now() + 86_400_000)]);
    const res = await call(listRoute, 'POST', { slug: 'a' }, startBody({ startDay: futureDay() }));
    expect(res.status).toBe(201);
  });

  it('holds the cap under the lock: two concurrent starts with one slot left make one read-along', async () => {
    seedAlong({}, [new Date(Date.now() + 86_400_000)]);
    const [first, second] = await Promise.all([
      call(listRoute, 'POST', { slug: 'a' }, startBody({ startDay: futureDay() })),
      call(listRoute, 'POST', { slug: 'a' }, startBody({ startDay: futureDay() })),
    ]);
    expect([first.status, second.status].sort()).toEqual([201, 409]);
    expect(h.alongs.filter((a) => a.status === 'active')).toHaveLength(2);
    expect(h.lockCalls).toEqual(['read-alongs:cA', 'read-alongs:cA']);
  });
});

describe('a due part posts', () => {
  it('posts the part once behind "Spoilers: <label>" as the moderator who started it', async () => {
    const ra = seedAlong();
    expect(await runDueReadAlongParts(NOW)).toBe(1);
    expect(h.drafts).toHaveLength(1);
    expect(h.drafts[0]).toMatchObject({
      userId: 'mod-a',
      communityId: 'cA',
      contentWarning: 'Spoilers: Part 1',
    });
    const content = String(h.drafts[0]!.content);
    expect(content).toContain('Moby Dick');
    expect(content).toContain('Part 1');
    expect(content).toContain('pages 1-50');
    expect(content).toContain(`/c/a/read/${ra.id}`);
    expect(content.length).toBeLessThanOrEqual(280);
    // it went through the same gate as a member's post, with the same text
    expect(h.gateCalls).toEqual([content]);
    const [part] = partsOf(ra.id);
    expect(part).toMatchObject({ postId: 'post-1' });
    expect(part!.postedAt).toBeInstanceOf(Date);
  });

  it('posts once under two concurrent job runs', async () => {
    const ra = seedAlong();
    const [a, b] = await Promise.all([runDueReadAlongParts(NOW), runDueReadAlongParts(NOW)]);
    expect(a + b).toBe(1);
    expect(h.drafts).toHaveLength(1);
    expect(h.gateCalls).toHaveLength(1);
    expect(partsOf(ra.id)[0]!.postedAt).toBeInstanceOf(Date);
  });

  it('does not post a part that is not due, or one of a paused or cancelled read-along', async () => {
    seedAlong({}, [new Date('2026-12-08T09:00:00Z')]);
    seedAlong({ status: 'paused' });
    seedAlong({ status: 'cancelled' });
    expect(await runDueReadAlongParts(NOW)).toBe(0);
    expect(h.drafts).toHaveLength(0);
  });

  it.each([
    ['refuse', 'gate_refused'],
    ['hold', 'held_by_automod'],
    ['flag', 'held_by_automod'],
  ] as const)('a gate that %ss the text pauses the read-along with %s and posts nothing', async (gate, reason) => {
    h.gate = gate;
    const ra = seedAlong();
    expect(await runDueReadAlongParts(NOW)).toBe(0);
    expect(ra).toMatchObject({ status: 'paused', pausedReason: reason });
    expect(h.drafts).toHaveLength(0);
    // the claim is given back, so a moderator who resumes it posts the part
    expect(partsOf(ra.id)[0]!.postedAt).toBeNull();
  });

  it('pauses when the starter is no longer a moderator, or is sanctioned', async () => {
    h.roles.set('cA:mod-a', 'MEMBER');
    const a = seedAlong();
    await runDueReadAlongParts(NOW);
    expect(a).toMatchObject({ status: 'paused', pausedReason: 'author_not_moderator' });

    h.roles.set('cA:mod-a', 'MOD');
    h.sanction.set('mod-a', { kind: 'timeout', endsAt: null });
    const b = seedAlong();
    await runDueReadAlongParts(NOW);
    expect(b).toMatchObject({ status: 'paused', pausedReason: 'author_sanctioned' });
    expect(h.drafts).toHaveLength(0);
  });

  it('pauses when publishing fails and leaves no draft behind', async () => {
    h.publishResult = null;
    const ra = seedAlong();
    await runDueReadAlongParts(NOW);
    expect(ra.status).toBe('paused');
    expect(h.drafts).toHaveLength(0);
  });

  it('skips a read-along whose starter is deleting their account, without pausing it', async () => {
    h.deletionScheduled.add('mod-a');
    const ra = seedAlong();
    expect(await runDueReadAlongParts(NOW)).toBe(0);
    expect(ra.status).toBe('active');
    expect(partsOf(ra.id)[0]!.postedAt).toBeNull();
  });

  it('posts one part per read-along per sweep and moves the late ones to the following weeks', async () => {
    const ra = seedAlong({}, [
      new Date('2026-11-23T09:00:00Z'),
      new Date('2026-11-30T09:00:00Z'),
      new Date('2026-12-07T09:00:00Z'),
    ]);
    expect(await runDueReadAlongParts(NOW)).toBe(1);
    const [first, second, third] = partsOf(ra.id);
    expect(first!.postedAt).toBeInstanceOf(Date);
    expect(second!.postedAt).toBeNull();
    // the next parts open after now, a week apart, on the read-along's weekday
    expect(second!.opensAt.getTime()).toBeGreaterThan(NOW.getTime());
    expect(third!.opensAt.getTime() - second!.opensAt.getTime()).toBeGreaterThanOrEqual(6.9 * 86_400_000);
    expect(await runDueReadAlongParts(NOW)).toBe(0);
  });

  it('gives back a claim a dead run left (no post recorded) so the part is not lost, and posts it', async () => {
    const ra = seedAlong();
    // claimed 20 minutes ago by a run that died before it posted
    partsOf(ra.id)[0]!.postedAt = new Date(NOW.getTime() - 20 * 60_000);
    expect(await runDueReadAlongParts(NOW)).toBe(1);
    expect(h.drafts).toHaveLength(1);
    // a claim made a minute ago is a live run's, and is left alone
    const rb = seedAlong();
    partsOf(rb.id)[0]!.postedAt = new Date(NOW.getTime() - 60_000);
    expect(await runDueReadAlongParts(NOW)).toBe(0);
    expect(h.drafts).toHaveLength(1);
  });

  it('does not claim a part whose read-along was cancelled after the sweep read it', async () => {
    const ra = seedAlong();
    ra.status = 'cancelled';
    expect(await runDueReadAlongParts(NOW)).toBe(0);
    expect(partsOf(ra.id)[0]!.postedAt).toBeNull();
  });

  it('is done when the last part has posted', async () => {
    const ra = seedAlong();
    await runDueReadAlongParts(NOW);
    expect(ra.status).toBe('done');
  });
});

describe('notices', () => {
  it('go to joined readers with notice on, who are still members, once per part', async () => {
    const ra = seedAlong({}, [new Date('2026-12-07T09:00:00Z'), new Date('2026-12-14T09:00:00Z')]);
    h.readers.push(
      { readAlongId: ra.id, userId: 'member-1', notify: true, lastPartDone: 0 },
      { readAlongId: ra.id, userId: 'member-2', notify: false, lastPartDone: 0 },
      // joined, then left the community
      { readAlongId: ra.id, userId: 'gone', notify: true, lastPartDone: 0 },
    );
    await Promise.all([runDueReadAlongParts(NOW), runDueReadAlongParts(NOW)]);
    expect(h.notified.map((n) => n.userId)).toEqual(['member-1']);
    expect(h.notified[0]).toMatchObject({
      type: 'SYSTEM',
      entityType: 'read-along',
      link: `/c/a/read/${ra.id}`,
      preview: { key: 'read-along-part-open', params: { part: 'Part 1', book: 'Moby Dick', community: 'Art' } },
    });
    expect(partsOf(ra.id)[0]!.notifiedAt).toBeInstanceOf(Date);
    // nothing more on a later sweep before the next part opens
    await runDueReadAlongParts(new Date('2026-12-08T10:00:00Z'));
    expect(h.notified).toHaveLength(1);
    // the second part opens a week later: one more notice
    await runDueReadAlongParts(new Date('2026-12-14T10:00:00Z'));
    expect(h.notified.map((n) => n.userId)).toEqual(['member-1', 'member-1']);
  });

  it('are not sent when the part was not posted', async () => {
    h.gate = 'refuse';
    const ra = seedAlong();
    h.readers.push({ readAlongId: ra.id, userId: 'member-1', notify: true, lastPartDone: 0 });
    await runDueReadAlongParts(NOW);
    expect(h.notified).toHaveLength(0);
  });
});

describe('joining', () => {
  const join = (slug: string, id: string, body?: unknown) => call(joinRoute, 'POST', { slug, id }, body ?? {});

  it('a member joins with notices on by default, can switch them off, and leaves', async () => {
    const ra = seedAlong();
    h.userId = 'member-1';
    const res = await join('a', ra.id);
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ success: true, notify: true });
    expect(h.readers).toHaveLength(1);
    // joining again changes only the notice setting
    expect(await json(await join('a', ra.id, { notify: false }))).toEqual({ success: true, notify: false });
    expect(h.readers).toHaveLength(1);
    expect(h.readers[0]).toMatchObject({ notify: false });
    const left = await call(joinRoute, 'DELETE', { slug: 'a', id: ra.id });
    expect(left.status).toBe(200);
    expect(h.readers).toHaveLength(0);
    // leaving again is not an error
    expect((await call(joinRoute, 'DELETE', { slug: 'a', id: ra.id })).status).toBe(200);
  });

  it('a member banned from the community cannot join, and the refusal carries the ban code', async () => {
    const ra = seedAlong();
    h.userId = 'banned';
    h.sanction.set('banned', { kind: 'ban', endsAt: null });
    const res = await join('a', ra.id);
    expect(res.status).toBe(403);
    expect(await json(res)).toMatchObject({ code: 'community_banned' });
    expect(h.readers).toHaveLength(0);
  });

  it('a timed-out member cannot join either, and a site ban refuses it', async () => {
    const ra = seedAlong();
    h.userId = 'member-1';
    h.sanction.set('member-1', { kind: 'timeout', endsAt: new Date('2099-01-01T00:00:00Z') });
    const timedOut = await join('a', ra.id);
    expect(timedOut.status).toBe(403);
    expect(await json(timedOut)).toMatchObject({ code: 'community_timed_out' });
    h.sanction.clear();
    h.accountBanned.add('member-1');
    expect((await join('a', ra.id)).status).toBe(403);
    expect(h.readers).toHaveLength(0);
  });

  it('someone who is not a member of the community cannot join', async () => {
    const ra = seedAlong();
    h.userId = 'stranger';
    expect((await join('a', ra.id)).status).toBe(403);
    expect(h.readers).toHaveLength(0);
  });

  it('refuses joining a read-along that has ended, and one that is full', async () => {
    const cancelled = seedAlong({ status: 'cancelled' });
    h.userId = 'member-1';
    const ended = await join('a', cancelled.id);
    expect(ended.status).toBe(409);
    expect(await json(ended)).toMatchObject({ code: 'READ_ALONG_ENDED' });

    const ra = seedAlong();
    for (let i = 0; i < MAX_READERS; i++)
      h.readers.push({ readAlongId: ra.id, userId: `u${i}`, notify: true, lastPartDone: 0 });
    const full = await join('a', ra.id);
    expect(full.status).toBe(409);
    expect(await json(full)).toMatchObject({ code: 'READ_ALONG_FULL', max: MAX_READERS });
    expect(h.readers).toHaveLength(MAX_READERS);
  });

  it('takes the readers lock before it counts', async () => {
    const ra = seedAlong();
    h.userId = 'member-1';
    await join('a', ra.id);
    expect(h.lockCalls).toContain(`read-along-readers:${ra.id}`);
  });
});

describe('marking a part', () => {
  const mark = (id: string, part: number) => call(progressRoute, 'PUT', { slug: 'a', id }, { part });

  it('records the reader’s last finished part, only for parts that have opened, and 0 clears it', async () => {
    const ra = seedAlong({}, [new Date('2026-12-07T09:00:00Z'), new Date('2027-01-04T09:00:00Z')]);
    (partsOf(ra.id)[0] as Row).postedAt = NOW;
    h.readers.push({ readAlongId: ra.id, userId: 'member-1', notify: true, lastPartDone: 0 });
    h.userId = 'member-1';
    expect(await json(await mark(ra.id, 1))).toEqual({ success: true, lastPartDone: 1 });
    expect(h.readers[0]).toMatchObject({ lastPartDone: 1 });
    // part 2 has not opened
    expect((await mark(ra.id, 2)).status).toBe(400);
    expect(await json(await mark(ra.id, 0))).toEqual({ success: true, lastPartDone: 0 });
  });

  it('refuses a member who has not joined', async () => {
    const ra = seedAlong();
    (partsOf(ra.id)[0] as Row).postedAt = NOW;
    h.userId = 'member-2';
    expect((await mark(ra.id, 1)).status).toBe(403);
  });
});

describe('the page', () => {
  const page = (slug: string, id: string) => call(itemRoute, 'GET', { slug, id });

  it('a member sees the parts, the readers and their own place; no reply or like count is in the body', async () => {
    const ra = seedAlong();
    (partsOf(ra.id)[0] as Row).postedAt = NOW;
    (partsOf(ra.id)[0] as Row).postId = 'post-9';
    h.readers.push(
      { readAlongId: ra.id, userId: 'member-1', notify: true, lastPartDone: 1 },
      { readAlongId: ra.id, userId: 'member-2', notify: false, lastPartDone: 0 },
    );
    h.userId = 'member-1';
    const res = await page('a', ra.id);
    expect(res.status).toBe(200);
    const readAlong = await pageOf(res);
    expect(readAlong.parts[0]).toMatchObject({ position: 1, opened: true, postId: 'post-9' });
    expect(readAlong.readers).toHaveLength(2);
    expect(readAlong.readerCount).toBe(2);
    expect(readAlong.me).toEqual({ notify: true, lastPartDone: 1 });
    expect(readAlong.canManage).toBe(false);
    expect(JSON.stringify(readAlong)).not.toMatch(/likeCount|replyCount|commentCount|viewCount|repostCount/);
  });

  it('a stranger on a public community sees the parts and how many are reading, not who', async () => {
    const ra = seedAlong();
    h.readers.push({ readAlongId: ra.id, userId: 'member-1', notify: true, lastPartDone: 1 });
    h.userId = 'stranger';
    const readAlong = await pageOf(await page('a', ra.id));
    expect(readAlong.readers).toBeNull();
    expect(readAlong.readerCount).toBe(1);
    expect(readAlong.me).toBeNull();
    expect(readAlong.canJoin).toBe(false);
  });

  it('a signed-out reader gets the page of a public community', async () => {
    const ra = seedAlong();
    h.userId = null;
    const res = await page('a', ra.id);
    expect(res.status).toBe(200);
    expect((await pageOf(res)).readers).toBeNull();
  });

  it('a private community’s read-along answers a non-member 404, the same as an unknown id', async () => {
    const ra = seedAlong({ communityId: 'cP' });
    h.userId = 'stranger';
    const hidden = await page('p', ra.id);
    const unknown = await page('p', 'nothing');
    const noCommunity = await page('missing', ra.id);
    expect(hidden.status).toBe(404);
    expect(unknown.status).toBe(404);
    expect(noCommunity.status).toBe(404);
    expect(await json(hidden)).toEqual(await json(unknown));
    // a banned member of the private community reads like a non-member
    h.userId = 'member-1';
    h.sanction.set('member-1', { kind: 'ban', endsAt: null });
    expect((await page('p', ra.id)).status).toBe(404);
    // a member reads it
    h.sanction.clear();
    expect((await page('p', ra.id)).status).toBe(200);
  });

  it('answers a non-member 404 on the private join and progress endpoints too', async () => {
    const ra = seedAlong({ communityId: 'cP' });
    h.userId = 'stranger';
    expect((await call(joinRoute, 'POST', { slug: 'p', id: ra.id }, {})).status).toBe(404);
    expect((await call(progressRoute, 'PUT', { slug: 'p', id: ra.id }, { part: 0 })).status).toBe(404);
    expect((await call(listRoute, 'GET', { slug: 'p' })).status).toBe(404);
  });

  it('shows the reason it paused to moderators only', async () => {
    const ra = seedAlong({ status: 'paused', pausedReason: 'held_by_automod' });
    h.userId = 'mod-a';
    expect(await pageOf(await page('a', ra.id))).toMatchObject({
      status: 'paused',
      pausedReason: 'held_by_automod',
      canManage: true,
    });
    h.userId = 'member-1';
    expect(await pageOf(await page('a', ra.id))).toMatchObject({ status: 'paused', pausedReason: null });
    const list = await json<{ readAlongs: ReadAlongSummaryDTO[]; maxActive: number }>(
      await call(listRoute, 'GET', { slug: 'a' }),
    );
    expect(list.readAlongs[0]).toMatchObject({ status: 'paused', pausedReason: null });
    h.userId = 'mod-a';
    expect(
      (await json<{ readAlongs: ReadAlongSummaryDTO[] }>(await call(listRoute, 'GET', { slug: 'a' }))).readAlongs[0],
    ).toMatchObject({
      pausedReason: 'held_by_automod',
    });
  });

  it('lists running, paused and finished read-alongs, not cancelled ones', async () => {
    seedAlong();
    seedAlong({ status: 'done' });
    seedAlong({ status: 'cancelled' });
    const list = await json<{ readAlongs: ReadAlongSummaryDTO[]; maxActive: number }>(
      await call(listRoute, 'GET', { slug: 'a' }),
    );
    expect(list.readAlongs.map((r) => r.status).sort()).toEqual(['active', 'done']);
    expect(list.maxActive).toBe(2);
  });
});

describe('moderating', () => {
  it('cancelling stops future parts, keeps what was posted, and is logged', async () => {
    const ra = seedAlong({}, [new Date('2026-12-07T09:00:00Z'), new Date('2026-12-14T09:00:00Z')]);
    await runDueReadAlongParts(NOW);
    const res = await call(itemRoute, 'PATCH', { slug: 'a', id: ra.id }, { action: 'cancel' });
    expect(res.status).toBe(200);
    expect(ra.status).toBe('cancelled');
    expect(await runDueReadAlongParts(new Date('2026-12-20T10:00:00Z'))).toBe(0);
    expect(partsOf(ra.id)[0]!.postedAt).toBeInstanceOf(Date);
    expect(h.logged.at(-1)).toMatchObject({ action: 'read_along_cancelled', targetId: ra.id });
    // cancelling twice is refused
    expect((await call(itemRoute, 'PATCH', { slug: 'a', id: ra.id }, { action: 'cancel' })).status).toBe(409);
  });

  it('resumes a paused read-along as the moderator who resumes it, moving late parts to the next weeks', async () => {
    const ra = seedAlong({ status: 'paused', pausedReason: 'author_not_moderator' }, [
      new Date('2026-11-23T09:00:00Z'),
      new Date('2026-11-30T09:00:00Z'),
    ]);
    h.userId = 'mod-b';
    const res = await call(itemRoute, 'PATCH', { slug: 'a', id: ra.id }, { action: 'resume' });
    expect(res.status).toBe(200);
    expect(ra).toMatchObject({ status: 'active', pausedReason: null, createdById: 'mod-b' });
    const [a, b] = partsOf(ra.id);
    expect(a!.opensAt.getTime()).toBeGreaterThan(Date.now());
    expect(b!.opensAt.getTime() - a!.opensAt.getTime()).toBeGreaterThanOrEqual(6.9 * 86_400_000);
  });

  it('refuses to resume when two others are active', async () => {
    seedAlong({}, [new Date(Date.now() + 86_400_000)]);
    seedAlong({}, [new Date(Date.now() + 86_400_000)]);
    const ra = seedAlong({ status: 'paused', pausedReason: 'manual' });
    const res = await call(itemRoute, 'PATCH', { slug: 'a', id: ra.id }, { action: 'resume' });
    expect(res.status).toBe(409);
    expect(await json(res)).toMatchObject({ code: 'READ_ALONG_CAP' });
  });

  it('edits the parts until the first part opens, then refuses', async () => {
    const ra = seedAlong({}, [new Date('2026-12-14T09:00:00Z'), new Date('2026-12-21T09:00:00Z')]);
    const edit = await call(
      itemRoute,
      'PATCH',
      { slug: 'a', id: ra.id },
      {
        parts: [
          { label: 'Start', startPage: 1, endPage: 60 },
          { label: 'Middle', startPage: 61, endPage: 120 },
          { label: 'End', startPage: 121, endPage: 200 },
        ],
      },
    );
    expect(edit.status).toBe(200);
    const parts = partsOf(ra.id).sort((a, b) => a.position - b.position);
    expect(parts.map((p) => p.label)).toEqual(['Start', 'Middle', 'End']);
    // the dates stay on the same weekly times, counted from the first part's day
    expect(parts[0]!.opensAt.toISOString()).toBe('2026-12-14T09:00:00.000Z');
    expect(parts[2]!.opensAt.toISOString()).toBe('2026-12-28T09:00:00.000Z');

    parts[0]!.postedAt = NOW;
    const late = await call(
      itemRoute,
      'PATCH',
      { slug: 'a', id: ra.id },
      {
        parts: [
          { label: 'A', startPage: 1, endPage: 100 },
          { label: 'B', startPage: 101, endPage: 200 },
        ],
      },
    );
    expect(late.status).toBe(409);
    expect(await json(late)).toMatchObject({ code: 'READ_ALONG_STARTED' });
  });
});

describe('opening times across a clock change', () => {
  it('keeps the wall time: London 09:00 is 09:00Z before and 08:00Z after the spring change', async () => {
    const { openingsFor } = await import('@/lib/communities/read-along');
    const opens = openingsFor({ weekday: 0, minuteOfDay: 540, timeZone: 'Europe/London' }, '2026-03-22', 3);
    expect(opens.map((ms) => new Date(ms).toISOString())).toEqual([
      '2026-03-22T09:00:00.000Z',
      '2026-03-29T08:00:00.000Z',
      '2026-04-05T08:00:00.000Z',
    ]);
  });

  it('keeps the wall time in the autumn change too, and a late sweep reschedules onto the same weekday', async () => {
    const { openingsFor, openingsAfter } = await import('@/lib/communities/read-along');
    const ny = { weekday: 0, minuteOfDay: 540, timeZone: 'America/New_York' };
    expect(openingsFor(ny, '2026-10-25', 3).map((ms) => new Date(ms).toISOString())).toEqual([
      '2026-10-25T13:00:00.000Z',
      '2026-11-01T14:00:00.000Z',
      '2026-11-08T14:00:00.000Z',
    ]);
    // resuming on Oct 31 (UTC) reflows to the Sundays after it, still at 09:00 local
    const after = openingsAfter(ny, Date.UTC(2026, 9, 31, 12), 2).map((ms) => new Date(ms).toISOString());
    expect(after).toEqual(['2026-11-01T14:00:00.000Z', '2026-11-08T14:00:00.000Z']);
  });
});
