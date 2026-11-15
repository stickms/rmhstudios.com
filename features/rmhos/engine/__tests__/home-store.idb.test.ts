/**
 * The IndexedDB implementation of HomeStore, against fake-indexeddb (a dev dependency, exact
 * version): the transaction is the whole point of `transact`, so it is tested for real.
 */
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SHARE_ARCHIVE_PATH } from '../agent-protocol';
import { HomeSync } from '../home-sync';
import { openHomeStore, type CachedHome, type HomeStore } from '../home-store';
import { putEntry } from './store-helpers';

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
    await putEntry(store, 'a', entry(1));
    expect(await store.get('a')).toEqual(entry(1));
    await store.delete('a');
    expect(await store.get('a')).toBeNull();
  });

  it('has() says whether an entry exists without reading it', async () => {
    expect(await store.has('a')).toBe(false);
    await putEntry(store, 'a', entry(1));
    expect(await store.has('a')).toBe(true);
    expect(await store.has('b')).toBe(false);
    await store.delete('a');
    expect(await store.has('a')).toBe(false);
  });

  it('transact applies every put and delete in one go', async () => {
    await putEntry(store, 'a', entry(1));
    await putEntry(store, 'gone', entry(9));
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
    await putEntry(store, 'a', entry(1));
    await putEntry(store, 'gone', entry(9));
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
    await putEntry(store, 'd', entry(4));
    expect(await store.get('d')).toEqual(entry(4));
  });

  it('close() leaves no open connection behind', async () => {
    await putEntry(store, 'a', entry(1));
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

/**
 * A REQUEST that fails asynchronously inside the transaction, with a QuotaExceededError (what a
 * full disk does): `put` is wrapped to run an `add` on a key that already exists, which the
 * database rejects as a constraint error on the request, and the request's error is then the
 * quota error. This is the path where `tx.error` is still null when `onerror` fires.
 */
describe('a request that fails inside a transaction', () => {
  const quota = () => new DOMException('disk full', 'QuotaExceededError');
  const realPut = IDBObjectStore.prototype.put;

  afterEach(() => {
    IDBObjectStore.prototype.put = realPut;
  });

  function failPutsFor(key: string) {
    IDBObjectStore.prototype.put = function (value: unknown, k?: IDBValidKey) {
      if (k !== key) return realPut.call(this, value, k);
      const req = this.add(value, k); // the key exists: the request fails, asynchronously
      Object.defineProperty(req, 'error', { configurable: true, get: () => quota(), set: () => {} });
      return req;
    };
  }

  it('rejects with the request error, so the QuotaExceededError name survives, and applies nothing', async () => {
    await putEntry(store, 'main', entry(1));
    await putEntry(store, 'gone', entry(9));
    failPutsFor('main');
    const err = await store
      .transact([
        { key: 'other', put: entry(2) },
        { key: 'gone', delete: true },
        { key: 'main', put: entry(3) },
      ])
      .then(
        () => null,
        (e: unknown) => e,
      );
    IDBObjectStore.prototype.put = realPut;
    expect(err).toBeInstanceOf(DOMException);
    expect((err as DOMException).name).toBe('QuotaExceededError');
    expect(await store.get('main')).toEqual(entry(1));
    expect(await store.get('other')).toBeNull();
    expect(await store.get('gone')).toEqual(entry(9));
  });

  it('HomeSync.save on top of it reports storage-full, with the stored home untouched', async () => {
    const tar = new Uint8Array(1536);
    tar.set(new TextEncoder().encode('ustar  \0'), 257);
    tar[0] = 2;
    const share = new Map<string, Uint8Array>();
    const vm = {
      writeShareFile: async (p: string, d: Uint8Array) => void share.set(p, d),
      readShareFile: async (p: string) => share.get(p)!,
      deleteShareFile: async (p: string) => void share.delete(p),
    };
    const agent = {
      save: vi.fn(async () => {
        share.set(SHARE_ARCHIVE_PATH, tar);
        return { bytes: tar.length };
      }),
    };
    const gz = async (d: Uint8Array) =>
      new Uint8Array(
        await new Response(
          new Blob([d as BlobPart]).stream().pipeThrough(new CompressionStream('gzip')),
        ).arrayBuffer(),
      );
    const old: CachedHome = {
      archive: await gz(new Uint8Array(1536).fill(0)),
      sha256: 'old',
      savedAt: 1,
    };
    await putEntry(store, 'u1', old);
    const sync = new HomeSync({ userId: 'u1', vm, agent: agent as never, store });
    await sync.prepare();
    failPutsFor('u1');
    const result = await sync.save();
    IDBObjectStore.prototype.put = realPut;
    expect(result).toEqual({ status: 'storage-full' });
    expect(await store.get('u1')).toEqual(old);
  });
});
