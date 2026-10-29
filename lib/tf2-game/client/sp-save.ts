/**
 * Half-Life 2 / Portal "Continue": the last map reached, persisted in
 * localStorage (`rmh:sp-game:save:<game>`), so a player can pick up where
 * they were on another visit.
 *
 * What is saved is a level start, not a snapshot of the world: the map, and
 * the transition that led into it (the carried player — health, suit, the
 * portal gun — and the entities that came through the landmark), which is all
 * plain data (lib/sp-game/level/transition.ts). An in-map checkpoint holds live
 * entity references and stays in memory for the session (death reloads it);
 * a later visit restarts the saved map from its entrance.
 *
 * Every storage access tolerates a missing, full or throwing localStorage
 * (private mode, blocked site data): saving then just does nothing.
 *
 * Environment-agnostic (storage injected).
 */

import type { TransitionData } from '@/lib/sp-game/level/transition';

export type SpGameId = 'hl2' | 'portal';

export const SP_SAVE_VERSION = 1;

export interface SpSave {
  v: typeof SP_SAVE_VERSION;
  game: SpGameId;
  map: string;
  /** How the map was entered (null: a new game / chapter start). */
  transition: TransitionData | null;
  /** Epoch ms. */
  savedAt: number;
  /** Autosaves reached in this map (shown as "checkpoint N"). */
  checkpoints: number;
}

export interface SaveStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const saveKey = (game: SpGameId): string => `rmh:sp-game:save:${game}`;

/** `window.localStorage`, or null where touching it throws. */
export function browserSaveStorage(): SaveStorage | null {
  try {
    return typeof window !== 'undefined' ? (window.localStorage ?? null) : null;
  } catch {
    return null;
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const MAP_RE = /^[a-z0-9_]{1,64}$/;

/** Validates a stored save (anything malformed → null). `maps` limits the map to the game's published list. */
export function parseSave(raw: unknown, game: SpGameId, maps: readonly string[]): SpSave | null {
  if (!isObj(raw) || raw.v !== SP_SAVE_VERSION || raw.game !== game) return null;
  if (typeof raw.map !== 'string' || !MAP_RE.test(raw.map) || !maps.includes(raw.map)) return null;
  const savedAt = typeof raw.savedAt === 'number' && Number.isFinite(raw.savedAt) ? raw.savedAt : 0;
  const checkpoints = typeof raw.checkpoints === 'number' && raw.checkpoints >= 0 ? Math.floor(raw.checkpoints) : 0;
  let transition: TransitionData | null = null;
  if (isObj(raw.transition)) {
    const t = raw.transition;
    // The shape the SP world expects; anything else starts the map fresh rather than crashing it.
    if (
      typeof t.toMap === 'string' &&
      t.toMap === raw.map &&
      typeof t.landmark === 'string' &&
      isObj(t.player) &&
      Array.isArray(t.entities) &&
      isObj(t.globals)
    ) {
      transition = t as unknown as TransitionData;
    }
  }
  return { v: SP_SAVE_VERSION, game, map: raw.map, transition, savedAt, checkpoints };
}

export function loadSave(game: SpGameId, maps: readonly string[], storage: SaveStorage | null = browserSaveStorage()): SpSave | null {
  if (!storage) return null;
  try {
    const text = storage.getItem(saveKey(game));
    return text ? parseSave(JSON.parse(text), game, maps) : null;
  } catch {
    return null;
  }
}

/** Persists; false when storage refused (the game goes on without it). */
export function writeSave(save: SpSave, storage: SaveStorage | null = browserSaveStorage()): boolean {
  if (!storage) return false;
  try {
    storage.setItem(saveKey(save.game), JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}

export function clearSave(game: SpGameId, storage: SaveStorage | null = browserSaveStorage()): void {
  try {
    storage?.removeItem(saveKey(game));
  } catch {
    /* nothing to clear */
  }
}

export function makeSave(game: SpGameId, map: string, transition: TransitionData | null, checkpoints = 0, now = Date.now()): SpSave {
  return { v: SP_SAVE_VERSION, game, map, transition, savedAt: now, checkpoints };
}
