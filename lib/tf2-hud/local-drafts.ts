/**
 * Local drafts in IndexedDB — how a signed-out author keeps their work (and how
 * a signed-in one keeps unsaved edits across a crash). Binary files are stored
 * natively; text as strings. Every call is best-effort: if IndexedDB is
 * unavailable the editor keeps working, it just cannot restore.
 */

import { binaryContent, textContent } from './project/model';
import type { FileContent, HudMeta, Overlay } from './project/types';

const DB_NAME = 'rmh-tf2-hud';
const DB_VERSION = 1;

export interface DraftSummary {
  id: string;
  meta: HudMeta;
  updatedAt: number;
  fileCount: number;
}

interface DraftRecord {
  id: string;
  meta: HudMeta;
  updatedAt: number;
  /** [path, null | string | Uint8Array] */
  files: [string, string | Uint8Array | null][];
  /** Server HUD this draft tracks, once saved to an account. */
  remoteId?: string;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('drafts'))
        db.createObjectStore('drafts', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('tf-assets')) db.createObjectStore('tf-assets');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(
  store: 'drafts' | 'tf-assets',
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        t.oncomplete = () => {
          resolve(req.result);
          db.close();
        };
        t.onerror = () => {
          reject(t.error);
          db.close();
        };
        t.onabort = () => {
          reject(t.error);
          db.close();
        };
      }),
  );
}

function toRecord(id: string, meta: HudMeta, overlay: Overlay, remoteId?: string): DraftRecord {
  const files: DraftRecord['files'] = [];
  for (const [path, c] of overlay) {
    files.push([path, c === null ? null : c.kind === 'text' ? c.text : c.bytes]);
  }
  return { id, meta, updatedAt: Date.now(), files, remoteId };
}

function fromRecord(rec: DraftRecord): { meta: HudMeta; overlay: Overlay; remoteId?: string } {
  const overlay = new Map<string, FileContent | null>();
  for (const [path, data] of rec.files) {
    overlay.set(
      path,
      data === null ? null : typeof data === 'string' ? textContent(data) : binaryContent(data),
    );
  }
  return { meta: rec.meta, overlay, remoteId: rec.remoteId };
}

export async function saveDraft(
  id: string,
  meta: HudMeta,
  overlay: Overlay,
  remoteId?: string,
): Promise<void> {
  try {
    await tx('drafts', 'readwrite', (s) => s.put(toRecord(id, meta, overlay, remoteId)));
  } catch {
    /* best effort */
  }
}

export async function loadDraft(
  id: string,
): Promise<{ meta: HudMeta; overlay: Overlay; remoteId?: string } | undefined> {
  try {
    const rec = await tx<DraftRecord | undefined>('drafts', 'readonly', (s) => s.get(id));
    return rec ? fromRecord(rec) : undefined;
  } catch {
    return undefined;
  }
}

export async function listDrafts(): Promise<DraftSummary[]> {
  try {
    const all = await tx<DraftRecord[]>('drafts', 'readonly', (s) => s.getAll());
    return all
      .map((r) => ({ id: r.id, meta: r.meta, updatedAt: r.updatedAt, fileCount: r.files.length }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

export async function deleteDraft(id: string): Promise<void> {
  try {
    await tx('drafts', 'readwrite', (s) => s.delete(id));
  } catch {
    /* best effort */
  }
}

/* ── User-imported TF2 files (fonts, textures, localisation) ── */

export async function saveTfAssets(files: Map<string, Uint8Array>): Promise<void> {
  try {
    const db = await open();
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction('tf-assets', 'readwrite');
      const s = t.objectStore('tf-assets');
      s.clear();
      for (const [path, bytes] of files) s.put(bytes, path);
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
    db.close();
  } catch {
    /* best effort */
  }
}

export async function loadTfAssets(): Promise<Map<string, Uint8Array>> {
  const out = new Map<string, Uint8Array>();
  try {
    const db = await open();
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction('tf-assets', 'readonly');
      const req = t.objectStore('tf-assets').openCursor();
      req.onsuccess = () => {
        const cur = req.result;
        if (cur) {
          out.set(String(cur.key), cur.value as Uint8Array);
          cur.continue();
        } else resolve();
      };
      req.onerror = () => reject(req.error);
    });
    db.close();
  } catch {
    /* none stored */
  }
  return out;
}

export async function clearTfAssets(): Promise<void> {
  try {
    await tx('tf-assets', 'readwrite', (s) => s.clear());
  } catch {
    /* best effort */
  }
}
