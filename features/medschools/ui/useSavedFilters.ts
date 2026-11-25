import { useSyncExternalStore } from 'react';
import { readString, removeKey, writeString } from '@/lib/core/persist';
import {
  SAVED_FILTERS_KEY,
  clearScope,
  parseSavedFilters,
  serializeSavedFilters,
  updateSaved,
  type SavedFilters,
  type SavedPatch,
  type Scope,
} from '../engine/saved-filters';

/**
 * The filters this device remembers (owner 2026-11-24): the browser half of `engine/saved-filters.ts`.
 *
 * The server cannot read localStorage, so the server HTML and the hydrating render show the URL's view (and the
 * member's preferences); right after hydration this store answers and the page moves to the remembered filters in
 * place, through the same path as any filter change (the previous answer kept on screen, dimmed, until the new one
 * lands; no scroll change, no skeleton). Nothing here touches the URL or a public cache key.
 *
 * Every read and write goes through `lib/core/persist` (never throws): a private window, blocked storage or junk reads as "nothing saved", and a choice
 * storage would not keep still holds for this visit.
 */

const EMPTY: SavedFilters = {};
const listeners = new Set<() => void>();
let cachedRaw: string | null | undefined;
let cached: SavedFilters = EMPTY;
/** A value storage would not keep (blocked or full): it stands in for the stored one this visit. */
let unsaved: string | null | undefined;

function readRaw(): string | null {
  if (unsaved !== undefined) return unsaved;
  return readString(SAVED_FILTERS_KEY);
}

function read(): SavedFilters {
  const raw = readRaw();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cached = parseSavedFilters(raw);
  }
  return cached;
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  // Another tab's change follows here too.
  const onStorage = (e: StorageEvent) => {
    if (e.key === SAVED_FILTERS_KEY || e.key === null) fn();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(fn);
    window.removeEventListener('storage', onStorage);
  };
}

function write(next: SavedFilters): void {
  const value = serializeSavedFilters(next);
  if (value === null) {
    removeKey(SAVED_FILTERS_KEY);
    unsaved = readString(SAVED_FILTERS_KEY) === null ? undefined : null;
  } else {
    unsaved = writeString(SAVED_FILTERS_KEY, value) ? undefined : value;
  }
  for (const fn of listeners) fn();
}

/** Remember one change in a scope's filters ("all" clears that filter). */
export function saveFilters(scope: Scope, patch: SavedPatch): void {
  write(updateSaved(read(), scope, patch));
}

/** Forget everything a scope remembers. */
export function clearSavedFilters(scope: Scope): void {
  write(clearScope(read(), scope));
}

/** The saved filters: `{}` on the server and in the hydrating render, this device's right after. */
export function useSavedFilters(): SavedFilters {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}
