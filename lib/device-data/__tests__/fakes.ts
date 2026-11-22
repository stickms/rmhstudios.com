import { IDBFactory } from 'fake-indexeddb';

import type { DeviceEnv } from '../inspect';

export class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length(): number {
    return this.map.size;
  }
  clear(): void {
    this.map.clear();
  }
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

/** A fake cache storage: names to entry counts. */
export function fakeCaches(initial: Record<string, number>): CacheStorage {
  const names = new Map(Object.entries(initial));
  return {
    keys: async () => [...names.keys()],
    delete: async (n: string) => names.delete(n),
    open: async (n: string) =>
      ({
        keys: async () => Array.from({ length: names.get(n) ?? 0 }, () => ({}) as Request),
      }) as unknown as Cache,
  } as unknown as CacheStorage;
}

export function makeDatabase(idb: IDBFactory, name: string, stores: Record<string, unknown[]>): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = idb.open(name, 1);
    req.onupgradeneeded = () => {
      for (const [store, rows] of Object.entries(stores)) {
        const os = req.result.createObjectStore(store, { autoIncrement: true });
        for (const row of rows) os.add(row);
      }
    };
    req.onsuccess = () => {
      req.result.close();
      resolve();
    };
    req.onerror = () => reject(req.error);
  });
}

export function openConnection(idb: IDBFactory, name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = idb.open(name);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function freshEnv(): Required<Pick<DeviceEnv, 'indexedDB' | 'localStorage' | 'sessionStorage' | 'caches'>> &
  DeviceEnv {
  return {
    indexedDB: new IDBFactory(),
    localStorage: new MemoryStorage(),
    sessionStorage: new MemoryStorage(),
    caches: fakeCaches({ 'rmh-static-v1': 3, 'rmh-images-v1': 2, 'other-cache': 1 }),
  };
}

export async function databaseNames(idb: IDBFactory): Promise<string[]> {
  return (await idb.databases()).map((d) => d.name as string).sort();
}
