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
