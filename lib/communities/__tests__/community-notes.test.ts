/**
 * s06-02 community moderator notes. The endpoints are driven through their registered handlers with a faked Prisma
 * (stateful for notes) and a faked session. Raw SQL is asserted against the real `@@map` table and quoted columns.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface Note {
  id: string;
  communityId: string;
  subjectId: string;
  authorId: string | null;
  body: string;
  banId: string | null;
  modItemId: string | null;
  createdAt: Date;
  editedAt: Date | null;
  deletedAt: Date | null;
  deletedById: string | null;
}

const h = vi.hoisted(() => ({
  userId: 'mod-a' as string,
  /** `${communityId}:${userId}` -> role */
  roles: new Map<string, string>(),
  notes: [] as Array<Record<string, unknown>>,
  calls: [] as string[],
  logged: [] as Array<Record<string, unknown>>,
  rawSql: [] as string[],
  groupBy: 0,
  now: Date.now(),
  seq: 0,
}));

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: vi.fn(async () => ({
        user: { id: h.userId },
        session: { id: 's1', userId: h.userId },
      })),
    },
  },
}));

vi.mock('@/lib/prisma.server', () => {
  const live = () => h.notes as unknown as Note[];
  const matches = (n: Note, where: Record<string, unknown>) => {
    for (const k of ['id', 'communityId', 'subjectId', 'authorId'] as const) {
      if (typeof where[k] === 'string' && (n as unknown as Record<string, unknown>)[k] !== where[k]) return false;
    }
    if ('deletedAt' in where && where.deletedAt === null && n.deletedAt !== null) return false;
    const inSubj = (where.subjectId as { in?: string[] } | undefined)?.in;
    if (inSubj && !inSubj.includes(n.subjectId)) return false;
    return true;
  };
  const prisma: Record<string, unknown> = {
    community: {
      findUnique: async ({ where }: { where: { slug: string } }) => {
        const id = where.slug === 'a' ? 'cA' : where.slug === 'b' ? 'cB' : null;
        if (!id) return null;
        const role = h.roles.get(`${id}:${h.userId}`);
        return { id, slug: where.slug, name: where.slug, isPrivate: false, members: role ? [{ role }] : [] };
      },
    },
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => (where.id === 'ghost' ? null : { id: where.id }),
      findMany: async ({ where }: { where: { id: { in: string[] } } }) =>
        where.id.in.map((id) => ({ id, name: id, handle: id })),
    },
    communityBan: { findFirst: async () => ({ id: 'ban1' }) },
    communityModItem: { findFirst: async () => ({ id: 'item1' }) },
    communityMemberNote: {
      findMany: async ({ where }: { where: Record<string, unknown> }) =>
        live()
          .filter((n) => matches(n, where))
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
      findFirst: async ({ where }: { where: Record<string, unknown> }) => live().find((n) => matches(n, where)) ?? null,
      count: async ({ where }: { where: Record<string, unknown> }) => live().filter((n) => matches(n, where)).length,
      create: async ({ data }: { data: Partial<Note> }) => {
        h.calls.push('create');
        const row = {
          id: `n${++h.seq}`,
          editedAt: null,
          deletedAt: null,
          deletedById: null,
          createdAt: new Date(h.now),
          ...data,
        } as Note;
        h.notes.push(row as unknown as Record<string, unknown>);
        return row;
      },
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Partial<Note> }) => {
        const rows = live().filter((n) => matches(n, where));
        for (const r of rows) Object.assign(r, data);
        return { count: rows.length };
      },
      groupBy: async ({ where }: { where: Record<string, unknown> }) => {
        h.groupBy++;
        const by = new Map<string, number>();
        for (const n of live().filter((x) => matches(x, where))) by.set(n.subjectId, (by.get(n.subjectId) ?? 0) + 1);
        return [...by].map(([subjectId, c]) => ({ subjectId, _count: { _all: c } }));
      },
    },
    // The one raw statement: the edit. The fake applies the same conditions the SQL states, with a controllable "database clock".
    $queryRaw: async (strings: TemplateStringsArray, ...v: unknown[]) => {
      h.rawSql.push(strings.join('?'));
      const [body, noteId, communityId, viewerId, secs] = v as [string, string, string, string, number];
      const row = live().find(
        (n) =>
          n.id === noteId &&
          n.communityId === communityId &&
          n.authorId === viewerId &&
          n.deletedAt === null &&
          n.createdAt.getTime() > h.now - secs * 1000,
      );
      if (!row) return [];
      row.body = body;
      row.editedAt = new Date(h.now);
      return [row];
    },
  };
  prisma.$transaction = async (fn: (tx: unknown) => unknown) => fn(prisma);
  return { prisma };
});
vi.mock('@/lib/db/advisory-lock.server', () => ({
  lockKey: async (_tx: unknown, key: string) => {
    h.calls.push(`lock:${key}`);
  },
}));
vi.mock('@/lib/communities/modlog.server', () => ({
  logModAction: async (_tx: unknown, input: Record<string, unknown>) => {
    h.calls.push(`log:${String(input.action)}`);
    h.logged.push(input);
    return 1n;
  },
}));

