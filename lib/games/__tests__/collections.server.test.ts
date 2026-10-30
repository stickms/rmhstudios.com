import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = { userId: string; collection: string; gameId: string };
const db = vi.hoisted(() => ({ rows: [] as Row[] }));

const prismaMock = vi.hoisted(() => ({
  gameCollectionItem: {
    findMany: async ({ where }: { where: { userId: string; collection?: string } }) =>
      db.rows.filter((r) => r.userId === where.userId && (where.collection === undefined || r.collection === where.collection)),
    createMany: async ({ data }: { data: Row[] }) => {
      let count = 0;
      for (const d of data) {
        if (!db.rows.some((r) => r.userId === d.userId && r.collection === d.collection && r.gameId === d.gameId)) {
          db.rows.push({ ...d });
          count++;
        }
      }
      return { count };
    },
    deleteMany: async ({ where }: { where: { userId: string; collection: string; gameId?: string } }) => {
      const before = db.rows.length;
      db.rows = db.rows.filter(
        (r) => !(r.userId === where.userId && r.collection === where.collection && (where.gameId === undefined || r.gameId === where.gameId)),
      );
      return { count: before - db.rows.length };
    },
    updateMany: async ({ where, data }: { where: { userId: string; collection: string }; data: { collection: string } }) => {
      let count = 0;
      for (const r of db.rows) if (r.userId === where.userId && r.collection === where.collection) { r.collection = data.collection; count++; }
      return { count };
    },
  },
}));
vi.mock('@/lib/prisma.server', () => ({ prisma: prismaMock }));

import {
  CollectionError,
  deleteCollection,
  importFavorites,
  listCollections,
  renameCollection,
  setItem,
} from '@/lib/games/collections.server';

const U = 'u1';
const code = (p: Promise<unknown>) =>
  p.then(() => null, (e) => (e instanceof CollectionError ? e.code : `other:${(e as Error).message}`));

beforeEach(() => {
  db.rows = [];
});

describe('setItem', () => {
  it('adds and removes a title, and a collection exists only while it holds one', async () => {
    await setItem({ userId: U, collection: 'Co-op', gameId: 'altair', on: true });
    expect((await listCollections(U)).map((c) => c.name)).toEqual(['Co-op']);
    await setItem({ userId: U, collection: 'Co-op', gameId: 'altair', on: false });
    expect(await listCollections(U)).toEqual([]);
  });

  it('is idempotent', async () => {
    await setItem({ userId: U, collection: 'favorites', gameId: 'altair', on: true });
    await setItem({ userId: U, collection: 'favorites', gameId: 'altair', on: true });
    expect(db.rows).toHaveLength(1);
    await setItem({ userId: U, collection: 'favorites', gameId: 'altair', on: false });
    expect(await code(setItem({ userId: U, collection: 'favorites', gameId: 'altair', on: false }))).toBeNull();
  });

  it('reuses the existing spelling when the name differs only in case', async () => {
    await setItem({ userId: U, collection: 'Co-op', gameId: 'altair', on: true });
    await setItem({ userId: U, collection: 'co-OP', gameId: 'laundry-sort', on: true });
    expect((await listCollections(U)).map((c) => `${c.name}:${c.ids.length}`)).toEqual(['Co-op:2']);
  });

  it('refuses an unknown title, a bad or reserved name, and keeps people apart', async () => {
    expect(await code(setItem({ userId: U, collection: 'x', gameId: 'nope', on: true }))).toBe('NOT_FOUND');
    expect(await code(setItem({ userId: U, collection: '  ', gameId: 'altair', on: true }))).toBe('BAD_NAME');
    expect(await code(setItem({ userId: U, collection: 'Favorites', gameId: 'altair', on: true }))).toBe('BAD_NAME');
    await setItem({ userId: U, collection: 'Mine', gameId: 'altair', on: true });
    expect(await listCollections('u2')).toEqual([]);
  });

  it('caps the number of collections but still lets you add to an existing one', async () => {
    for (let i = 0; i < 20; i++) await setItem({ userId: U, collection: `c${i}`, gameId: 'altair', on: true });
    expect(await code(setItem({ userId: U, collection: 'one-too-many', gameId: 'altair', on: true }))).toBe('TOO_MANY');
    expect(await code(setItem({ userId: U, collection: 'c3', gameId: 'laundry-sort', on: true }))).toBeNull();
  });

  it('favorites do not count toward the cap', async () => {
    await setItem({ userId: U, collection: 'favorites', gameId: 'altair', on: true });
    for (let i = 0; i < 20; i++) await setItem({ userId: U, collection: `c${i}`, gameId: 'altair', on: true });
    expect(await listCollections(U)).toHaveLength(21);
  });
});

describe('deleteCollection and renameCollection', () => {
  it('delete removes a whole collection, only the caller’s', async () => {
    await setItem({ userId: U, collection: 'Zen', gameId: 'altair', on: true });
    await setItem({ userId: 'u2', collection: 'Zen', gameId: 'altair', on: true });
    await deleteCollection({ userId: U, collection: 'Zen' });
    expect(await listCollections(U)).toEqual([]);
    expect(await listCollections('u2')).toHaveLength(1);
  });

  it('rename moves the titles, refuses a taken or reserved name, and cannot rename favorites', async () => {
    await setItem({ userId: U, collection: 'Zen', gameId: 'altair', on: true });
    await setItem({ userId: U, collection: 'Co-op', gameId: 'altair', on: true });
    await setItem({ userId: U, collection: 'favorites', gameId: 'altair', on: true });
    expect(await code(renameCollection({ userId: U, from: 'Zen', to: 'co-op' }))).toBe('EXISTS');
    expect(await code(renameCollection({ userId: U, from: 'Zen', to: 'Favorites' }))).toBe('BAD_NAME');
    expect(await code(renameCollection({ userId: U, from: 'favorites', to: 'Faves' }))).toBe('BAD_NAME');
    expect(await code(renameCollection({ userId: U, from: 'Missing', to: 'Other' }))).toBe('NOT_FOUND');
    await renameCollection({ userId: U, from: 'Zen', to: 'Chill' });
    expect((await listCollections(U)).map((c) => c.name)).toEqual(['favorites', 'Chill', 'Co-op']);
  });
});

describe('importFavorites', () => {
  it('adds only real titles, once, up to the cap, and ignores junk', async () => {
    await importFavorites(U, ['altair', 'altair', 'nope', 'laundry-sort', 42 as unknown as string]);
    const fav = (await listCollections(U)).find((c) => c.name === 'favorites');
    expect(fav?.ids).toEqual(['altair', 'laundry-sort']);
  });
});
