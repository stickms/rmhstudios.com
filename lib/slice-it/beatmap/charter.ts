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
import { CHART_MINE_ID_PREFIX, createSeededRandom } from '../chart';
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

/**
 * Beat subdivision each snap position represents, as a denominator: 1 on the
 * beat, 2 on the eighth, 3 on a triplet, 4 on the sixteenth.
 *
 * This is the highest-value readability signal the analyser produces and it used
 * to be computed and thrown away one function before it could be used. The
 * renderer colours notes by it (`Slice.quant`), which is how every game in this
 * genre communicates rhythm.
 */
const QUANT_BY_FRACTION: readonly { fraction: number; quant: number }[] = [
  { fraction: 0, quant: 1 },
  { fraction: 1 / 4, quant: 4 },
  { fraction: 1 / 3, quant: 3 },
  { fraction: 1 / 2, quant: 2 },
  { fraction: 2 / 3, quant: 3 },
  { fraction: 3 / 4, quant: 4 },
];

/**
 * The subdivision denominator for a snapped within-beat position.
 *
 * Nearest match rather than an exact lookup, because two of the six positions
 * are thirds: `{[1/3]: 3}` is a key of `"0.3333333333333333"` and any arithmetic
 * that produces a different last bit misses it silently, which would tag every
 * triplet in the chart as a downbeat.
 */