const { route: listRoute } = await import('@/lib/communities/api/communities.$slug.notes.$userId.server');
const { route: itemRoute } = await import('@/lib/communities/api/communities.$slug.notes.$userId.$noteId.server');
const { route: countsRoute } = await import('@/lib/communities/api/communities.$slug.notes.counts.server');

const call = (
  r: {
    handlers: Record<
      string,
      ((a: { request: Request; params: Record<string, string> }) => Promise<Response> | Response) | undefined
    >;
  },
  method: string,
  params: Record<string, string>,
  opts: { body?: unknown; qs?: string } = {},
) =>
  r.handlers[method]!({
    request: new Request(`https://rmhstudios.com/api/x${opts.qs ?? ''}`, {
      method,
      headers: {
        cookie: 'better-auth.session_token=t',
        'x-forwarded-for': '203.0.113.9',
        'content-type': 'application/json',
      },
      ...(opts.body === undefined ? {} : { body: JSON.stringify(opts.body) }),
    }),
    params,
  });

const seedNote = (over: Partial<Note> = {}): Note => {
  const n = {
    id: `n${++h.seq}`,
    communityId: 'cA',
    subjectId: 'member-1',
    authorId: 'mod-a',
    body: 'warned about spoilers',
    banId: null,
    modItemId: null,
    createdAt: new Date(h.now),
    editedAt: null,
    deletedAt: null,
    deletedById: null,
    ...over,
  };
  h.notes.push(n as unknown as Record<string, unknown>);
  return n;
};

beforeEach(() => {
  h.userId = 'mod-a';
  h.roles = new Map([
    ['cA:mod-a', 'MOD'],
    ['cA:mod-b', 'MOD'],
    ['cA:owner', 'ADMIN'],
    ['cA:member-1', 'MEMBER'],
    ['cB:mod-c', 'MOD'],
  ]);
  h.notes.length = 0;
  h.calls.length = 0;
  h.logged.length = 0;
  h.rawSql.length = 0;
  h.groupBy = 0;
  h.now = Date.now();
  h.seq = 0;
});

describe('every endpoint is moderators only', () => {
  it('a plain member and a stranger get 403, an unknown community 404, and nothing is written', async () => {
    const note = seedNote();
    for (const who of ['member-1', 'stranger']) {
      h.userId = who;
      const results = await Promise.all([
        call(listRoute, 'GET', { slug: 'a', userId: 'member-1' }),
        call(listRoute, 'POST', { slug: 'a', userId: 'member-1' }, { body: { body: 'hi' } }),
        call(itemRoute, 'PATCH', { slug: 'a', userId: 'member-1', noteId: note.id }, { body: { body: 'x' } }),
        call(itemRoute, 'DELETE', { slug: 'a', userId: 'member-1', noteId: note.id }),
        call(countsRoute, 'GET', { slug: 'a' }, { qs: '?userIds=member-1' }),
      ]);
      expect(results.map((r) => r.status)).toEqual([403, 403, 403, 403, 403]);
    }
    expect((await call(listRoute, 'GET', { slug: 'nope', userId: 'member-1' })).status).toBe(404);
    expect(h.notes).toHaveLength(1);
    expect(note.deletedAt).toBeNull();
  });

  it('a moderator lists, newest first, only live notes of that community and member', async () => {
    seedNote({ id: 'old', createdAt: new Date(h.now - 5000), body: 'old' });
    seedNote({ id: 'new', body: 'new' });
    seedNote({ id: 'gone', deletedAt: new Date(), body: 'gone' });
    seedNote({ id: 'other-community', communityId: 'cB' });
    seedNote({ id: 'other-member', subjectId: 'member-2' });
    const res = await call(listRoute, 'GET', { slug: 'a', userId: 'member-1' });
    const json = (await res.json()) as { notes: Array<{ id: string }> };
    expect(json.notes.map((n) => n.id)).toEqual(['new', 'old']);
  });
});

