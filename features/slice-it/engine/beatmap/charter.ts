/**
 * Turning detected onsets into a playable chart.
 *
 * Detection says *when* something happened. Charting decides which of those
 * moments become notes, on which lane, and as taps or holds — and that is a
 * design problem, not a signal-processing one. The rules below are the ones
 * every mainstream rhythm game converges on:
 *
 * - **Notes are LABELLED by the grid and PLACED by the audio.** Which subdivision
 *   of the beat an onset belongs to is musical information (it drives the flags and
 *   the beaming), and it is read off the tracked grid. But where the note sits in
 *   time is where the player HEARS the attack: moving it to a grid line is a
 *   timing error of exactly the size it is moved, against a 15 ms MARVELOUS window.
 *   A note is only moved onto the grid when the move is smaller than the detector's
 *   own precision; a live or old recording whose tempo wanders keeps its true timing.
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

import type {
  Difficulty,
  Slice,
} from '../types';
import {
  CHART_MINE_ID_PREFIX,
  createSeededRandom,
} from '../chart';
import type { Onset } from './onsets';

/* ─── Quantisation ───────────────────────────────────────────────────────── */

/** Grid positions within a beat: 16ths plus the two triplet positions. */
const SUBDIVISIONS: readonly number[] =
  [
    0,
    1 /
      4,
    1 /
      3,
    1 /
      2,
    2 /
      3,
    3 /
      4,
    1,
  ];

/**
 * How far from every grid position an onset may be before it is dropped as an
 * artefact (a reverb tail, a vocal consonant), seconds…
 */
const MAX_SNAP_SECONDS = 0.055;
/** …and as a fraction of the beat, so slow songs do not get a sloppier filter. */
const MAX_SNAP_FRACTION = 0.18;
/**
 * How far an onset may be from a grid position and still be LABELLED with it
 * (given that position's subdivision, flags and beam group). One further out — a
 * swung or human hit — is marked off-grid, which the renderer and the editor
 * already know how to show.
 */
const SNAP_MOVE_SECONDS = 0.03;
const SNAP_MOVE_FRACTION = 0.1;
/**
 * How far a note's TIME may be moved onto the grid line it was labelled with.
 *
 * Onset times are accurate to a couple of milliseconds (see `attack.ts`), so a
 * correction this small is inside the measurement's own noise and tidies a tight
 * electronic track onto exact grid lines. Anything larger is real timing in the
 * music, and moving it would put the note off the sound the player hears: the old
 * 30 ms move was twice the MARVELOUS window and is the largest single cause of a
 * chart "feeling off" on a song that is not machine-quantised.
 */
const SNAP_TIME_SECONDS = 0.006;

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
  /** Spectral centroid (log2 Hz) of the attack; absent on a pool rebuilt from a chart. */
  centroid?: number;
  /**
   * How long the note is held, seconds, already snapped to the beat grid — set
   * ONLY when the sound really is sustained and long enough to be a hold. It is
   * decided once per note, here, so a hold on Expert is the same hold (same
   * length) on every easier tier that keeps the note.
   */
  holdDuration?: number;
  /** Strength ranked within the note's own register (0–1); see {@link assignRanks}. */
  rank?: number;
  /** The lane this note's sound belongs on, when the song's timbres tell. */
  laneHint?:
    | 0
    | 1;
  /** True when the note was too far from the grid to snap, and keeps its own time. */
  offGrid?: boolean;
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
const QUANT_BY_FRACTION: readonly {
  fraction: number;
  quant: number;
}[] =
  [
    {
      fraction: 0,
      quant: 1,
    },
    {
      fraction:
        1 /
        4,
      quant: 4,
    },
    {
      fraction:
        1 /
        3,
      quant: 3,
    },
    {
      fraction:
        1 /
        2,
      quant: 2,
    },
    {
      fraction:
        2 /
        3,
      quant: 3,
    },
    {
      fraction:
        3 /
        4,
      quant: 4,
    },
  ];

/**
 * The subdivision denominator for a snapped within-beat position.
 *
 * Nearest match rather than an exact lookup, because two of the six positions
 * are thirds: `{[1/3]: 3}` is a key of `"0.3333333333333333"` and any arithmetic
 * that produces a different last bit misses it silently, which would tag every
 * triplet in the chart as a downbeat.
 */
export function quantOf(
  fraction: number,
): number {
  let quant = 1;
  let bestError =
    Infinity;
  for (const entry of QUANT_BY_FRACTION) {
    const error =
      Math.abs(
        fraction -
          entry.fraction,
      );
    if (
      error <
      bestError
    ) {
      bestError =
        error;
      quant =
        entry.quant;
    }
  }
  return quant;
}