export function quantOf(fraction: number): number {
  let quant = 1;
  let bestError = Infinity;
  for (const entry of QUANT_BY_FRACTION) {
    const error = Math.abs(fraction - entry.fraction);
    if (error < bestError) {
      bestError = error;
      quant = entry.quant;
    }
  }
  return quant;
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

export interface Tier {
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
      quant: quantOf(note.fraction),
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

/* ─── G7: chart-native mines ─────────────────────────────────────────────── */

/**
 * Share of a difficulty's notes that may become mines.
 *
 * **`easy` is zero and must stay zero.** A mine is a note you are punished for
 * playing, which inverts the only rule a beginner has learned so far ("a thing
 * arrives, you hit it"). Every game in the genre withholds the hazard vocabulary
 * from its lowest tier for the same reason.
 *
 * The other three are small on purpose. A mine is a rest made *legible* — its
 * job is to make the silence after a run feel like a place you must not go, and
 * one every twenty notes reads as a hazard while one every five reads as a
 * different game. The stored chart is the composed density; the `bombs`
 * modifier's own random conversion (`BOMB_CONVERSION_RATE`) still runs on top
 * for players who want more.
 */
const MINE_SHARE: Record<Difficulty, number> = {
  easy: 0,
  normal: 0.015,
  hard: 0.03,
  expert: 0.045,
};

/** Seconds between two mines. Two mines in one phrase is one mine twice. */
const MINE_MIN_SPACING_SECONDS = 3;

/** Consecutive notes at run spacing before the pattern counts as a "run". */
const MINE_RUN_MIN_LENGTH = 4;

/** Gap, as a fraction of the beat, at or under which notes read as a run. */
const MINE_RUN_MAX_GAP_BEATS = 0.55;

/**
 * The lead-in a mine must clear, seconds.
 *
 * `lintNotes`' own `too-early` rule warns about anything before 2s, and a
 * generator that emits notes its linter warns about trains authors to ignore
 * the panel. Same number, deliberately.
 */
const MINE_LEAD_IN_SECONDS = 2;

interface MineCandidate {
  time: number;
  lane: number;
  /** Beat subdivision of the slot, for the renderer's quant colouring. */
  quant: number;
}

/** The beat a quantised note sits in, recovered from its stored fraction. */
function beatFrameAt(
  notes: readonly QuantizedNote[],
  time: number,
): { start: number; length: number } | null {
  if (notes.length === 0) return null;
  let lo = 0;
  let hi = notes.length - 1;
  let best = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (notes[mid].time <= time) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  const near = notes[best];
  if (!(near.beatLength > 0)) return null;
  return { start: near.time - near.fraction * near.beatLength, length: near.beatLength };
}

/**
 * Place mines at the rests the chart wants you **not** to hit (`G7`).
 *
 * A mine is only interesting where the music has already told the player to
 * press. Two such places, and only two, because a mine anywhere else is a
 * random punishment rather than a reading test:
 *
 * 1. **The step after a run ends.** A stream of four or more notes builds a
 *    cadence the hands are already committed to; the note that does not come is
 *    the hardest thing in the genre to *not* play. The mine goes exactly where
 *    the next note of the run would have been, in the lane the alternation was
 *    heading for.
 * 2. **The downbeat a syncopation skips.** When a note lands off the beat and
 *    the beat itself is empty, the empty beat is the one the player's internal
 *    metronome is counting. The mine goes on that beat, in the same lane as the
 *    syncopated note — the lane the hand is already on.
 *
 * Everything after that is refusal. A candidate is dropped unless it clears the
 * tier's own spacing rules in its own lane and in both, sits outside every hold,
 * clears the lead-in, and is far enough from the previous mine to be read as its
 * own event. What survives is sampled evenly across the track so a chart's mines
 * are spread through it rather than clustered where the runs happen to be.
 *
 * The result is `BOMB` slices carrying {@link CHART_MINE_ID_PREFIX} on their
 * `id`. That prefix is load-bearing: it is what `applyChartModifiers` in
 * `chart.ts` matches to **strip them when the `bombs` modifier is off**, which
 * is the only reason placing them in the stored chart is safe at all. Placed
 * without that gate they would be unavoidable bombs on every run for every
 * player, including everyone who never opted in.
 */
export function placeMines(
  slices: readonly Slice[],
  notes: readonly QuantizedNote[],
  tier: Tier,
  difficulty: Difficulty,
  duration: number,
  random: () => number,
): Slice[] {
  const share = MINE_SHARE[difficulty] ?? 0;
  const budget = Math.floor(slices.length * share);
  if (budget < 1 || slices.length < MINE_RUN_MIN_LENGTH) return [];

  const ordered = [...slices].sort((a, b) => a.time - b.time);
  const first = ordered[0].time;
  const last = ordered[ordered.length - 1].time;

  // A mine must be a rest, so the bar for "something is already here" is higher
  // than the bar for two ordinary notes: 2x the tier's own minimum in either
  // lane. At the fastest spacings that rejects every candidate, which is the
  // intended answer — a 16th-note stream at Expert has no rests in it to mark.
  const anyLaneGuard = Math.max(tier.minGap * 2, 0.15);
  const sameLaneGuard = Math.max(tier.laneMinGap, 0.18);

  const candidates: MineCandidate[] = [];

  /* 1. The step after a run ends. */
  let runStart = 0;
  for (let i = 1; i <= ordered.length; i++) {
    const frame = beatFrameAt(notes, ordered[i - 1].time);
    const beatLength = frame?.length ?? 0.5;
    const gap = i < ordered.length ? ordered[i].time - ordered[i - 1].time : Infinity;
    const continues = gap <= beatLength * MINE_RUN_MAX_GAP_BEATS;
    if (continues) continue;

    const runLength = i - runStart;
    runStart = i;
    if (runLength < MINE_RUN_MIN_LENGTH) continue;

    const tail = ordered[i - 1];
    const before = ordered[i - 2];
    const step = tail.time - before.time;
    if (!(step > 0)) continue;
    // The lane the run was heading for: alternate if it was alternating, hold
    // the lane if it was a jack. Either way it is where the hand is going.
    const lane = tail.lane === before.lane ? tail.lane : 1 - tail.lane;
    const time = Number((tail.time + step).toFixed(4));
    const tailFrame = beatFrameAt(notes, time);
    const fraction = tailFrame ? ((time - tailFrame.start) / tailFrame.length) % 1 : 0;
    candidates.push({ time, lane, quant: quantOf(fraction < 0 ? fraction + 1 : fraction) });
  }

  /* 2. The downbeat a syncopation skips. */
  for (const slice of ordered) {
    if (slice.quant === undefined || slice.quant === 1) continue;
    const frame = beatFrameAt(notes, slice.time);
    if (!frame) continue;
    const time = Number(frame.start.toFixed(4));
    if (time >= slice.time) continue;
    candidates.push({ time, lane: slice.lane, quant: 1 });
  }

  /* 3. Refusal. */
  const holds = ordered.filter((s) => s.type === 'LONG' && (s.duration ?? 0) > 0);
  const viable = candidates
    .filter((candidate) => {
      if (candidate.time < Math.max(MINE_LEAD_IN_SECONDS, first)) return false;
      if (candidate.time > Math.min(last, duration)) return false;
      for (const slice of ordered) {
        const distance = Math.abs(slice.time - candidate.time);
        if (distance < anyLaneGuard) return false;
        if (slice.lane === candidate.lane && distance < sameLaneGuard) return false;
      }
      for (const hold of holds) {
        if (hold.lane !== candidate.lane) continue;
        const end = hold.time + (hold.duration ?? 0);
        if (candidate.time >= hold.time - sameLaneGuard && candidate.time <= end + sameLaneGuard) {
          return false;
        }
      }
      return true;
    })
    .sort((a, b) => a.time - b.time || a.lane - b.lane);

  // Two rules found the same rest — keep one.
  const deduped: MineCandidate[] = [];
  for (const candidate of viable) {
    const previous = deduped[deduped.length - 1];
    if (previous && candidate.time - previous.time < anyLaneGuard) continue;
    deduped.push(candidate);
  }
  if (deduped.length === 0) return [];

  /* 4. Spread, then spend the budget. */
  // Stride sampling rather than "the first N": a chart's runs cluster, and
  // taking candidates in time order until the budget runs out would put every
  // mine in the first chorus and none in the last. The offset is the one place
  // the seeded PRNG is consulted, so two difficulties of the same song do not
  // pick the same phrases.
  const stride = Math.max(1, deduped.length / budget);
  const offset = random() * stride;
  const picked: MineCandidate[] = [];
  for (let i = 0; picked.length < budget; i++) {
    const index = Math.floor(offset + i * stride);
    if (index >= deduped.length) break;
    const candidate = deduped[index];
    const previous = picked[picked.length - 1];
    if (previous && candidate.time - previous.time < MINE_MIN_SPACING_SECONDS) continue;
    picked.push(candidate);
  }

  return picked.map((candidate, index) => ({
    id: `${CHART_MINE_ID_PREFIX}${difficulty}-${index}-${Math.round(candidate.time * 1000)}`,
    time: candidate.time,
    type: 'BOMB' as const,
    lane: candidate.lane,
    quant: candidate.quant,
  }));
}

/* ─── Entry point ────────────────────────────────────────────────────────── */

export interface ChartResult {
  slices: Record<Difficulty, Slice[]>;
  /**
   * Notes per difficulty, for the library card and for tests.
   *
   * **Playable notes, not stored slices.** G7's mines are stored in the same
   * array but are never hit, never scored and vanish entirely unless the player
   * turns `bombs` on — counting them would advertise a note count no run of the
   * chart can ever produce.
   */
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

    // G7. A separate PRNG stream, so a chart generated with mines has exactly
    // the same notes as one generated before mines existed — the mine sampler
    // cannot pull the lane assignments out from under `buildSlices`.
    const mines = placeMines(
      built,
      selected,
      tier,
      difficulty,
      duration,
      createSeededRandom(`${seed}:${difficulty}:mines`),
    );

    slices[difficulty] = [...built, ...mines].sort((a, b) => a.time - b.time);
    noteCounts[difficulty] = built.length;
  }

  return { slices, noteCounts };
}

export { TIERS };
