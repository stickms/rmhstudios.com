/**
 * Slice It chart editor — the subset invariant.
 *
 * Easy ⊆ Normal ⊆ Hard ⊆ Expert.
 *
 * `slice-it.md`: "Difficulties are nested: Expert is selected from all
 * candidates, Hard from Expert, Normal from Hard, Easy from Normal. A pattern
 * learned on Normal is still there on Hard with more between the notes."
 *
 * That property is what makes the difficulty ladder teach anything, and a human
 * editing four independent lists breaks it within ten minutes without noticing.
 * So the editor enforces it rather than documenting it.
 *
 * Design doc: `docs/slice-it-chart-editor.md` §7.2.
 */

import { bundle, deleteNotes, moveNotes, placeNote, type Command } from './commands';
import { newNoteId } from './uuid';
import type { Charts, Difficulty, EditorNote, NestingMode } from './types';

export const TIER_ORDER = ['easy', 'normal', 'hard', 'expert'] as const;

export interface NestingViolation {
  difficulty: Difficulty;
  noteId: string;
  time: number;
  /** The tier that is missing this note. */
  missingFrom: Difficulty;
}

/**
 * Identity for nesting purposes: same time (to 1 ms) and same lane.
 *
 * Not the note id: a note cascaded into four tiers is four rows with four ids,
 * because the tiers are independent lists that happen to agree. Comparing ids
 * would report every cascaded note as a violation.
 */
export function noteKey(note: EditorNote): string {
  return `${Math.round(note.time * 1000)}:${note.lane}`;
}

export function checkNesting(charts: Charts): NestingViolation[] {
  const violations: NestingViolation[] = [];
  for (let i = 0; i < TIER_ORDER.length - 1; i++) {
    const lower = charts[TIER_ORDER[i]];
    const higher = charts[TIER_ORDER[i + 1]];
    if (!lower || !higher) continue;
    const higherKeys = new Set(higher.notes.map(noteKey));
    for (const note of lower.notes) {
      if (!higherKeys.has(noteKey(note))) {
        violations.push({
          difficulty: TIER_ORDER[i],
          noteId: note.id,
          time: note.time,
          missingFrom: TIER_ORDER[i + 1],
        });
      }
    }
  }
  return violations;
}

/** Violations grouped by the tier they are reported on, for the tab badges. */
export function violationsByTier(
  violations: readonly NestingViolation[],
): Record<Difficulty, number> {
  const counts: Record<Difficulty, number> = { easy: 0, normal: 0, hard: 0, expert: 0 };
  for (const violation of violations) counts[violation.difficulty] += 1;
  return counts;
}

/**
 * Cascade a placement upward through the tiers above `difficulty`.
 *
 * Takes `charts` — which the design doc's sketch does not — so a tier that
 * already has a note at this position is skipped rather than given a duplicate.
 * Placing a note on Easy in a chart where Expert already has that note is the
 * common case, not the rare one, and duplicating it there would put two notes on
 * one timestamp in one lane, which is unhittable (the engine's per-lane debounce
 * swallows the second).
 */
export function cascadePlace(charts: Charts, difficulty: Difficulty, note: EditorNote): Command[] {
  const from = TIER_ORDER.indexOf(difficulty as (typeof TIER_ORDER)[number]);
  if (from < 0) return [placeNote(difficulty, note)];
  const key = noteKey(note);

  const commands: Command[] = [];
  for (const tier of TIER_ORDER.slice(from)) {
    const existing = charts[tier];
    if (!existing) continue;
    if (tier !== difficulty && existing.notes.some((n) => noteKey(n) === key)) continue;
    // A fresh id per tier: the lists are independent, and reusing one id across
    // four of them would make "delete this note" ambiguous.
    commands.push(placeNote(tier, tier === difficulty ? note : { ...note, id: newNoteId() }));
  }
  return commands;
}

/**
 * Cascade a deletion downward — a note removed from Expert cannot survive below
 * it, because below is a subset.
 *
 * Resolves the notes to remove per tier by {@link noteKey} rather than by id, for
 * the same reason {@link cascadePlace} mints new ids: the same musical note is a
 * different row in each tier.
 */
export function cascadeDelete(
  charts: Charts,
  difficulty: Difficulty,
  notes: readonly EditorNote[],
): Command[] {
  const to = TIER_ORDER.indexOf(difficulty as (typeof TIER_ORDER)[number]);
  if (to < 0) return [deleteNotes(difficulty, notes)];
  const keys = new Set(notes.map(noteKey));

  const commands: Command[] = [];
  for (const tier of TIER_ORDER.slice(0, to + 1)) {
    const existing = charts[tier];
    if (!existing) continue;
    const doomed =
      tier === difficulty ? notes.slice() : existing.notes.filter((n) => keys.has(noteKey(n)));
    if (doomed.length > 0) commands.push(deleteNotes(tier, doomed));
  }
  return commands;
}

