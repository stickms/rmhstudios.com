/**
 * RMHStudio — IndexedDB Project Storage
 *
 * Stores full project data in IndexedDB for persistence beyond what
 * localStorage can handle.  Provides save, load, list, delete, export,
 * and import operations.
 */

import type { Project } from './types';

const DB_NAME = 'rmhstudio';
const DB_VERSION = 1;
const STORE_NAME = 'projects';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(
  db: IDBDatabase,
  mode: IDBTransactionMode,
): IDBObjectStore {
  return db.transaction(STORE_NAME, mode).objectStore(STORE_NAME);
}

function wrap<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ─── Public API ──────────────────────────────────────────────────

export async function saveProject(project: Project): Promise<void> {
  const db = await openDB();
  const store = tx(db, 'readwrite');
  await wrap(store.put({ ...project, updatedAt: Date.now() }));
  db.close();
}

export async function loadProject(id: string): Promise<Project | undefined> {
  const db = await openDB();
  const store = tx(db, 'readonly');
  const result = await wrap(store.get(id));
  db.close();
  return result as Project | undefined;
}

export interface ProjectSummary {
  id: string;
  name: string;
  bpm: number;
  createdAt: number;
  updatedAt: number;
}

export async function listProjects(): Promise<ProjectSummary[]> {
  const db = await openDB();
  const store = tx(db, 'readonly');
  const all: Project[] = await wrap(store.getAll());
  db.close();
  return all
    .map(p => ({
      id: p.id,
      name: p.name,
      bpm: p.bpm,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deleteProject(id: string): Promise<void> {
  const db = await openDB();
  const store = tx(db, 'readwrite');
  await wrap(store.delete(id));
  db.close();
}

export function exportProjectJSON(project: Project): string {
  return JSON.stringify(project, null, 2);
}

export function importProjectJSON(json: string): Project {
  const parsed = JSON.parse(json) as Project;
  // Assign a new ID to avoid collisions
  parsed.id = crypto.randomUUID();
  parsed.createdAt = Date.now();
  parsed.updatedAt = Date.now();
  return parsed;
}
