/**
 * `/api/v1/me/highlights*`, `/api/v1/me/shelves*` and `/api/v1/me/reading-goal`, driven through the real
 * developer-API wrapper, the real v1 adapters and the site's real `updateHighlight`, `deleteHighlight`, `setShelf`
 * and `getGoalProgress` over a small in-memory Prisma stand-in. What this holds: scopes, owner-only rows, the
 * `since` keyset across equal timestamps, edits through the site functions (passage counters), the goal moving, the
 * 404s and `document: null`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  handlersOf,
  type TestHandler,
} from '@/lib/__tests__/api-handlers-of';

type Row = Record<string, unknown>;

const h = vi.hoisted(() => ({
  scopes: [] as string[],
  highlights: [] as Row[],
  links: [] as Row[],
  stats: [] as Row[],
  shelves: [] as Row[],
  goals: [] as Row[],
  blog: [] as Row[],
  news: [] as Row[],
  libDocs: [] as Row[],
}));

vi.mock('@/lib/api/developer-auth.server', async (orig) => ({
  ...(await orig<typeof import('@/lib/api/developer-auth.server')>()),
  authenticateApiKey: async () => ({
    ok: true,
    userId: 'owner_1',
    tier: 'starter',
    keyId: 'key_1',
    scopes: h.scopes,
    testMode: false,
    allowedCidrs: [],
    rateLimitPerMinute: null,
  }),
  touchApiKeyLastUsed: () => undefined,
}));
vi.mock('@/lib/redis.server', () => ({
  redisRateLimit: async () => null,
  redisIncrBy: async () => null,
}));
vi.mock('@/lib/api/usage.server', () => ({ recordUsage: vi.fn() }));
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: unknown) => ({ options: config }),
}));
vi.mock('@/lib/cached.server', () => ({
  cached: async (_k: string, _t: number, fn: () => unknown) => fn(),
  invalidateCached: async () => undefined,
}));
vi.mock('@/lib/moderation.server', () => ({
  getHiddenAuthorIds: async () => [],
}));
vi.mock('@/lib/library/library.server', () => ({
  getBook: async (slug: string) =>
    slug === 'meditations'
      ? { slug, title: 'Meditations', pages: 254 }
      : slug === 'odyssey'
        ? { slug, title: 'The Odyssey', pages: 400 }
        : undefined,
}));
vi.mock('@/lib/library/library', () => ({
  getLibraryBook: (slug: string) =>
    slug === 'static-book' ? { slug, title: 'Static Book' } : undefined,
}));
vi.mock('@/lib/reading/glossary.server', () => ({
  listGlossary: async () => [],
}));

const isDate = (v: unknown): v is Date => v instanceof Date;
function cmp(a: unknown, b: unknown): number {
  const x = isDate(a) ? a.getTime() : (a as number | string);
  const y = isDate(b) ? b.getTime() : (b as number | string);
  return x < y ? -1 : x > y ? 1 : 0;
}
function matches(row: Row, where: Row | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([k, cond]) => {
    if (k === 'AND') return (cond as Row[]).every((w) => matches(row, w));
    if (k === 'OR') return (cond as Row[]).some((w) => matches(row, w));
    const v = row[k];
    if (cond === null) return v === null;
    if (isDate(cond)) return isDate(v) && v.getTime() === cond.getTime();
    if (typeof cond === 'object') {
      const c = cond as Row;
      if ('in' in c) return (c.in as unknown[]).includes(v);
      if ('not' in c) return c.not === null ? v !== null : v !== c.not;
      if ('gt' in c && cmp(v, c.gt) <= 0) return false;
      if ('gte' in c && cmp(v, c.gte) < 0) return false;
      if ('lt' in c && cmp(v, c.lt) >= 0) return false;
      return true;
    }
    return v === cond;
  });
}
function sorted(rows: Row[], orderBy: Row[] | undefined): Row[] {
  const out = [...rows];
  if (!orderBy) return out;
  out.sort((a, b) => {
    for (const o of orderBy) {
      const [[f, dir]] = Object.entries(o) as [[string, string]];
      const d = cmp(a[f], b[f]);
      if (d !== 0) return dir === 'desc' ? -d : d;
    }
    return 0;
  });
  return out;
}

vi.mock('@/lib/prisma.server', () => {
  const db = {
    $transaction: async (fn: (tx: unknown) => unknown) => fn(db),
    readingHighlight: {
      findMany: async (a: { where?: Row; orderBy?: Row[]; take?: number }) =>
        sorted(h.highlights.filter((r) => matches(r, a.where)), a.orderBy).slice(
          0,
          a.take,
        ),
      // A copy, as a real query returns: the site reads the old visibility before it writes the new one.
      findFirst: async (a: { where: Row }) => {
        const r = h.highlights.find((x) => matches(x, a.where));
        return r ? { ...r } : null;
      },
      update: async (a: { where: { id: string }; data: Row }) => {
        const r = h.highlights.find((x) => x.id === a.where.id)!;
        Object.assign(r, a.data, { updatedAt: new Date('2026-11-22T12:00:00Z') });
        return r;
      },
      delete: async (a: { where: { id: string } }) => {
        h.highlights = h.highlights.filter((x) => x.id !== a.where.id);
      },
    },
    readingHighlightPassage: {
      findMany: async (a: { where: Row }) =>
        h.links.filter((r) => matches(r, a.where)),
      count: async (a: { where: Row }) =>
        h.links.filter((r) => matches(r, a.where)).length,
      create: async (a: { data: Row }) => {
        h.links.push(a.data);
      },
      deleteMany: async (a: { where: Row }) => {
        h.links = h.links.filter((r) => !matches(r, a.where));
      },
    },
    readingPassageStat: {
      upsert: async () => ({ id: 'stat_new' }),
      update: async (a: { where: { id: string }; data: { readers: { increment: number } } }) => {
        h.stats.find((s) => s.id === a.where.id)!.readers =
          (h.stats.find((s) => s.id === a.where.id)!.readers as number) +
          a.data.readers.increment;
      },
      updateMany: async (a: { where: { id: string }; data: { readers: { decrement: number } } }) => {
        const s = h.stats.find((x) => x.id === a.where.id);
        if (s && (s.readers as number) > 0)
          s.readers = (s.readers as number) - a.data.readers.decrement;
      },
    },
    blogPost: {
      findMany: async (a: { where: { slug: { in: string[] } } }) =>
        h.blog.filter((r) => a.where.slug.in.includes(r.slug as string)),
    },
    newsArticle: {
      findMany: async (a: { where: { slug: { in: string[] } } }) =>
        h.news.filter((r) => a.where.slug.in.includes(r.slug as string)),
    },
    libraryDocument: {
      findMany: async (a: { where: { slug: { in: string[] } } }) =>
        h.libDocs.filter((r) => a.where.slug.in.includes(r.slug as string)),
    },
    readingShelfEntry: {
      findUnique: async (a: { where: { userId_docSlug: Row } }) =>
        h.shelves.find((r) => matches(r, a.where.userId_docSlug as Row)) ?? null,
      upsert: async (a: { where: { userId_docSlug: Row }; create: Row; update: Row }) => {
        const found = h.shelves.find((r) => matches(r, a.where.userId_docSlug as Row));
        const now = new Date('2026-11-22T12:00:00Z');
        if (found) return Object.assign(found, a.update, { updatedAt: now });
        const row = { ...a.create, updatedAt: now };
        h.shelves.push(row);
        return row;
      },
      update: async (a: { where: { userId_docSlug: Row }; data: Row }) => {
        const r = h.shelves.find((x) => matches(x, a.where.userId_docSlug as Row))!;
        return Object.assign(r, a.data, { updatedAt: new Date('2026-11-22T12:05:00Z') });
      },
      findMany: async (a: { where: Row }) => h.shelves.filter((r) => matches(r, a.where)),
      deleteMany: async (a: { where: Row }) => {
        const before = h.shelves.length;
        h.shelves = h.shelves.filter((r) => !matches(r, a.where));
        return { count: before - h.shelves.length };
      },
      aggregate: async (a: { where: Row }) => {
        const rows = h.shelves.filter((r) => matches(r, a.where));
        return {
          _count: { _all: rows.length },
          _sum: { pages: rows.reduce((n, r) => n + (r.pages as number), 0) },
        };
      },
    },
    readingGoal: {
      findUnique: async (a: { where: { userId_year: Row } }) =>
        h.goals.find((r) => matches(r, a.where.userId_year)) ?? null,
    },
    readingPrefs: { findUnique: async () => null },
  };
  return { prisma: db };
});

const load = async (p: string) =>
  handlersOf<TestHandler>((await import(p)).Route);
const routes = {
  list: await load('../../../../app/routes/api/v1/me/highlights'),
  one: await load('../../../../app/routes/api/v1/me/highlights/$id'),
  shelves: await load('../../../../app/routes/api/v1/me/shelves'),
  shelf: await load('../../../../app/routes/api/v1/me/shelves/$slug'),
  goal: await load('../../../../app/routes/api/v1/me/reading-goal'),
};
const { KEY_PREFIX } = await import('@/lib/api/developer-auth.server');
const BEARER = `Bearer ${KEY_PREFIX}${'k'.repeat(24)}`;

const call = (
  handler: TestHandler | undefined,
  path: string,
  init: { method?: string; body?: unknown; params?: Record<string, string> } = {},
) =>
  handler!({
    request: new Request(`https://x.test${path}`, {
      method: init.method ?? 'GET',
      headers: { authorization: BEARER, 'content-type': 'application/json' },
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    }),
    params: init.params ?? {},
  });

const hl = (id: string, o: Row = {}): Row => ({
  id,
  userId: 'owner_1',
  docKind: 'library',
  docKey: 'meditations',
  unit: '',
  exact: `quote ${id}`,
  prefix: '',
  suffix: '',
  start: 0,
  end: 5,
  version: '',
  note: null,
  isPublic: false,
  createdAt: new Date('2026-11-01T00:00:00Z'),
  updatedAt: new Date('2026-11-01T00:00:00Z'),
  ...o,
});

beforeEach(() => {
  h.scopes = ['read:reading', 'write:reading'];
  h.highlights = [];
  h.links = [];
  h.stats = [];
  h.shelves = [];
  h.goals = [];
  h.blog = [];
  h.news = [];
  h.libDocs = [{ slug: 'meditations', title: 'Meditations', hidden: false }];
});

describe('scopes', () => {
  it('refuses every endpoint without the scope, and writes with only the read scope', async () => {
    h.scopes = [];
    for (const r of [
      call(routes.list.GET, '/api/v1/me/highlights'),
      call(routes.shelves.GET, '/api/v1/me/shelves'),
      call(routes.goal.GET, '/api/v1/me/reading-goal'),
      call(routes.one.PATCH, '/api/v1/me/highlights/a', { method: 'PATCH', body: { note: 'x' }, params: { id: 'a' } }),
      call(routes.one.DELETE, '/api/v1/me/highlights/a', { method: 'DELETE', params: { id: 'a' } }),
      call(routes.shelf.PUT, '/api/v1/me/shelves/meditations', { method: 'PUT', body: { shelf: 'want' }, params: { slug: 'meditations' } }),
      call(routes.shelf.DELETE, '/api/v1/me/shelves/meditations', { method: 'DELETE', params: { slug: 'meditations' } }),
    ])
      expect((await r).status).toBe(403);
    h.scopes = ['read:reading'];
    h.highlights = [hl('a')];
    const res = await call(routes.one.DELETE, '/api/v1/me/highlights/a', { method: 'DELETE', params: { id: 'a' } });
    expect(res.status).toBe(403);
    expect(h.highlights).toHaveLength(1);
  });

  it('is registered as two scopes, and a wildcard key satisfies them', async () => {
    const { SCOPES, hasScope } = await import('@/lib/api/scopes');
    expect(SCOPES.map((s) => s.id)).toEqual(
      expect.arrayContaining(['read:reading', 'write:reading']),
    );
    expect(hasScope(['read:*'], 'read:reading')).toBe(true);
    expect(hasScope(['write:*'], 'write:reading')).toBe(true);
    expect(hasScope(['write:reading'], 'read:reading')).toBe(false);
  });
});

describe('only the key owner’s rows', () => {
  it('lists only the owner’s highlights and never takes a user id', async () => {
    h.highlights = [hl('mine'), hl('theirs', { userId: 'other_1', note: 'private note' })];
    const res = await call(routes.list.GET, '/api/v1/me/highlights?userId=other_1');
    const body = await res.json();
    expect(body.data.map((x: Row) => x.id)).toEqual(['mine']);
    expect(JSON.stringify(body)).not.toContain('private note');
  });

  it('answers 404 to edit or delete another member’s highlight and leaves it alone', async () => {
    h.highlights = [hl('theirs', { userId: 'other_1', note: 'keep' })];
    const patch = await call(routes.one.PATCH, '/api/v1/me/highlights/theirs', { method: 'PATCH', body: { note: 'x' }, params: { id: 'theirs' } });
    const del = await call(routes.one.DELETE, '/api/v1/me/highlights/theirs', { method: 'DELETE', params: { id: 'theirs' } });
    expect(patch.status).toBe(404);
    expect(del.status).toBe(404);
    expect(h.highlights[0]!.note).toBe('keep');
  });

  it('lists only the owner’s shelf entries', async () => {
    h.shelves = [
      { userId: 'owner_1', docSlug: 'meditations', title: 'Meditations', shelf: 'want', pages: 254, finishedAt: null, updatedAt: new Date() },
      { userId: 'other_1', docSlug: 'odyssey', title: 'The Odyssey', shelf: 'read', pages: 1, finishedAt: null, updatedAt: new Date() },
    ];
    // The site's getMyShelves filters by userId in the query; the stand-in applies it.
    const res = await call(routes.shelves.GET, '/api/v1/me/shelves');
    expect((await res.json()).data.map((e: Row) => e.slug)).toEqual(['meditations']);
  });
});

describe('listing and since sync', () => {
  it('lists newest first and honours kind, hasNote and visibility', async () => {
    h.highlights = [
      hl('a', { createdAt: new Date('2026-11-01T00:00:00Z') }),
      hl('b', { createdAt: new Date('2026-11-03T00:00:00Z'), note: 'n', isPublic: true }),
      hl('c', { createdAt: new Date('2026-11-02T00:00:00Z'), docKind: 'blog', docKey: 'post' }),
    ];
    const ids = async (q: string) =>
      (await (await call(routes.list.GET, `/api/v1/me/highlights${q}`)).json()).data.map((x: Row) => x.id);
    expect(await ids('')).toEqual(['b', 'c', 'a']);
    expect(await ids('?kind=blog')).toEqual(['c']);
    expect(await ids('?hasNote=true')).toEqual(['b']);
    expect(await ids('?visibility=private')).toEqual(['c', 'a']);
  });

  it('pages newest first with a cursor', async () => {
    h.highlights = ['a', 'b', 'c'].map((id, i) =>
      hl(id, { createdAt: new Date(Date.UTC(2026, 10, 1 + i)) }),
    );
    const p1 = await (await call(routes.list.GET, '/api/v1/me/highlights?limit=2')).json();
    expect(p1.data.map((x: Row) => x.id)).toEqual(['c', 'b']);
    const p2 = await (
      await call(routes.list.GET, `/api/v1/me/highlights?limit=2&cursor=${p1.nextCursor}`)
    ).json();
    expect(p2.data.map((x: Row) => x.id)).toEqual(['a']);
    expect(p2.nextCursor).toBeNull();
  });

  it('returns edited highlights by (updatedAt, id) across a page boundary with equal timestamps, and nothing older', async () => {
    const T1 = new Date('2026-11-10T00:00:00Z');
    const T2 = new Date('2026-11-20T00:00:00Z');
    const T3 = new Date('2026-11-21T00:00:00Z');
    h.highlights = [
      hl('old', { updatedAt: T1 }),
      hl('e', { updatedAt: T2 }),
      hl('c', { updatedAt: T2 }),
      hl('d', { updatedAt: T2 }),
      hl('f', { updatedAt: T3 }),
      hl('x', { userId: 'other_1', updatedAt: T3 }),
    ];
    const seen: string[] = [];
    let cursor = '';
    for (let i = 0; i < 6; i++) {
      const res = await call(
        routes.list.GET,
        `/api/v1/me/highlights?since=${T1.toISOString()}&limit=2${cursor}`,
      );
      const page = await res.json();
      seen.push(...page.data.map((x: Row) => x.id));
      if (!page.nextCursor) break;
      cursor = `&cursor=${page.nextCursor}`;
    }
    expect(seen).toEqual(['c', 'd', 'e', 'f']);
  });

  it('rejects a cursor from the other mode and a bad since', async () => {
    h.highlights = ['a', 'b', 'c'].map((id) => hl(id));
    const p1 = await (await call(routes.list.GET, '/api/v1/me/highlights?limit=1')).json();
    const crossed = await call(
      routes.list.GET,
      `/api/v1/me/highlights?since=2020-01-01T00:00:00Z&cursor=${p1.nextCursor}`,
    );
    expect(crossed.status).toBe(400);
    expect((await call(routes.list.GET, '/api/v1/me/highlights?since=yesterday')).status).toBe(400);
    expect((await call(routes.list.GET, '/api/v1/me/highlights?limit=101')).status).toBe(400);
    expect((await call(routes.list.GET, '/api/v1/me/highlights?cursor=zzz')).status).toBe(400);
  });

  it('returns document: null for a removed document and a title and URL for a live one', async () => {
    h.blog = [{ slug: 'live-post', title: 'Live post' }];
    h.highlights = [
      hl('lib'),
      hl('live', { docKind: 'blog', docKey: 'live-post' }),
      hl('gone', { docKind: 'blog', docKey: 'deleted-post', note: 'still mine' }),
      hl('hidden', { docKey: 'hidden-book' }),
      hl('static', { docKey: 'static-book' }),
    ];
    h.libDocs.push({ slug: 'hidden-book', title: 'Hidden', hidden: true });
    const body = await (await call(routes.list.GET, '/api/v1/me/highlights?limit=10')).json();
    const by = Object.fromEntries(body.data.map((x: Row) => [x.id, x]));
    expect(by.gone.document).toBeNull();
    expect(by.gone.note).toBe('still mine');
    expect(by.hidden.document).toBeNull();
    expect(by.live.document).toEqual({ title: 'Live post', url: expect.stringMatching(/\/blog\/live-post$/) });
    expect(by.lib.document.title).toBe('Meditations');
    expect(by.static.document.title).toBe('Static Book');
    expect(Object.keys(by.lib).sort()).toEqual(
      ['createdAt', 'document', 'id', 'isPublic', 'key', 'kind', 'note', 'quote', 'updatedAt'],
    );
  });
});

describe('edits go through the site functions', () => {
  it('patches the note and clears it with null', async () => {
    h.highlights = [hl('a')];
    const res = await call(routes.one.PATCH, '/api/v1/me/highlights/a', { method: 'PATCH', body: { note: 'new' }, params: { id: 'a' } });
    expect(res.status).toBe(200);
    expect((await res.json()).note).toBe('new');
    const cleared = await call(routes.one.PATCH, '/api/v1/me/highlights/a', { method: 'PATCH', body: { note: null }, params: { id: 'a' } });
    expect((await cleared.json()).note).toBeNull();
  });

  it('un-publishing removes the passage count the site made, and publishing alone adds none', async () => {
    h.highlights = [hl('pub', { isPublic: true }), hl('priv')];
    h.stats = [{ id: 's1', readers: 1 }];
    h.links = [{ highlightId: 'pub', statId: 's1', userId: 'owner_1' }];
    const off = await call(routes.one.PATCH, '/api/v1/me/highlights/pub', { method: 'PATCH', body: { isPublic: false }, params: { id: 'pub' } });
    expect((await off.json()).isPublic).toBe(false);
    expect(h.stats[0]!.readers).toBe(0);
    expect(h.links).toHaveLength(0);
    const on = await call(routes.one.PATCH, '/api/v1/me/highlights/priv', { method: 'PATCH', body: { isPublic: true }, params: { id: 'priv' } });
    expect((await on.json()).isPublic).toBe(true);
    expect(h.stats[0]!.readers).toBe(0);
  });

  it('deletes a public highlight and takes back its passage count', async () => {
    h.highlights = [hl('pub', { isPublic: true })];
    h.stats = [{ id: 's1', readers: 1 }];
    h.links = [{ highlightId: 'pub', statId: 's1', userId: 'owner_1' }];
    const res = await call(routes.one.DELETE, '/api/v1/me/highlights/pub', { method: 'DELETE', params: { id: 'pub' } });
    expect(res.status).toBe(204);
    expect(h.highlights).toHaveLength(0);
    expect(h.stats[0]!.readers).toBe(0);
    const again = await call(routes.one.DELETE, '/api/v1/me/highlights/pub', { method: 'DELETE', params: { id: 'pub' } });
    expect(again.status).toBe(404);
  });

  it('validates bodies: empty, unknown fields, over-long notes', async () => {
    h.highlights = [hl('a')];
    for (const body of [{}, { note: 'x'.repeat(2001) }, { isPublic: 'yes' }, { exact: 'rewrite' }]) {
      const res = await call(routes.one.PATCH, '/api/v1/me/highlights/a', { method: 'PATCH', body, params: { id: 'a' } });
      expect(res.status).toBe(400);
    }
    expect(h.highlights[0]!.note).toBeNull();
  });
});

describe('shelves and the goal', () => {
  it('shelving a book as read with finishedAt moves the goal for that year', async () => {
    h.goals = [{ userId: 'owner_1', year: 2026, unit: 'books', target: 3 }];
    const before = await (await call(routes.goal.GET, '/api/v1/me/reading-goal?year=2026')).json();
    expect(before.goal).toMatchObject({ unit: 'books', target: 3, books: 0, done: 0 });
    const put = await call(routes.shelf.PUT, '/api/v1/me/shelves/meditations', {
      method: 'PUT',
      body: { shelf: 'read', finishedAt: '2026-03-01T00:00:00.000Z' },
      params: { slug: 'meditations' },
    });
    expect(put.status).toBe(200);
    expect(await put.json()).toMatchObject({ slug: 'meditations', shelf: 'read', pages: 254, finishedAt: '2026-03-01T00:00:00.000Z' });
    await call(routes.shelf.PUT, '/api/v1/me/shelves/odyssey', {
      method: 'PUT',
      body: { shelf: 'read', finishedAt: '2025-12-31T00:00:00.000Z' },
      params: { slug: 'odyssey' },
    });
    const after = await (await call(routes.goal.GET, '/api/v1/me/reading-goal?year=2026')).json();
    expect(after).toMatchObject({ year: 2026, goal: { books: 1, pages: 254, done: 1 } });
  });

  it('reports goal: null when none is set', async () => {
    const res = await call(routes.goal.GET, '/api/v1/me/reading-goal?year=2026');
    expect(await res.json()).toEqual({ year: 2026, goal: null });
    expect((await call(routes.goal.GET, '/api/v1/me/reading-goal?year=1999')).status).toBe(400);
  });

  it('filters the list by shelf and removes an entry', async () => {
    await call(routes.shelf.PUT, '/api/v1/me/shelves/meditations', { method: 'PUT', body: { shelf: 'want' }, params: { slug: 'meditations' } });
    await call(routes.shelf.PUT, '/api/v1/me/shelves/odyssey', { method: 'PUT', body: { shelf: 'reading' }, params: { slug: 'odyssey' } });
    const reading = await (await call(routes.shelves.GET, '/api/v1/me/shelves?shelf=reading')).json();
    expect(reading.data.map((e: Row) => e.slug)).toEqual(['odyssey']);
    expect((await call(routes.shelves.GET, '/api/v1/me/shelves?shelf=nope')).status).toBe(400);
    const del = await call(routes.shelf.DELETE, '/api/v1/me/shelves/odyssey', { method: 'DELETE', params: { slug: 'odyssey' } });
    expect(del.status).toBe(204);
    expect((await call(routes.shelf.DELETE, '/api/v1/me/shelves/odyssey', { method: 'DELETE', params: { slug: 'odyssey' } })).status).toBe(404);
  });

  it('answers 404 for an unknown library slug and 400 for a bad body', async () => {
    const unknown = await call(routes.shelf.PUT, '/api/v1/me/shelves/no-such-book', { method: 'PUT', body: { shelf: 'want' }, params: { slug: 'no-such-book' } });
    expect(unknown.status).toBe(404);
    expect(h.shelves).toHaveLength(0);
    const cases = [
      { shelf: 'finished' },
      { shelf: 'want', finishedAt: '2026-03-01T00:00:00.000Z' },
      { shelf: 'read', finishedAt: '2999-01-01T00:00:00.000Z' },
      { shelf: 'read', finishedAt: 'not a date' },
    ];
    for (const body of cases) {
      const res = await call(routes.shelf.PUT, '/api/v1/me/shelves/meditations', { method: 'PUT', body, params: { slug: 'meditations' } });
      expect(res.status).toBe(400);
    }
  });
});

describe('write budget', () => {
  it('draws on a per-member write budget of its own', async () => {
    const { writeBudgetExceeded } = await import('@/lib/api/v1/reading.server');
    expect(writeBudgetExceeded('budget_user')).toBe(false);
    let refusedAt = 0;
    for (let i = 2; i <= 1000 && !refusedAt; i++)
      if (writeBudgetExceeded('budget_user')) refusedAt = i;
    expect(refusedAt).toBeGreaterThan(1);
    expect(refusedAt).toBeLessThan(1000);
    expect(writeBudgetExceeded('another_member')).toBe(false);
  });
});
