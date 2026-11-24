import type { MedProgram } from '../types';
import { matchPrompts } from './similarity';
import { THEME_IDS, type ThemeId } from './theme-ids';
import { SOURCE_PRIORITY, type PromptLimit, type PromptSource } from './types';

/**
 * The school view: stored prompts and observations in, the Secondaries tab's data out (pure, computed at read, D5/R8).
 * Marks and links are never stored: a stored link goes stale the moment a source adds an observation.
 */

export interface StoredObservation {
  cycleYear: number;
  source: PromptSource;
  limit: PromptLimit | null;
  optional: boolean;
  sourceRef: string | null;
  lastCheckedAt: Date;
}

export interface StoredPrompt {
  id: string;
  program: MedProgram;
  text: string;
  themes: string[];
  observations: StoredObservation[];
}

export type YoyStatus = 'same' | 'reworded' | 'new' | 'gone' | 'last-cycle';

export interface PromptView {
  id: string;
  program: MedProgram;
  text: string;
  limit: PromptLimit | null;
  optional: boolean;
  themes: ThemeId[];
  /** `null` = nothing to compare with (a first year of data). */
  status: YoyStatus | null;
  previousText: string | null;
  /** Every cycle the prompt was observed in, ascending; two sources in one cycle count once. */
  cycles: number[];
  /** The sources that saw it in the cycle shown, in `SOURCE_PRIORITY` order. */
  sources: PromptSource[];
  lastCheckedAt: Date;
}

export interface ProgramView {
  program: MedProgram;
  /** `current` = this cycle's prompts; `not-yet` = none seen this cycle, the newest earlier cycle's list is shown. */
  state: 'current' | 'not-yet' | 'none';
  shownCycle: number | null;
  comparedWith: number | null;
  prompts: PromptView[];
}

const PROGRAMS: readonly MedProgram[] = ['REG', 'PHD'];
const priorityIndex = (s: PromptSource) => SOURCE_PRIORITY.indexOf(s);

function themesOf(p: StoredPrompt): ThemeId[] {
  const ids = THEME_IDS.filter((id) => p.themes.includes(id));
  return ids.length > 0 ? ids : ['other'];
}

function cyclesOf(p: StoredPrompt, currentCycle: number): number[] {
  return [...new Set(p.observations.filter((o) => o.cycleYear <= currentCycle).map((o) => o.cycleYear))].sort(
    (a, b) => a - b,
  );
}

function observedIn(p: StoredPrompt, cycle: number, sources?: ReadonlySet<PromptSource>): StoredObservation[] {
  return p.observations.filter((o) => o.cycleYear === cycle && (!sources || sources.has(o.source)));
}

function toView(
  p: StoredPrompt,
  shown: number,
  currentCycle: number,
  status: YoyStatus | null,
  previousText: string | null,
): PromptView {
  const obs = [...observedIn(p, shown)].sort((a, b) => priorityIndex(a.source) - priorityIndex(b.source));
  const sources = [...new Set(obs.map((o) => o.source))];
  const newest = obs.reduce((t, o) => Math.max(t, o.lastCheckedAt.getTime()), 0);
  return {
    id: p.id,
    program: p.program,
    text: p.text,
    limit: obs.find((o) => o.limit !== null)?.limit ?? null,
    optional: obs.some((o) => o.optional),
    themes: themesOf(p),
    status,
    previousText,
    cycles: cyclesOf(p, currentCycle),
    sources,
    lastCheckedAt: new Date(newest),
  };
}

function order(a: PromptView, b: PromptView): number {
  const ai = THEME_IDS.indexOf(a.themes[0] ?? 'other');
  const bi = THEME_IDS.indexOf(b.themes[0] ?? 'other');
  return ai - bi || a.text.localeCompare(b.text) || a.id.localeCompare(b.id);
}

/** A forum thread, not a source's own page: a sighting there says a prompt exists, never that a page still lists it. */
export const isForumRef = (ref: string | null): boolean => ref !== null && /^https:\/\/[^/]+\/threads\//.test(ref);

