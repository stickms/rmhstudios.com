/**
 * Turning detected onsets into a playable chart.
 *
 * Detection says *when* something happened. Charting decides which of those
 * moments become notes, on which lane, and as taps or holds — and that is a
 * design problem, not a signal-processing one. The rules below are the ones
 * every mainstream rhythm game converges on:
 *
 * - **Notes land on the grid.** Human timing and onset detection are both a few
 *   milliseconds loose; a chart that reproduces that looseness feels wrong even
 *   when it is technically more faithful. Quantising to subdivisions of the
 *   tracked beat is what makes a chart feel *composed*.
 * - **Difficulties are nested.** Easy ⊆ Normal ⊆ Hard ⊆ Expert, always. A player
 *   who learns a pattern on Normal finds that same pattern still there on Hard,
 *   with more between the notes. Generating each difficulty independently
 *   produces four unrelated charts and destroys that progression.
 * - **Density is targeted, not emergent.** Each difficulty has a notes-per-second
 *   budget and spends it on the strongest onsets, so a sparse ballad and a wall
 *   of drum-and-bass both produce a chart of the intended difficulty.
 * - **Patterns must be physically playable.** Two lanes, two fingers: notes in
 *   the same lane need more space between them than notes that alternate, and a
 *   long run of same-lane notes (a "jack") is unfun at any speed. Lane
 *   assignment follows the music's own frequency content where it can and
 *   breaks from it where playability demands.
 */

import type { Difficulty, Slice } from '../types';
import { createSeededRandom } from '../chart';
import type { Onset } from './onsets';

/* ─── Quantisation ───────────────────────────────────────────────────────── */

/** Grid positions within a beat: 16ths plus the two triplet positions. */
const SUBDIVISIONS: readonly number[] = [0, 1 / 4, 1 / 3, 1 / 2, 2 / 3, 3 / 4, 1];

/** Hard ceiling on how far a note may be moved to reach the grid, seconds. */
const MAX_SNAP_SECONDS = 0.055;
/** …and as a fraction of the beat, so slow songs do not get a sloppier grid. */
const MAX_SNAP_FRACTION = 0.18;

export interface QuantizedNote {
  /** Snapped time, seconds. */
  time: number;
  strength: number;
  frame: number;
  lowRatio: number;
  highRatio: number;
  sustain: number;
  /** Index of the beat this note sits in. */
  beatIndex: number;
  /** Position within that beat, 0–1. */
  fraction: number;
  /** Length of the beat this note sits in, seconds. */
  beatLength: number;
}

