/**
 * The sight reading game ("Sprint") — its levels and the constants every run is measured by. Pure,
 * client-safe; the one file the numbers live in (plan `2026-11-09-rmhmusic-note-sprint.md`).
 *
 * A level is one kind of prompt on one or two clefs. The kind decides the par (the time that
 * still scores full marks) and whether the microphone can answer it: the microphone hears one
 * note at a time, so it plays notes, accidentals and bars, never a chord.
 */
import type { Clef } from '../theory/clef';

/** What a prompt asks for: one note, one note with a sharp or flat, a triad, or notes in order. */
export type SprintKind = 'note' | 'accidental' | 'chord' | 'bar';

export type SprintLevelId = 'note' | 'note-both' | 'accidental' | 'triad' | 'inversion' | 'bar';

export interface SprintLevel {
  id: SprintLevelId;
  kind: SprintKind;
  /** The staves its prompts are drawn on. */
  clefs: readonly Clef[];
}

/** The levels, easiest first (the freeplay list and the daily order). */
export const SPRINT_LEVELS: readonly SprintLevel[] = [
  {
    id: 'note',
    kind: 'note',
    clefs: ['treble'],
  },
  {
    id: 'note-both',
    kind: 'note',
    clefs: ['treble', 'bass'],
  },
  {
    id: 'accidental',
    kind: 'accidental',
    clefs: ['treble', 'bass'],
  },
  {
    id: 'triad',
    kind: 'chord',
    clefs: ['treble', 'bass'],
  },
  {
    id: 'inversion',
    kind: 'chord',
    clefs: ['treble', 'bass'],
  },
  {
    id: 'bar',
    kind: 'bar',
    clefs: ['treble', 'bass'],
  },
];

export function sprintLevel(id: SprintLevelId): SprintLevel | undefined {
  return SPRINT_LEVELS.find((l) => l.id === id);
}

export function isSprintLevelId(id: unknown): id is SprintLevelId {
  return typeof id === 'string' && SPRINT_LEVELS.some((l) => l.id === id);
}

/** Par per kind, in ms: at or under it a prompt scores 100. Tuned from real play. */
export const PAR_MS: Readonly<Record<SprintKind, number>> = {
  note: 1200,
  accidental: 1600,
  chord: 2400,
  bar: 2000,
};

/** A bar's par grows by this much for every note after the first. */
export const BAR_NOTE_MS = 700;

/** At this multiple of par a right answer scores 0 (linear in between). */
export const ZERO_AT_PAR = 4;

/** Notes in a bar. */
export const BAR_NOTES = 4;

/** The par of one prompt of `kind` with `noteCount` notes (only a bar's depends on it). */
export function parMs(kind: SprintKind, noteCount = 1): number {
  if (kind !== 'bar') return PAR_MS[kind];
  return PAR_MS.bar + BAR_NOTE_MS * Math.max(0, Math.round(noteCount) - 1);
}

/** Whether the microphone can answer this kind (one note at a time). */
export function micAllowed(kind: SprintKind): boolean {
  return kind !== 'chord';
}

/**
 * The steps (above the clef's bottom line) a prompt may use: one ledger line below and above the
 * staff. Inside what a card can draw (`CARD_MIN_STEP`…`CARD_MAX_STEP` in `staff-card-layout.ts`).
 */
export const SPRINT_MIN_STEP = -2;
export const SPRINT_MAX_STEP = 10;

/** Prompts in a freeplay run (fixed length, not a clock, so runs compare). */
export const FREEPLAY_PROMPTS = 20;

/** The daily challenge: these levels in order, this many prompts each. */
export const DAILY_LEVELS: readonly SprintLevelId[] = ['note', 'note-both', 'accidental', 'triad', 'inversion', 'bar'];
export const DAILY_PROMPTS_PER_LEVEL = 5;
