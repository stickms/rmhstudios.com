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
  /**
   * Only on the `<userId>:replaced` entry: the sha256 of the backup that replaced this home. The
   * entry can be put back only while the stored home is still exactly that backup.
   */
  forSha?: string;
}

/** One write of a multi-key change. */
export type StoreOp = { key: string; put: CachedHome } | { key: string; delete: true };

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
  /**
   * Applies every op or none: one IndexedDB `readwrite` transaction (resolves on complete,
   * rejects on error or abort), or, in memory, a validated copy that is swapped in. A failed
   * quota write rejects with a `QuotaExceededError`, as a plain `put` does. Every change that
   * touches more than one key goes through here, so a failure cannot leave them disagreeing.
   */
  transact(ops: StoreOp[]): Promise<void>;
}

export function memoryHomeStore(
  opts: {
    /** Test seam: an error to throw instead of applying a transaction (nothing is applied). */
    failTransact?: (ops: StoreOp[]) => Error | null;
  } = {},
): HomeStore {
  let m = new Map<string, CachedHome>();
  return {
    kind: 'memory',
    close: () => {},
    get: async (id) => m.get(id) ?? null,
    put: async (id, h) => void m.set(id, h),
    delete: async (id) => void m.delete(id),
    async transact(ops) {
      const err = opts.failTransact?.(ops);
      if (err) throw err;
      const next = new Map(m);
      for (const op of ops) {
        if ('put' in op) next.set(op.key, op.put);
        else next.delete(op.key);
      }
      m = next; // all or nothing
    },
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

function transaction(db: IDBDatabase, ops: StoreOp[]) {
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('transaction failed'));
    tx.onabort = () => reject(tx.error ?? new DOMException('aborted', 'AbortError'));
    try {
      const st = tx.objectStore(STORE);
      for (const op of ops) {
        if ('put' in op) st.put(op.put, op.key);
        else st.delete(op.key);
      }
    } catch (e) {
      // A synchronous failure part-way: undo what was queued, then report it.
      try {
        tx.abort();
      } catch {
        // already finished
      }
      reject(e);
    }
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
    async transact(ops) {
      const d = await db();
      if (!d) return fallback.transact(ops);
      await transaction(d, ops);
    },
  };
}
