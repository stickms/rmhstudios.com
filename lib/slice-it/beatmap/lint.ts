/**
 * Slice It — chart lint rules.
 *
 * Design doc: `docs/slice-it-chart-editor.md` §9.
 *
 * ## Why this lives under `beatmap/` and not under `editor/`
 *
 * The editor is not the only thing that judges a chart. Upload-time validation
 * (`C11`) has to hold a hand-authored chart to the same standard as a generated
 * one, and the ranked-pool gate (`R10`) has to agree with both. Three copies of
 * "is this chart playable" drift within a release: the editor says a chart is
 * clean, the uploader rejects it, and nobody can say which is right. So the
 * rules live here — pure, dependency-free, no editor types, no DOM — and every
 * caller imports them.
 *
 * ## What an error means
 *
 * `error` is reserved for charts that are *broken*, not charts that are bad.
 * The distinction is load-bearing because errors block publish and warnings do
 * not. A jack faster than the engine's own per-lane debounce is an error: the
 * second press is swallowed by {@link INPUT_COOLDOWN_MS} before it can resolve
 * a note, so the note cannot be hit by anyone, ever, at any skill level. A
 * density spike is a warning: it is a taste question, and some authors mean it.
 *
 * Everything here is O(n) in the note count with one sort, so an 1800-note
 * Expert chart lints in low single-digit milliseconds. It is still run off the
 * edit path (see `editor/lint-runner.ts`) because eight rules × every keystroke
 * is the kind of cost that only shows up on the machines we do not test on.
 */

import { HIT_WINDOWS, INPUT_COOLDOWN_MS, type Difficulty } from '@/lib/slice-it/constants';

/** The rule codes. Kept as a union so a panel can group by code exhaustively. */
export type LintCode =
  | 'unhittable-jack'
  | 'too-early'
  | 'hold-too-short'
  | 'density-spike'
  | 'empty-stretch'
  | 'off-grid'
  | 'nesting-violation';

export type LintSeverity = 'error' | 'warning';

/**
 * The minimum shape a rule needs. Deliberately not `Slice` and deliberately not
 * `EditorNote`: the upload path has plain parsed JSON and the editor has notes
 * carrying selection state, and both satisfy this.
 */
export interface LintNote {
  id: string;
  time: number;
  lane: number;
  type: string;
  duration?: number;
}

export interface LintFinding {
  /** The note at fault, or `null` for a finding about a stretch of the song. */
  noteId: string | null;
  /** Where the playhead should go when this finding is clicked. */
  time: number;
  code: LintCode;
  severity: LintSeverity;
  message: string;
}

export interface LintInput {
  difficulty: Difficulty;
  notes: readonly LintNote[];
  /** Track length, seconds. Bounds the empty-stretch rule. */
  duration: number;
  /**
   * Beat times in seconds, for the off-grid rule. Omitted means the rule does
   * not run — a chart whose grid we cannot reconstruct is not thereby off-grid,
   * and inventing a metronome to measure it against would flag every chart on a
   * tempo-changing track.
   */
  beats?: readonly number[];
}

/**
 * Readable notes-per-second ceiling per tier.
 *
 * These are the *sustained* ceilings the charter budgets to; the spike rule
 * fires at 1.6× because a one-second burst is how a chart accents a fill and
 * flagging every one of those would train authors to ignore the panel.
 */
export const NPS_CEILING: Record<Difficulty, number> = {
  easy: 2.5,
  normal: 4,
  hard: 6.5,
  expert: 10,
};

/** How far over the ceiling a one-second window has to be to count as a spike. */
const SPIKE_FACTOR = 1.6;

/** Seconds of silence that reads as "the chart stopped" rather than "a break". */
const EMPTY_STRETCH_SECONDS = 8;

/**
 * The lead-in. A note before this arrives on screen before the player has
 * looked at the playfield, so a missed first note reads as the game starting
 * broken rather than as a note the player missed.
 */
const LEAD_IN_SECONDS = 2;

/**
 * How far off the nearest grid position a note may sit, as a fraction of the
 * beat. Matches the charter's own snap tolerance in spirit: it accepts up to a
 * ~0.18-beat error when quantising, and a note further from the grid than that
 * was not written against the grid at all.
 */
const OFF_GRID_FRACTION = 0.18;
/** …with an absolute floor, so a 200 BPM track does not get a stricter rule. */
const OFF_GRID_SECONDS = 0.055;

