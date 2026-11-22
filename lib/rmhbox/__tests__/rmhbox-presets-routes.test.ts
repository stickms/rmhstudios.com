/**
 * The HTTP layer of /api/rmhbox/presets: sign-in, zod validation (400), another member's
 * preset (404), duplicate name (409) and the per-game cap (422). Prisma is a small fake.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handlersOf } from '@/lib/__tests__/api-handlers-of';

interface Row {
  id: string;
  userId: string;
  minigameId: string;
  name: string;
  values: unknown;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const db = vi.hoisted(() => ({ viewer: 'alice' as string | null, rows: [] as Row[], seq: 0 }));

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: async () => (db.viewer ? { user: { id: db.viewer, isAdmin: false }, session: { id: 's' } } : null),
    },
  },
}));
vi.mock('@/lib/rate-limit.server', () => ({ withRateLimitAsync: async () => null }));
vi.mock('@/lib/db/advisory-lock.server', () => ({ lockKey: async () => undefined }));

type Where = {
  id?: string;
  userId?: string;
  minigameId?: string;
  isDefault?: boolean;
  NOT?: { id: string };
  userId_minigameId_name?: { userId: string; minigameId: string; name: string };
};
const match = (r: Row, w: Where = {}) =>
  (w.id === undefined || r.id === w.id) &&
  (w.userId === undefined || r.userId === w.userId) &&
  (w.minigameId === undefined || r.minigameId === w.minigameId) &&
  (w.isDefault === undefined || r.isDefault === w.isDefault) &&
  (w.NOT === undefined || r.id !== w.NOT.id) &&
  (w.userId_minigameId_name === undefined ||
    (r.userId === w.userId_minigameId_name.userId &&
      r.minigameId === w.userId_minigameId_name.minigameId &&
      r.name === w.userId_minigameId_name.name));

vi.mock('@/lib/prisma.server', () => {
  const model = {
    count: async ({ where }: { where: Where }) => db.rows.filter((r) => match(r, where)).length,
    findUnique: async ({ where }: { where: Where }) => db.rows.find((r) => match(r, where)) ?? null,
    findFirst: async ({ where }: { where: Where }) => db.rows.find((r) => match(r, where)) ?? null,
    findMany: async ({ where }: { where: Where }) => db.rows.filter((r) => match(r, where)),
    create: async ({ data }: { data: Omit<Row, 'id' | 'createdAt' | 'updatedAt'> }) => {
      const row: Row = { ...data, id: `p${++db.seq}`, createdAt: new Date(0), updatedAt: new Date(0) };
      db.rows.push(row);
      return row;
    },
    update: async ({ where, data }: { where: { id: string }; data: Partial<Row> }) =>
      Object.assign(
        db.rows.find((r) => r.id === where.id)!,
        data,
      ),
    updateMany: async ({ where, data }: { where: Where; data: Partial<Row> }) => {
      const hit = db.rows.filter((r) => match(r, where));
      hit.forEach((r) => Object.assign(r, data));
      return { count: hit.length };
    },
    deleteMany: async ({ where }: { where: Where }) => {
      const hit = db.rows.filter((r) => match(r, where));
      db.rows = db.rows.filter((r) => !hit.includes(r));
      return { count: hit.length };
    },
  };
  const prisma: Record<string, unknown> = { rmhboxSettingsPreset: model };
  prisma.$transaction = async (fn: (tx: unknown) => unknown) => fn(prisma);
  return { prisma };
});

const { route: collection } = await import('@/lib/rmhbox/api/rmhbox.presets.server');
const { route: item } = await import('@/lib/rmhbox/api/rmhbox.presets.$id.server');
const list = handlersOf(collection);
const one = handlersOf(item);

const json = (method: string, body?: unknown) =>
  new Request('http://t/api/rmhbox/presets', {
    method,
    headers: { 'content-type': 'application/json', ...(db.viewer ? { cookie: 'better-auth.session_token=t' } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const post = (body: unknown) => list.POST!({ request: json('POST', body), params: {} });
const patch = (id: string, body: unknown) => one.PATCH!({ request: json('PATCH', body), params: { id } });
const del = (id: string) => one.DELETE!({ request: json('DELETE'), params: { id } });

const valid = { minigameId: 'rhyme-time', name: 'Quick round', values: { totalRounds: 2 } };

beforeEach(() => {
  db.viewer = 'alice';
  db.rows = [];
  db.seq = 0;
});

describe('POST /api/rmhbox/presets', () => {
  it('refuses a signed-out caller', async () => {
    db.viewer = null;
    expect((await post(valid)).status).toBe(401);
    expect(db.rows).toHaveLength(0);
  });

  it('creates a preset and answers 201 with values fitted to the schema', async () => {
    const res = await post(valid);
    expect(res.status).toBe(201);
    const { preset } = (await res.json()) as { preset: { name: string; values: Record<string, unknown> } };
    expect(preset.name).toBe('Quick round');
    expect(preset.values.totalRounds).toBe(2);
    expect(db.rows[0]!.userId).toBe('alice');
  });

  it.each([
    ['an empty name', { ...valid, name: '   ' }],
    ['a name over 40 characters', { ...valid, name: 'x'.repeat(41) }],
    ['values that are not flat', { ...valid, values: { totalRounds: { deep: 1 } } }],
    [
      'values over 4 KB',
      { ...valid, values: Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`k${i}`, 'y'.repeat(200)])) },
    ],
    ['a missing minigame', { name: 'x', values: {} }],
  ])('answers 400 for %s', async (_label, body) => {
    expect((await post(body)).status).toBe(400);
    expect(db.rows).toHaveLength(0);
  });

  it('answers 400 for a minigame that does not exist', async () => {
    const res = await post({ ...valid, minigameId: 'nope' });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { code: string }).code).toBe('unknown-game');
  });

  it('answers 409 for a duplicate name in the same minigame', async () => {
    expect((await post(valid)).status).toBe(201);
    const res = await post(valid);
    expect(res.status).toBe(409);
    expect(((await res.json()) as { code: string }).code).toBe('name-taken');
  });

  it('refuses the 11th preset for one minigame', async () => {
    for (let i = 0; i < 10; i++) expect((await post({ ...valid, name: `p${i}` })).status).toBe(201);
    const res = await post({ ...valid, name: 'eleventh' });
    expect(res.status).toBe(422);
    expect(((await res.json()) as { code: string }).code).toBe('game-limit');
    expect(db.rows).toHaveLength(10);
  });
});

describe('PATCH and DELETE /api/rmhbox/presets/:id', () => {
  it('answers 404 to another member and leaves the preset alone', async () => {
    await post(valid);
    const id = db.rows[0]!.id;
    db.viewer = 'bob';
    expect((await patch(id, { name: 'Mine' })).status).toBe(404);
    expect((await del(id)).status).toBe(404);
    expect(db.rows).toHaveLength(1);
    expect(db.rows[0]!.name).toBe('Quick round');
  });

  it('answers 404 for an id that does not exist', async () => {
    expect((await patch('missing', { name: 'x' })).status).toBe(404);
    expect((await del('missing')).status).toBe(404);
  });

  it('answers 400 to an empty patch and 409 to a rename onto an existing name', async () => {
    await post(valid);
    await post({ ...valid, name: 'Other' });
    const id = db.rows[0]!.id;
    expect((await patch(id, {})).status).toBe(400);
    expect((await patch(id, { name: 'Other' })).status).toBe(409);
  });

  it('lets the owner mark one default per minigame and delete it', async () => {
    await post(valid);
    await post({ ...valid, name: 'Other' });
    const [a, b] = db.rows;
    expect((await patch(a!.id, { isDefault: true })).status).toBe(200);
    expect((await patch(b!.id, { isDefault: true })).status).toBe(200);
    expect(db.rows.filter((r) => r.isDefault).map((r) => r.id)).toEqual([b!.id]);
    expect((await del(b!.id)).status).toBe(200);
    expect(db.rows).toHaveLength(1);
  });
});
