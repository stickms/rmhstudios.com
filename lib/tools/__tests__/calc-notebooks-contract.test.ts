import { beforeEach, describe, expect, it, vi } from 'vitest';
import { assertJsonSafe } from '@/lib/db/query-shape';
import {
  createCalcNotebookApi,
  deleteCalcNotebookApi,
  listCalcNotebooksApi,
  updateCalcNotebookApi,
} from '@/lib/tools/calc-notebooks.contract';
import { calcNotebookSchema } from '@/lib/tools/schemas';

/**
 * s15-08: the four notebook calls are declared as contracts and bound with `implement()`. The routes still answer as
 * they did (same paths, bodies, statuses and `private, no-store` on the list) and every one stays scoped to the
 * caller: another member's notebook is a 404 and is never changed or removed.
 */

type Row = Record<string, unknown>;
const h = vi.hoisted(() => ({
  notebooks: [] as Row[],
  nextId: 1,
  options: new Map<string, Record<string, unknown>>(),
}));

const matches = (row: Row, where: Row) => Object.entries(where).every(([k, v]) => row[k] === v);
const pick = (row: Row, select?: Record<string, boolean>) =>
  select ? Object.fromEntries(Object.keys(select).map((k) => [k, row[k]])) : { ...row };

const calcNotebook = {
  findMany: vi.fn(
    async ({
      where,
      orderBy,
      take,
      select,
    }: {
      where: Row;
      orderBy: Row;
      take: number;
      select: Record<string, boolean>;
    }) => {
      expect(orderBy).toEqual({ updatedAt: 'desc' });
      return h.notebooks
        .filter((r) => matches(r, where))
        .slice(0, take)
        .map((r) => pick(r, select));
    },
  ),
  count: vi.fn(async ({ where }: { where: Row }) => h.notebooks.filter((r) => matches(r, where)).length),
  create: vi.fn(async ({ data, select }: { data: Row; select?: Record<string, boolean> }) => {
    const row = { id: `n${h.nextId++}`, updatedAt: new Date('2027-01-05T00:00:00Z'), ...data };
    h.notebooks.push(row);
    return pick(row, select);
  }),
  updateMany: vi.fn(async ({ where, data }: { where: Row; data: Row }) => {
    const hit = h.notebooks.filter((r) => matches(r, where));
    for (const r of hit) Object.assign(r, data);
    return { count: hit.length };
  }),
  deleteMany: vi.fn(async ({ where }: { where: Row }) => {
    const gone = h.notebooks.filter((r) => matches(r, where));
    h.notebooks = h.notebooks.filter((r) => !matches(r, where));
    return { count: gone.length };
  }),
};

vi.mock('@/lib/prisma.server', async () => {
  const { shapeChecked } = await import('@/lib/db/query-shape');
  return { prisma: shapeChecked({ calcNotebook }) };
});
vi.mock('@/lib/api/handler.server', () => ({
  defineHandler: (options: Record<string, unknown>, fn: Record<string, unknown>) => {
    h.options.set(String(options.label), options);
    return fn;
  },
}));

type Handler = (a: { userId: string; params?: Record<string, string>; body?: unknown }) => Promise<Response>;
async function routes() {
  const list = (await import('@/lib/tools/api/calc-notebooks.server')).route.handlers as Record<string, Handler>;
  const one = (await import('@/lib/tools/api/calc-notebooks.$id.server')).route.handlers as Record<string, Handler>;
  return { list, one };
}
async function json(res: Response) {
  const body = (await res.json()) as Record<string, unknown>;
  assertJsonSafe(body);
  return body;
}

beforeEach(() => {
  h.notebooks = [
    { id: 'mine', userId: 'u1', title: 'Rent', body: 'rent = 1', updatedAt: new Date('2027-01-01T00:00:00Z') },
    { id: 'theirs', userId: 'u2', title: 'Theirs', body: 'secret', updatedAt: new Date('2027-01-02T00:00:00Z') },
  ];
  h.nextId = 1;
  vi.clearAllMocks();
});

