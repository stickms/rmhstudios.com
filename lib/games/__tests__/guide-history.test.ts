import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => {
  const created: unknown[] = [];
  return {
    created,
    guide: null as null | Record<string, unknown>,
    revisions: [] as Array<Record<string, unknown>>,
    guideUpdates: [] as unknown[],
    sql: [] as string[],
  };
});

vi.mock('@/lib/prisma.server', () => {
  const gameGuide = {
    findUnique: vi.fn(async ({ where, select }: { where: { id: string }; select: Record<string, boolean> }) => {
      if (!db.guide || db.guide.id !== where.id) return null;
      return Object.fromEntries(Object.keys(select).map((k) => [k, db.guide![k]]));
    }),
    update: vi.fn(async (args: unknown) => {
      db.guideUpdates.push(args);
      const data = (args as { data: { body?: string } }).data;
      if (data.body !== undefined && db.guide) db.guide.body = data.body;
    }),
    findMany: vi.fn(async () => []),
  };
  const gameGuideRevision = {
    findFirst: vi.fn(
      async ({ where }: { where: { id?: string; guideId: string; createdAt?: { lt: Date } } }) =>
        db.revisions
          .filter((r) => r.guideId === where.guideId)
          .filter((r) => (where.id ? r.id === where.id : true))
          .filter((r) => (where.createdAt ? (r.createdAt as Date) < where.createdAt.lt : true))
          .sort((a, b) => (b.createdAt as Date).getTime() - (a.createdAt as Date).getTime())[0] ?? null,
    ),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      db.created.push(data);
      db.revisions.push({ id: `r${db.revisions.length + 1}`, createdAt: new Date('2026-12-01T00:00:00Z'), ...data });
    }),
    count: vi.fn(async () => 1),
    findMany: vi.fn(async () => []),
    deleteMany: vi.fn(async () => ({ count: 0 })),
  };
  const prisma = {
    gameGuide,
    gameGuideRevision,
    $queryRaw: vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.join('?');
      db.sql.push(text);
      if (text.includes('"game_guide_revision"')) {
        return db.revisions
          .filter((r) => r.guideId === values[0])
          .map((r): Record<string, unknown> => ({ ...r, length: (r.body as string).length }))
          .sort((a, b) => (b.createdAt as Date).getTime() - (a.createdAt as Date).getTime());
      }
      return [{ length: String(db.guide?.body ?? '').length }];
    }),
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({ gameGuide, gameGuideRevision })),
  };
  return { prisma };
});
vi.mock('@/lib/arcade/updates-jobs.server', () => ({ enqueueGameUpdateFanout: vi.fn() }));
vi.mock('@/lib/cached.server', () => ({ cached: vi.fn(), invalidateCached: vi.fn() }));

const history = await import('@/lib/games/guide-history.server');

const author = { userId: 'author', isAdmin: false };
const stranger = { userId: 'other', isAdmin: false };
const anonymous = { userId: null, isAdmin: false };
const admin = { userId: 'admin', isAdmin: true };

beforeEach(() => {
  db.created.length = 0;
  db.guideUpdates.length = 0;
  db.sql.length = 0;
  db.guide = {
    id: 'g1',
    authorId: 'author',
    gameId: 'rmhtype',
    title: 'A guide',
    published: true,
    createdAt: new Date('2026-10-01T00:00:00Z'),
    body: 'current text here',
  };
  db.revisions = [
    { id: 'r1', guideId: 'g1', note: 'first edit', body: 'v1', createdAt: new Date('2026-10-05T00:00:00Z') },
    { id: 'r2', guideId: 'g1', note: null, body: 'version two!', createdAt: new Date('2026-10-09T00:00:00Z') },
    { id: 'x1', guideId: 'other-guide', note: null, body: 'elsewhere', createdAt: new Date('2026-10-06T00:00:00Z') },
  ];
});

