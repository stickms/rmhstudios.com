import { CHARTED_TYPES } from './public-read';
import {
  ALL_PROGRAMS,
  isAllPrograms,
  normalizePrograms,
  programsFromLegacy,
  programsValue,
  schoolProgramOf,
  type ProgramKey,
} from './programs';
import { showParam, type ProgramFilter } from './search';
import type { MedEventType } from './types';

/**
 * Preferences fill a page's defaults only where the URL is silent (spec section 7, plan D13/D14). Pure and client-safe:
 * the route loaders and the pages call the same functions on the same cached preferences, so the server HTML already
 * shows the preferred view. Nothing here reads a session or touches a public endpoint's parameters.
 */

/**
 * Mirrors `MedPrefsDto` (the private prefs endpoint). `programs` is the resolved program set (all four = no preference);
 * `programFilter` and `degree` are the older columns, kept in step by the service and read only as a fallback.
 */
export interface Prefs {
  programs: ProgramKey[];
  programFilter: ProgramFilter;
  degree: 'MD' | 'DO' | null;
  homeState: string | null;
  chartCategories: MedEventType[];
}

/** What a viewer with no saved preferences has: every program, no home state, no chosen categories. */
export const DEFAULT_VIEW_PREFS: Prefs = {
  programs: [...ALL_PROGRAMS],
  programFilter: 'ALL',
  degree: null,
  homeState: null,
  chartCategories: [],
};

export type ViewKind = 'index' | 'live' | 'school';

/**
 * The keys of a parsed search that a preference can fill. An ABSENT key is "the URL is silent"; a present key is the
 * viewer's choice, including the default (all four programs, `program: 'ALL'`); an empty `show` is silent.
 * `programs` is the index and live pages' key, `program` the school page's.
 */
export interface PrefsSearch {
  programs?: readonly ProgramKey[] | undefined;
  program?: ProgramFilter | undefined;
  show?: readonly MedEventType[] | undefined;
}

export interface EffectiveView {
  /** Index and live: the program set, canonical order, all four when unfiltered. */
  programs: ProgramKey[];
  /** School page: `ALL | REG | PHD` (the school's own two programs). */
  program: ProgramFilter;
  /** The Activity chart's categories, in `CHARTED_TYPES` order (school pages; every type elsewhere). */
  show: MedEventType[];
  /** True while any default came from a preference, so the page can say its view is not the URL's alone. */
  fromPrefs: boolean;
  /** True while the program set came from this device's saved filters (`saved-filters.ts`), not the URL. */
  fromDevice: boolean;
}

/** What this device remembers that the view reads (index and live; the school page has its own degree). */
export interface DeviceView {
  programs?: readonly ProgramKey[] | undefined;
}

interface Clean {
  programs: ProgramKey[];
  show: MedEventType[] | null;
}

const LEGACY_PROGRAMS: readonly ProgramFilter[] = ['ALL', 'REG', 'PHD'];

/** A stale row (an enum that changed) falls to the default; it never throws. */
function clean(prefs: Prefs | null | undefined): Clean {
  const stored = Array.isArray(prefs?.programs) ? normalizePrograms(prefs.programs) : [];
  const legacyProgram = LEGACY_PROGRAMS.find((p) => p === prefs?.programFilter) ?? 'ALL';
  const legacyDegree = prefs?.degree === 'MD' || prefs?.degree === 'DO' ? prefs.degree : undefined;
  const programs = stored.length > 0 ? stored : programsFromLegacy(legacyDegree, legacyProgram);
  const wanted = new Set<unknown>(Array.isArray(prefs?.chartCategories) ? prefs.chartCategories : []);
  const shown = CHARTED_TYPES.filter((t) => wanted.has(t));
  return { programs, show: shown.length ? shown : null };
}

/** The resolved program preference of a stored `Prefs` (all four when it has none). Used by the pages and the rail. */
export const prefProgramsOf = (prefs: Prefs | null | undefined): ProgramKey[] => clean(prefs).programs;

