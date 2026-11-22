/**
 * Cloud save backups and snapshot policy (pure, client-safe).
 *
 * A backup file is `{ format: "rmh-cloud-save", version: 1, gameId, savedAt, saveData }`. Restore accepts only that
 * shape, for the same game, as a JSON object no larger than one save may be (`MAX_SAVE_BYTES`). The browser runs
 * `parseBackupFile` before it sends anything and the server runs `validateBackup` again on what arrives, so a file
 * edited by hand or a request that never saw the page meets the same rules.
 */
import { MAX_SAVE_BYTES } from '@/lib/game-saves/registry';

export const BACKUP_FORMAT = 'rmh-cloud-save';
export const BACKUP_VERSION = 1;

/** Snapshots kept per member and game; older ones are pruned in the transaction that adds a new one. */
export const SNAPSHOT_KEEP = 10;

/** An automatic snapshot is taken at most this often per game. */
export const SNAPSHOT_INTERVAL_MS = 6 * 60 * 60 * 1000;

export type SnapshotReason = 'auto' | 'before-restore' | 'before-delete';

export const SNAPSHOT_REASONS: readonly SnapshotReason[] = ['auto', 'before-restore', 'before-delete'];

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  gameId: string;
  /** ISO time the save was last written. */
  savedAt: string;
  saveData: Record<string, unknown>;
}

export type BackupError =
  'not-json' | 'wrong-format' | 'wrong-version' | 'wrong-game' | 'bad-date' | 'bad-save' | 'too-large';

export type BackupResult =
  | {
      ok: true;
      backup: BackupFile;
    }
  | {
      ok: false;
      error: BackupError;
    };

/** Size of a save in the unit `MAX_SAVE_BYTES` is checked in (the length of its JSON, as the save endpoint counts it). */
export function saveSize(saveData: unknown): number {
  return JSON.stringify(saveData).length;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function toBackupFile(gameId: string, savedAt: Date | string, saveData: Record<string, unknown>): BackupFile {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    gameId,
    savedAt: typeof savedAt === 'string' ? savedAt : savedAt.toISOString(),
    saveData,
  };
}

/** Validate an already-parsed backup (the server's entry point, and the second half of `parseBackupFile`). */
export function validateBackup(value: unknown, expectedGameId: string): BackupResult {
  if (!isRecord(value) || value.format !== BACKUP_FORMAT)
    return {
      ok: false,
      error: 'wrong-format',
    };
  if (value.version !== BACKUP_VERSION)
    return {
      ok: false,
      error: 'wrong-version',
    };
  if (value.gameId !== expectedGameId)
    return {
      ok: false,
      error: 'wrong-game',
    };
  if (typeof value.savedAt !== 'string' || Number.isNaN(Date.parse(value.savedAt))) {
    return {
      ok: false,
      error: 'bad-date',
    };
  }
  const { saveData } = value;
  if (!isRecord(saveData))
    return {
      ok: false,
      error: 'bad-save',
    };
  if (saveSize(saveData) > MAX_SAVE_BYTES)
    return {
      ok: false,
      error: 'too-large',
    };
  return {
    ok: true,
    backup: {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      gameId: expectedGameId,
      savedAt: value.savedAt,
      saveData,
    },
  };
}

/** Headroom for the envelope around `saveData`, so a file is refused on its length before it is parsed. */
const ENVELOPE_ALLOWANCE = 2_000;

export function parseBackupFile(text: string, expectedGameId: string): BackupResult {
  if (text.length > MAX_SAVE_BYTES + ENVELOPE_ALLOWANCE)
    return {
      ok: false,
      error: 'too-large',
    };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      ok: false,
      error: 'not-json',
    };
  }
  return validateBackup(parsed, expectedGameId);
}

/** Whether an overwrite should keep the old blob: nothing kept yet, or the newest snapshot is six hours old or more. */
export function shouldSnapshot(lastSnapshotAt: Date | null, now: Date): boolean {
  if (!lastSnapshotAt) return true;
  return now.getTime() - lastSnapshotAt.getTime() >= SNAPSHOT_INTERVAL_MS;
}

/** `<game>-<yyyy-mm-dd>.json`, the name a backup downloads under. */
export function backupFileName(gameId: string, date: Date | string): string {
  const day = (typeof date === 'string' ? new Date(date) : date).toISOString().slice(0, 10);
  return `${gameId}-${day}.json`;
}
