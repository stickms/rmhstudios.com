/**
 * What this browser holds from the site, read once (sprint 07, feature 03).
 *
 * Client-only: nothing here runs on the server and nothing it finds is sent anywhere. Every reader takes an optional
 * environment so a test can hand it a fake IndexedDB, and each one swallows its own failures (a blocked storage API, a
 * private window): a store that cannot be read is reported as absent, never as an error that hides the others.
 */
import {
  DEVICE_STORES,
  type DeviceStore,
} from './registry';

export interface DeviceEnv {
  indexedDB?: IDBFactory | undefined;
  localStorage?: Storage | undefined;
  sessionStorage?: Storage | undefined;
  caches?: CacheStorage | undefined;
  estimate?: (() => Promise<StorageEstimate>) | undefined;
}

export function browserEnv(): DeviceEnv {
  const g = globalThis as {
    indexedDB?: IDBFactory;
    caches?: CacheStorage;
    navigator?: Navigator;
  };
  const web = (
    name: 'localStorage' | 'sessionStorage',
  ): Storage | undefined => {
    try {
      return (globalThis as unknown as Record<string, Storage | undefined>)[name];
    } catch {
      return undefined;
    }
  };
  const nav = g.navigator;
  return {
    indexedDB: g.indexedDB,
    localStorage: web('localStorage'),
    sessionStorage: web('sessionStorage'),
    caches: g.caches,
    estimate: nav?.storage?.estimate
      ? () => nav.storage.estimate()
      : undefined,
  };
}

export interface StoreReport {
  id: string;
  /** Something from this store exists in this browser. */
  present: boolean;
  /** Records (IndexedDB), keys (Web Storage) or entries (cache) across the store. */
  count: number;
  /** Byte size, only for the stores where the bytes are the point (Studio samples, book pages); otherwise null. */
  bytes: number | null;
  /** Per object store counts for an IndexedDB store, summed over its databases (`projects`, `samples`, ...). */
  parts: Readonly<Record<string, number>>;
}

export interface UnsentCounts {
  projects: number;
  samples: number;
  drafts: number;
}

export interface DeviceReport {
  stores: StoreReport[];
  /** The browser's own estimate of everything this origin stores, or null where it cannot say. */
  estimate: { usage: number; quota: number } | null;
  unsent: UnsentCounts;
}

/** The stores whose byte size is worth the walk: the bytes are the point. */
const SIZED_IDS: ReadonlySet<string> =
  new Set(['studio', 'library-reader']);

function requestResult<T>(
  req: IDBRequest<T>,
): Promise<T> {
  return new Promise(
    (resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    },
  );
}

async function existingDatabaseNames(
  idb: IDBFactory | undefined,
): Promise<Set<string>> {
  if (!idb || typeof idb.databases !== 'function') return new Set();
  try {
    const list = await idb.databases();
    return new Set(
      list
        .map((d) => d.name)
        .filter((n): n is string => typeof n === 'string'),
    );
  } catch {
    return new Set();
  }
}

/** A rough byte size of a stored value: binary payloads exactly, text by length, objects by their fields. */
export function approxBytes(
  value: unknown,
  depth = 0,
): number {
  if (value == null || depth > 4) return 0;
  if (typeof value === 'string') return value.length;
  if (typeof value === 'number') return 8;
  if (typeof value === 'boolean') return 1;
  if (value instanceof ArrayBuffer) return value.byteLength;
  if (ArrayBuffer.isView(value)) return value.byteLength;
  if (typeof Blob !== 'undefined' && value instanceof Blob) return value.size;
  if (Array.isArray(value))
    return value.reduce<number>(
      (n, v) => n + approxBytes(v, depth + 1),
      0,
    );
  if (typeof value === 'object')
    return Object.values(value as Record<string, unknown>).reduce<number>(
      (n, v) => n + approxBytes(v, depth + 1),
      0,
    );
  return 0;
}

async function readDatabase(
  idb: IDBFactory,
  name: string,
  sized: boolean,
): Promise<{ parts: Record<string, number>; bytes: number }> {
  const db = await requestResult(idb.open(name));
  try {
    const parts: Record<string, number> = {};
    let bytes = 0;
    const storeNames = Array.from(db.objectStoreNames);
    if (storeNames.length === 0) return { parts, bytes };
    const tx = db.transaction(storeNames, 'readonly');
    for (const s of storeNames) {
      const os = tx.objectStore(s);
      parts[s] = await requestResult(os.count());
      if (sized && parts[s]) {
        const all = await requestResult(os.getAll());
        for (const v of all) bytes += approxBytes(v);
      }
    }
    return { parts, bytes };
  } finally {
    db.close();
  }
}

function keysWithPrefix(
  storage: Storage | undefined,
  prefixes: readonly string[],
  all: readonly DeviceStore[],
  self: DeviceStore,
): string[] {
  if (!storage) return [];
  const out: string[] = [];
  try {
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (key === null) continue;
      if (!prefixes.some((p) => key.startsWith(p))) continue;
      // A longer name on another line owns the key (`vb-meta` is a save, `vb-` is a preference).
      const mine = Math.max(
        ...prefixes.filter((p) => key.startsWith(p)).map((p) => p.length),
      );
      const owned = all.some(
        (o) =>
          o !== self &&
          o.kind === 'localstorage-prefix' &&
          o.names.some((n) => key.startsWith(n) && n.length > mine),
      );
      if (!owned) out.push(key);
    }
  } catch {
    return [];
  }
  return out;
}