/**
 * Cascade a move to **every** tier that shares the note.
 *
 * Not in the design doc's sketch, and the invariant does not survive without it:
 * dragging a note on Normal moves it out from under its Hard and Expert twins,
 * which turns one note into a violation and a duplicate in one gesture.
 *
 * Both directions, unlike place (upward) and delete (downward). A note being
 * edited on Hard may also exist on Normal and Easy — that is what "Easy ⊆ Normal
 * ⊆ Hard" MEANS — and leaving the lower copies where they were breaks the
 * invariant from underneath just as surely as leaving the higher ones does. The
 * asymmetry of place and delete is real (adding to a higher tier only, removing
 * from lower tiers only, each preserves the subset relation); a move is not an
 * add or a remove, it is both at once, so it has to follow the note wherever it
 * is.
 */
export function cascadeMove(
  charts: Charts,
  difficulty: Difficulty,
  notes: readonly EditorNote[],
  deltaTime: number,
  deltaLane: number,
  keys: number,
): Command[] {
  const noteKeys = new Set(notes.map(noteKey));

  const commands: Command[] = [];
  for (const tier of TIER_ORDER) {
    const existing = charts[tier];
    if (!existing) continue;
    const targets =
      tier === difficulty ? notes.slice() : existing.notes.filter((n) => noteKeys.has(noteKey(n)));
    if (targets.length > 0) {
      commands.push(moveNotes(tier, targets, deltaTime, deltaLane, keys));
    }
  }
  return commands;
}

/* ─── the mode gate ───────────────────────────────────────────────────────── */

/**
 * Turn an edit into the command(s) the current nesting mode wants.
 *
 * One entry point rather than a `mode === 'cascade'` branch at every call site:
 * the invariant is only as good as the least careful caller, and there are four
 * of them (click-place, box-delete, drag-move, keyboard-nudge).
 */
export function nestedPlace(
  mode: NestingMode,
  charts: Charts,
  difficulty: Difficulty,
  note: EditorNote,
): Command | null {
  if (mode !== 'cascade') return placeNote(difficulty, note);
  return bundle('Place note (nested)', cascadePlace(charts, difficulty, note));
}

export function nestedDelete(
  mode: NestingMode,
  charts: Charts,
  difficulty: Difficulty,
  notes: readonly EditorNote[],
): Command | null {
  if (notes.length === 0) return null;
  if (mode !== 'cascade') return deleteNotes(difficulty, notes);
  return bundle('Delete notes (nested)', cascadeDelete(charts, difficulty, notes));
}

export function nestedMove(
  mode: NestingMode,
  charts: Charts,
  difficulty: Difficulty,
  notes: readonly EditorNote[],
  deltaTime: number,
  deltaLane: number,
  keys: number,
): Command | null {
  if (notes.length === 0) return null;
  if (mode !== 'cascade') return moveNotes(difficulty, notes, deltaTime, deltaLane, keys);
  return bundle(
    'Move notes (nested)',
    cascadeMove(charts, difficulty, notes, deltaTime, deltaLane, keys),
  );
}

/**
 * Repair an existing chart set so the invariant holds, by promoting every lower
 * note into the tiers above it.
 *
 * Promotion, never demotion: the other direction (deleting the offending note
 * from the lower tier) throws work away, and a chart that a generator built
 * nested and a human then broke is much more likely to want the note back than
 * to want it gone.
 */
export function repairNesting(charts: Charts): Command | null {
  const commands: Command[] = [];
  // Walk downward so a note promoted from Easy into Normal is then visible to
  // the Normal→Hard pass in the same sweep.
  let working = charts;
  for (let i = 0; i < TIER_ORDER.length - 1; i++) {
    const lower = working[TIER_ORDER[i]];
    const higher = working[TIER_ORDER[i + 1]];
    if (!lower || !higher) continue;
    const higherKeys = new Set(higher.notes.map(noteKey));
    for (const note of lower.notes) {
      if (higherKeys.has(noteKey(note))) continue;
      const command = placeNote(TIER_ORDER[i + 1], { ...note, id: newNoteId() });
      commands.push(command);
      working = command.apply(working);
      higherKeys.add(noteKey(note));
    }
  }
  return bundle('Repair nesting', commands);
}
