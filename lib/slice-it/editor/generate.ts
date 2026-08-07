/**
 * Slice It chart editor — the auto-generate modes.
 *
 * Design doc: `docs/slice-it-chart-editor.md` §8.
 *
 * The request this module answers: _"an 'auto' generate mode if people only want
 * to change existing notes."_ Most authors do not chart four minutes from an
 * empty timeline — they want the generator's chart with the six places it got
 * wrong fixed. So generation is not a one-time seed. It is an operation
 * available at any time, at four scopes, and it **never touches a note the
 * author has edited** unless they ask it to.
 *
 * Browser-free and Node-free like the rest of `lib/slice-it/editor`: this runs
 * in the tab (§8.2 — re-charting is the cheap half of the pipeline and the audio
 * is already decoded here) and it is also the unit under test.
 */

import { INPUT_COOLDOWN_MS } from '@/lib/slice-it/constants';
import { buildCharts, type QuantizedNote } from '@/lib/slice-it/beatmap/charter';
import { bundle, replaceChartNotes, sortNotes, type Command } from './commands';
import { repairNesting, TIER_ORDER } from './nesting';
import type { Charts, Difficulty, EditorNote } from './types';

export type GenerateScope =
  /** Whole chart, discard everything. The "start over" button. */
  | { kind: 'replace-all' }
  /**
   * Regenerate only notes still marked `auto`. Author edits survive intact.
   * THE DEFAULT — it is what "re-run the generator on the parts I have not
   * touched" means, and it is the mode most sessions use.
   */
  | { kind: 'auto-only' }
  /** Regenerate a time range. Everything outside it is untouched. */
  | { kind: 'range'; start: number; end: number; preserveEdited: boolean }
  /**
   * Fill gaps: add notes where the generator found onsets and the chart has
   * nothing, without moving or removing anything that exists. Purely additive,
   * so it can never lose work.
   */
  | { kind: 'fill-gaps'; minGapSeconds: number };

export interface GenerateOptions {
  scope: GenerateScope;
  difficulty: Difficulty | 'all';
  /** −2…+2, the C10 density bias. 0 is the generator's own budget. */
  densityBias: number;
  /** Respect the nesting invariant when regenerating multiple tiers. */
  cascade: boolean;
  /**
   * Seeded, so the same options twice produce the same chart — the generator is
   * already deterministic ("Everything arbitrary is seeded") and the editor must
   * not be the thing that breaks that.
   */
  seed: number;
}

/** The panel's starting position: the mode that cannot lose work. */
export function defaultGenerateOptions(seed: number): GenerateOptions {
  return {
    scope: { kind: 'auto-only' },
    difficulty: 'all',
    densityBias: 0,
    cascade: true,
    seed,
  };
}

/**
 * The scopes that are allowed to remove an author's note, and the only ones.
 *
 * Exported because it is a property of the design rather than of the UI: the
 * confirmation step in the panel and the invariant test in
 * `__tests__/generate.test.ts` must agree on exactly one definition of "this
 * mode can eat my work".
 */
export function scopeDiscardsAuthorWork(scope: GenerateScope): boolean {
  if (scope.kind === 'replace-all') return true;
  if (scope.kind === 'range') return !scope.preserveEdited;
  return false;
}

/* ─── The merge ──────────────────────────────────────────────────────────── */

/**
 * The notes a scope carries over untouched.
 *
 * Everything else in the existing chart is the generator's and is replaced
 * wholesale. Kept notes are returned by REFERENCE — a note that survives a
 * regenerate must come out the same object it went in as, or the timeline would
 * lose its selection and `markSaved`'s reference check (store.ts) would think
 * every save raced an edit.
 */
function keptFor(existing: readonly EditorNote[], scope: GenerateScope): EditorNote[] {
  switch (scope.kind) {
    case 'replace-all':
      return [];
    case 'auto-only':
      return existing.filter((note) => !note.auto);
    case 'range':
      return existing.filter((note) => {
        const inside = note.time >= scope.start && note.time <= scope.end;
        if (!inside) return true;
        return scope.preserveEdited && !note.auto;
      });
    case 'fill-gaps':
      // Purely additive: nothing that exists is dropped, generated or not.
      return existing.slice();
  }
}

