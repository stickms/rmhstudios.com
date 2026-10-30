/**
 * A minimal in-memory IndexedDB (`IDBFactory`) for the replay store tests:
 * `open` with `onupgradeneeded`, keyPath object stores, transactions whose
 * requests (`put`/`get`/`getAll`/`delete`) succeed asynchronously and that
 * complete once no request is pending. Values are structured-cloned.
 * (fake-indexeddb is not a dependency of this repo.)
 */

type Handler = ((this: unknown, ev: unknown) => void) | null;

class Req<T> {
  result!: T;
  error: unknown = null;
  onsuccess: Handler = null;
  onerror: Handler = null;
  onupgradeneeded: Handler = null;
}

class Store {
  readonly rows = new Map<string, unknown>();
  constructor(readonly keyPath: string) {}
}

class Db {
  readonly stores = new Map<string, Store>();
  version = 0;
  get objectStoreNames() {
    return { contains: (n: string) => this.stores.has(n) };
  }
  createObjectStore(name: string, opts: { keyPath: string }) {
    const s = new Store(opts.keyPath);
    this.stores.set(name, s);
    return s;
  }
  transaction(name: string, mode: 'readonly' | 'readwrite') {
    const store = this.stores.get(name);
    if (!store) throw new Error(`no store ${name}`);
    return new Tx(store, mode);
  }
}

class Tx {
  oncomplete: Handler = null;
  onerror: Handler = null;
  onabort: Handler = null;
  error: unknown = null;
  private pending = 0;
  private done = false;
  constructor(
    private readonly store: Store,
    private readonly mode: 'readonly' | 'readwrite',
  ) {
    this.check();
  }

  private check(): void {
    setTimeout(() => {
      if (this.done || this.pending > 0) return;
      this.done = true;
      this.oncomplete?.call(this, {});
    }, 0);
  }

  private request<T>(fn: () => T): Req<T> {
    if (this.done) throw new Error('transaction finished');
    const r = new Req<T>();
    this.pending += 1;
    queueMicrotask(() => {
      try {
        r.result = fn();
        this.pending -= 1;
        r.onsuccess?.call(r, {});
      } catch (err) {
        this.pending -= 1;
        r.error = err;
        r.onerror?.call(r, {});
      }
      this.check();
    });
    return r;
  }

  objectStore() {
    const s = this.store;
    const write = () => {
      if (this.mode !== 'readwrite') throw new Error('read-only transaction');
    };
    return {
      put: (v: Record<string, unknown>) =>
        this.request(() => {
          write();
          const key = String(v[s.keyPath]);
          s.rows.set(key, structuredClone(v));
          return key;
        }),
      get: (k: string) => this.request(() => (s.rows.has(k) ? structuredClone(s.rows.get(k)) : undefined)),
      getAll: () => this.request(() => [...s.rows.values()].map((v) => structuredClone(v))),
      delete: (k: string) =>
        this.request(() => {
          write();
          s.rows.delete(k);
          return undefined;
        }),
    };
  }
}

export function fakeIndexedDb(): IDBFactory & { dbs: Map<string, Db> } {
  const dbs = new Map<string, Db>();
  const factory = {
    dbs,
    open(name: string, version = 1) {
      const r = new Req<Db>();
      queueMicrotask(() => {
        let db = dbs.get(name);
        const fresh = !db;
        if (!db) {
          db = new Db();
          dbs.set(name, db);
        }
        r.result = db;
        if (fresh || version > db.version) {
          db.version = version;
          r.onupgradeneeded?.call(r, {});
        }
        r.onsuccess?.call(r, {});
      });
      return r;
    },
  };
  return factory as unknown as IDBFactory & { dbs: Map<string, Db> };
}
