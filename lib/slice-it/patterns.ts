/**
 * Slice It — pattern classification and the weakness profile (`P8`).
 *
 * Nothing is aggregated across runs. `Player.totalScore` and `gamesPlayed` are
 * the whole of a career, so there is no record of what a player is actually
 * good or bad at — and therefore no way to recommend a chart that would improve
 * them.
 *
 * Classified **once, from the chart** rather than per submission: a note's
 * pattern is a property of the chart, and re-deriving it on every score would be
 * the same work N times for an answer that cannot change.
 *
 * Pure and browser-safe, so the editor can show the mix live and the score route
 * can aggregate against the same definitions.
 */

import type { Slice } from './types';

export type Pattern = 'jack' | 'trill' | 'stream' | 'chord' | 'hold' | 'burst' | 'isolated';

export const PATTERNS: readonly Pattern[] = [
  'jack',
  'trill',
  'stream',
  'chord',
  'hold',
  'burst',
  'isolated',
];

/** Gap above which a note is standing on its own, seconds. */
const ISOLATED_GAP = 0.5;
/** Gap below which consecutive notes are a burst rather than a stream. */
const BURST_GAP = 0.1;
/** Gap below which an alternation reads as a trill rather than as two notes. */
const TRILL_GAP = 0.16;
/** Two notes closer than this are simultaneous. */
const CHORD_EPSILON = 1e-3;

/**
 * What kind of thing this note is, in context.
 *
 * Order matters and is not arbitrary. A LONG note is a hold whatever surrounds
 * it, because holding is the skill being tested. A simultaneous pair is a chord
 * before it is anything else, because the hands do something different. Only
 * then does spacing decide, and only then does lane repetition (a jack) versus
 * alternation (a trill).
 *
 * `notes` must be sorted by time. Every caller derives it from a chart, which
 * always is.
 */
export function classify(notes: readonly Slice[], index: number): Pattern {
  const note = notes[index];
  if (!note) return 'isolated';
  if (note.type === 'LONG') return 'hold';

  const prev = notes[index - 1];
  const next = notes[index + 1];

  if (prev && Math.abs(note.time - prev.time) < CHORD_EPSILON) return 'chord';
  if (next && Math.abs(next.time - note.time) < CHORD_EPSILON) return 'chord';

  const gapBefore = prev ? note.time - prev.time : Infinity;
  if (gapBefore > ISOLATED_GAP) return 'isolated';

  if (prev && prev.lane === note.lane) return 'jack';
  // A trill is A-B-A: this note's neighbours are on the same lane as each
  // other and it is not. Checked before the spacing buckets, because a fast
  // trill would otherwise read as a burst and lose what makes it hard.
  if (prev && next && next.lane === prev.lane && next.lane !== note.lane && gapBefore < TRILL_GAP) {
    return 'trill';
  }
  return gapBefore < BURST_GAP ? 'burst' : 'stream';
}

/** The whole chart's pattern mix, for the editor and the rating panel. */
export function patternMix(notes: readonly Slice[]): Record<Pattern, number> {
  const mix = Object.fromEntries(PATTERNS.map((p) => [p, 0])) as Record<Pattern, number>;
  for (let i = 0; i < notes.length; i++) mix[classify(notes, i)]++;
  return mix;
}

/* ─── The profile ────────────────────────────────────────────────────────── */

export interface PatternStat {
  pattern: Pattern;
  /** Accuracy-weighted points earned on notes of this kind. */
  hitPoints: number;
  /** Notes of this kind attempted. */
  notes: number;
}

export interface PatternProfile {
  /** 0–1 per pattern, or null where the sample is too small to mean anything. */
  accuracy: Partial<Record<Pattern, number | null>>;
  /** The pattern this player is worst at, among those with enough data. */
  weakest: Pattern | null;
  /** The pattern they are best at. */
  strongest: Pattern | null;
}

/**
 * Below this many attempted notes, a pattern's accuracy is noise.
 *
 * 200 rather than a handful: a "weakest skill" derived from thirty chord notes
 * would send a player to drill something they have barely met, and a
 * recommendation engine that is confidently wrong is worse than none.
 */
export const MIN_NOTES_FOR_PATTERN = 200;

export function buildProfile(stats: readonly PatternStat[]): PatternProfile {
  const accuracy: Partial<Record<Pattern, number | null>> = {};
  let weakest: Pattern | null = null;
  let strongest: Pattern | null = null;
  let low = Infinity;
  let high = -Infinity;

  for (const stat of stats) {
    if (stat.notes < MIN_NOTES_FOR_PATTERN) {
      // Null rather than omitted: "we have not seen enough of this" is a fact
      // the radar should draw as a gap, not as a zero.
      accuracy[stat.pattern] = null;
      continue;
    }
    const value = stat.notes > 0 ? stat.hitPoints / stat.notes : 0;
    accuracy[stat.pattern] = value;
    if (value < low) {
      low = value;
      weakest = stat.pattern;
    }
    if (value > high) {
      high = value;
      strongest = stat.pattern;
    }
  }

  return { accuracy, weakest, strongest };
}

/**
 * Fold one run's per-note results into per-pattern deltas.
 *
 * Takes the classified chart and the run's hit weights, so the caller does the
 * classification once for the chart rather than once per player per run.
 */
export function accumulate(
  notes: readonly Slice[],
  hitWeightById: ReadonlyMap<string, number>,
): Map<Pattern, { hitPoints: number; notes: number }> {
  const out = new Map<Pattern, { hitPoints: number; notes: number }>();
  for (let i = 0; i < notes.length; i++) {
    const weight = hitWeightById.get(notes[i].id);
    // Absent means the note was never judged — the run ended before it, or the
    // modifiers removed it. Counting it as a miss would punish a player for
    // failing early twice.
    if (weight === undefined) continue;
    const pattern = classify(notes, i);
    const entry = out.get(pattern) ?? { hitPoints: 0, notes: 0 };
    entry.hitPoints += weight;
    entry.notes += 1;
    out.set(pattern, entry);
  }
  return out;
}