export function applyPrefs(
  kind: ViewKind,
  search: PrefsSearch,
  prefs: Prefs | null | undefined,
  ctx: { schoolDegree?: 'MD' | 'DO' } = {},
  device: DeviceView = {},
): EffectiveView {
  const p = clean(prefs);
  let fromPrefs = false;
  let fromDevice = false;

  let programs: ProgramKey[] = [...ALL_PROGRAMS];
  let program: ProgramFilter = 'ALL';
  if (kind === 'school') {
    if (search.program !== undefined) program = search.program;
    else if (ctx.schoolDegree) {
      program = schoolProgramOf(p.programs, ctx.schoolDegree);
      if (program !== 'ALL') fromPrefs = true;
    }
  } else {
    // URL > this device > preferences > every program (owner 2026-11-24). All four is never stored, so a device value
    // is always a real narrowing; a preference of all four is "no preference".
    const url = search.programs && search.programs.length > 0 ? normalizePrograms(search.programs) : undefined;
    const saved = device.programs && device.programs.length > 0 ? normalizePrograms(device.programs) : undefined;
    const pref = isAllPrograms(p.programs) ? undefined : p.programs;
    const picked = pickFilter(url, saved, pref, [...ALL_PROGRAMS]);
    programs = picked.value;
    fromDevice = picked.from === 'device';
    fromPrefs = picked.from === 'prefs';
  }

  let show: MedEventType[] = [...CHARTED_TYPES];
  if (kind === 'school') {
    if (search.show && search.show.length > 0) show = [...search.show];
    else if (p.show) {
      show = [...p.show];
      fromPrefs = true;
    }
  }

  return { programs, program, show, fromPrefs, fromDevice };
}

/** The view a page reads. Kept as the one name the pages and loaders call; the program set needs no second pass. */
export const resolveView = applyPrefs;

/**
 * The search params a page writes for a view it chose (D14). A value is omitted only when it equals the global default
 * AND no preference would override that default for this viewer, so a viewer with no preferences gets exactly the clean
 * URLs, and a viewer with a `md-phd` preference who turns every program back on gets the full list written. Non-default
 * values are always written: a shared link must not depend on the recipient's preferences.
 */
export function writeSearch(
  kind: ViewKind,
  next: EffectiveView,
  prefs: Prefs | null | undefined,
): Record<string, string> {
  const p = clean(prefs);
  const out: Record<string, string> = {};
  if (kind === 'school') {
    const schoolPrefersOther = !isAllPrograms(p.programs);
    if (next.program !== 'ALL' || schoolPrefersOther) out.program = next.program;
    const shown = showParam(next.show.length ? next.show : CHARTED_TYPES);
    if (shown !== showParam(CHARTED_TYPES) || p.show) out.show = shown;
  } else if (!isAllPrograms(next.programs) || !isAllPrograms(p.programs)) {
    out.programs = programsValue(next.programs);
  }
  return out;
}

/** What a page changes in its view: only the keys it names are rewritten in the URL. */
export interface ViewPatch {
  programs?: readonly ProgramKey[];
  program?: ProgramFilter;
  show?: readonly MedEventType[];
}

/** The search keys a preference can fill; every other key (q, state, tab, type, cycle, school, list) is the page's own. */
export const PREF_KEYS = ['programs', 'program', 'show'] as const;

/**
 * The next URL search after the viewer changes `patch`. Only the preference keys the patch names are rewritten, through
 * `writeSearch` (D14); a key it does not name stays exactly as the URL had it, so a default that came from a preference
 * is never frozen into the address by an unrelated change. Everything else in `prev` is kept. The old `degree` key is
 * dropped as soon as the program set is written, so a legacy link does not fight the new key.
 */
export function patchSearch(
  kind: ViewKind,
  prev: Record<string, unknown>,
  view: EffectiveView,
  patch: ViewPatch,
  prefs: Prefs | null | undefined,
): Record<string, unknown> {
  const merged: EffectiveView = {
    programs: patch.programs ? normalizePrograms(patch.programs) : view.programs,
    program: patch.program ?? view.program,
    show: patch.show ? [...patch.show] : view.show,
    fromPrefs: false,
    fromDevice: false,
  };
  const written = writeSearch(kind, merged, prefs);
  const out: Record<string, unknown> = { ...prev };
  for (const k of PREF_KEYS) {
    if (!(k in patch)) continue;
    const w = written[k];
    if (w === undefined) delete out[k];
    else out[k] = w;
  }
  if (kind !== 'school' && 'programs' in patch) {
    delete out.degree;
    delete out.program;
  }
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