/**
 * Regenerate, preserving author work.
 *
 * The rule is simple and has to stay simple, because an author needs to be able
 * to predict it: a note with `auto: false` is the author's and is never moved,
 * retyped or removed. Everything else is the generator's and is replaced
 * wholesale.
 *
 * The subtle part is collisions. A regenerated note landing within
 * INPUT_COOLDOWN_MS of an author's note in the same lane is unhittable — the
 * engine's own per-lane debounce (`submitInput`) would swallow it, so the note
 * would render, look chartable, and never be scoreable. So generated notes
 * yield.
 */
export function mergeGenerated(
  existing: readonly EditorNote[],
  generated: readonly EditorNote[],
  options: GenerateOptions,
): EditorNote[] {
  const kept = keptFor(existing, options.scope);
  const guard = INPUT_COOLDOWN_MS / 1000;
  const scope = options.scope;

  const accepted = generated.filter((candidate) => {
    if (scope.kind === 'range') {
      if (candidate.time < scope.start || candidate.time > scope.end) return false;
    }
    if (scope.kind === 'fill-gaps') {
      // A gap is a gap in the chart, not in one lane: adding a note 40 ms after
      // an existing one in the OTHER lane fills nothing and charts a burst the
      // author never asked for.
      const gap = Math.max(guard, scope.minGapSeconds);
      if (kept.some((note) => Math.abs(note.time - candidate.time) < gap)) return false;
    }
    // Yield to the notes that would swallow this one.
    return !kept.some(
      (note) => note.lane === candidate.lane && Math.abs(note.time - candidate.time) < guard,
    );
  });

  return sortNotes([...kept, ...accepted.map((note) => ({ ...note, auto: true }))]);
}

/* ─── Re-charting ────────────────────────────────────────────────────────── */

/**
 * How the density bias is spent.
 *
 * `selectTier` (charter.ts) budgets `targetNps × duration` notes per tier and
 * takes no other knob, so the bias is applied as a scale on the duration handed
 * to the charter — the same arithmetic the budget does, expressed at the one
 * seam this phase is allowed to touch. A real `densityBias` parameter on
 * `buildCharts` is filed in `docs/_handoff/editor-phase45-requests.md`.
 */
const DENSITY_FACTORS: Record<string, number> = {
  '-2': 0.55,
  '-1': 0.75,
  '0': 1,
  '1': 1.35,
  '2': 1.8,
};

/**
 * Bias to budget scale. Bounded below by the tier's minimum gap and above by the
 * pool: `+2` on a sparse track selects every onset there is and stops, because
 * the charter can only chart moments the analyser found.
 */
export function densityFactor(bias: number): number {
  const clamped = Math.max(-2, Math.min(2, Math.round(bias)));
  return DENSITY_FACTORS[String(clamped)] ?? 1;
}

/**
 * Re-chart from the cached analysis pool (§8.2).
 *
 * Same charter the upload path runs — two implementations of "which onsets
 * become notes" is exactly the drift an editor exists to prevent. The only
 * editor-specific parts are the density scale above and the note ids, which are
 * derived from the seed so the same options twice produce the same chart down to
 * the identity of every note.
 */
export function regenerate(
  pool: readonly QuantizedNote[],
  duration: number,
  options: GenerateOptions,
): Record<Difficulty, EditorNote[]> {
  const scaled = Math.max(1, duration * densityFactor(options.densityBias));
  const seed = `editor:${options.seed}`;
  const { slices } = buildCharts(pool.slice(), scaled, seed);

  const out = {} as Record<Difficulty, EditorNote[]>;
  for (const difficulty of TIER_ORDER) {
    out[difficulty] = slices[difficulty].map((slice, index) => ({
      ...slice,
      // Namespaced by seed so a regenerated note can never collide with an
      // author's id (uuidv7) or with a note from a different run that the merge
      // decided to keep.
      id: `g${options.seed.toString(36)}-${difficulty}-${index}`,
      auto: true,
    }));
  }
  return out;
}

/* ─── The plan (preview before apply) ────────────────────────────────────── */

