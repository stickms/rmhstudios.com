import { isAllPrograms, normalizePrograms, type ProgramKey } from './programs';
import { decodeMine, encodeMine, type MineChoice } from './mine';
import { MAX_STATES } from './search';
import { HOME_STATE_CODES } from './tracker';
import type { MedEventType } from './types';

/**
 * The filters this device remembers (owner 2026-11-24: "users may only be interested in specific states or program
 * types"). The pure half: the shape, its parser, the update rules and the precedence. The browser half is
 * `ui/useSavedFilters.ts`; like the light/dark choice (`mode.ts`) it lives on this device only, never the account.
 *
 * Two scopes. The index and the live page share one set (programs, states, "my schools"): a member who picked
 * California on the index wants it on the live page too. The activity rail keeps its own (programs, event types, "my
 * schools"), because it sits beside the page and a change in it must not move the page.
 */

/** The localStorage key (named in `lib/device-data/registry.ts`). */
export const SAVED_FILTERS_KEY = 'rmh-medschool-filters';

/** The rail's event types (the public live types), for validating a stored list. */
const EVENT_TYPES: readonly MedEventType[] = [
  'INTERVIEW',
  'SECONDARY',
  'ACCEPTANCE',
  'WAITLIST',
  'REJECTION',
  'HOLD',
  'WITHDRAWN',
];
const KNOWN_STATES = new Set(HOME_STATE_CODES);

export interface SavedScope {
  /** A program set other than all four (all four is never stored: it is the default). */
  programs?: ProgramKey[];
  /** One to `MAX_STATES` known codes, sorted (pages only). */
  states?: string[];
  /** Event types other than all of them (rail only). */
  types?: MedEventType[];
  /** "My schools", as `encodeMine` writes it. */
  mine?: string;
}

export interface SavedFilters {
  page?: SavedScope;
  rail?: SavedScope;
}

export type Scope = keyof SavedFilters;

function cleanScope(raw: unknown): SavedScope | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const out: SavedScope = {};
  if (Array.isArray(r.programs)) {
    const p = normalizePrograms(r.programs);
    if (p.length > 0 && !isAllPrograms(p)) out.programs = p;
  }
  if (Array.isArray(r.states)) {
    const s = [...new Set(r.states.filter((x): x is string => typeof x === 'string' && KNOWN_STATES.has(x)))]
      .sort()
      .slice(0, MAX_STATES);
    if (s.length > 0) out.states = s;
  }
  if (Array.isArray(r.types)) {
    const wanted = new Set(r.types);
    const t = EVENT_TYPES.filter((ty) => wanted.has(ty));
    if (t.length > 0 && t.length < EVENT_TYPES.length) out.types = t;
  }
  const mine = decodeMine(r.mine);
  if (mine) out.mine = encodeMine(mine);
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Whatever is stored (nothing, junk, another version's shape) reads as a valid value. Never throws. */
export function parseSavedFilters(raw: string | null | undefined): SavedFilters {
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== 'object') return {};
  const p = parsed as Record<string, unknown>;
  const page = cleanScope(p.page);
  const rail = cleanScope(p.rail);
  return { ...(page ? { page } : {}), ...(rail ? { rail } : {}) };
}

/** The stored string, or `null` when nothing is saved (the caller removes the key). */
export function serializeSavedFilters(f: SavedFilters): string | null {
  const clean = parseSavedFilters(JSON.stringify(f));
  return clean.page || clean.rail ? JSON.stringify(clean) : null;
}

/**
 * What one change in a filter does to the stored set. A named key with the default value ("All programs", every
 * state, every event, "All schools") is removed: choosing "all" clears the memory. Unnamed keys stay.
 */
export interface SavedPatch {
  programs?: readonly ProgramKey[];
  states?: readonly string[];
  types?: readonly MedEventType[];
  mine?: MineChoice | null;
}

export function updateSaved(prev: SavedFilters, scope: Scope, patch: SavedPatch): SavedFilters {
  const next: SavedScope = { ...prev[scope] };
  if ('programs' in patch) {
    const p = normalizePrograms(patch.programs ?? []);
    if (p.length === 0 || isAllPrograms(p)) delete next.programs;
    else next.programs = p;
  }
  if ('states' in patch) {
    if (patch.states && patch.states.length > 0) next.states = [...patch.states];
    else delete next.states;
  }
  if ('types' in patch) {
    if (patch.types && patch.types.length > 0 && patch.types.length < EVENT_TYPES.length) next.types = [...patch.types];
    else delete next.types;
  }
  if ('mine' in patch) {
    if (patch.mine) next.mine = encodeMine(patch.mine);
    else delete next.mine;
  }
  return parseSavedFilters(JSON.stringify({ ...prev, [scope]: next }));
}

/** Forget one scope (the note's "Clear"). */
export function clearScope(prev: SavedFilters, scope: Scope): SavedFilters {
  const out: SavedFilters = { ...prev };
  delete out[scope];
  return out;
}

export type FilterSource = 'url' | 'device' | 'prefs' | 'default';

/**
 * The one precedence rule (owner 2026-11-24): an explicit URL value wins; else this device's saved value; else the
 * signed-in member's saved preference (D13/D14, programs only); else the default. `undefined` is "silent" at every
 * level, so a URL that names nothing never blanks a saved filter.
 */
export function pickFilter<T>(
  url: T | undefined,
  device: T | undefined,
  prefs: T | undefined,
  fallback: T,
): { value: T; from: FilterSource } {
  if (url !== undefined) return { value: url, from: 'url' };
  if (device !== undefined) return { value: device, from: 'device' };
  if (prefs !== undefined) return { value: prefs, from: 'prefs' };
  return { value: fallback, from: 'default' };
}
