import { openDB, type IDBPDatabase } from 'idb';
import type { Project, ProjectMeta, SampleMeta } from './types';

const DB_NAME = 'rmh-studio-db';
const DB_VERSION = 1;

interface StudioDB {
  projects: { key: string; value: { id: string; name: string; data: string; updatedAt: number } };
  samples: { key: string; value: { id: string; name: string; buffer: ArrayBuffer; meta: SampleMeta } };
  presets: { key: string; value: { id: string; pluginId: string; name: string; params: Record<string, number> } };
}

let dbInstance: IDBPDatabase | null = null;

async function getDB(): Promise<IDBPDatabase> {
  if (dbInstance) return dbInstance;
  dbInstance = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('projects')) {
        db.createObjectStore('projects', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('samples')) {
        db.createObjectStore('samples', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('presets')) {
        db.createObjectStore('presets', { keyPath: 'id' });
      }
    },
  });
  return dbInstance;
}

// ─── Projects ───────────────────────────────────────────────────────────────

export async function saveProject(project: Project): Promise<void> {
  const db = await getDB();
  await db.put('projects', {
    id: project.id,
    name: project.name,
    data: JSON.stringify(project),
    updatedAt: Date.now(),
  });
}

export async function loadProject(id: string): Promise<Project | null> {
  const db = await getDB();
  const row = await db.get('projects', id);
  if (!row) return null;
  return JSON.parse(row.data as string) as Project;
}

export async function deleteProject(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('projects', id);
}

export async function listProjects(): Promise<ProjectMeta[]> {
  const db = await getDB();
  const all = await db.getAll('projects');
  return all
    .map((row) => ({
      id: row.id as string,
      name: row.name as string,
      updatedAt: row.updatedAt as number,
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

// ─── Samples ────────────────────────────────────────────────────────────────

export async function saveSample(
  id: string,
  name: string,
  buffer: ArrayBuffer,
  meta: SampleMeta,
): Promise<void> {
  const db = await getDB();
  await db.put('samples', { id, name, buffer, meta });
}

export async function loadSample(id: string): Promise<{ buffer: ArrayBuffer; meta: SampleMeta } | null> {
  const db = await getDB();
  const row = await db.get('samples', id);
  if (!row) return null;
  return { buffer: row.buffer as ArrayBuffer, meta: row.meta as SampleMeta };
}

export async function deleteSample(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('samples', id);
}

export async function listSamples(): Promise<SampleMeta[]> {
  const db = await getDB();
  const all = await db.getAll('samples');
  return all.map((row) => row.meta as SampleMeta);
}

// ─── Presets ────────────────────────────────────────────────────────────────

export async function savePreset(
  id: string,
  pluginId: string,
  name: string,
  params: Record<string, number>,
): Promise<void> {
  const db = await getDB();
  await db.put('presets', { id, pluginId, name, params });
}

export async function loadPresetsForPlugin(pluginId: string): Promise<{ id: string; name: string; params: Record<string, number> }[]> {
  const db = await getDB();
  const all = await db.getAll('presets');
  return all
    .filter((row) => row.pluginId === pluginId)
    .map((row) => ({ id: row.id as string, name: row.name as string, params: row.params as Record<string, number> }));
}