export interface DifficultyPlan {
  difficulty: Difficulty;
  /** What the chart becomes if this plan is applied. */
  next: EditorNote[];
  /** Notes in `next` that are not in the current chart — drawn green. */
  added: EditorNote[];
  /** Notes in the current chart that `next` drops — drawn struck through. */
  removed: EditorNote[];
  /** Author notes carried through untouched. The number that earns trust. */
  keptAuthored: number;
}

export interface GeneratePlan {
  options: GenerateOptions;
  charts: Charts;
  byDifficulty: Record<Difficulty, DifficultyPlan>;
  /** Difficulties this plan actually rewrites. */
  targets: Difficulty[];
  totalGenerated: number;
  totalKeptAuthored: number;
  totalRemoved: number;
}

export function targetsOf(options: GenerateOptions): Difficulty[] {
  return options.difficulty === 'all' ? [...TIER_ORDER] : [options.difficulty];
}

/**
 * Build the whole proposal without committing any of it.
 *
 * **Preview before apply, always.** A regenerate that silently ate an author's
 * work once is a feature they will never press again — so the panel renders this
 * object, the timeline draws its `added`/`removed` lists, and only the Apply
 * button turns it into a command.
 */
export function buildGeneratePlan(
  charts: Charts,
  pool: readonly QuantizedNote[],
  duration: number,
  options: GenerateOptions,
): GeneratePlan {
  const generated = regenerate(pool, duration, options);
  const targets = targetsOf(options);

  let next = { ...charts };
  for (const difficulty of targets) {
    const merged = mergeGenerated(charts[difficulty].notes, generated[difficulty], options);
    next = { ...next, [difficulty]: { ...next[difficulty], notes: merged, dirty: true } };
  }

  // The nesting invariant is a cross-difficulty property (§7.2), so it can only
  // be restored after every target has been merged — repairing tier by tier
  // would push notes into a tier that the next merge then rewrites.
  if (options.cascade) {
    const repair = repairNesting(next);
    if (repair) next = repair.apply(next);
  }

  const byDifficulty = {} as Record<Difficulty, DifficultyPlan>;
  let totalGenerated = 0;
  let totalKeptAuthored = 0;
  let totalRemoved = 0;

  for (const difficulty of TIER_ORDER) {
    const before = charts[difficulty].notes;
    const after = next[difficulty].notes;
    const { added, removed } = diffNotes(before, after);
    const keptAuthored = after.filter((note) => !note.auto).length;
    byDifficulty[difficulty] = { difficulty, next: after, added, removed, keptAuthored };
    if (targets.includes(difficulty) || added.length > 0 || removed.length > 0) {
      totalGenerated += after.filter((note) => note.auto).length;
      totalKeptAuthored += keptAuthored;
      totalRemoved += removed.length;
    }
  }

  return {
    options,
    charts: next,
    byDifficulty,
    targets,
    totalGenerated,
    totalKeptAuthored,
    totalRemoved,
  };
}

/**
 * Turn a previewed plan into one undo step.
 *
 * One step for all four tiers, not four: a cascaded regenerate that could be
 * un-done a quarter at a time would leave the nesting invariant broken in a state
 * the author never asked for — the same reasoning `nesting.ts` gives for
 * bundling a cascaded placement.
 */
export function planCommand(
  charts: Charts,
  plan: GeneratePlan,
  label = 'Generate notes',
): Command | null {
  const parts: Command[] = [];
  for (const difficulty of TIER_ORDER) {
    const before = charts[difficulty].notes;
    const after = plan.byDifficulty[difficulty].next;
    if (before === after) continue;
    parts.push(replaceChartNotes(difficulty, before, after, label));
  }
  return bundle(label, parts);
}

/** Set difference by note id — what the preview draws in green and struck. */
export function diffNotes(
  before: readonly EditorNote[],
  after: readonly EditorNote[],
): { added: EditorNote[]; removed: EditorNote[] } {
  const beforeIds = new Set(before.map((note) => note.id));
  const afterIds = new Set(after.map((note) => note.id));
  return {
    added: after.filter((note) => !beforeIds.has(note.id)),
    removed: before.filter((note) => !afterIds.has(note.id)),
  };
}
