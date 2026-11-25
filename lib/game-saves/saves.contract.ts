/**
 * Contracts for the cloud save manager (`/settings/cloud-saves`). Client-safe: types come from the zod schemas by
 * `import type`, so no zod ships.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { BackupFile, SnapshotReason } from '@/lib/game-saves/backup';
import type { restoreBody } from '@/lib/game-saves/saves-schema';

export interface SaveSummary {
  gameId: string;
  /** ISO time of the live save; `null` when the game has none. */
  savedAt: string | null;
  sizeBytes: number | null;
  snapshotCount: number;
}

export interface SnapshotSummary {
  /** Row id as a string (a bigint does not survive JSON). */
  id: string;
  reason: SnapshotReason;
  sizeBytes: number;
  createdAt: string;
}

/** The live save of one game, blob included (the page builds a backup file from it). */
export const getGameSaveApi = endpoint<{
  res: {
    saveData: Record<string, unknown> | null;
    updatedAt: string | null;
  };
}>()({
  method: 'GET',
  path: '/api/game-saves/$gameId',
});

/** Delete the live save; a `before-delete` snapshot is kept first. */
export const deleteGameSaveApi = endpoint<{
  res: {
    success: true;
  };
}>()({
  method: 'DELETE',
  path: '/api/game-saves/$gameId',
});

/**
 * Write the live save. `expectedUpdatedAt` is optional: absent, the write is last-writer-wins; an ISO time (or `null`
 * for "no row yet") makes it a compare-and-set that answers 409 {@link SaveChangedElsewhere} when the stored row moved.
 */
export const saveGameApi = endpoint<{
  body: {
    saveData: Record<string, unknown>;
    expectedUpdatedAt?: string | null;
  };
  res: {
    success: true;
    updatedAt: string;
  };
}>()({
  method: 'POST',
  path: '/api/game-saves/$gameId',
});

/** The 409 body of a compare-and-set save: nothing was written; `updatedAt` is the row as it is now. */
export interface SaveChangedElsewhere {
  error: 'Save changed elsewhere';
  updatedAt: string | null;
}

export const listGameSavesApi = endpoint<{
  res: {
    saves: SaveSummary[];
  };
}>()({
  method: 'GET',
  path: '/api/game-saves',
});

export const listSaveSnapshotsApi = endpoint<{
  res: {
    snapshots: SnapshotSummary[];
  };
}>()({
  method: 'GET',
  path: '/api/game-saves/$gameId/snapshots',
});

/** A snapshot as a backup file download (a link target, not called through `api()`). */
export const downloadSaveSnapshotApi = endpoint<{
  res: BackupFile;
}>()({
  method: 'GET',
  path: '/api/game-saves/$gameId/snapshots/$id',
});

export const restoreGameSaveApi = endpoint<{
  body: z.infer<typeof restoreBody>;
  res: {
    success: true;
    updatedAt: string;
  };
}>()({
  method: 'POST',
  path: '/api/game-saves/$gameId/restore',
});