describe('another community', () => {
  it('a moderator of community B gets 404 for a note id of community A, on edit and delete', async () => {
    const note = seedNote({ authorId: 'mod-c' });
    h.userId = 'mod-c';
    const edit = await call(
      itemRoute,
      'PATCH',
      { slug: 'b', userId: 'member-1', noteId: note.id },
      { body: { body: 'x' } },
    );
    const del = await call(itemRoute, 'DELETE', { slug: 'b', userId: 'member-1', noteId: note.id });
    expect(edit.status).toBe(404);
    expect(del.status).toBe(404);
    expect(note.deletedAt).toBeNull();
    expect(note.body).toBe('warned about spoilers');
    expect(h.logged).toHaveLength(0);
  });
});

describe('the cap', () => {
  it('takes the member lock, then counts: 49 live notes allow the 50th, 50 refuse the 51st (deleted ones do not count)', async () => {
    for (let i = 0; i < 49; i++) seedNote();
    seedNote({ deletedAt: new Date() });
    const ok = await call(listRoute, 'POST', { slug: 'a', userId: 'member-1' }, { body: { body: 'the 50th' } });
    expect(ok.status).toBe(201);
    expect(h.calls.slice(0, 2)).toEqual(['lock:community-note:cA:member-1', 'create']);
    h.calls.length = 0;
    const refused = await call(listRoute, 'POST', { slug: 'a', userId: 'member-1' }, { body: { body: 'the 51st' } });
    expect(refused.status).toBe(409);
    expect(h.calls).toEqual(['lock:community-note:cA:member-1']);
    expect(h.notes.filter((n) => !(n as unknown as Note).deletedAt)).toHaveLength(50);
  });

  it('validates the text: empty and over 500 characters are 400', async () => {
    const empty = await call(listRoute, 'POST', { slug: 'a', userId: 'member-1' }, { body: { body: '   ' } });
    const long = await call(listRoute, 'POST', { slug: 'a', userId: 'member-1' }, { body: { body: 'x'.repeat(501) } });
    expect(empty.status).toBe(400);
    expect(long.status).toBe(400);
    expect(h.notes).toHaveLength(0);
  });

  it('a note about someone who does not exist is 404', async () => {
    const res = await call(listRoute, 'POST', { slug: 'a', userId: 'ghost' }, { body: { body: 'hi' } });
    expect(res.status).toBe(404);
  });
});

describe('editing', () => {
  it('the author edits inside 15 minutes and the note is marked edited', async () => {
    const note = seedNote({ createdAt: new Date(h.now - 14 * 60_000) });
    const res = await call(
      itemRoute,
      'PATCH',
      { slug: 'a', userId: 'member-1', noteId: note.id },
      { body: { body: 'fixed' } },
    );
    expect(res.status).toBe(200);
    expect(note.body).toBe('fixed');
    expect(note.editedAt).not.toBeNull();
  });

  it('after 15 minutes the edit is refused (409) and the text is unchanged', async () => {
    const note = seedNote({ createdAt: new Date(h.now - 16 * 60_000) });
    const res = await call(
      itemRoute,
      'PATCH',
      { slug: 'a', userId: 'member-1', noteId: note.id },
      { body: { body: 'late' } },
    );
    expect(res.status).toBe(409);
    expect(note.body).toBe('warned about spoilers');
  });

  it('another moderator cannot edit the note (403), even inside the window', async () => {
    const note = seedNote();
    h.userId = 'mod-b';
    const res = await call(
      itemRoute,
      'PATCH',
      { slug: 'a', userId: 'member-1', noteId: note.id },
      { body: { body: 'mine now' } },
    );
    expect(res.status).toBe(403);
    expect(note.body).toBe('warned about spoilers');
  });

  it('the edit window is judged by the database in one statement, on the real table and quoted columns', async () => {
    const note = seedNote();
    await call(itemRoute, 'PATCH', { slug: 'a', userId: 'member-1', noteId: note.id }, { body: { body: 'fixed' } });
    const sql = h.rawSql.join('\n');
    expect(sql).toContain('UPDATE "community_member_note"');
    for (const col of ['"body"', '"editedAt"', '"id"', '"communityId"', '"authorId"', '"deletedAt"', '"createdAt"']) {
      expect(sql).toContain(col);
    }
    expect(sql).toMatch(/"createdAt" > now\(\) - make_interval/);
    expect(sql).toContain('RETURNING');
    const prismaSchema = readFileSync(join(process.cwd(), 'prisma/schema/communities.prisma'), 'utf8');
    expect(prismaSchema).toContain('@@map("community_member_note")');
  });
});