export interface ViewOptions {
  /**
   * The sources whose page was read (a check with status OK) this cycle. A source is compared for "gone" only if it is in
   * this set; left out, only the forum rule below applies (a bare unit test of the marks).
   */
  readSources?: ReadonlySet<PromptSource>;
}

function buildProgram(
  all: readonly StoredPrompt[],
  program: MedProgram,
  currentCycle: number,
  opts: ViewOptions = {},
): ProgramView | null {
  const prompts = all.filter((p) => p.program === program && cyclesOf(p, currentCycle).length > 0);
  if (prompts.length === 0) return null;

  const current = prompts.filter((p) => observedIn(p, currentCycle).length > 0);

  if (current.length === 0) {
    const newest = Math.max(...prompts.flatMap((p) => cyclesOf(p, currentCycle)));
    const shown = prompts.filter((p) => observedIn(p, newest).length > 0);
    return {
      program,
      state: 'not-yet',
      shownCycle: newest,
      comparedWith: null,
      prompts: shown.map((p) => toView(p, newest, currentCycle, 'last-cycle', null)).sort(order),
    };
  }

  const prev = currentCycle - 1;
  const prevAny = prompts.filter((p) => observedIn(p, prev).length > 0);
  if (prevAny.length === 0) {
    return {
      program,
      state: 'current',
      shownCycle: currentCycle,
      comparedWith: null,
      prompts: current.map((p) => toView(p, currentCycle, currentCycle, null, null)).sort(order),
    };
  }

  // Compare only on the sources that have seen something this cycle: a source that has not been read yet is not evidence
  // that a school dropped a prompt (Review Focus 1).
  // A forum sighting never makes a source comparable (one thread post would otherwise mark every other prompt of that
  // source "not seen this cycle"), and a source whose page was not read this cycle is not evidence either.
  const comparable = new Set(
    current.flatMap((p) =>
      observedIn(p, currentCycle)
        .filter((o) => !isForumRef(o.sourceRef) && (opts.readSources === undefined || opts.readSources.has(o.source)))
        .map((o) => o.source),
    ),
  );
  const views: PromptView[] = [];
  const unmatchedCurrent: StoredPrompt[] = [];
  for (const p of current) {
    if (observedIn(p, prev).length > 0) views.push(toView(p, currentCycle, currentCycle, 'same', null));
    else unmatchedCurrent.push(p);
  }
  const prevOnly = prevAny.filter(
    (p) => observedIn(p, currentCycle).length === 0 && observedIn(p, prev, comparable).length > 0,
  );

  const matches = matchPrompts(
    prevOnly.map((p) => ({ id: p.id, text: p.text })),
    unmatchedCurrent.map((p) => ({ id: p.id, text: p.text })),
  );
  const olderFor = new Map(matches.map((m) => [m.newerId, m.olderId]));
  const matchedOlder = new Set(matches.map((m) => m.olderId));
  const byId = new Map(prompts.map((p) => [p.id, p]));

  for (const p of unmatchedCurrent) {
    const older = olderFor.get(p.id);
    const previousText = older !== undefined ? (byId.get(older)?.text ?? null) : null;
    views.push(toView(p, currentCycle, currentCycle, previousText !== null ? 'reworded' : 'new', previousText));
  }
  const gone = prevOnly.filter((p) => !matchedOlder.has(p.id)).map((p) => toView(p, prev, currentCycle, 'gone', null));

  return {
    program,
    state: 'current',
    shownCycle: currentCycle,
    comparedWith: prev,
    prompts: [...views.sort(order), ...gone.sort(order)],
  };
}

/** REG then PHD; only programs that have any observed prompt. */
export function buildSchoolView(prompts: readonly StoredPrompt[], currentCycle: number, opts: ViewOptions = {}): ProgramView[] {
  const out: ProgramView[] = [];
  for (const program of PROGRAMS) {
    const v = buildProgram(prompts, program, currentCycle, opts);
    if (v) out.push(v);
  }
  return out;
}