/** The keys of one Web Storage registry line that exist in this browser (localStorage and sessionStorage). */
export function presentKeys(
  store: DeviceStore,
  env: DeviceEnv,
): { area: 'local' | 'session'; key: string }[] {
  const found: { area: 'local' | 'session'; key: string }[] = [];
  for (const key of keysWithPrefix(env.localStorage, store.names, DEVICE_STORES, store))
    found.push({ area: 'local', key });
  for (const key of keysWithPrefix(env.sessionStorage, store.names, DEVICE_STORES, store))
    found.push({ area: 'session', key });
  return found;
}

async function inspectStore(
  store: DeviceStore,
  env: DeviceEnv,
  dbNames: Set<string>,
): Promise<StoreReport> {
  const empty: StoreReport = {
    id: store.id,
    present: false,
    count: 0,
    bytes: null,
    parts: {},
  };
  try {
    if (store.kind === 'indexeddb') {
      if (!env.indexedDB) return empty;
      const parts: Record<string, number> = {};
      let bytes = 0;
      let present = false;
      const sized = SIZED_IDS.has(store.id);
      for (const name of store.names) {
        if (!dbNames.has(name)) continue;
        present = true;
        try {
          const r = await readDatabase(env.indexedDB, name, sized);
          for (const [k, v] of Object.entries(r.parts)) parts[k] = (parts[k] ?? 0) + v;
          bytes += r.bytes;
        } catch {
          // The database exists but cannot be opened right now; it is still listed so it can be cleared.
        }
      }
      const count = Object.values(parts).reduce((a, b) => a + b, 0);
      return {
        id: store.id,
        present,
        count,
        bytes: sized && present ? bytes : null,
        parts,
      };
    }
    if (store.kind === 'localstorage-prefix') {
      const keys = presentKeys(store, env);
      return { ...empty, present: keys.length > 0, count: keys.length };
    }
    if (!env.caches) return empty;
    const names = (await env.caches.keys()).filter((n) =>
      store.names.some((p) => n.startsWith(p)),
    );
    let entries = 0;
    for (const n of names) {
      try {
        entries += (await (await env.caches.open(n)).keys()).length;
      } catch {
        // An unreadable cache still counts as present.
      }
    }
    return { ...empty, present: names.length > 0, count: entries };
  } catch {
    return empty;
  }
}

/** Local Studio projects and samples and unsent drafts: the work that may exist only on this device. */
export function unsentFromReports(
  reports: readonly StoreReport[],
  env: DeviceEnv,
): UnsentCounts {
  const by = new Map(reports.map((r) => [r.id, r]));
  const draftKeys = DEVICE_STORES.filter(
    (s) => s.kind === 'localstorage-prefix' && s.unsent === 'drafts',
  ).reduce((n, s) => n + presentKeys(s, env).length, 0);
  return {
    projects: by.get('studio')?.parts.projects ?? 0,
    samples: by.get('studio')?.parts.samples ?? 0,
    drafts: (by.get('drafts')?.parts.drafts ?? 0) + draftKeys,
  };
}

export async function inspectDevice(
  env: DeviceEnv = browserEnv(),
): Promise<DeviceReport> {
  const dbNames = await existingDatabaseNames(env.indexedDB);
  const all = await Promise.all(
    DEVICE_STORES.map((s) => inspectStore(s, env, dbNames)),
  );
  let estimate: DeviceReport['estimate'] = null;
  try {
    const e = await env.estimate?.();
    if (e && typeof e.usage === 'number' && typeof e.quota === 'number')
      estimate = { usage: e.usage, quota: e.quota };
  } catch {
    estimate = null;
  }
  return {
    stores: all.filter((r) => r.present),
    estimate,
    unsent: unsentFromReports(all, env),
  };
}

/** Just the unsent-work counts, for the sign-out and deletion questions. */
export async function countUnsentWork(
  env: DeviceEnv = browserEnv(),
): Promise<UnsentCounts> {
  const dbNames = await existingDatabaseNames(env.indexedDB);
  const stores = DEVICE_STORES.filter((s) => s.unsent === 'studio' || s.unsent === 'drafts');
  const reports = await Promise.all(
    stores
      .filter((s) => s.kind === 'indexeddb')
      .map((s) => inspectStore(s, env, dbNames)),
  );
  return unsentFromReports(reports, env);
}

export function hasUnsentWork(
  counts: UnsentCounts,
): boolean {
  return counts.projects + counts.samples + counts.drafts > 0;
}

/** A byte count scaled to the unit a reader wants (`Intl` unit names), for `Intl.NumberFormat`'s `unit` style. */
export function scaleBytes(
  bytes: number,
): {
  value: number;
  unit:
    | 'byte'
    | 'kilobyte'
    | 'megabyte'
    | 'gigabyte';
} {
  if (bytes < 1000) return { value: bytes, unit: 'byte' };
  if (bytes < 1_000_000) return { value: bytes / 1000, unit: 'kilobyte' };
  if (bytes < 1_000_000_000) return { value: bytes / 1_000_000, unit: 'megabyte' };
  return { value: bytes / 1_000_000_000, unit: 'gigabyte' };
}
