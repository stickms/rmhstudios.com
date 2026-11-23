import { CHARTED_TYPES } from './public-read';
import { showParam, type LiveProgramFilter, type ProgramFilter } from './search';
import type { MedEventType } from './types';

/**
 * Preferences fill a page's defaults only where the URL is silent (spec section 7, plan D13/D14). Pure and client-safe:
 * the route loaders and the pages call the same functions on the same cached preferences, so the server HTML already
 * shows the preferred view. Nothing here reads a session or touches a public endpoint's parameters.
 */

/** Mirrors `MedPrefsDto` (the private prefs endpoint). */
export interface Prefs {
  programFilter: ProgramFilter;
  degree: 'MD' | 'DO' | null;
  homeState: string | null;
  chartCategories: MedEventType[];
}

export type ViewKind = 'index' | 'live' | 'school';

/**
 * The keys of a parsed search that a preference can fill. An ABSENT key is "the URL is silent"; a present key is the
 * viewer's choice, including the default (`program: 'ALL'`). `degree: 'ALL'` is the explicit "every degree", the one
 * way a link can override a degree preference; an empty `show` is silent.
 */
export interface PrefsSearch {
  degree?: 'MD' | 'DO' | 'ALL';
  program?: LiveProgramFilter;
  show?: readonly MedEventType[];
}

export interface EffectiveView {
  degree?: 'MD' | 'DO';
  program: LiveProgramFilter;
  /** The Activity chart's categories, in `CHARTED_TYPES` order (school pages; every type elsewhere). */
  show: MedEventType[];
  /** True while any default came from a preference, so the page can say its view is not the URL's alone. */
  fromPrefs: boolean;
}

interface Clean {
  program: ProgramFilter;
  degree: 'MD' | 'DO' | null;
  show: MedEventType[] | null;
}

const PROGRAMS: readonly ProgramFilter[] = ['ALL', 'REG', 'PHD'];

/** A stale row (an enum that changed) falls to the default; it never throws. */
function clean(prefs: Prefs | null | undefined): Clean {
  const program = PROGRAMS.find((p) => p === prefs?.programFilter) ?? 'ALL';
  const degree = prefs?.degree === 'MD' || prefs?.degree === 'DO' ? prefs.degree : null;
  const wanted = new Set<unknown>(Array.isArray(prefs?.chartCategories) ? prefs.chartCategories : []);
  const shown = CHARTED_TYPES.filter((t) => wanted.has(t));
  return { program, degree, show: shown.length ? shown : null };
}

export function applyPrefs(
  kind: ViewKind,
  search: PrefsSearch,
  prefs: Prefs | null | undefined,
  ctx: { schoolDegree?: 'MD' | 'DO' } = {},
): EffectiveView {
  const p = clean(prefs);
  let fromPrefs = false;

  let program: LiveProgramFilter;
  if (search.program !== undefined) program = search.program;
  else {
    program = p.program;
    if (p.program !== 'ALL') fromPrefs = true;
  }

  let degree: 'MD' | 'DO' | undefined;
  if (kind === 'school')
    degree = ctx.schoolDegree; // a school has its own degree
  else if (search.degree !== undefined) degree = search.degree === 'ALL' ? undefined : search.degree;
  else if (p.degree) {
    degree = p.degree;
    fromPrefs = true;
  }

  let show: MedEventType[] = [...CHARTED_TYPES];
  if (kind === 'school') {
    if (search.show && search.show.length > 0) show = [...search.show];
    else if (p.show) {
      show = [...p.show];
      fromPrefs = true;
    }
  }

  return { ...(degree ? { degree } : {}), program, show, fromPrefs };
}

/**
 * The view a page reads: `applyPrefs`, then phase 3's rule that a program belongs to a degree. The index and live
 * pages have one select for both ("MD-PhD"), so a program with no degree behind it cannot be shown and reads as All;
 * a preference may supply the degree, which is why the rule runs after the preferences, not in the URL parser. A
 * school page keeps the program (the school supplies the degree).
 */
export function resolveView(
  kind: ViewKind,
  search: PrefsSearch,
  prefs: Prefs | null | undefined,
  ctx: { schoolDegree?: 'MD' | 'DO' } = {},
): EffectiveView {
  const v = applyPrefs(kind, search, prefs, ctx);
  if (kind === 'school' || v.degree || v.program === 'ALL' || v.program === 'NONE') return v;
  // The program was dropped, so a preference that only supplied it no longer shows.
  return { ...v, program: 'ALL', fromPrefs: applyPrefs(kind, { ...search, program: 'ALL' }, prefs, ctx).fromPrefs };
}

/**
 * The search params a page writes for a view it chose (D14). A value is omitted only when it equals the global default
 * AND no preference would override that default for this viewer, so a viewer with no preferences gets exactly the clean
 * URLs phase 3 wrote, and a viewer with a `PHD` preference who picks All gets `program=ALL`. Non-default values are
 * always written: a shared link must not depend on the recipient's preferences.
 */
export function writeSearch(
  kind: ViewKind,
  next: EffectiveView,
  prefs: Prefs | null | undefined,
): Record<string, string> {
  const p = clean(prefs);
  const out: Record<string, string> = {};
  if (next.program !== 'ALL' || p.program !== 'ALL') out.program = next.program;
  if (kind !== 'school') {
    if (next.degree) out.degree = next.degree;
    else if (p.degree) out.degree = 'ALL';
  }
  if (kind === 'school') {
    const shown = showParam(next.show.length ? next.show : CHARTED_TYPES);
    if (shown !== showParam(CHARTED_TYPES) || p.show) out.show = shown;
  }
  return out;
}

/** What a page changes in its view: only the keys it names are rewritten in the URL. */
export interface ViewPatch {
  degree?: 'MD' | 'DO' | undefined;
  program?: LiveProgramFilter;
  show?: readonly MedEventType[];
}

/** The search keys a preference can fill; every other key (q, state, tab, type, cycle, school) is the page's own. */
export const PREF_KEYS = ['program', 'degree', 'show'] as const;

/**
 * The next URL search after the viewer changes `patch`. Only the preference keys the patch names are rewritten, through
 * `writeSearch` (D14); a key it does not name stays exactly as the URL had it, so a default that came from a preference
 * is never frozen into the address by an unrelated change. Everything else in `prev` is kept.
 */
export function patchSearch(
  kind: ViewKind,
  prev: Record<string, unknown>,
  view: EffectiveView,
  patch: ViewPatch,
  prefs: Prefs | null | undefined,
): Record<string, unknown> {
  const degree = 'degree' in patch ? patch.degree : view.degree;
  const merged: EffectiveView = {
    ...(degree ? { degree } : {}),
    program: patch.program ?? view.program,
    show: patch.show ? [...patch.show] : view.show,
    fromPrefs: false,
  };
  const written = writeSearch(kind, merged, prefs);
  const out: Record<string, unknown> = { ...prev };
  for (const k of PREF_KEYS) {
    if (!(k in patch)) continue;
    const w = written[k];
    if (w === undefined) delete out[k];
    else out[k] = w;
  }
  return out;
}
