import { decodeWorld, encodeWorld } from './format';
import type { World } from '../world';

const DB = 'hearthworks';
const STORE = 'worlds';

/** The stamp lives under its own key beside the world, so the world's bytes (and older builds) are untouched. */
const metaKey = (slot: string) => `${slot}::meta`;

/** A world as this device holds it, with whose it is. */
export interface StoredWorld {
  world: World;
  /** The member whose account it was saved under; `null` for a guest save or one from before the stamp existed. */
  owner: string | null;
  /** When it was written, ms since epoch; `0` for a save from before the stamp existed. */
  savedAt: number;
}

interface WorldMeta {
  owner: string | null;
  at: number;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Save a world locally, stamped with the signed-in member (`null` for a guest). The local copy is always written
 * first; the account copy follows it. Resolves false (never throws) where storage is unavailable or blocked.
 */
export async function saveWorld(
  slot: string,
  world: World,
  owner: string | null = null,
  at: number = Date.now(),
): Promise<boolean> {
  try {
    const db = await open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      store.put(encodeWorld(world), slot);
      store.put({ owner, at } satisfies WorldMeta, metaKey(slot));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    return true;
  } catch {
    return false;
  }
}

function readMeta(raw: unknown): WorldMeta {
  if (typeof raw !== 'object' || raw === null) return { owner: null, at: 0 };
  const m = raw as Partial<WorldMeta>;
  return {
    owner: typeof m.owner === 'string' && m.owner ? m.owner : null,
    at: typeof m.at === 'number' && Number.isFinite(m.at) && m.at > 0 ? m.at : 0,
  };
}

/**
 * Load a world with its owner, or null if absent, unreadable or storage is unavailable. A world stamped by another
 * signed-in account is not loaded (a different member on a shared browser must not be offered it); a guest's world or
 * one with no stamp is, as before. Pass `identity` as the signed-in member, or `null` when signed out.
 */
export async function loadWorld(slot: string, identity: string | null = null): Promise<StoredWorld | null> {
  try {
    const db = await open();
    const [bytes, meta] = await new Promise<[Uint8Array | undefined, unknown]>((resolve, reject) => {
      const tx = db.transaction(STORE);
      const store = tx.objectStore(STORE);
      const world = store.get(slot);
      const stamp = store.get(metaKey(slot));
      tx.oncomplete = () => resolve([world.result as Uint8Array | undefined, stamp.result]);
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    if (!bytes) return null;
    const { owner, at } = readMeta(meta);
    if (owner && identity && owner !== identity) return null;
    return { world: decodeWorld(bytes), owner, savedAt: at };
  } catch {
    return null;
  }
}
