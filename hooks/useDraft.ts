'use client';

/**
 * Keyed draft autosave (plan B3) — the generalisation of `useComposeDraft`.
 *
 * `useComposeDraft` saves ONE draft, for the feed composer, under one fixed
 * localStorage key. Every other surface that can lose written work — comment
 * boxes, the blog editor, a bio, a group description, a message — either
 * re-implemented that or shipped without it. This is the same idea with the
 * three properties the single-key version could not have:
 *
 *  1. **Keyed.** `${surface}:${entityId ?? 'new'}:${userId}`. The `userId`
 *     segment is not decoration: a shared laptop is the normal case for a
 *     school or a family, and a draft keyed only by surface would hand the
 *     next person to sign in the previous person's half-written post. Editing
 *     an existing entity keys by its id; a new one keys by `new`, so starting a
 *     second post does not clobber the first entity's in-progress edit.
 *  2. **IndexedDB, not localStorage.** Drafts can hold structured values
 *     (attachments metadata, an editor's node tree), localStorage is a
 *     synchronous main-thread string store with a ~5 MB per-origin cap shared
 *     with everything else the site keeps there, and writes on every keystroke
 *     debounce are exactly the pattern that makes that hurt.
 *  3. **A restore prompt rather than an auto-apply.** Silently refilling an
 *     editor the user deliberately emptied is its own kind of data loss, so the
 *     recovered value is *offered* (`recovered`) and the caller decides.
 *
 * `useComposeDraft` is deliberately left alone — it is live on the composer and
 * its localStorage key holds real drafts today. New surfaces use this.
 *
 * Client-only (touches `indexedDB`); import from components, never the server.
 */

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { useCallback, useEffect, useRef, useState } from 'react';

const DB_NAME = 'rmh-drafts';
const DB_VERSION = 1;
const STORE = 'drafts';

/**
 * Longer than the composer's 600ms: these surfaces are long-form, an IndexedDB
 * write is a transaction rather than a string assignment, and nothing here is
 * needed until the tab dies.
 */
const DEBOUNCE_MS = 800;

/** Drafts older than this are junk — see `clearExpiredDrafts`. */
export const DEFAULT_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

/** One persisted draft. `value` is whatever shape the surface hands us. */
export interface DraftRecord<T = unknown> {
  key: string;
  surface: string;
  entityId: string | null;
  userId: string;
  value: T;
  savedAt: number;
}

interface DraftDB extends DBSchema {
  [STORE]: {
    key: string;
    value: DraftRecord;
    // Sweeping by age is the only whole-store query, so it gets the only index.
    indexes: { 'by-savedAt': number };
  };
}

let dbPromise: Promise<IDBPDatabase<DraftDB>> | null = null;

function getDB(): Promise<IDBPDatabase<DraftDB>> {
  if (!dbPromise) {
    dbPromise = openDB<DraftDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: 'key' });
          store.createIndex('by-savedAt', 'savedAt');
        }
      },
    });
  }
  return dbPromise;
}

/**
 * The draft key. Exported because tests and any future "you have N drafts"
 * surface must derive it the same way — a second copy of this template is how
 * drafts start leaking between accounts.
 */
export function draftKey(surface: string, entityId: string | null | undefined, userId: string) {
  return `${surface}:${entityId ?? 'new'}:${userId}`;
}

/** Read one draft. Resolves to `null` when absent or storage is unavailable. */
export async function loadDraft<T>(key: string): Promise<DraftRecord<T> | null> {
  try {
    const db = await getDB();
    const row = await db.get(STORE, key);
    return (row as DraftRecord<T> | undefined) ?? null;
  } catch {
    return null; // private mode / storage disabled — editing still works
  }
}

/** Write one draft (best-effort; swallows quota and private-mode failures). */
export async function saveDraft<T>(record: Omit<DraftRecord<T>, 'savedAt'>): Promise<void> {
  try {
    const db = await getDB();
    await db.put(STORE, { ...record, savedAt: Date.now() } as DraftRecord);
  } catch {
    /* storage unavailable — the editor keeps working, just without recovery */
  }
}

/** Delete one draft. */
export async function deleteDraft(key: string): Promise<void> {
  try {
    const db = await getDB();
    await db.delete(STORE, key);
  } catch {
    /* nothing to do — the record either never existed or is unreachable */
  }
}

/**
 * Drop drafts older than `maxAgeMs` (default 14 days) and report how many went.
 *
 * Nothing else deletes a draft the user never came back to, so without this the
 * store grows forever on the device of anyone who abandons text — and a
 * two-month-old draft offered back is noise, not a rescue. Cheap enough to call
 * from an idle callback on app start; it walks the `by-savedAt` index over a
 * bounded key range rather than scanning the store.
 */
