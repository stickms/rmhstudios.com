/**
 * The IndexedDB implementation of HomeStore, against fake-indexeddb (a dev dependency, exact
 * version): the transaction is the whole point of `transact`, so it is tested for real.
 */
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { openHomeStore, type CachedHome, type HomeStore } from '../home-store';

const entry = (n: number): CachedHome => ({
  archive: new Uint8Array([n, n]),
  sha256: `sha${n}`,
  savedAt: n,
});

let store: HomeStore;
beforeEach(() => {
  (globalThis as { indexedDB?: IDBFactory }).indexedDB = new IDBFactory();
  store = openHomeStore();
});

describe('openHomeStore on IndexedDB', () => {
  it('puts, gets and deletes, and says it is IndexedDB', async () => {
    expect(await store.get('a')).toBeNull();
    expect(store.kind).toBe('indexeddb');
    await store.put('a', entry(1));
    expect(await store.get('a')).toEqual(entry(1));
    await store.delete('a');
    expect(await store.get('a')).toBeNull();
  });

  it('transact applies every put and delete in one go', async () => {
    await store.put('a', entry(1));
    await store.put('gone', entry(9));
    await store.transact([
      { key: 'a', put: entry(2) },
      { key: 'b', put: entry(3) },
      { key: 'gone', delete: true },
    ]);
    expect(await store.get('a')).toEqual(entry(2));
    expect(await store.get('b')).toEqual(entry(3));
    expect(await store.get('gone')).toBeNull();
  });

  it('transact applies none of it when one op fails (the earlier ones are rolled back)', async () => {
    await store.put('a', entry(1));
    await store.put('gone', entry(9));
    const unclonable = { ...entry(5), archive: (() => 1) as unknown as Uint8Array };
    await expect(
      store.transact([
        { key: 'a', put: entry(2) },
        { key: 'gone', delete: true },
        { key: 'c', put: unclonable },
      ]),
    ).rejects.toBeTruthy();
    expect(await store.get('a')).toEqual(entry(1)); // not 2
    expect(await store.get('gone')).toEqual(entry(9)); // not deleted
    expect(await store.get('c')).toBeNull();
    // The connection is still good afterwards.
    await store.put('d', entry(4));
    expect(await store.get('d')).toEqual(entry(4));
  });

  it('close() leaves no open connection behind', async () => {
    await store.put('a', entry(1));
    store.close();
    const again = openHomeStore();
    expect(await again.get('a')).toEqual(entry(1));
  });

  it('without IndexedDB it falls back to memory, transactions included', async () => {
    (globalThis as { indexedDB?: unknown }).indexedDB = undefined;
    const mem = openHomeStore();
    await mem.transact([{ key: 'a', put: entry(1) }]);
    expect(await mem.get('a')).toEqual(entry(1));
    expect(mem.kind).toBe('memory');
  });
});
