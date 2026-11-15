/**
 * The home folder's copy in this browser: IndexedDB database `rmhos`, object store `home`,
 * keyed by the account's user id. Nothing here leaves the device. IndexedDB can be missing or
 * refuse to open (private windows, blocked site data); the store then keeps the archive in
 * memory for the life of the page, so the session still works and just does not outlive it.
 */

export interface CachedHome {
  /** gzip of the tar. */
  archive: Uint8Array;
  /** sha256 (hex) of the tar before gzip. */
  sha256: string;
  savedAt: number;
}

export interface HomeStore {
  /**
   * Where archives really live: 'indexeddb', or 'memory' when this browser has no usable
   * IndexedDB (nothing then outlives the page). Known once the first operation has settled.
   */
  readonly kind: 'indexeddb' | 'memory';
  /** Closes the IndexedDB connection. The store is not used afterwards. */
  close(): void;
  get(userId: string): Promise<CachedHome | null>;
  put(userId: string, h: CachedHome): Promise<void>;
  delete(userId: string): Promise<void>;
}

export function memoryHomeStore(): HomeStore {
  const m = new Map<string, CachedHome>();
  return {
    kind: 'memory',
    close: () => {},
    get: async (id) => m.get(id) ?? null,
    put: async (id, h) => void m.set(id, h),
    delete: async (id) => void m.delete(id),
  };
}

const DB = 'rmhos';
const STORE = 'home';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('indexedDB open failed'));
    req.onblocked = () => reject(new Error('indexedDB open blocked'));
  });
}

function request<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  run: (s: IDBObjectStore) => IDBRequest<T>,
) {
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = run(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error ?? req.error);
    tx.onabort = () => reject(tx.error ?? new DOMException('aborted', 'AbortError'));
  });
}

export function openHomeStore(): HomeStore {
  const fallback = memoryHomeStore();
  let dbp: Promise<IDBDatabase | null> | null = null;
  let kind: 'indexeddb' | 'memory' = 'indexeddb';
  let closed = false;
  const db = () =>
    (dbp ??= (async () => {
      try {
        const d = typeof indexedDB === 'undefined' ? null : await openDb();
        if (!d) kind = 'memory';
        // A close() that raced the open: do not leak the connection.
        if (d && closed) d.close();
        return d;
      } catch {
        kind = 'memory';
        return null;
      }
    })());
  return {
    get kind() {
      return kind;
    },
    close() {
      closed = true;
      void dbp?.then((d) => d?.close());
    },
    async get(id) {
      const d = await db();
      if (!d) return fallback.get(id);
      return ((await request(d, 'readonly', (s) => s.get(id))) as CachedHome | undefined) ?? null;
    },
    async put(id, h) {
      const d = await db();
      if (!d) return fallback.put(id, h);
      await request(d, 'readwrite', (s) => s.put(h, id));
    },
    async delete(id) {
      const d = await db();
      if (!d) return fallback.delete(id);
      await request(d, 'readwrite', (s) => s.delete(id));
    },
  };
}
