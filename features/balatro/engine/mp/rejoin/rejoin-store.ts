/**
 * Crash/reload rejoin storage (PLAN §0.4, NET-06).
 *
 * In a match, Lua's `save_run` writes `/rmh/mp/run.jkr` and `/rmh/mp/state.json`
 * and sends `snapshot {runId}`; the session runtime copies both files into
 * IndexedDB keyed by `runId` (here), at vanilla's own save cadence. A reload
 * then restores the run through vanilla's Continue path (`rejoin_restore`).
 *
 * The localStorage hint `rmh-balatro-mp-rejoin` (= runId, MP_REJOIN_HINT_KEY)
 * is set while the player holds a seat in a running match and cleared at match
 * end; boot reads it to preload the MP pack. Only the newest few snapshots are
 * kept. Every storage failure degrades to "no snapshot".
 */

export interface RejoinSnapshot {
  runId: string;
  /** The lobby code the match runs in. */
  code: string;
  savedAt: number;
  run: Uint8Array;
  state: string;
}

export interface SnapshotStore {
  put(snap: RejoinSnapshot): Promise<void>;
  get(runId: string): Promise<RejoinSnapshot | null>;
  delete(runId: string): Promise<void>;
}

export const SNAPSHOT_DB = 'rmh-balatro-mp';
export const SNAPSHOT_STORE = 'snapshots';
export const SNAPSHOT_KEEP = 3;

export function memorySnapshotStore(): SnapshotStore & { all(): RejoinSnapshot[] } {
  const m = new Map<string, RejoinSnapshot>();
  return {
    async put(s) {
      m.set(s.runId, { ...s, run: s.run.slice() });
      const sorted = [...m.values()].sort((a, b) => b.savedAt - a.savedAt);
      for (const old of sorted.slice(SNAPSHOT_KEEP)) m.delete(old.runId);
    },
    async get(runId) {
      const s = m.get(runId);
      return s ? { ...s, run: s.run.slice() } : null;
    },
    async delete(runId) {
      m.delete(runId);
    },
    all: () => [...m.values()],
  };
}

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

/** IndexedDB-backed store; null where IndexedDB is unavailable. */
export function idbSnapshotStore(idb: IDBFactory | undefined = globalThis.indexedDB): SnapshotStore | null {
  if (!idb) return null;
  let dbp: Promise<IDBDatabase> | null = null;
  const open = () =>
    (dbp ??= new Promise<IDBDatabase>((resolve, reject) => {
      const r = idb.open(SNAPSHOT_DB, 1);
      r.onupgradeneeded = () => {
        if (!r.result.objectStoreNames.contains(SNAPSHOT_STORE)) r.result.createObjectStore(SNAPSHOT_STORE, { keyPath: 'runId' });
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => {
        dbp = null;
        reject(r.error);
      };
    }));
  const tx = async (mode: IDBTransactionMode) => (await open()).transaction(SNAPSHOT_STORE, mode).objectStore(SNAPSHOT_STORE);
  const valid = (v: unknown): v is RejoinSnapshot => {
    const s = v as RejoinSnapshot | undefined;
    return !!s && typeof s.runId === 'string' && typeof s.code === 'string' && s.run instanceof Uint8Array && typeof s.state === 'string';
  };
  return {
    async put(snap) {
      try {
        const store = await tx('readwrite');
        await req(store.put(snap));
        const all = ((await req((await tx('readonly')).getAll())) as unknown[]).filter(valid);
        all.sort((a, b) => b.savedAt - a.savedAt);
        const del = await tx('readwrite');
        for (const old of all.slice(SNAPSHOT_KEEP)) await req(del.delete(old.runId));
      } catch {
        /* a rejoin without a snapshot starts the run fresh */
      }
    },
    async get(runId) {
      try {
        const v = await req((await tx('readonly')).get(runId));
        return valid(v) ? v : null;
      } catch {
        return null;
      }
    },
    async delete(runId) {
      try {
        await req((await tx('readwrite')).delete(runId));
      } catch {
        /* nothing to clean */
      }
    },
  };
}