export async function clearExpiredDrafts(maxAgeMs = DEFAULT_MAX_AGE_MS): Promise<number> {
  try {
    const db = await getDB();
    const cutoff = Date.now() - maxAgeMs;
    const tx = db.transaction(STORE, 'readwrite');
    const index = tx.store.index('by-savedAt');
    let cursor = await index.openCursor(IDBKeyRange.upperBound(cutoff, true));
    let removed = 0;
    while (cursor) {
      await cursor.delete();
      removed += 1;
      cursor = await cursor.continue();
    }
    await tx.done;
    return removed;
  } catch {
    return 0;
  }
}

export interface UseDraftOptions<T> {
  /** Stable name for the editor kind — `'compose'`, `'comment'`, `'blog'`, … */
  surface: string;
  /** The entity being edited; omit/null for a new one (keys as `new`). */
  entityId?: string | null;
  /** The signed-in user. Persistence is OFF while this is null — see below. */
  userId: string | null | undefined;
  /** The live editor value. Written back debounced whenever it is "dirty". */
  value: T;
  /**
   * Is this value worth keeping? Defaults to "not empty string / not empty
   * object". A draft that fails this is deleted rather than stored, so clearing
   * an editor clears its draft.
   */
  isDirty?: (value: T) => boolean;
  /**
   * Turn autosave off without unmounting — for seeded editors (a quote, a
   * share-target payload) that would otherwise overwrite a real draft with
   * content the user did not type.
   */
  enabled?: boolean;
}

export interface UseDraftResult<T> {
  /** A stored draft worth offering back, or null. Render your restore prompt off this. */
  recovered: T | null;
  /** "Restore": returns the value to apply and closes the prompt (keeps the record). */
  accept: () => T | null;
  /** "Discard": deletes the stored draft and closes the prompt. */
  discard: () => void;
  /** Delete the draft without a prompt — call this after a successful submit. */
  clear: () => void;
  /** True once IndexedDB has been consulted for this key. */
  ready: boolean;
}

function defaultIsDirty(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value as object).length > 0;
  return true;
}

export function useDraft<T>({
  surface,
  entityId = null,
  userId,
  value,
  isDirty = defaultIsDirty,
  enabled = true,
}: UseDraftOptions<T>): UseDraftResult<T> {
  // No user, no key, no persistence. Falling back to an `anon` segment would
  // put every signed-out visitor on a shared device in the same bucket, which
  // is the exact leak the key format exists to prevent.
  const key = userId ? draftKey(surface, entityId, userId) : null;

  const [recovered, setRecovered] = useState<T | null>(null);
  const [ready, setReady] = useState(false);

  // Mirrored in refs so the debounce timer and the unmount flush always read
  // the freshest value/key without re-arming on every keystroke.
  const valueRef = useRef(value);
  valueRef.current = value;
  const keyRef = useRef(key);
  keyRef.current = key;
  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const write = useCallback(() => {
    const k = keyRef.current;
    if (!k || !userId) return;
    const current = valueRef.current;
    if (isDirtyRef.current(current)) {
      void saveDraft<T>({ key: k, surface, entityId, userId, value: current });
    } else {
      void deleteDraft(k);
    }
  }, [surface, entityId, userId]);

  // Load pass. Runs per key, so switching entities re-asks the store.
  useEffect(() => {
    let alive = true;
    setReady(false);
    setRecovered(null);
    if (!key) {
      setReady(true);
      return;
    }
    void loadDraft<T>(key).then((record) => {
      if (!alive) return;
      const fresh = record && Date.now() - record.savedAt <= DEFAULT_MAX_AGE_MS ? record : null;
      // An expired record is swept here too, so a surface the user revisits
      // cleans up after itself even if the idle sweep never ran.
      if (record && !fresh) void deleteDraft(key);
      setRecovered(fresh ? fresh.value : null);
      setReady(true);
    });
    return () => {
      alive = false;
    };
  }, [key]);

  // Autosave pass.
  useEffect(() => {
    if (!enabled || !key || !ready) return;
    // Suspended while a restore prompt is open. The editor is empty at that
    // moment by definition — the user has not answered yet — and writing that
    // empty value back would delete the very draft being offered.
    if (recovered !== null) return;

    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      write();
    }, DEBOUNCE_MS);

    return () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
    };
  }, [value, enabled, key, ready, recovered, write]);

  // Flush on unmount — but only a write we had already committed to. Navigating
  // away mid-sentence must still save; a component that was idle must not get a
  // spurious write (it would resurrect a draft `clear()` just removed).
  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
        write();
      }
    },
    [write],
  );

  const accept = useCallback(() => {
    const restored = recovered;
    setRecovered(null);
    return restored;
  }, [recovered]);

  const discard = useCallback(() => {
    setRecovered(null);
    if (keyRef.current) void deleteDraft(keyRef.current);
  }, []);

  const clear = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    setRecovered(null);
    if (keyRef.current) void deleteDraft(keyRef.current);
  }, []);

  return { recovered, accept, discard, clear, ready };
}
