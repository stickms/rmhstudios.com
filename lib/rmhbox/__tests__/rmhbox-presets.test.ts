/**
 * RMHBox host presets: ownership, schema validation on save and on read, the caps under the
 * per-member lock, and one default per minigame. Prisma is an in-memory fake.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

const state = vi.hoisted(() => ({ rows: [] as Row[], seq: 0, events: [] as string[] }));

type Where = Partial<Pick<Row, 'id' | 'userId' | 'minigameId' | 'isDefault'>> & {
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

const model = {
  count: async ({ where }: { where: Where }) => {
    state.events.push('count');
    return state.rows.filter((r) => match(r, where)).length;
  },
  findUnique: async ({ where }: { where: Where }) => state.rows.find((r) => match(r, where)) ?? null,
  findFirst: async ({ where }: { where: Where }) => state.rows.find((r) => match(r, where)) ?? null,
  findMany: async ({ where }: { where: Where }) => state.rows.filter((r) => match(r, where)),
  create: async ({ data }: { data: Omit<Row, 'id' | 'createdAt' | 'updatedAt'> }) => {
    const row: Row = { ...data, id: `p${++state.seq}`, createdAt: new Date(0), updatedAt: new Date(0) };
    state.rows.push(row);
    return row;
  },
  update: async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
    const row = state.rows.find((r) => r.id === where.id)!;
    Object.assign(row, data);
    return row;
  },
  updateMany: async ({ where, data }: { where: Where; data: Partial<Row> }) => {
    const hit = state.rows.filter((r) => match(r, where));
    hit.forEach((r) => Object.assign(r, data));
    return { count: hit.length };
  },
  deleteMany: async ({ where }: { where: Where }) => {
    const hit = state.rows.filter((r) => match(r, where));
    state.rows = state.rows.filter((r) => !hit.includes(r));
    return { count: hit.length };
  },
};

const prismaMock = vi.hoisted(() => ({ rmhboxSettingsPreset: undefined as unknown, $transaction: undefined as unknown }));
prismaMock.rmhboxSettingsPreset = model;
prismaMock.$transaction = async (fn: (tx: unknown) => unknown) => fn(prismaMock);
vi.mock('@/lib/prisma.server', () => ({ prisma: prismaMock }));
vi.mock('@/lib/db/advisory-lock.server', () => ({
  lockKey: vi.fn(async (_tx: unknown, key: string) => {
    state.events.push(`lock:${key}`);
  }),
}));

const { createPreset, updatePreset, deletePreset, listPresets, exportRmhboxPresets } = await import('@/lib/rmhbox/presets.server');
const { createPresetSchema, updatePresetSchema } = await import('@/lib/rmhbox/presets-schema');

const RHYME = 'rhyme-time';
const quick = { totalRounds: 2, inputDuration: 30, maxSubmissions: 20, enableSpeedBonus: false };

beforeEach(() => {
  state.rows = [];
  state.seq = 0;
  state.events = [];
});

describe('ownership', () => {
  it('lists, changes and deletes only the caller’s own presets', async () => {
    const made = await createPreset('alice', { minigameId: RHYME, name: 'Quick round', values: quick });
    if (!made.ok) throw new Error('create failed');
    const id = made.value.id;

    expect(await listPresets('bob', RHYME)).toEqual([]);
    const renamed = await updatePreset('bob', id, { name: 'Mine now' });
    expect(renamed).toMatchObject({ ok: false, status: 404, code: 'not-found' });
    expect(await deletePreset('bob', id)).toBe(false);
    expect(state.rows).toHaveLength(1);
    expect(state.rows[0]!.name).toBe('Quick round');

    expect(await deletePreset('alice', id)).toBe(true);
  });

  it('lets two members use the same preset name', async () => {
    expect((await createPreset('alice', { minigameId: RHYME, name: 'Same', values: quick })).ok).toBe(true);
    expect((await createPreset('bob', { minigameId: RHYME, name: 'Same', values: quick })).ok).toBe(true);
  });
});

describe('validation against the minigame schema', () => {
  it('refuses a minigame that is not in the registry', async () => {
    expect(await createPreset('alice', { minigameId: 'nope', name: 'x', values: {} })).toMatchObject({
      ok: false,
      status: 400,
      code: 'unknown-game',
    });
  });

  it('stores clamped, complete values and drops unknown keys', async () => {
    const r = await createPreset('alice', {
      minigameId: RHYME,
      name: 'Wild',
      values: { totalRounds: 999, inputDuration: 'fast', hacked: true },
    });
    if (!r.ok) throw new Error('create failed');
    expect(r.value.values).toMatchObject({ totalRounds: 5 });
    expect(r.value.values).not.toHaveProperty('hacked');
    expect(typeof r.value.values.inputDuration).toBe('number');
    expect(Object.keys(state.rows[0]!.values as object)).not.toContain('hacked');
  });

  it('applies a preset saved before a setting was removed, with the reset flag and no error', async () => {
    state.rows.push({
      id: 'old',
      userId: 'alice',
      minigameId: RHYME,
      name: 'Old',
      values: { totalRounds: 3, removedSetting: 7 },
      isDefault: false,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    });
    const [p] = await listPresets('alice', RHYME);
    expect(p!.reset).toBe(true);
    expect(p!.values.totalRounds).toBe(3);
    expect(p!.values).not.toHaveProperty('removedSetting');
    expect(p!.values).toHaveProperty('inputDuration');
  });

  it('lists a preset for a minigame that no longer exists without throwing', async () => {
    state.rows.push({
      id: 'gone',
      userId: 'alice',
      minigameId: 'retired-game',
      name: 'Old',
      values: { a: 1 },
      isDefault: true,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    });
    expect(await listPresets('alice')).toEqual([expect.objectContaining({ id: 'gone', values: {}, reset: true })]);
  });

  it('rejects values over 4 KB, non-objects and empty or long names at the schema', () => {
    const big = Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`k${i}`, 'x'.repeat(100)]));
    expect(createPresetSchema.safeParse({ minigameId: RHYME, name: 'a', values: big }).success).toBe(false);
    expect(createPresetSchema.safeParse({ minigameId: RHYME, name: 'a', values: [1] }).success).toBe(false);
    expect(createPresetSchema.safeParse({ minigameId: RHYME, name: 'a', values: { x: { y: 1 } } }).success).toBe(false);
    expect(createPresetSchema.safeParse({ minigameId: RHYME, name: '   ', values: {} }).success).toBe(false);
    expect(createPresetSchema.safeParse({ minigameId: RHYME, name: 'x'.repeat(41), values: {} }).success).toBe(false);
    expect(createPresetSchema.safeParse({ minigameId: RHYME, name: 'x'.repeat(40), values: quick }).success).toBe(true);
    expect(updatePresetSchema.safeParse({}).success).toBe(false);
  });
});

describe('caps under the lock', () => {
  it('refuses the 11th preset for a game, after taking the per-member lock', async () => {
    for (let i = 0; i < 10; i++) {
      expect((await createPreset('alice', { minigameId: RHYME, name: `p${i}`, values: quick })).ok).toBe(true);
    }
    state.events = [];
    const r = await createPreset('alice', { minigameId: RHYME, name: 'p10', values: quick });
    expect(r).toMatchObject({ ok: false, status: 422, code: 'game-limit', error: 'You can keep 10 presets per game' });
    expect(state.events[0]).toBe('lock:rmhbox-presets:alice');
    expect(state.events.indexOf('count')).toBeGreaterThan(0);
    expect(state.rows).toHaveLength(10);
  });

  it('refuses the 101st preset overall but still allows another game under its own cap', async () => {
    const games = ['rhyme-time', 'wit-war', 'wiki-race', 'category-crash', 'emoji-cinema', 'fact-or-friction', 'undercover-agent', 'undercover-editor', 'minimalist-masterpiece'];
    let n = 0;
    for (const g of games) {
      for (let i = 0; i < 10 && n < 90; i++, n++) {
        await createPreset('alice', { minigameId: g, name: `p${i}`, values: {} });
      }
    }
    for (let i = 0; state.rows.length < 100; i++) {
      state.rows.push({ ...state.rows[0]!, id: `fill${i}`, minigameId: 'filler', name: `f${i}` });
    }
    const r = await createPreset('alice', { minigameId: 'wit-war', name: 'extra-name', values: {} });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(['game-limit', 'total-limit']).toContain(r.code);
    expect(state.rows.length).toBe(100);
  });

  it('refuses a duplicate name within a game', async () => {
    await createPreset('alice', { minigameId: RHYME, name: 'Dup', values: quick });
    expect(await createPreset('alice', { minigameId: RHYME, name: 'Dup', values: quick })).toMatchObject({
      ok: false,
      status: 409,
      code: 'name-taken',
    });
    const other = await createPreset('alice', { minigameId: RHYME, name: 'Other', values: quick });
    if (!other.ok) throw new Error('create failed');
    expect(await updatePreset('alice', other.value.id, { name: 'Dup' })).toMatchObject({ ok: false, code: 'name-taken' });
  });
});

describe('one default per minigame', () => {
  it('clears the previous default when another is set, on create and on update', async () => {
    const a = await createPreset('alice', { minigameId: RHYME, name: 'A', values: quick, isDefault: true });
    const b = await createPreset('alice', { minigameId: RHYME, name: 'B', values: quick, isDefault: true });
    if (!a.ok || !b.ok) throw new Error('create failed');
    expect(state.rows.filter((r) => r.isDefault).map((r) => r.name)).toEqual(['B']);

    await updatePreset('alice', a.value.id, { isDefault: true });
    expect(state.rows.filter((r) => r.isDefault).map((r) => r.name)).toEqual(['A']);

    await updatePreset('alice', a.value.id, { isDefault: false });
    expect(state.rows.some((r) => r.isDefault)).toBe(false);
  });

  it('leaves another game’s or another member’s default alone', async () => {
    await createPreset('alice', { minigameId: 'wit-war', name: 'W', values: {}, isDefault: true });
    await createPreset('bob', { minigameId: RHYME, name: 'B', values: quick, isDefault: true });
    await createPreset('alice', { minigameId: RHYME, name: 'A', values: quick, isDefault: true });
    expect(state.rows.filter((r) => r.isDefault)).toHaveLength(3);
  });
});

describe('exportRmhboxPresets', () => {
  it('returns only the member’s own presets', async () => {
    await createPreset('alice', { minigameId: RHYME, name: 'Mine', values: quick, isDefault: true });
    await createPreset('bob', { minigameId: RHYME, name: 'Theirs', values: quick });
    const out = await exportRmhboxPresets('alice');
    expect(out).toEqual([expect.objectContaining({ minigameId: RHYME, name: 'Mine', isDefault: true })]);
  });
});