describe('deleting', () => {
  it('any moderator soft-deletes and the deletion is logged as note_deleted, in the same transaction', async () => {
    const note = seedNote({ authorId: 'mod-a' });
    h.userId = 'mod-b';
    const res = await call(itemRoute, 'DELETE', { slug: 'a', userId: 'member-1', noteId: note.id });
    expect(res.status).toBe(200);
    expect(note.deletedAt).toBeInstanceOf(Date);
    expect(note.deletedById).toBe('mod-b');
    expect(h.logged).toHaveLength(1);
    expect(h.logged[0]).toMatchObject({
      communityId: 'cA',
      actorId: 'mod-b',
      action: 'note_deleted',
      targetUserId: 'member-1',
    });
    // The log never carries the note text.
    expect(JSON.stringify(h.logged[0])).not.toContain('spoilers');
    const again = await call(itemRoute, 'DELETE', { slug: 'a', userId: 'member-1', noteId: note.id });
    expect(again.status).toBe(404);
    expect(h.logged).toHaveLength(1);
  });
});

describe('counts', () => {
  it('is one grouped query and answers zero for members without notes', async () => {
    seedNote({ subjectId: 'm1' });
    seedNote({ subjectId: 'm1' });
    seedNote({ subjectId: 'm2', deletedAt: new Date() });
    seedNote({ subjectId: 'm3', communityId: 'cB' });
    const res = await call(countsRoute, 'GET', { slug: 'a' }, { qs: '?userIds=m1,m2,m3,m4' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ counts: { m1: 2, m2: 0, m3: 0, m4: 0 } });
    expect(h.groupBy).toBe(1);
  });

  it('accepts 50 ids and refuses 51 (400)', async () => {
    const ids = (n: number) => Array.from({ length: n }, (_, i) => `u${i}`).join(',');
    expect((await call(countsRoute, 'GET', { slug: 'a' }, { qs: `?userIds=${ids(50)}` })).status).toBe(200);
    expect((await call(countsRoute, 'GET', { slug: 'a' }, { qs: `?userIds=${ids(51)}` })).status).toBe(400);
    expect((await call(countsRoute, 'GET', { slug: 'a' }, { qs: '' })).status).toBe(400);
  });
});

describe('notes stay private', () => {
  const ROOT = process.cwd();
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      if (f === 'node_modules' || f === '.git' || f === '__tests__') return [];
      return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(f) ? [p] : [];
    });

  it('only the note endpoints, the erasure and the deletion module import the notes server module', () => {
    const importers = ['app', 'lib', 'components', 'features', 'server', 'hooks']
      .flatMap((d) => walk(join(ROOT, d)))
      .filter((p) => /member-notes\.server['"]/.test(readFileSync(p, 'utf8')))
      .map((p) => relative(ROOT, p))
      .sort();
    expect(importers).toEqual([
      'lib/account/deletion.server.ts',
      'lib/communities/api/communities.$slug.notes.$userId.$noteId.server.ts',
      'lib/communities/api/communities.$slug.notes.$userId.server.ts',
      'lib/communities/api/communities.$slug.notes.counts.server.ts',
    ]);
  });

  it('nothing in the account export or the developer API reads the notes table', () => {
    const files = [...walk(join(ROOT, 'lib/account')), ...walk(join(ROOT, 'app/routes/api/v1'))].filter(
      (p) => !p.includes('deletion.server') && !p.includes('/__tests__/'),
    );
    for (const f of files) expect(readFileSync(f, 'utf8')).not.toMatch(/communityMemberNote|member-notes/);
  });
});