describe('guide history: who can read it', () => {
  it('lists revisions for the author, newest first, with size changes and no bodies', async () => {
    const res = await history.listGuideRevisions(author, 'g1');
    expect(res?.canRestore).toBe(true);
    expect(res?.currentLength).toBe('current text here'.length);
    expect(res?.revisions.map((r) => r.id)).toEqual(['r2', 'r1']);
    // r2 ('version two!', 12) was replaced by the current text (17); r1 ('v1', 2) by r2 (12).
    expect(res?.revisions.map((r) => r.delta)).toEqual([5, 10]);
    expect(res?.revisions[0]).not.toHaveProperty('body');
  });

  it('gives another member and a signed-out viewer nothing', async () => {
    expect(await history.listGuideRevisions(stranger, 'g1')).toBeNull();
    expect(await history.listGuideRevisions(anonymous, 'g1')).toBeNull();
    expect(await history.getGuideRevision(stranger, 'g1', 'r1')).toBeNull();
    expect(await history.getGuideRevision(anonymous, 'g1', 'r1')).toBeNull();
    expect(await history.getGuideForHistory(stranger, 'rmhtype', 'g1')).toBeNull();
  });

  it('lets an admin read the history but not restore', async () => {
    const res = await history.listGuideRevisions(admin, 'g1');
    expect(res?.canRestore).toBe(false);
    expect((await history.getGuideRevision(admin, 'g1', 'r1'))?.body).toBe('v1');
    expect(await history.restoreGuideRevision(admin, 'g1', 'r1')).toBe('forbidden');
    expect(db.created).toHaveLength(0);
  });

  it('is a 404 for a revision of another guide, and for a missing guide', async () => {
    expect(await history.getGuideRevision(author, 'g1', 'x1')).toBeNull();
    expect(await history.restoreGuideRevision(author, 'g1', 'x1')).toBe('not_found');
    expect(await history.listGuideRevisions(author, 'nope')).toBeNull();
  });

  it('keeps the history page to the right game', async () => {
    expect(await history.getGuideForHistory(author, 'chess', 'g1')).toBeNull();
    expect((await history.getGuideForHistory(author, 'rmhtype', 'g1'))?.canRestore).toBe(true);
  });
});

describe('guide history: restore', () => {
  it('writes the current body as a revision with the note, then makes the version current', async () => {
    expect(await history.restoreGuideRevision(author, 'g1', 'r1')).toBe('ok');
    expect(db.created).toEqual([
      { guideId: 'g1', body: 'current text here', note: 'Restored the version of 2026-10-01' },
    ]);
    expect(db.guide?.body).toBe('v1');
    // The replaced text is still in history.
    expect(db.revisions.some((r) => r.body === 'current text here')).toBe(true);
  });

  it('dates a restore by when the version became current (the edit before it, else the guide)', async () => {
    await history.restoreGuideRevision(author, 'g1', 'r2');
    expect(db.created[0]).toMatchObject({ note: 'Restored the version of 2026-10-05' });
  });

  it('never deletes history', () => {
    const src = readFileSync(resolve(__dirname, '../guide-history.server.ts'), 'utf8');
    expect(src).not.toMatch(/gameGuideRevision\.(delete|deleteMany|update|updateMany)\b/);
    expect(src).toMatch(/updateGuide\(/);
  });
});

describe('guide history: raw SQL', () => {
  it('uses the real table names and quoted camelCase columns', async () => {
    await history.listGuideRevisions(author, 'g1');
    const sql = db.sql.join('\n');
    expect(sql).toContain('FROM "game_guide_revision"');
    expect(sql).toContain('"guideId"');
    expect(sql).toContain('"createdAt"');
    expect(sql).toContain('FROM "game_guide"');
    const schema = readFileSync(resolve(__dirname, '../../../prisma/schema/games.prisma'), 'utf8');
    expect(schema).toContain('@@map("game_guide_revision")');
    expect(schema).toContain('@@map("game_guide")');
    expect(sql).not.toMatch(/"body"\s*,|SELECT[^;]*\*/);
  });
});

describe('guide history: every read path applies the rule', () => {
  it('each listed path goes through the history module', () => {
    for (const path of history.GUIDE_HISTORY_READ_PATHS) {
      const src = readFileSync(resolve(__dirname, '../../..', path), 'utf8');
      expect(src, path).toMatch(/from '@\/lib\/games\/guide-history\.server'/);
    }
  });
  it('the restore endpoint is wired through the history module too', () => {
    const src = readFileSync(resolve(__dirname, '../api/guides.$id.revisions.$revisionId.restore.server.ts'), 'utf8');
    expect(src).toContain('restoreGuideRevision');
  });
});