describe('the contracts', () => {
  it('keep the paths and methods the tab always called', () => {
    expect([listCalcNotebooksApi.method, listCalcNotebooksApi.path]).toEqual(['GET', '/api/calc-notebooks']);
    expect([createCalcNotebookApi.method, createCalcNotebookApi.path]).toEqual(['POST', '/api/calc-notebooks']);
    expect([updateCalcNotebookApi.method, updateCalcNotebookApi.path]).toEqual(['PUT', '/api/calc-notebooks/$id']);
    expect([deleteCalcNotebookApi.method, deleteCalcNotebookApi.path]).toEqual(['DELETE', '/api/calc-notebooks/$id']);
  });

  it('are bound with implement(): each handler is labelled by its contract and the writes validate the same schema', async () => {
    await routes();
    expect(h.options.get('POST /api/calc-notebooks')).toMatchObject({ rateLimit: 'write', body: calcNotebookSchema });
    expect(h.options.get('PUT /api/calc-notebooks/$id')).toMatchObject({
      rateLimit: 'write',
      body: calcNotebookSchema,
    });
    expect(h.options.get('GET /api/calc-notebooks')).toMatchObject({ rateLimit: 'read' });
    expect(h.options.get('DELETE /api/calc-notebooks/$id')).toMatchObject({ rateLimit: 'write' });
  });
});

describe('the routes keep ownership', () => {
  it('the list is the caller’s own, private and uncached', async () => {
    const { list } = await routes();
    const res = await list.GET!({ userId: 'u1' });
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
    const body = await json(res);
    expect((body.notebooks as Row[]).map((n) => n.id)).toEqual(['mine']);
    expect(calcNotebook.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'u1' } }));
  });

  it('a created notebook is the caller’s and answers 201 with its id', async () => {
    const { list } = await routes();
    const res = await list.POST!({ userId: 'u1', body: { title: 'New', body: 'x = 1' } });
    expect(res.status).toBe(201);
    const { id } = (await json(res)) as { id: string };
    expect(h.notebooks.find((n) => n.id === id)).toMatchObject({ userId: 'u1', title: 'New', body: 'x = 1' });
  });

  it('a notebook past the cap keeps its old refusal', async () => {
    const { list } = await routes();
    const { MAX_NOTEBOOKS } = await import('@/lib/tools/schemas');
    h.notebooks = Array.from({ length: MAX_NOTEBOOKS }, (_, i) => ({
      id: `n${i}`,
      userId: 'u1',
      title: 't',
      body: '',
      updatedAt: new Date(),
    }));
    const res = await list.POST!({ userId: 'u1', body: { title: 'One more', body: '' } });
    expect(res.status).toBe(409);
    expect(await json(res)).toEqual({ error: 'Limit reached' });
  });

  it('PUT edits the caller’s notebook and answers { ok: true }', async () => {
    const { one } = await routes();
    const res = await one.PUT!({ userId: 'u1', params: { id: 'mine' }, body: { title: 'Rent 2', body: 'rent = 2' } });
    expect(await json(res)).toEqual({ ok: true });
    expect(h.notebooks.find((n) => n.id === 'mine')).toMatchObject({ title: 'Rent 2', body: 'rent = 2' });
  });

  it('PUT of another member’s notebook is a 404 and changes nothing', async () => {
    const { one } = await routes();
    const res = await one.PUT!({ userId: 'u1', params: { id: 'theirs' }, body: { title: 'Mine', body: 'taken' } });
    expect(res.status).toBe(404);
    expect(await json(res)).toEqual({ error: 'Not found' });
    expect(h.notebooks.find((n) => n.id === 'theirs')).toMatchObject({ title: 'Theirs', body: 'secret' });
    expect(calcNotebook.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'theirs', userId: 'u1' } }),
    );
  });

  it('DELETE removes the caller’s notebook, and another member’s is a 404 that removes nothing', async () => {
    const { one } = await routes();
    const other = await one.DELETE!({ userId: 'u1', params: { id: 'theirs' } });
    expect(other.status).toBe(404);
    expect(h.notebooks.map((n) => n.id).sort()).toEqual(['mine', 'theirs']);
    const own = await one.DELETE!({ userId: 'u1', params: { id: 'mine' } });
    expect(await json(own)).toEqual({ ok: true });
    expect(h.notebooks.map((n) => n.id)).toEqual(['theirs']);
  });
});
