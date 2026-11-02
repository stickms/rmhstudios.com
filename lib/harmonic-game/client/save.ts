/**
 * Harmonic's save slot: the last level reached plus the story flags, in localStorage under
 * `harmonic:save`. Like the HL2/Portal slot it is a level start, not a world snapshot. Every access
 * tolerates a missing, full or throwing storage (private mode): saving then does nothing.
 * Environment-agnostic (storage injected).
 */

export const HARMONIC_SAVE_KEY = 'harmonic:save';
export const HARMONIC_SAVE_VERSION = 1;

export type SaveFlag = boolean | string | number;

export interface HarmonicSave {
  v: typeof HARMONIC_SAVE_VERSION;
  level: string;
  flags: Record<string, SaveFlag>;
  /** Epoch ms. */
  savedAt: number;
}

export interface SaveStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const LEVEL_RE = /^[a-z0-9_]{1,64}$/;
const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

/** `window.localStorage`, or null where touching it throws. */
export function browserStorage(): SaveStorage | null {
  try {
    return typeof window !== 'undefined' ? (window.localStorage ?? null) : null;
  } catch {
    return null;
  }
}

/** Validates a parsed save; anything malformed or of another version is null. */
export function parseHarmonicSave(raw: unknown, levels?: readonly string[]): HarmonicSave | null {
  if (!isObj(raw) || raw.v !== HARMONIC_SAVE_VERSION) return null;
  if (typeof raw.level !== 'string' || !LEVEL_RE.test(raw.level)) return null;
  if (levels && !levels.includes(raw.level)) return null;
  if (typeof raw.savedAt !== 'number' || !Number.isFinite(raw.savedAt)) return null;
  if (!isObj(raw.flags)) return null;
  const flags: Record<string, SaveFlag> = {};
  for (const [k, val] of Object.entries(raw.flags)) {
    if (
      typeof val === 'boolean' ||
      typeof val === 'string' ||
      (typeof val === 'number' && Number.isFinite(val))
    )
      flags[k] = val;
  }
  return { v: HARMONIC_SAVE_VERSION, level: raw.level, flags, savedAt: raw.savedAt };
}

export function readHarmonicSave(
  storage: SaveStorage | null = browserStorage(),
  levels?: readonly string[],
): HarmonicSave | null {
  if (!storage) return null;
  try {
    const text = storage.getItem(HARMONIC_SAVE_KEY);
    return text ? parseHarmonicSave(JSON.parse(text), levels) : null;
  } catch {
    return null;
  }
}

export function writeHarmonicSave(
  save: HarmonicSave,
  storage: SaveStorage | null = browserStorage(),
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(HARMONIC_SAVE_KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}

export function clearHarmonicSave(storage: SaveStorage | null = browserStorage()): void {
  try {
    storage?.removeItem(HARMONIC_SAVE_KEY);
  } catch {
    /* nothing to clear */
  }
}

/** A level began: record it, keeping the flags of the run in progress. */
export function saveLevelStart(
  level: string,
  storage: SaveStorage | null = browserStorage(),
  now: number = Date.now(),
): boolean {
  const prev = readHarmonicSave(storage);
  return writeHarmonicSave(
    { v: HARMONIC_SAVE_VERSION, level, flags: prev?.flags ?? {}, savedAt: now },
    storage,
  );
}