/** Index of the last beat at or before `time`, or -1. */
function beatIndexAt(
  beats: number[],
  time: number,
): number {
  let lo = 0;
  let hi =
    beats.length -
    1;
  let found =
    -1;
  while (
    lo <=
    hi
  ) {
    const mid =
      (lo +
        hi) >>
      1;
    if (
      beats[
        mid
      ] <=
      time
    ) {
      found =
        mid;
      lo =
        mid +
        1;
    } else {
      hi =
        mid -
        1;
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
export function quantizeOnsets(
  onsets: Onset[],
  beats: number[],
): QuantizedNote[] {
  if (
    beats.length <
    2
  )
    return [];

  const out: QuantizedNote[] =
    [];

  for (const onset of onsets) {
    let index =
      beatIndexAt(
        beats,
        onset.time,
      );
    if (
      index <
      0
    )
      index = 0;
    if (
      index >=
      beats.length -
        1
    )
      index =
        beats.length -
        2;

    const start =
      beats[
        index
      ];
    const end =
      beats[
        index +
          1
      ];
    const beatLength =
      end -
      start;
    if (
      !(
        beatLength >
        0
      )
    )
      continue;

    const fraction =
      (onset.time -
        start) /
      beatLength;

    let bestFraction = 0;
    let bestError =
      Infinity;
    for (const candidate of SUBDIVISIONS) {
      const error =
        Math.abs(
          fraction -
            candidate,
        );
      if (
        error <
        bestError
      ) {
        bestError =
          error;
        bestFraction =
          candidate;
      }
    }

    const errorSeconds =
      bestError *
      beatLength;
    if (
      errorSeconds >
      Math.min(
        MAX_SNAP_SECONDS,
        beatLength *
          MAX_SNAP_FRACTION,
      )
    )
      continue;
    const snap =
      errorSeconds <=
      Math.min(
        SNAP_MOVE_SECONDS,
        beatLength *
          SNAP_MOVE_FRACTION,
      );

    // A note snapped to the end of one beat is the start of the next.
    let beatIndex =
      index;
    let snappedFraction =
      bestFraction;
    if (
      bestFraction >=
      1
    ) {
      beatIndex =
        index +
        1;
      snappedFraction = 0;
    }
    const snappedStart =
      beats[
        Math.min(
          beatIndex,
          beats.length -
            1,
        )
      ];
    const snappedLength =
      beatIndex +
        1 <
      beats.length
        ? beats[
            beatIndex +
              1
          ] -
          snappedStart
        : beatLength;

    // The label snaps (within SNAP_MOVE_*); the time snaps only inside the detector's
    // own noise.
    const gridTime =
      snappedStart +
      snappedFraction *
        snappedLength;
    const time =
      snap &&
      Math.abs(
        gridTime -
          onset.time,
      ) <=
        SNAP_TIME_SECONDS
        ? gridTime
        : onset.time;
    out.push(
      {
        time,
        strength:
          onset.strength,
        frame:
          onset.frame,
        lowRatio:
          onset.lowRatio,
        highRatio:
          onset.highRatio,
        sustain:
          onset.sustain,
        beatIndex,
        fraction:
          snap
            ? snappedFraction
            : Math.max(
                0,
                Math.min(
                  1,
                  fraction,
                ),
              ),
        beatLength:
          snappedLength,
        ...(snap
          ? {}
          : {
              offGrid: true,
            }),
        ...(onset.centroid !==
        undefined
          ? {
              centroid:
                onset.centroid,
            }
          : {}),
        ...holdFor(
          onset,
          time,
          snappedLength,
          beats,
        ),
      },
    );
  }

  out.sort(
    (
      a,
      b,
    ) =>
      a.time -
      b.time,
  );
  return mergeCoincident(
    out,
  );
}

/* ─── Holds ──────────────────────────────────────────────────────────────── */

/** The shortest hold, seconds — clear of the lint's own 317 ms release window. */
const MIN_HOLD_SECONDS = 0.4;
/** …and as a share of the beat, so a slow song does not get a hold that is a blink. */
const MIN_HOLD_BEATS = 0.75;
/** The longest hold, in beats. */
const MAX_HOLD_BEATS = 4;
/** Hold tails end on quarter-beat positions (sixteenths): where a player expects them. */
const TAIL_DIVISIONS = 4;

/**
 * Snap a tail time to the nearest quarter-beat of the grid, when it is already
 * that close.
 *
 * A tail that is within a few milliseconds of a grid line is that line, and is
 * charted there. One that is further is the audio's own release (a bass note gated
 * at 92% of two beats ends at 1.84, not 2.0) and is charted where it is heard: the
 * release is judged against the sound, and a tail drawn on a grid line 60 ms away
 * from the sound it follows reads as the game being out of time.
 */
function snapTail(
  time: number,
  beats: readonly number[],
): number {
  const index =
    Math.max(
      0,
      Math.min(
        beats.length -
          2,
        beatIndexAt(
          beats as number[],
          time,
        ),
      ),
    );
  const start =
    beats[
      index
    ];
  const length =
    beats[
      index +
        1
    ] -
    start;
  if (
    !(
      length >
      0
    )
  )
    return time;
  const fraction =
    (time -
      start) /
    length;
  const snapped =
    Math.round(
      fraction *
        TAIL_DIVISIONS,
    ) /
    TAIL_DIVISIONS;
  const gridTime =
    start +
    snapped *
      length;
  return Math.abs(
    gridTime -
      time,
  ) <=
    SNAP_TIME_SECONDS *
      2
    ? gridTime
    : time;
}

/** `{ holdDuration }` for a sustained onset that is long enough to chart as one, else `{}`. */
function holdFor(
  onset: Onset,
  noteTime: number,
  beatLength: number,
  beats: readonly number[],
): {
  holdDuration?: number;
} {
  const end =
    onset.holdEnd ??
    (onset.sustain >
    0
      ? onset.time +
        onset.sustain
      : 0);
  if (
    !(
      end >
      noteTime
    )
  )
    return {};
  const duration =
    Math.min(
      snapTail(
        end,
        beats,
      ) -
        noteTime,
      beatLength *
        MAX_HOLD_BEATS,
    );
  return duration >=
    Math.max(
      MIN_HOLD_SECONDS,
      beatLength *
        MIN_HOLD_BEATS,
    )
    ? {
        holdDuration:
          duration,
      }
    : {};
}

/**
 * Two onsets that landed in the same grid slot are one note.
 *
 * They used to be recognisable by sharing a time (both were moved to the grid line).
 * Notes now keep their own time, so the slot is compared instead, and the merged
 * note sits where the STRONGER attack is — the one the player is following.
 */
function mergeCoincident(
  notes: QuantizedNote[],
): QuantizedNote[] {
  const out: QuantizedNote[] =
    [];
  for (const note of notes) {
    const previous =
      out[
        out.length -
          1
      ];
    const sameSlot =
      previous !==
        undefined &&
      !previous.offGrid &&
      !note.offGrid &&
      previous.beatIndex ===
        note.beatIndex &&
      previous.fraction ===
        note.fraction &&
      Math.abs(
        previous.time -
          note.time,
      ) <=
        SNAP_MOVE_SECONDS *
          2;
    if (
      previous &&
      (sameSlot ||
        Math.abs(
          previous.time -
            note.time,
        ) <
          0.001)
    ) {
      if (
        note.strength >
        previous.strength
      )
        previous.time =
          note.time;
      previous.strength =
        Math.max(
          previous.strength,
          note.strength,
        );
      previous.sustain =
        Math.max(
          previous.sustain,
          note.sustain,
        );
      if (
        note.holdDuration &&
        !(
          previous.holdDuration &&
          previous.holdDuration >=
            note.holdDuration
        )
      ) {
        previous.holdDuration =
          note.holdDuration;
      }
      previous.lowRatio =
        (previous.lowRatio +
          note.lowRatio) /
        2;
      previous.highRatio =
        (previous.highRatio +
          note.highRatio) /
        2;
      continue;
    }
    out.push(
      {
        ...note,
      },
    );
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
const TIERS: Record<
  Difficulty,
  Tier
> =
  {
    easy: {
      targetNps: 1.4,
      minGap: 0.3,
      laneMinGap: 0.45,
      holdShare: 0.35,
    },
    normal:
      {
        targetNps: 2.8,
        minGap: 0.16,
        laneMinGap: 0.26,
        holdShare: 0.3,
      },
    hard: {
      targetNps: 4.2,
      minGap: 0.105,
      laneMinGap: 0.17,
      holdShare: 0.22,
    },
    expert:
      {
        targetNps: 6.0,
        minGap: 0.075,
        laneMinGap: 0.12,
        holdShare: 0.16,
      },
  };

/** The order tiers are derived in — each is selected from the one before it. */
const TIER_ORDER: readonly Difficulty[] =
  [
    'expert',
    'hard',
    'normal',
    'easy',
  ];

/**
 * How much a note's grid position boosts its priority.
 *
 * Selection is greedy by strength, and strength alone charts the loudest sounds
 * rather than the most *musical* ones — a crash cymbal on an off-beat outscores
 * the downbeat it is decorating. Weighting by metric position is how a human
 * charter breaks the same tie: the note on the beat is the one the player is
 * already counting.
 */
/** A detected section, as `beatmap/sections.ts` produces them. */
export interface Section {
  start: number;
  end: number;
  energy: number;
}

/** G14 — bounds on how far section energy may move a note's priority. */
const SECTION_WEIGHT_MIN = 0.7;
const SECTION_WEIGHT_MAX = 1.45;

/**
 * Build the G14 priority multiplier: a function from time to a bounded weight.
 *
 * Returns a constant 1 when there is no section data — every chart generated
 * before `sections.ts` existed, and any track whose novelty curve was too flat
 * to segment. That is the correct fallback rather than a defect: a track with
 * no discernible structure genuinely has no loud part to favour.
 */
function sectionEnergyWeighter(
  sections?: Section[],
): (
  time: number,
) => number {
  if (
    !sections ||
    sections.length <
      2
  )
    return () =>
      1;
  const mean =
    sections.reduce(
      (
        sum,
        s,
      ) =>
        sum +
        s.energy,
      0,
    ) /
    sections.length;
  if (
    !(
      mean >
      0
    )
  )
    return () =>
      1;

  return (
    time: number,
  ) => {
    const section =
      sections.find(
        (
          s,
        ) =>
          time >=
            s.start &&
          time <
            s.end,
      );
    if (
      !section
    )
      return 1;
    const ratio =
      section.energy /
      mean;
    return Math.max(
      SECTION_WEIGHT_MIN,
      Math.min(
        SECTION_WEIGHT_MAX,
        ratio,
      ),
    );
  };
}

function metricWeight(
  note: QuantizedNote,
): number {
  if (
    note.offGrid
  )
    return 0.9;
  const onBeat =
    note.fraction <
    0.001;
  if (
    onBeat
  )
    return note.beatIndex %
      4 ===
      0
      ? 1.6
      : 1.35;
  if (
    Math.abs(
      note.fraction -
        0.5,
    ) <
    0.001
  )
    return 1.15;
  if (
    Math.abs(
      note.fraction -
        1 /
          3,
    ) <
      0.01 ||
    Math.abs(
      note.fraction -
        2 /
          3,
    ) <
      0.01
  ) {
    return 1.05;
  }
  return 1;
}

/**
 * C10 — the uploader's density thumb on the scale.
 *
 * Density budgets are per-tier constants, so an analyser that over-charts a
 * sparse ambient track leaves the uploader with no recourse but deletion. This
 * is the most common upload complaint, expressed as a slider.
 *
 * **Exponential, not linear.** −1 has to mean "noticeably sparser" and −2 "about
 * half as many"; linear steps of 0.25 deliver neither, because a 25% cut at the
 * sparse end is a handful of notes. 1.45^±2 is 0.48× and 2.1×, which is the
 * range that actually spans "too busy" to "too empty" on the tracks people
 * complain about.
 *
 * The floor of 8 is not part of the bias: a chart with three notes in it is not
 * a chart, however sparse the uploader asked for.
 */
export function biasedBudget(
  base: number,
  bias: number,
): number {
  const clamped =
    Math.max(
      -2,
      Math.min(
        2,
        Number.isFinite(
          bias,
        )
          ? bias
          : 0,
      ),
    );
  return Math.max(
    8,
    Math.floor(
      base *
        Math.pow(
          1.45,
          clamped,
        ),
    ),
  );
}

/* ─── Ranking and lane hints ─────────────────────────────────────────────── */

/**
 * Rank every note's strength WITHIN its own register.
 *
 * Raw onset strength is a flux value, and a hi-hat's broadband flux is larger than
 * a kick's. Selected by strength alone, the sparse tiers charted the hats and left
 * the kick and snare — the backbone a player counts — out (on a test track Easy
 * contained 3 of 128 kick/snare hits). Ranking each register against itself says
 * "this is one of the kick's strongest hits", which is what matters when the budget
 * is small. The floor keeps a weak hit from ranking at zero: it is still a hit.
 */
function assignRanks(
  notes: QuantizedNote[],
): void {
  const groups: Record<
    | 'low'
    | 'mid'
    | 'high',
    QuantizedNote[]
  > =
    {
      low: [],
      mid: [],
      high: [],
    };
  for (const note of notes)
    groups[
      registerOf(
        note,
      )
    ].push(
      note,
    );
  for (const group of Object.values(
    groups,
  )) {
    if (
      group.length <
      6
    ) {
      for (const note of group)
        note.rank =
          note.strength;
      continue;
    }
    const sorted =
      [
        ...group,
      ].sort(
        (
          a,
          b,
        ) =>
          a.strength -
          b.strength,
      );
    sorted.forEach(
      (
        note,
        i,
      ) => {
        note.rank =
          0.35 +
          0.65 *
            (i /
              (sorted.length -
                1));
      },
    );
  }
}

/** How much a register matters when the budget is tight: the low end carries the groove. */
const REGISTER_WEIGHT: Record<
  | 'low'
  | 'mid'
  | 'high',
  number
> =
  {
    low: 1.2,
    mid: 1.1,
    high: 0.9,
  };

/** Octaves between the two timbre clusters below which they are not worth separating. */
const MIN_CLUSTER_SEPARATION = 0.8;
/** Octaves either side of the boundary where a sound is too close to call. */
const LANE_AMBIGUITY = 0.2;

/**
 * Decide which lane each sound belongs on, from this song's own timbres.
 *
 * Fixed thresholds ("more than 42% below 250 Hz is lane 0") assume a mix of kick,
 * snare and hats. A song of piano and strings has none of those, so every note fell
 * on the same side of the line or was assigned at random. Here the notes are split
 * in two by their spectral centroid with a 2-means fit, so the boundary is wherever
 * THIS song's low sounds end and high sounds begin; the lower cluster is lane 0.
 * Sounds within {@link LANE_AMBIGUITY} of the boundary get no hint and take the
 * lane that keeps the pattern alternating, which is what plays well.
 *
 * With no centroid (a pool rebuilt from a stored chart) the old register ratios
 * decide, as they did before.
 */
function assignLaneHints(
  notes: QuantizedNote[],
): void {
  const withCentroid =
    notes.filter(
      (
        n,
      ) =>
        n.centroid !==
        undefined,
    );
  if (
    withCentroid.length >=
    12
  ) {
    const values =
      withCentroid
        .map(
          (
            n,
          ) =>
            n.centroid as number,
        )
        .sort(
          (
            a,
            b,
          ) =>
            a -
            b,
        );
    let lo =
      values[
        Math.floor(
          values.length *
            0.1,
        )
      ];
    let hi =
      values[
        Math.floor(
          values.length *
            0.9,
        )
      ];
    for (
      let iteration = 0;
      iteration <
      16;
      iteration++
    ) {
      const boundary =
        (lo +
          hi) /
        2;
      let loSum = 0,
        loWeight = 0,
        hiSum = 0,
        hiWeight = 0;
      for (const n of withCentroid) {
        const c =
          n.centroid as number;
        const w =
          0.2 +
          n.strength;
        if (
          c <=
          boundary
        ) {
          loSum +=
            c *
            w;
          loWeight +=
            w;
        } else {
          hiSum +=
            c *
            w;
          hiWeight +=
            w;
        }
      }
      if (
        loWeight ===
          0 ||
        hiWeight ===
          0
      )
        break;
      const nextLo =
        loSum /
        loWeight;
      const nextHi =
        hiSum /
        hiWeight;
      if (
        Math.abs(
          nextLo -
            lo,
        ) +
          Math.abs(
            nextHi -
              hi,
          ) <
        1e-4
      ) {
        lo =
          nextLo;
        hi =
          nextHi;
        break;
      }
      lo =
        nextLo;
      hi =
        nextHi;
    }
    if (
      hi -
        lo >=
      MIN_CLUSTER_SEPARATION
    ) {
      const boundary =
        (lo +
          hi) /
        2;
      for (const n of notes) {
        if (
          n.centroid ===
          undefined
        )
          continue;
        if (
          n.centroid <
          boundary -
            LANE_AMBIGUITY
        )
          n.laneHint = 0;
        else if (
          n.centroid >
          boundary +
            LANE_AMBIGUITY
        )
          n.laneHint = 1;
      }
      return;
    }
  }
  for (const n of notes) {
    if (
      n.lowRatio >=
      LOW_LANE_BIAS
    )
      n.laneHint = 0;
    else if (
      n.highRatio >=
      HIGH_LANE_BIAS
    )
      n.laneHint = 1;
  }
}

/**
 * Pick the notes for one tier out of a candidate pool.
 *
 * Greedy by weighted strength subject to a minimum gap, stopping at the density
 * budget. Because it always draws from the tier above, the result is a strict
 * subset — which is what makes the four difficulties feel like the same chart.
 */
function selectTier(
  candidates: QuantizedNote[],
  tier: Tier,
  duration: number,
  sections?: Section[],
  densityBias = 0,
): QuantizedNote[] {
  const budget =
    biasedBudget(
      tier.targetNps *
        Math.max(
          1,
          duration,
        ),
      densityBias,
    );

  // G14 — spend the budget where the music is.
  //
  // A single notes-per-second target spread flat over the track over-charts a
  // quiet intro and under-charts the drop, because greedy-by-strength alone
  // cannot see that a section is quiet ON PURPOSE. Weighting by the section's
  // energy relative to the track's mean pushes notes toward the loud parts
  // without changing the total, so the tier's density guarantee is untouched.
  //
  // A WEIGHT rather than a per-section quota, deliberately: a hard quota with a
  // floor and a ceiling has to decide what to do when a section cannot spend
  // its allocation, and every answer to that reintroduces the flat behaviour
  // somewhere. Bounded so a near-silent intro still gets notes and a drop
  // cannot swallow the whole budget.
  const energyWeight =
    sectionEnergyWeighter(
      sections,
    );

  const ranked =
    candidates
      .map(
        (
          note,
          index,
        ) => ({
          note,
          index,
          // Rank within register, not raw flux (see `assignRanks`); a held note is
          // what the music is doing at that moment, so it is kept in preference.
          priority:
            (note.rank ??
              note.strength) *
            REGISTER_WEIGHT[
              registerOf(
                note,
              )
            ] *
            (note.holdDuration
              ? 1.25
              : 1) *
            metricWeight(
              note,
            ) *
            energyWeight(
              note.time,
            ),
        }),
      )
      // Ties broken by original index rather than by anything derived from
      // floating-point time, so the selection is byte-for-byte reproducible.
      .sort(
        (
          a,
          b,
        ) =>
          b.priority -
            a.priority ||
          a.index -
            b.index,
      );

  const accepted: QuantizedNote[] =
    [];
  const acceptedTimes: number[] =
    [];

  for (const {
    note,
  } of ranked) {
    if (
      accepted.length >=
      budget
    )
      break;
    let tooClose = false;
    // Linear scan of a sorted array would be O(n²); binary search the insert
    // point and check only the two neighbours.
    const at =
      lowerBound(
        acceptedTimes,
        note.time,
      );
    if (
      at >
        0 &&
      note.time -
        acceptedTimes[
          at -
            1
        ] <
        tier.minGap
    )
      tooClose = true;
    if (
      !tooClose &&
      at <
        acceptedTimes.length &&
      acceptedTimes[
        at
      ] -
        note.time <
        tier.minGap
    ) {
      tooClose = true;
    }
    if (
      tooClose
    )
      continue;
    acceptedTimes.splice(
      at,
      0,
      note.time,
    );
    accepted.push(
      note,
    );
  }

  accepted.sort(
    (
      a,
      b,
    ) =>
      a.time -
      b.time,
  );
  return accepted;
}

function lowerBound(
  sorted: number[],
  value: number,
): number {
  let lo = 0;
  let hi =
    sorted.length;
  while (
    lo <
    hi
  ) {
    const mid =
      (lo +
        hi) >>
      1;
    if (
      sorted[
        mid
      ] <
      value
    )
      lo =
        mid +
        1;
    else
      hi =
        mid;
  }
  return lo;
}

/* ─── Lane assignment and note types ─────────────────────────────────────── */

/** Below this is kick/bass territory; above the other threshold is hats/cymbals. */
/**
 * G12 — which register a note's attack sat in.
 *
 * Deliberately reuses `LOW_LANE_BIAS`/`HIGH_LANE_BIAS` rather than picking its
 * own thresholds: the sound and the lane should agree about what a note IS, and
 * two sets of numbers drifting apart would produce a chart whose left hand
 * stops matching the low sample.
 */
function registerOf(
  note: QuantizedNote,
):
  | 'low'
  | 'mid'
  | 'high' {
  if (
    note.lowRatio >=
    LOW_LANE_BIAS
  )
    return 'low';
  if (
    note.highRatio >=
    HIGH_LANE_BIAS
  )
    return 'high';
  return 'mid';
}

const LOW_LANE_BIAS = 0.42;
const HIGH_LANE_BIAS = 0.3;
/** A run of this many notes in one lane forces an alternation… */
const MAX_JACK_RUN = 2;
/** …unless the notes have room between them, when a longer run is a bassline. */
const MAX_SPACED_RUN = 4;

/**
 * Assign lanes, place holds, and emit the final slices.
 *
 * Two passes. The first asks each sound which lane it belongs on (the song's own
 * timbre clusters, see {@link assignLaneHints}); the second walks the notes in
 * time and applies what two fingers can actually do: no more than a few in a row
 * on one lane, never two closer than the tier's `laneMinGap`, and nothing on a
 * lane while a hold is on it. Looking a whole pass ahead is what lets a hold know
 * which later notes would collide with it.
 *
 * Holds come from `note.holdDuration`, measured from the audio and snapped to the
 * grid once, so the same note is the same hold on every tier. Here a hold is only
 * shortened (never lengthened) — to end before the next note that wants its lane
 * and is at least as important, and never below the playable minimum.
 */
interface BuiltTier {
  slices: Slice[];
  /** The notes that survived, in time order — the pool the next easier tier draws from. */
  kept: QuantizedNote[];
  /** The lane each kept note ended up on, so an easier tier can leave it where it is. */
  lanes: Map<
    QuantizedNote,
    number
  >;
}

function buildSlices(
  notes: QuantizedNote[],
  tier: Tier,
  difficulty: Difficulty,
  random: () => number,
  /** Lanes decided by the tier above. When given, this tier may only DROP notes. */
  fixedLanes: Map<
    QuantizedNote,
    number
  > | null = null,
): BuiltTier {
  /* 1. The lane each sound asks for. */
  const natural: number[] =
    new Array(
      notes.length,
    );
  let previousNatural =
    -1;
  for (
    let i = 0;
    i <
    notes.length;
    i++
  ) {
    const fixed =
      fixedLanes?.get(
        notes[
          i
        ],
      );
    if (
      fixed !==
      undefined
    ) {
      natural[
        i
      ] =
        fixed;
      previousNatural =
        fixed;
      continue;
    }
    const hint =
      notes[
        i
      ]
        .laneHint;
    // No clear timbre: take the lane that keeps the pattern alternating, with a
    // seeded coin only for the very first note.
    const lane =
      hint !==
      undefined
        ? hint
        : previousNatural >=
            0
          ? 1 -
            previousNatural
          : random() <
              0.5
            ? 0
            : 1;
    natural[
      i
    ] =
      lane;
    previousNatural =
      lane;
  }

  /* 2. What two fingers can do. */
  const slices: Slice[] =
    [];
  const kept: QuantizedNote[] =
    [];
  const lanes =
    new Map<
      QuantizedNote,
      number
    >();
  const lastTimeInLane =
    [
      -Infinity,
      -Infinity,
    ];
  const holdEndInLane =
    [
      -Infinity,
      -Infinity,
    ];
  let runLane =
    -1;
  let runLength = 0;
  let holds = 0;
  const holdBudget =
    Math.floor(
      notes.length *
        tier.holdShare,
    );
  // An easier tier leaves every lane exactly as the tier above put it, so each of
  // its notes is the SAME note (time and lane) one tier up — the nesting the
  // difficulty ladder promises. It can only drop; it never moves a note.
  const frozen =
    fixedLanes !==
    null;

  for (
    let i = 0;
    i <
    notes.length;
    i++
  ) {
    const note =
      notes[
        i
      ];
    let lane =
      natural[
        i
      ];

    // Break jacks — but a run of notes with room between them is a bassline, not
    // a jack, so it may be longer.
    const sinceInLane =
      note.time -
      lastTimeInLane[
        lane
      ];
    const maxRun =
      sinceInLane >=
      tier.laneMinGap *
        1.6
        ? MAX_SPACED_RUN
        : MAX_JACK_RUN;
    if (
      !frozen &&
      lane ===
        runLane &&
      runLength >=
        maxRun
    )
      lane =
        1 -
        lane;

    // Respect same-lane spacing and any hold on the lane; fall back to the other
    // lane, then drop.
    if (
      note.time -
        lastTimeInLane[
          lane
        ] <
        tier.laneMinGap ||
      note.time <
        holdEndInLane[
          lane
        ]
    ) {
      const other =
        1 -
        lane;
      if (
        !frozen &&
        note.time -
          lastTimeInLane[
            other
          ] >=
          tier.laneMinGap &&
        note.time >=
          holdEndInLane[
            other
          ]
      ) {
        lane =
          other;
      } else {
        continue;
      }
    }

    // Tap or hold.
    let type: Slice['type'] =
      'STANDARD';
    let duration:
      | number
      | undefined;
    if (
      note.holdDuration &&
      holds <
        holdBudget
    ) {
      const importance =
        note.rank ??
        note.strength;
      let limit =
        note.time +
        note.holdDuration;
      for (
        let j =
          i +
          1;
        j <
        notes.length;
        j++
      ) {
        const other =
          notes[
            j
          ];
        if (
          other.time >=
          limit
        )
          break;
        // A note of equal or higher rank that wants this lane ends the hold; a
        // weaker one is simply played on the other lane, or dropped, by step 2.
        if (
          natural[
            j
          ] ===
            lane &&
          (other.rank ??
            other.strength) >=
            importance
        ) {
          limit =
            other.time -
            tier.laneMinGap;
          break;
        }
      }
      const step =
        note.beatLength /
        TAIL_DIVISIONS;
      const fitted =
        Math.floor(
          (limit -
            note.time) /
            step +
            1e-6,
        ) *
        step;
      if (
        fitted >=
        Math.max(
          MIN_HOLD_SECONDS,
          note.beatLength *
            MIN_HOLD_BEATS,
        )
      ) {
        type =
          'LONG';
        duration =
          fitted;
        holds++;
      }
    }

    slices.push(
      {
        id: `${difficulty}-${i}-${Math.round(note.time * 1000)}`,
        time: Number(
          note.time.toFixed(
            4,
          ),
        ),
        type,
        lane,
        quant:
          note.offGrid
            ? 16
            : quantOf(
                note.fraction,
              ),
        // G12 — the register this attack sat in, from the SAME ratios the lane
        // hint falls back on.
        sound:
          registerOf(
            note,
          ),
        ...(duration !==
        undefined
          ? {
              duration:
                Number(
                  duration.toFixed(
                    4,
                  ),
                ),
            }
          : {}),
      },
    );

    kept.push(
      note,
    );
    lanes.set(
      note,
      lane,
    );
    lastTimeInLane[
      lane
    ] =
      note.time;
    if (
      duration !==
      undefined
    )
      holdEndInLane[
        lane
      ] =
        note.time +
        duration;
    if (
      lane ===
      runLane
    )
      runLength++;
    else {
      runLane =
        lane;
      runLength = 1;
    }
  }

  return {
    slices,
    kept,
    lanes,
  };
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
const MINE_SHARE: Record<
  Difficulty,
  number
> =
  {
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
): {
  start: number;
  length: number;
} | null {
  if (
    notes.length ===
    0
  )
    return null;
  let lo = 0;
  let hi =
    notes.length -
    1;
  let best = 0;
  while (
    lo <=
    hi
  ) {
    const mid =
      (lo +
        hi) >>
      1;
    if (
      notes[
        mid
      ]
        .time <=
      time
    ) {
      best =
        mid;
      lo =
        mid +
        1;
    } else {
      hi =
        mid -
        1;
    }
  }
  const near =
    notes[
      best
    ];
  if (
    !(
      near.beatLength >
      0
    )
  )
    return null;
  return {
    start:
      near.time -
      near.fraction *
        near.beatLength,
    length:
      near.beatLength,
  };
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
  const share =
    MINE_SHARE[
      difficulty
    ] ??
    0;
  const budget =
    Math.floor(
      slices.length *
        share,
    );
  if (
    budget <
      1 ||
    slices.length <
      MINE_RUN_MIN_LENGTH
  )
    return [];

  const ordered =
    [
      ...slices,
    ].sort(
      (
        a,
        b,
      ) =>
        a.time -
        b.time,
    );
  const first =
    ordered[0]
      .time;
  const last =
    ordered[
      ordered.length -
        1
    ]
      .time;

  // A mine must be a rest, so the bar for "something is already here" is higher
  // than the bar for two ordinary notes: 2x the tier's own minimum in either
  // lane. At the fastest spacings that rejects every candidate, which is the
  // intended answer — a 16th-note stream at Expert has no rests in it to mark.
  const anyLaneGuard =
    Math.max(
      tier.minGap *
        2,
      0.15,
    );
  const sameLaneGuard =
    Math.max(
      tier.laneMinGap,
      0.18,
    );

  const candidates: MineCandidate[] =
    [];

  /* 1. The step after a run ends. */
  let runStart = 0;
  for (
    let i = 1;
    i <=
    ordered.length;
    i++
  ) {
    const frame =
      beatFrameAt(
        notes,
        ordered[
          i -
            1
        ]
          .time,
      );
    const beatLength =
      frame?.length ??
      0.5;
    const gap =
      i <
      ordered.length
        ? ordered[
            i
          ]
            .time -
          ordered[
            i -
              1
          ]
            .time
        : Infinity;
    const continues =
      gap <=
      beatLength *
        MINE_RUN_MAX_GAP_BEATS;
    if (
      continues
    )
      continue;

    const runLength =
      i -
      runStart;
    runStart =
      i;
    if (
      runLength <
      MINE_RUN_MIN_LENGTH
    )
      continue;

    const tail =
      ordered[
        i -
          1
      ];
    const before =
      ordered[
        i -
          2
      ];
    const step =
      tail.time -
      before.time;
    if (
      !(
        step >
        0
      )
    )
      continue;
    // The lane the run was heading for: alternate if it was alternating, hold
    // the lane if it was a jack. Either way it is where the hand is going.
    const lane =
      tail.lane ===
      before.lane
        ? tail.lane
        : 1 -
          tail.lane;
    const time =
      Number(
        (
          tail.time +
          step
        ).toFixed(
          4,
        ),
      );
    const tailFrame =
      beatFrameAt(
        notes,
        time,
      );
    const fraction =
      tailFrame
        ? ((time -
            tailFrame.start) /
            tailFrame.length) %
          1
        : 0;
    candidates.push(
      {
        time,
        lane,
        quant:
          quantOf(
            fraction <
              0
              ? fraction +
                  1
              : fraction,
          ),
      },
    );
  }

  /* 2. The downbeat a syncopation skips. */
  for (const slice of ordered) {
    if (
      slice.quant ===
        undefined ||
      slice.quant ===
        1
    )
      continue;
    const frame =
      beatFrameAt(
        notes,
        slice.time,
      );
    if (
      !frame
    )
      continue;
    const time =
      Number(
        frame.start.toFixed(
          4,
        ),
      );
    if (
      time >=
      slice.time
    )
      continue;
    candidates.push(
      {
        time,
        lane: slice.lane,
        quant: 1,
      },
    );
  }

  /* 3. Refusal. */
  const holds =
    ordered.filter(
      (
        s,
      ) =>
        s.type ===
          'LONG' &&
        (s.duration ??
          0) >
          0,
    );
  const viable =
    candidates
      .filter(
        (
          candidate,
        ) => {
          if (
            candidate.time <
            Math.max(
              MINE_LEAD_IN_SECONDS,
              first,
            )
          )
            return false;
          if (
            candidate.time >
            Math.min(
              last,
              duration,
            )
          )
            return false;
          for (const slice of ordered) {
            const distance =
              Math.abs(
                slice.time -
                  candidate.time,
              );
            if (
              distance <
              anyLaneGuard
            )
              return false;
            if (
              slice.lane ===
                candidate.lane &&
              distance <
                sameLaneGuard
            )
              return false;
          }
          for (const hold of holds) {
            if (
              hold.lane !==
              candidate.lane
            )
              continue;
            const end =
              hold.time +
              (hold.duration ??
                0);
            if (
              candidate.time >=
                hold.time -
                  sameLaneGuard &&
              candidate.time <=
                end +
                  sameLaneGuard
            ) {
              return false;
            }
          }
          return true;
        },
      )
      .sort(
        (
          a,
          b,
        ) =>
          a.time -
            b.time ||
          a.lane -
            b.lane,
      );

  // Two rules found the same rest — keep one.
  const deduped: MineCandidate[] =
    [];
  for (const candidate of viable) {
    const previous =
      deduped[
        deduped.length -
          1
      ];
    if (
      previous &&
      candidate.time -
        previous.time <
        anyLaneGuard
    )
      continue;
    deduped.push(
      candidate,
    );
  }
  if (
    deduped.length ===
    0
  )
    return [];

  /* 4. Spread, then spend the budget. */
  // Stride sampling rather than "the first N": a chart's runs cluster, and
  // taking candidates in time order until the budget runs out would put every
  // mine in the first chorus and none in the last. The offset is the one place
  // the seeded PRNG is consulted, so two difficulties of the same song do not
  // pick the same phrases.
  const stride =
    Math.max(
      1,
      deduped.length /
        budget,
    );
  const offset =
    random() *
    stride;
  const picked: MineCandidate[] =
    [];
  for (
    let i = 0;
    picked.length <
    budget;
    i++
  ) {
    const index =
      Math.floor(
        offset +
          i *
            stride,
      );
    if (
      index >=
      deduped.length
    )
      break;
    const candidate =
      deduped[
        index
      ];
    const previous =
      picked[
        picked.length -
          1
      ];
    if (
      previous &&
      candidate.time -
        previous.time <
        MINE_MIN_SPACING_SECONDS
    )
      continue;
    picked.push(
      candidate,
    );
  }

  return picked.map(
    (
      candidate,
      index,
    ) => ({
      id: `${CHART_MINE_ID_PREFIX}${difficulty}-${index}-${Math.round(candidate.time * 1000)}`,
      time: candidate.time,
      type: 'BOMB' as const,
      lane: candidate.lane,
      quant:
        candidate.quant,
    }),
  );
}

/* ─── Entry point ────────────────────────────────────────────────────────── */

export interface ChartResult {
  slices: Record<
    Difficulty,
    Slice[]
  >;
  /**
   * Notes per difficulty, for the library card and for tests.
   *
   * **Playable notes, not stored slices.** G7's mines are stored in the same
   * array but are never hit, never scored and vanish entirely unless the player
   * turns `bombs` on — counting them would advertise a note count no run of the
   * chart can ever produce.
   */
  noteCounts: Record<
    Difficulty,
    number
  >;
}

/**
 * Build all four difficulty charts from one set of quantised onsets.
 *
 * `seed` makes the few genuinely arbitrary choices (lane for a hit with no
 * clear frequency bias) reproducible, so re-analysing a song yields the same
 * chart and two clients that generate locally agree.
 */
export function buildCharts(
  notes: QuantizedNote[],
  duration: number,
  seed: string,
  sections?: Section[],
  /** C10 — the uploader's −2…2 density bias. 0 is the shipped behaviour. */
  densityBias = 0,
): ChartResult {
  const slices =
    {} as Record<
      Difficulty,
      Slice[]
    >;
  const noteCounts =
    {} as Record<
      Difficulty,
      number
    >;

  // Copies, because ranks and lane hints are written onto them and the caller (the
  // editor) keeps its pool between runs.
  const prepared =
    notes.map(
      (
        note,
      ) => ({
        ...note,
      }),
    );
  assignRanks(
    prepared,
  );
  assignLaneHints(
    prepared,
  );

  let pool =
    prepared;
  let fixedLanes: Map<
    QuantizedNote,
    number
  > | null =
    null;
  for (const difficulty of TIER_ORDER) {
    const tier =
      TIERS[
        difficulty
      ];
    const selected =
      selectTier(
        pool,
        tier,
        duration,
        sections,
        densityBias,
      );
    const random =
      createSeededRandom(
        `${seed}:${difficulty}`,
      );
    const built =
      buildSlices(
        selected,
        tier,
        difficulty,
        random,
        fixedLanes,
      );

    // The next (easier) tier draws from the notes that SURVIVED this one, with
    // their lanes fixed — that is the nesting, by construction.
    pool =
      built.kept;
    fixedLanes =
      built.lanes;

    // G7. A separate PRNG stream, so a chart generated with mines has exactly
    // the same notes as one generated before mines existed — the mine sampler
    // cannot pull the lane assignments out from under `buildSlices`.
    const mines =
      placeMines(
        built.slices,
        built.kept,
        tier,
        difficulty,
        duration,
        createSeededRandom(
          `${seed}:${difficulty}:mines`,
        ),
      );

    slices[
      difficulty
    ] =
      [
        ...built.slices,
        ...mines,
      ].sort(
        (
          a,
          b,
        ) =>
          a.time -
          b.time,
      );
    noteCounts[
      difficulty
    ] =
      built.slices.length;
  }

  return {
    slices,
    noteCounts,
  };
}

export { TIERS };