/** Grid positions within a beat that count as on-grid, as fractions. */
const GRID_FRACTIONS = [0, 1 / 4, 1 / 3, 1 / 2, 2 / 3, 3 / 4, 1];

const guardSeconds = INPUT_COOLDOWN_MS / 1000;

/**
 * The release window a hold has to be longer than.
 *
 * `GOOD × 2` is the full width of the window either side of the tail: a hold
 * shorter than that has a tail whose window opens before its head's window has
 * closed, so one press-and-release lands inside both and the engine has to pick
 * one. The player cannot make the chart mean what it says.
 */
export const MIN_HOLD_SECONDS = HIT_WINDOWS.GOOD * 2;

/**
 * Run every rule. Findings come back in time order, which is the order the
 * panel lists them in and the order a "next issue" key steps through.
 */
export function lintNotes(input: LintInput): LintFinding[] {
  const findings: LintFinding[] = [];
  const notes = [...input.notes].sort((a, b) => a.time - b.time);

  const ceiling = NPS_CEILING[input.difficulty] ?? NPS_CEILING.normal;
  const lastByLane = new Map<number, LintNote>();

  for (const note of notes) {
    /* Unhittable jack. The engine debounces per lane, so the second press
     * inside the cooldown never reaches the resolver — this note is not merely
     * hard, it is unreachable. Error. */
    const previous = lastByLane.get(note.lane);
    if (previous) {
      const gap = note.time - previous.time;
      if (gap < guardSeconds) {
        findings.push({
          noteId: note.id,
          time: note.time,
          code: 'unhittable-jack',
          severity: 'error',
          message: `${Math.round(gap * 1000)} ms after the previous note in this lane; the input cooldown is ${INPUT_COOLDOWN_MS} ms, so the second press is swallowed.`,
        });
      }
    }
    lastByLane.set(note.lane, note);

    /* Inside the lead-in. */
    if (note.time < LEAD_IN_SECONDS) {
      findings.push({
        noteId: note.id,
        time: note.time,
        code: 'too-early',
        severity: 'warning',
        message: `At ${note.time.toFixed(2)}s, before the player can react to the playfield.`,
      });
    }

    /* A hold shorter than its own release window. */
    if (note.type === 'LONG') {
      const duration = note.duration ?? 0;
      if (duration < MIN_HOLD_SECONDS) {
        findings.push({
          noteId: note.id,
          time: note.time,
          code: 'hold-too-short',
          severity: 'error',
          message: `${Math.round(duration * 1000)} ms long; shorter than its own ${Math.round(MIN_HOLD_SECONDS * 1000)} ms release window, so head and tail judgements overlap.`,
        });
      }
    }

    /* Off the grid. */
    if (input.beats && input.beats.length >= 2) {
      const error = gridError(note.time, input.beats);
      if (error && error.seconds > Math.min(OFF_GRID_SECONDS, error.beatLength * OFF_GRID_FRACTION)) {
        findings.push({
          noteId: note.id,
          time: note.time,
          code: 'off-grid',
          severity: 'warning',
          message: `${Math.round(error.seconds * 1000)} ms from the nearest subdivision of the beat.`,
        });
      }
    }
  }

  findings.push(...densitySpikes(notes, ceiling));
  findings.push(...emptyStretches(notes, input.duration));

  findings.sort((a, b) => a.time - b.time);
  return findings;
}

/**
 * Density spikes over a one-second sliding window.
 *
 * A two-pointer sweep rather than a window per note: the window only ever moves
 * forward, so the whole rule is one pass. The finding is attached to the note
 * that *opened* the densest window it appears in, so a four-second stream
 * produces one finding at its start rather than one per note — a panel listing
 * forty identical spike rows is a panel authors close.
 */
function densitySpikes(notes: readonly LintNote[], ceiling: number): LintFinding[] {
  const threshold = ceiling * SPIKE_FACTOR;
  const out: LintFinding[] = [];
  let start = 0;
  /** Time before which a new finding is folded into the previous one. */
  let coveredUntil = -Infinity;

  for (let end = 0; end < notes.length; end++) {
    while (notes[end].time - notes[start].time > 1) start++;
    const nps = end - start + 1;
    if (nps <= threshold) continue;
    if (notes[start].time < coveredUntil) continue;
    coveredUntil = notes[end].time + 1;
    out.push({
      noteId: notes[start].id,
      time: notes[start].time,
      code: 'density-spike',
      severity: 'warning',
      message: `${nps} notes in one second here; the readable ceiling for this tier is ${ceiling}.`,
    });
  }
  return out;
}

