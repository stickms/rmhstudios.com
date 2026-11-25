/**
 * RMHHomes — the place a comparison measures distance to, and the unit it is shown in (s12 10). Kept on the device
 * only (never sent to the server), through `lib/core/persist`.
 */
import { readJson, writeJson } from '@/lib/core/persist';
import type { DistanceUnit } from './distance';
import type { ComparePlace } from './compare';

export const COMPARE_PLACE_KEY = 'rmh:homes:compare-place';

export interface ComparePrefs {
  place: ComparePlace | null;
  unit: DistanceUnit;
}

export const DEFAULT_COMPARE_PREFS: ComparePrefs = { place: null, unit: 'mi' };

function validPlace(v: unknown): ComparePlace | null {
  if (!v || typeof v !== 'object') return null;
  const p = v as Record<string, unknown>;
  const { label, lat, lng } = p;
  if (typeof label !== 'string' || typeof lat !== 'number' || typeof lng !== 'number') return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { label: label.slice(0, 200), lat, lng };
}

/** Pure check of a stored value: a bad shape falls back to the defaults, field by field. */
export function parseComparePrefs(value: unknown): ComparePrefs | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const v = value as Record<string, unknown>;
  return { place: validPlace(v.place), unit: v.unit === 'km' ? 'km' : 'mi' };
}

export function readComparePrefs(): ComparePrefs {
  return readJson(COMPARE_PLACE_KEY, DEFAULT_COMPARE_PREFS, { validate: parseComparePrefs });
}

export function writeComparePrefs(prefs: ComparePrefs): void {
  writeJson(COMPARE_PLACE_KEY, prefs);
}