/** Index of the last beat at or before `time`, or -1. */
function beatIndexAt(beats: number[], time: number): number {
  let lo = 0;
  let hi = beats.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (beats[mid] <= time) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

/**
 * Snap onsets to the beat grid, dropping the ones that land nowhere near it.
 *
 * The drop is the point: an onset that is 40% of a beat away from every
 * subdivision is usually a reverb tail, a vocal consonant or a detector
 * artefact, and charting it produces a note the player hears no reason for.
 */
export function quantizeOnsets(onsets: Onset[], beats: number[]): QuantizedNote[] {
  if (beats.length < 2) return [];

  const out: QuantizedNote[] = [];

  for (const onset of onsets) {
    let index = beatIndexAt(beats, onset.time);
    if (index < 0) index = 0;
    if (index >= beats.length - 1) index = beats.length - 2;

    const start = beats[index];
    const end = beats[index + 1];
    const beatLength = end - start;
    if (!(beatLength > 0)) continue;

    const fraction = (onset.time - start) / beatLength;

    let bestFraction = 0;
    let bestError = Infinity;
    for (const candidate of SUBDIVISIONS) {
      const error = Math.abs(fraction - candidate);
      if (error < bestError) {
        bestError = error;
        bestFraction = candidate;
      }
    }

    const errorSeconds = bestError * beatLength;
    if (errorSeconds > Math.min(MAX_SNAP_SECONDS, beatLength * MAX_SNAP_FRACTION)) continue;

    // A note snapped to the end of one beat is the start of the next.
    let beatIndex = index;
    let snappedFraction = bestFraction;
    if (bestFraction >= 1) {
      beatIndex = index + 1;
      snappedFraction = 0;
    }
    const snappedStart = beats[Math.min(beatIndex, beats.length - 1)];
    const snappedLength =
      beatIndex + 1 < beats.length ? beats[beatIndex + 1] - snappedStart : beatLength;

    out.push({
      time: snappedStart + snappedFraction * snappedLength,
      strength: onset.strength,
      frame: onset.frame,
      lowRatio: onset.lowRatio,
      highRatio: onset.highRatio,
      sustain: onset.sustain,
      beatIndex,
      fraction: snappedFraction,
      beatLength: snappedLength,
    });
  }

  out.sort((a, b) => a.time - b.time);
  return mergeCoincident(out);
}

/** Two onsets that snapped to the same grid position are one note. */
function mergeCoincident(notes: QuantizedNote[]): QuantizedNote[] {
  const out: QuantizedNote[] = [];
  for (const note of notes) {
    const previous = out[out.length - 1];
    if (previous && Math.abs(previous.time - note.time) < 0.001) {
      previous.strength = Math.max(previous.strength, note.strength);
      previous.sustain = Math.max(previous.sustain, note.sustain);
      previous.lowRatio = (previous.lowRatio + note.lowRatio) / 2;
      previous.highRatio = (previous.highRatio + note.highRatio) / 2;
      continue;
    }
    out.push({ ...note });
  }
  return out;
}

/* ─── Difficulty tiers ───────────────────────────────────────────────────── */

interface Tier {
  /** Notes per second the chart aims for. */
  targetNps: number;
  /** Closest two notes may ever be, seconds. */
  minGap: number;
  /** Closest two notes *in the same lane* may be, seconds. */
  laneMinGap: number;
  /** Share of notes allowed to be holds. */
  holdShare: number;
}

/**
 * Density budgets.
 *
 * Calibrated against the two-lane, two-button layout this game actually has —
 * not against a four-key or six-lane game, where the same notes-per-second is
 * far easier because the load is spread over more fingers. Expert's 6 NPS on
 * two alternating buttons is already a 180 BPM sixteenth-note stream.
 */
const TIERS: Record<Difficulty, Tier> = {
  easy: { targetNps: 1.4, minGap: 0.3, laneMinGap: 0.45, holdShare: 0.2 },
  normal: { targetNps: 2.8, minGap: 0.16, laneMinGap: 0.26, holdShare: 0.18 },
  hard: { targetNps: 4.2, minGap: 0.105, laneMinGap: 0.17, holdShare: 0.14 },
  expert: { targetNps: 6.0, minGap: 0.075, laneMinGap: 0.12, holdShare: 0.1 },
};

/** The order tiers are derived in — each is selected from the one before it. */
const TIER_ORDER: readonly Difficulty[] = ['expert', 'hard', 'normal', 'easy'];

/**
 * How much a note's grid position boosts its priority.
 *
 * Selection is greedy by strength, and strength alone charts the loudest sounds
 * rather than the most *musical* ones — a crash cymbal on an off-beat outscores
 * the downbeat it is decorating. Weighting by metric position is how a human
 * charter breaks the same tie: the note on the beat is the one the player is
 * already counting.
 */
function metricWeight(note: QuantizedNote): number {
  const onBeat = note.fraction < 0.001;
  if (onBeat) return note.beatIndex % 4 === 0 ? 1.6 : 1.35;
  if (Math.abs(note.fraction - 0.5) < 0.001) return 1.15;
  if (Math.abs(note.fraction - 1 / 3) < 0.01 || Math.abs(note.fraction - 2 / 3) < 0.01) {
    return 1.05;
  }
  return 1;
}

/**
 * Pick the notes for one tier out of a candidate pool.
 *
 * Greedy by weighted strength subject to a minimum gap, stopping at the density
 * budget. Because it always draws from the tier above, the result is a strict
 * subset — which is what makes the four difficulties feel like the same chart.
 */
function selectTier(candidates: QuantizedNote[], tier: Tier, duration: number): QuantizedNote[] {
  const budget = Math.max(8, Math.floor(tier.targetNps * Math.max(1, duration)));

  const ranked = candidates
    .map((note, index) => ({ note, index, priority: note.strength * metricWeight(note) }))
    // Ties broken by original index rather than by anything derived from
    // floating-point time, so the selection is byte-for-byte reproducible.
    .sort((a, b) => b.priority - a.priority || a.index - b.index);

  const accepted: QuantizedNote[] = [];
  const acceptedTimes: number[] = [];

  for (const { note } of ranked) {
    if (accepted.length >= budget) break;
    let tooClose = false;
    // Linear scan of a sorted array would be O(n²); binary search the insert
    // point and check only the two neighbours.
    const at = lowerBound(acceptedTimes, note.time);
    if (at > 0 && note.time - acceptedTimes[at - 1] < tier.minGap) tooClose = true;
    if (!tooClose && at < acceptedTimes.length && acceptedTimes[at] - note.time < tier.minGap) {
      tooClose = true;
    }
    if (tooClose) continue;
    acceptedTimes.splice(at, 0, note.time);
    accepted.push(note);
  }

  accepted.sort((a, b) => a.time - b.time);
  return accepted;
}

function lowerBound(sorted: number[], value: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] < value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/* ─── Lane assignment and note types ─────────────────────────────────────── */

/** Below this is kick/bass territory; above the other threshold is hats/cymbals. */
const LOW_LANE_BIAS = 0.42;
const HIGH_LANE_BIAS = 0.3;
/** A run of this many notes in one lane forces an alternation. */
const MAX_JACK_RUN = 2;

/**
 * Assign lanes, place holds, and emit the final slices.
 *
 * Lane choice starts from the music — bass-dominant hits go to lane 0, bright
 * hits to lane 1, so the chart's shape tracks the drum pattern — and is then
 * overridden by two playability rules: no more than {@link MAX_JACK_RUN}
 * consecutive notes in one lane, and never two notes in the same lane closer
 * than the tier's `laneMinGap`.
 */
function buildSlices(
  notes: QuantizedNote[],
  tier: Tier,
  difficulty: Difficulty,
  random: () => number,
): Slice[] {
  const slices: Slice[] = [];
  const lastTimeInLane = [-Infinity, -Infinity];
  const holdEndInLane = [-Infinity, -Infinity];
  let runLane = -1;
  let runLength = 0;
  let holds = 0;
  const holdBudget = Math.floor(notes.length * tier.holdShare);

  for (let i = 0; i < notes.length; i++) {
    const note = notes[i];

    // 1. What the music suggests.
    let lane: number;
    if (note.lowRatio >= LOW_LANE_BIAS) lane = 0;
    else if (note.highRatio >= HIGH_LANE_BIAS) lane = 1;
    // Neither dominant — alternate, with a deterministic tie-break so a chart
    // of pure mid-range hits still varies instead of sitting on one lane.
    else lane = runLane >= 0 ? 1 - runLane : random() < 0.5 ? 0 : 1;

    // 2. Break jacks.
    if (lane === runLane && runLength >= MAX_JACK_RUN) lane = 1 - lane;

    // 3. Respect same-lane spacing; fall back to the other lane, then drop.
    if (note.time - lastTimeInLane[lane] < tier.laneMinGap || note.time < holdEndInLane[lane]) {
      const other = 1 - lane;
      if (
        note.time - lastTimeInLane[other] >= tier.laneMinGap &&
        note.time >= holdEndInLane[other]
      ) {
        lane = other;
      } else {
        continue;
      }
    }

    // 4. Tap or hold. A hold needs the energy to actually sustain, room before
    //    the next note in the same lane, and a slot in the tier's hold budget.
    let type: Slice['type'] = 'STANDARD';
    let duration: number | undefined;
    const minHold = note.beatLength * 0.75;
    if (holds < holdBudget && note.sustain >= minHold) {
      const nextInLane = findNextTime(notes, i + 1, note.time);
      const available = nextInLane - note.time - tier.laneMinGap;
      const wanted = Math.min(note.sustain, note.beatLength * 4);
      // Quantise the tail to half-beats so a hold ends somewhere musical.
      const stepped =
        Math.floor(Math.min(wanted, available) / (note.beatLength / 2)) * (note.beatLength / 2);
      if (stepped >= minHold) {
        type = 'LONG';
        duration = stepped;
        holds++;
      }
    }

    slices.push({
      id: `${difficulty}-${i}-${Math.round(note.time * 1000)}`,
      time: Number(note.time.toFixed(4)),
      type,
      lane,
      ...(duration !== undefined ? { duration: Number(duration.toFixed(4)) } : {}),
    });

    lastTimeInLane[lane] = note.time;
    if (duration !== undefined) holdEndInLane[lane] = note.time + duration;
    if (lane === runLane) runLength++;
    else {
      runLane = lane;
      runLength = 1;
    }
  }

  return slices;
}

/** Time of the next note after index `from`, or +∞. */
function findNextTime(notes: QuantizedNote[], from: number, after: number): number {
  for (let i = from; i < notes.length; i++) {
    if (notes[i].time > after) return notes[i].time;
  }
  return Infinity;
}

/* ─── Entry point ────────────────────────────────────────────────────────── */

export interface ChartResult {
  slices: Record<Difficulty, Slice[]>;
  /** Notes per difficulty, for the library card and for tests. */
  noteCounts: Record<Difficulty, number>;
}

/**
 * Build all four difficulty charts from one set of quantised onsets.
 *
 * `seed` makes the few genuinely arbitrary choices (lane for a hit with no
 * clear frequency bias) reproducible, so re-analysing a song yields the same
 * chart and two clients that generate locally agree.
 */
export function buildCharts(notes: QuantizedNote[], duration: number, seed: string): ChartResult {
  const slices = {} as Record<Difficulty, Slice[]>;
  const noteCounts = {} as Record<Difficulty, number>;

  let pool = notes;
  for (const difficulty of TIER_ORDER) {
    const tier = TIERS[difficulty];
    const selected = selectTier(pool, tier, duration);
    // The next (easier) tier draws from this one — that is the nesting.
    pool = selected;
    const random = createSeededRandom(`${seed}:${difficulty}`);
    const built = buildSlices(selected, tier, difficulty, random);
    slices[difficulty] = built;
    noteCounts[difficulty] = built.length;
  }

  return { slices, noteCounts };
}

export { TIERS };
