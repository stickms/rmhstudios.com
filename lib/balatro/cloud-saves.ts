/**
 * Balatro saves on the account: the shared game-save table (`GameSave`, gameId
 * `balatro`, via /api/game-saves/balatro) holds one snapshot of the game's whole
 * save directory.
 *
 * Why a snapshot and not per-file rows: Balatro's files depend on each other — a
 * profile's profile.jkr (stats, unlocks), meta.jkr (discoveries) and save.jkr (the
 * run in progress) are written together. Merging them file by file from two
 * devices could pair a run with stats from another device. So the whole directory
 * moves as one unit, and the newer snapshot wins; IndexedDB stays the local copy
 * that survives a closed tab, and the account copy is how saves reach another
 * device (and survive a cleared browser).
 *
 * "Newer" is the newest file modification time inside the snapshot (the game
 * writes settings.jkr on every save, so it advances whenever anything is saved).
 */
import { jsonTransport, type CloudTransport } from '@/lib/game-saves/cloud-save';
import { MAX_SAVE_BYTES } from '@/lib/game-saves/registry';

export const CLOUD_ENDPOINT = '/api/game-saves/balatro';

export interface SaveFile {
  /** Relative to the save directory: `settings.jkr`, `1/save.jkr`. */
  path: string;
  data: Uint8Array;
  /** Modification time, ms since the epoch. */
  mtime: number;
}

export interface SaveSnapshot {
  v: 1;
  /** Newest file mtime in the snapshot. */
  savedAt: number;
  files: Record<string, { data: string; mtime: number }>;
}

/** Save files only: `settings.jkr`/`metrics.jkr` at the root, profile files in 1–3. */
export function isSavePath(path: string): boolean {
  return /^(?:[123]\/)?[A-Za-z0-9_-]+\.jkr$/.test(path);
}

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

function fromBase64(text: string): Uint8Array {
  const s = atob(text);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function newestMtime(files: SaveFile[]): number {
  return files.reduce((m, f) => Math.max(m, f.mtime), 0);
}

export function toSnapshot(files: SaveFile[]): SaveSnapshot {
  const out: SaveSnapshot['files'] = {};
  for (const f of files) if (isSavePath(f.path)) out[f.path] = { data: toBase64(f.data), mtime: f.mtime };
  return { v: 1, savedAt: newestMtime(files), files: out };
}

/** A stored payload back into files, or null if it is not a snapshot we wrote. */
export function parseSnapshot(raw: unknown): SaveFile[] | null {
  if (!raw || typeof raw !== 'object') return null;
  const snap = raw as Partial<SaveSnapshot>;
  if (snap.v !== 1 || !snap.files || typeof snap.files !== 'object') return null;
  const files: SaveFile[] = [];
  for (const [path, entry] of Object.entries(snap.files)) {
    if (!isSavePath(path) || !entry || typeof entry.data !== 'string' || typeof entry.mtime !== 'number') {
      return null;
    }
    try {
      files.push({ path, data: fromBase64(entry.data), mtime: entry.mtime });
    } catch {
      return null;
    }
  }
  return files;
}

/** Which copy the game should start from. */
export function chooseSnapshot(local: SaveFile[], cloud: SaveFile[] | null): 'local' | 'cloud' {
  if (!cloud || !cloud.length) return 'local';
  if (!local.length) return 'cloud';
  return newestMtime(cloud) > newestMtime(local) ? 'cloud' : 'local';
}

export interface CloudSaves {
  /** The account's snapshot, or null (none, signed out, offline). */
  read(): Promise<SaveFile[] | null>;
  /** Queue an upload of the current directory (throttled). */
  schedule(read: () => SaveFile[]): void;
  /** Upload now if anything changed (tab hidden / leaving). */
  flush(read: () => SaveFile[]): void;
}

const MIN_INTERVAL_MS = 10_000;
const DEBOUNCE_MS = 2_000;

export function createCloudSaves(
  transport: CloudTransport = jsonTransport(CLOUD_ENDPOINT),
  onError?: (message: string) => void,
): CloudSaves {
  let lastBody = '';
  let lastSent = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let tooLargeReported = false;

  const body = (files: SaveFile[]): { snap: SaveSnapshot; json: string } | null => {
    const snap = toSnapshot(files);
    const json = JSON.stringify(snap);
    if (json === lastBody || !Object.keys(snap.files).length) return null;
    // The shared table's per-row cap; three full profiles stay well under it.
    if (json.length > MAX_SAVE_BYTES - 1024) {
      if (!tooLargeReported) onError?.('save-too-large');
      tooLargeReported = true;
      return null;
    }
    return { snap, json };
  };

  const send = async (read: () => SaveFile[]) => {
    timer = null;
    const next = body(read());
    if (!next) return;
    lastSent = Date.now();
    try {
      await transport.write(next.snap);
      lastBody = next.json;
    } catch {
      onError?.('save-upload-failed');
    }
  };

  return {
    async read() {
      try {
        return parseSnapshot(await transport.read());
      } catch {
        return null;
      }
    },
    schedule(read) {
      if (timer) return;
      const wait = Math.max(DEBOUNCE_MS, lastSent + MIN_INTERVAL_MS - Date.now());
      timer = setTimeout(() => void send(read), wait);
    },
    flush(read) {
      if (timer) clearTimeout(timer);
      timer = null;
      const next = body(read());
      if (!next) return;
      lastSent = Date.now();
      if (transport.beacon(next.snap)) lastBody = next.json;
    },
  };
}
