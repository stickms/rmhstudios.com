/**
 * My Replays storage (WS13, REP-02/03, D-34): local IndexedDB only, the newest
 * 30 matches kept (by start time). One record per match: the header and every
 * player's log this peer received (so the POV can be switched), each capped
 * per player by `PlayerLog` (log.ts).
 *
 * IndexedDB database `rmh-balatro-replays`, object store `matches`, keyPath
 * `id` (= the match's runId). A separate database from the rejoin snapshots
 * (rejoin/rejoin-store.ts), so neither has to migrate the other. Every
 * storage failure degrades to "no replays" — never an error in the game.
 */

import type { QueueMode } from '../../net/events';
import type { ReplayEvent } from '../types';
import { isReplayEvent, REPLAY_LIMITS, type ReplayResult } from './log';

export interface ReplayPlayer {
  id: string;
  name: string;
}

export interface ReplayRecord {
  /** The match's runId. */
  id: string;
  /** When the match started (ms since the epoch). */
  at: number;
  savedAt: number;
  kind: 'match' | 'practice' | 'spectated';
  /** Whose replay this is (the recording peer; for a spectated match, the spectator). */
  me: string;
  queueMode: QueueMode;
  ruleset: string;
  players: ReplayPlayer[];
  result: ReplayResult;
  /** Per player id: the contiguous log as received. */
  logs: Record<string, ReplayEvent[]>;
  /** Per player id: a log that hit a D-34 cap. */
  truncated?: Record<string, boolean>;
}

export interface ReplayListEntry {
  id: string;
  at: number;
  queueMode: QueueMode;
  ruleset: string;
  players: string[];
  result: ReplayResult;
}

export interface ReplayStore {
  put(rec: ReplayRecord): Promise<void>;
  get(id: string): Promise<ReplayRecord | null>;
  /** Newest first, at most `KEEP_MATCHES`. */
  list(): Promise<ReplayListEntry[]>;
  delete(id: string): Promise<void>;
}

export const REPLAY_DB = 'rmh-balatro-replays';
export const REPLAY_STORE = 'matches';

export function listEntry(r: ReplayRecord): ReplayListEntry {
  return {
    id: r.id,
    at: r.at,
    queueMode: r.queueMode,
    ruleset: r.ruleset,
    players: r.players.map((p) => p.name.slice(0, 64)).slice(0, 16),
    result: r.result,
  };
}

const newestFirst = (a: { at: number; savedAt: number; id: string }, b: { at: number; savedAt: number; id: string }) =>
  b.at - a.at || b.savedAt - a.savedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Records past the newest `keep` (to delete). */
export function overRetention<T extends { at: number; savedAt: number; id: string }>(
  all: readonly T[],
  keep: number = REPLAY_LIMITS.KEEP_MATCHES,
): T[] {
  return [...all].sort(newestFirst).slice(keep);
}

/** A stored value that is a usable record (anything else is skipped, then deleted). */
export function isReplayRecord(v: unknown): v is ReplayRecord {
  const r = v as ReplayRecord | undefined;
  if (!r || typeof r !== 'object') return false;
  if (typeof r.id !== 'string' || typeof r.at !== 'number' || typeof r.savedAt !== 'number') return false;
  if (typeof r.me !== 'string' || typeof r.queueMode !== 'string' || typeof r.ruleset !== 'string') return false;
  if (!Array.isArray(r.players) || !r.logs || typeof r.logs !== 'object') return false;
  for (const list of Object.values(r.logs)) {
    if (!Array.isArray(list) || !list.every(isReplayEvent)) return false;
  }
  return true;
}

function clone(r: ReplayRecord): ReplayRecord {
  return JSON.parse(JSON.stringify(r)) as ReplayRecord;
}

/** In-memory store (tests, and the fallback where IndexedDB is unavailable). */
export function memoryReplayStore(keep: number = REPLAY_LIMITS.KEEP_MATCHES): ReplayStore & { size(): number } {
  const m = new Map<string, ReplayRecord>();
  return {
    async put(r) {
      m.set(r.id, clone(r));
      for (const old of overRetention([...m.values()], keep)) m.delete(old.id);
    },
    async get(id) {
      const r = m.get(id);
      return r ? clone(r) : null;
    },
    async list() {
      return [...m.values()].sort(newestFirst).slice(0, keep).map(listEntry);
    },
    async delete(id) {
      m.delete(id);
    },
    size: () => m.size,
  };
}

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/** IndexedDB-backed store; null where IndexedDB is unavailable. */
export function idbReplayStore(
  idb: IDBFactory | undefined = globalThis.indexedDB,
  keep: number = REPLAY_LIMITS.KEEP_MATCHES,
): ReplayStore | null {
  if (!idb) return null;
  let dbp: Promise<IDBDatabase> | null = null;
  const open = () =>
    (dbp ??= new Promise<IDBDatabase>((resolve, reject) => {
      const r = idb.open(REPLAY_DB, 1);
      r.onupgradeneeded = () => {
        if (!r.result.objectStoreNames.contains(REPLAY_STORE)) r.result.createObjectStore(REPLAY_STORE, { keyPath: 'id' });
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => {
        dbp = null;
        reject(r.error);
      };
    }));

  const all = async (): Promise<ReplayRecord[]> => {
    const db = await open();
    const store = db.transaction(REPLAY_STORE, 'readonly').objectStore(REPLAY_STORE);
    const rows = (await req(store.getAll())) as unknown[];
    return rows.filter(isReplayRecord);
  };

  const store: ReplayStore = {
    async put(rec) {
      try {
        const db = await open();
        const tx = db.transaction(REPLAY_STORE, 'readwrite');
        const os = tx.objectStore(REPLAY_STORE);
        os.put(clone(rec));
        const rows = (await req(os.getAll())) as unknown[];
        const valid = rows.filter(isReplayRecord);
        const bad = rows.filter((r) => !isReplayRecord(r)) as { id?: unknown }[];
        for (const old of overRetention(valid, keep)) os.delete(old.id);
        for (const b of bad) if (typeof b?.id === 'string') os.delete(b.id);
        await done(tx);
      } catch {
        /* storage full or blocked: the replay is simply not kept */
      }
    },
    async get(id) {
      try {
        const db = await open();
        const v = await req(db.transaction(REPLAY_STORE, 'readonly').objectStore(REPLAY_STORE).get(id));
        return isReplayRecord(v) ? v : null;
      } catch {
        return null;
      }
    },
    async list() {
      try {
        return (await all()).sort(newestFirst).slice(0, keep).map(listEntry);
      } catch {
        return [];
      }
    },
    async delete(id) {
      try {
        const db = await open();
        const tx = db.transaction(REPLAY_STORE, 'readwrite');
        tx.objectStore(REPLAY_STORE).delete(id);
        await done(tx);
      } catch {
        /* ignore */
      }
    },
  };
  return store;
}