/**
 * Stretches with nothing in them.
 *
 * Includes the head of the track and the tail, because "the last 40 seconds are
 * empty" is the single most common way a generated chart is quietly broken —
 * the analyser ran out of audio, or the upload was truncated — and it is
 * invisible in the editor until you scroll there.
 */
function emptyStretches(notes: readonly LintNote[], duration: number): LintFinding[] {
  const out: LintFinding[] = [];
  if (!(duration > 0)) return out;

  const push = (from: number, to: number, noteId: string | null) => {
    const gap = to - from;
    if (gap <= EMPTY_STRETCH_SECONDS) return;
    out.push({
      noteId,
      time: from,
      code: 'empty-stretch',
      severity: 'warning',
      message: `${Math.round(gap)}s with no notes.`,
    });
  };

  if (notes.length === 0) {
    push(0, duration, null);
    return out;
  }

  push(0, notes[0].time, notes[0].id);
  for (let i = 1; i < notes.length; i++) push(notes[i - 1].time, notes[i].time, notes[i].id);
  push(notes[notes.length - 1].time, duration, null);
  return out;
}

/**
 * Distance from `time` to the nearest subdivision of the beat it lands in.
 *
 * Binary search for the beat, not a scan: the caller is inside a per-note loop
 * and a 4-minute track has ~500 beats, which is 900 000 comparisons a song for
 * no reason.
 */
function gridError(
  time: number,
  beats: readonly number[],
): { seconds: number; beatLength: number } | null {
  let lo = 0;
  let hi = beats.length - 1;
  if (time <= beats[0]) {
    const beatLength = beats[1] - beats[0];
    return beatLength > 0 ? { seconds: Math.abs(time - beats[0]), beatLength } : null;
  }
  if (time >= beats[hi]) {
    const beatLength = beats[hi] - beats[hi - 1];
    return beatLength > 0 ? { seconds: Math.abs(time - beats[hi]), beatLength } : null;
  }
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (beats[mid] <= time) lo = mid;
    else hi = mid;
  }
  const start = beats[lo];
  const beatLength = beats[lo + 1] - start;
  if (!(beatLength > 0)) return null;

  const fraction = (time - start) / beatLength;
  let best = Infinity;
  for (const candidate of GRID_FRACTIONS) {
    best = Math.min(best, Math.abs(fraction - candidate));
  }
  return { seconds: best * beatLength, beatLength };
}

/**
 * Identity for nesting purposes: same time (to 1 ms) and same lane.
 *
 * Not the note id — a note cascaded into four tiers is four rows with four ids.
 * This is the same key `editor/nesting.ts` uses, and it is exported so the two
 * cannot drift: if the editor and the upload gate disagreed about what "the
 * same note" means, a chart could pass one and fail the other with nothing
 * visibly different about it.
 */
export function nestingKey(note: Pick<LintNote, 'time' | 'lane'>): string {
  return `${Math.round(note.time * 1000)}:${note.lane}`;
}

/**
 * The nesting rule (§7.2), the one rule that is not per-chart: a note present
 * at a lower tier must exist at every tier above it, or the difficulty ladder
 * lies about what it contains.
 *
 * Reported against the *lower* chart's note, because that is the one an author
 * is looking at when they broke it. A warning, not an error: `cascade` mode
 * makes this unreachable by accident, and an author who deliberately turned
 * cascade off has a reason.
 */
export function lintNesting(
  lower: { difficulty: Difficulty; notes: readonly LintNote[] },
  higher: { difficulty: Difficulty; notes: readonly LintNote[] },
): LintFinding[] {
  const present = new Set(higher.notes.map(nestingKey));
  const out: LintFinding[] = [];

  for (const note of lower.notes) {
    if (present.has(nestingKey(note))) continue;
    out.push({
      noteId: note.id,
      time: note.time,
      code: 'nesting-violation',
      severity: 'warning',
      message: `Present on ${lower.difficulty} but missing from ${higher.difficulty}.`,
    });
  }
  return out;
}

/** Publish gating: errors block, warnings do not. */
export function hasBlockingErrors(findings: readonly LintFinding[]): boolean {
  return findings.some((finding) => finding.severity === 'error');
}

export function countBySeverity(findings: readonly LintFinding[]): {
  errors: number;
  warnings: number;
} {
  let errors = 0;
  let warnings = 0;
  for (const finding of findings) {
    if (finding.severity === 'error') errors++;
    else warnings++;
  }
  return { errors, warnings };
}
