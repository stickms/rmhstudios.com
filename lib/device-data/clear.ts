/**
 * Clearing what this site keeps in the browser (sprint 07, feature 03).
 *
 * An IndexedDB database is deleted with `deleteDatabase`, not emptied store by store, so reopening the editor finds
 * nothing and no empty shell is left. A delete another tab (or this one) holds open is reported as `blocked` for that
 * row: the browser keeps it queued and finishes it as soon as the connection closes, but the person is told, never
 * left believing it is gone. Web Storage is cleared by prefix in both localStorage and sessionStorage, and the service
 * worker's caches by name prefix.
 */
import { browserEnv, presentKeys, type DeviceEnv } from './inspect';
import { DEVICE_STORES, type DeviceStore } from './registry';

export type ClearStatus = 'cleared' | 'blocked' | 'failed';

export interface ClearRow {
  storeId: string;
  /** The database, key prefix or cache name this row is about. */
  name: string;
  status: ClearStatus;
}

export interface ClearResult {
  rows: ClearRow[];
  cleared: number;
  blocked: number;
  failed: number;
}

function summarise(rows: ClearRow[]): ClearResult {
  return {
    rows,
    cleared: rows.filter((r) => r.status === 'cleared').length,
    blocked: rows.filter((r) => r.status === 'blocked').length,
    failed: rows.filter((r) => r.status === 'failed').length,
  };
}

function deleteDatabase(idb: IDBFactory, name: string): Promise<ClearStatus> {
  return new Promise((resolve) => {
    let req: IDBOpenDBRequest;
    try {
      req = idb.deleteDatabase(name);
    } catch {
      resolve('failed');
      return;
    }
    req.onsuccess = () => resolve('cleared');
    req.onerror = () => resolve('failed');
    req.onblocked = () => resolve('blocked');
  });
}

async function clearOne(store: DeviceStore, env: DeviceEnv): Promise<ClearRow[]> {
  if (store.kind === 'indexeddb') {
    const idb = env.indexedDB;
    return Promise.all(
      store.names.map(async (name): Promise<ClearRow> => ({
        storeId: store.id,
        name,
        status: idb ? await deleteDatabase(idb, name) : 'cleared',
      })),
    );
  }
  if (store.kind === 'localstorage-prefix') {
    let status: ClearStatus = 'cleared';
    for (const { area, key } of presentKeys(store, env)) {
      try {
        (area === 'local' ? env.localStorage : env.sessionStorage)?.removeItem(key);
      } catch {
        status = 'failed';
      }
    }
    return [{ storeId: store.id, name: store.names.join(', '), status }];
  }
  const caches = env.caches;
  if (!caches) return [{ storeId: store.id, name: store.names.join(', '), status: 'cleared' }];
  try {
    const names = (await caches.keys()).filter((n) => store.names.some((p) => n.startsWith(p)));
    const rows: ClearRow[] = [];
    for (const name of names) {
      let ok = false;
      try {
        ok = await caches.delete(name);
      } catch {
        ok = false;
      }
      rows.push({ storeId: store.id, name, status: ok ? 'cleared' : 'failed' });
    }
    return rows.length > 0 ? rows : [{ storeId: store.id, name: store.names.join(', '), status: 'cleared' }];
  } catch {
    return [{ storeId: store.id, name: store.names.join(', '), status: 'failed' }];
  }
}

/** Clear the given registry lines. A line that is not in the registry is never touched. */
export async function clearStores(stores: readonly DeviceStore[], env: DeviceEnv = browserEnv()): Promise<ClearResult> {
  const known = stores.filter((s) => DEVICE_STORES.includes(s));
  const rows = (await Promise.all(known.map((s) => clearOne(s, env)))).flat();
  return summarise(rows);
}

export function clearStoreById(id: string, env: DeviceEnv = browserEnv()): Promise<ClearResult> {
  return clearStores(
    DEVICE_STORES.filter((s) => s.id === id),
    env,
  );
}

/**
 * Everything personal on this device: recordings, book pages, saves, markers. Theme, language, a dismissed tip and
 * the other preferences stay, and so do the service worker's static caches.
 *
 * Studio projects, samples and unsent drafts are skipped unless `includeUnsent` is true: the callers ask the member
 * keep-or-delete first and pass what they chose. The default is to keep.
 */
export function clearPersonalDeviceData(
  options: { includeUnsent?: boolean } = {},
  env: DeviceEnv = browserEnv(),
): Promise<ClearResult> {
  return clearStores(
    DEVICE_STORES.filter((s) => s.personal && (options.includeUnsent === true || !s.unsent)),
    env,
  );
}

/** Every registered store, personal or not, unsent work included. The page confirms this one by name. */
export function clearEverything(env: DeviceEnv = browserEnv()): Promise<ClearResult> {
  return clearStores(DEVICE_STORES, env);
}
