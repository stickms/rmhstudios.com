/**
 * RMHHomes — saved places ("work", "campus"), stored on the device only.
 *
 * A saved place is a label and a coordinate. That is the entire model, and it
 * deliberately has no server side: the set of addresses a person measures their
 * housing search against is a map of their life — where they work, where their
 * kid goes to school, where their ex lives — and none of it is needed on the
 * server to draw a distance badge that is computed in the browser anyway.
 * `localStorage` is therefore the feature, not a shortcut.
 *
 * The pure list operations are separated from the two `localStorage` wrappers
 * so the ordering, de-duplication and cap are testable without a DOM.
 */

import type { LatLng } from './distance';

export interface SavedPlace extends LatLng {
  id: string;
  /** What the user calls it. "Work", "Mom's", "campus". */
  label: string;
}

/** Namespaced so it is obvious in devtools which product owns the row. */
export const SAVED_PLACES_KEY = 'rmh-homes-saved-places';

/**
 * Small on purpose. A commute filter with twenty origins is not a filter, and
 * the cap keeps the whole list cheap to scan per listing per slider tick.
 */
export const MAX_SAVED_PLACES = 8;

export const MAX_PLACE_LABEL_LENGTH = 40;

function isValidCoord(lat: unknown, lng: unknown): lat is number {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

function newId(): string {
  const c = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Parse whatever is in storage into a clean list.
 *
 * Anything malformed is dropped rather than thrown on: this reads a value the
 * user's own browser owns and that a previous version of the app may have
 * written in a different shape, so a bad row must cost one place, not the
 * whole feature.
 */
export function parseSavedPlaces(raw: string | null | undefined): SavedPlace[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const out: SavedPlace[] = [];
  for (const row of parsed) {
    if (!row || typeof row !== 'object') continue;
    const { id, label, lat, lng } = row as Record<string, unknown>;
    if (!isValidCoord(lat, lng)) continue;
    const cleanLabel =
      typeof label === 'string' ? label.trim().slice(0, MAX_PLACE_LABEL_LENGTH) : '';
    if (!cleanLabel) continue;
    out.push({
      id: typeof id === 'string' && id ? id : newId(),
      label: cleanLabel,
      lat: lat as number,
      lng: lng as number,
    });
    if (out.length >= MAX_SAVED_PLACES) break;
  }
  return out;
}

/** Build a place from raw input, or `null` when the input cannot make one. */
export function makeSavedPlace(input: {
  label: string;
  lat: number;
  lng: number;
}): SavedPlace | null {
  const label = input.label.trim().slice(0, MAX_PLACE_LABEL_LENGTH);
  if (!label) return null;
  if (!isValidCoord(input.lat, input.lng)) return null;
  return { id: newId(), label, lat: input.lat, lng: input.lng };
}

/**
 * Append a place. A second place with the same label replaces the first —
 * re-saving "Work" after changing jobs should move the pin, not leave two pins
 * called Work. Over the cap, the oldest goes.
 */
export function addSavedPlace(list: readonly SavedPlace[], place: SavedPlace): SavedPlace[] {
  const key = place.label.toLowerCase();
  const kept = list.filter((p) => p.label.toLowerCase() !== key);
  return [...kept, place].slice(-MAX_SAVED_PLACES);
}

export function removeSavedPlace(list: readonly SavedPlace[], id: string): SavedPlace[] {
  return list.filter((p) => p.id !== id);
}

export function renameSavedPlace(
  list: readonly SavedPlace[],
  id: string,
  label: string,
): SavedPlace[] {
  const clean = label.trim().slice(0, MAX_PLACE_LABEL_LENGTH);
  if (!clean) return [...list];
  return list.map((p) => (p.id === id ? { ...p, label: clean } : p));
}

/* -------------------------------------------------------------------------- */
/* Storage (browser only)                                                     */
/* -------------------------------------------------------------------------- */

function storage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    // Safari in private mode and a blocked third-party context both throw on
    // access rather than returning null.
    return null;
  }
}

export function loadSavedPlaces(): SavedPlace[] {
  const store = storage();
  if (!store) return [];
  try {
    return parseSavedPlaces(store.getItem(SAVED_PLACES_KEY));
  } catch {
    return [];
  }
}

export function persistSavedPlaces(list: readonly SavedPlace[]): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(SAVED_PLACES_KEY, JSON.stringify(list.slice(0, MAX_SAVED_PLACES)));
  } catch {
    // Quota or a locked-down storage partition. The in-memory list still works
    // for this session; losing it on reload beats crashing the filter.
  }
}
