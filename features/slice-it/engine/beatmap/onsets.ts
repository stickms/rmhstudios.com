/**
 * Onset detection — SuperFlux plus adaptive peak picking.
 *
 * ## The detection function
 *
 * Spectral flux is the sum of the positive frame-to-frame change in each band:
 * energy appearing where there was less before, which is what a note attack
 * sounds like. Plain flux has one well-known failure: **vibrato and glissando**.
 * A held violin note wobbling ±50 cents moves energy from one band to the next
 * every few frames, and every one of those moves reads as a positive change in
 * the band it arrived in. The result is a detector that fires continuously
 * through sustained strings — a chart with a wall of notes where the song has
 * one long tone.
 *
 * SuperFlux (Böck & Widmer, DAFx-13) fixes it with two changes, both here:
 *
 * 1. **A maximum filter over frequency** on the reference frame, so energy that
 *    merely *moved* to an adjacent band is compared against the neighbourhood
 *    it came from and produces no flux.
 * 2. **A lag of more than one frame** (`μ`), so the comparison is against
 *    genuinely earlier audio rather than the tail of the same attack.
 *
 * ## Peak picking
 *
 * Dixon's rules, as refined by Böck: a frame is an onset if it is a local
 * maximum over a short window, exceeds a *moving average* over a longer window
 * by a margin, and is far enough from the previous onset. Moving-average
 * thresholding rather than a global one is the reason quiet verses get charted
 * at all — a fixed threshold tuned for a chorus finds nothing anywhere else.
 */

import type { Spectrogram } from './spectrum';
import { measureSustainEnds } from './sustain';

/** Kick/bass territory, and the hat/cymbal band the charter reads for lanes. */
const LOW_BAND_HZ = 250;
const HIGH_BAND_HZ = 2000;

export interface Onset {
  /** Seconds from the start of the track. */
  time: number;
  /** Detection-function value, normalised to roughly 0–1 across the song. */
  strength: number;
  /** Frame index in the spectrogram, for band lookups. */
  frame: number;
  /** Fraction of this frame's energy below 250 Hz. */
  lowRatio: number;
  /** Fraction above 2 kHz. */
  highRatio: number;
  /** Seconds the note keeps sounding after the attack; 0 for a hit that decays at once. */
  sustain: number;
  /**
   * Where the sound sits in frequency: the energy-weighted mean of log2(Hz) over
   * the attack's body. Lets the charter split kick-like from snare/hat-like
   * sounds with a boundary fitted to THIS song instead of a fixed threshold.
   * Absent on onsets rebuilt from a stored chart.
   */
  centroid?: number;
  /** Absolute time the note stops sounding, when `sustain > 0`. */
  holdEnd?: number;
}

/**
 * Where "high" starts for beat tracking, and how much it counts there.
 *
 * Hi-hats and cymbals usually sit on the off-beat and have the widest flux in the
 * song, so a tracker that listens to everything equally can lock half a beat out
 * of phase (a house loop's tracked grid was 226 ms off a 484 ms beat) and every
 * kick is then charted as an off-beat. Kick and snare — the events that define the
 * beat — live below this line.
 */
const BEAT_HIGH_HZ = 3000;
export const BEAT_HIGH_WEIGHT = 0.2;

/** Lag in frames for the flux difference — ~35 ms at an 11.6 ms hop. */
const FLUX_LAG = 3;
/** Half-width of the frequency max-filter, in bands. */
const MAX_FILTER_RADIUS = 1;

/** Local-maximum window, seconds either side. */
const PRE_MAX_S = 0.03;
const POST_MAX_S = 0.03;
/** Moving-average window, seconds either side. */
const PRE_AVG_S = 0.15;
const POST_AVG_S = 0.1;
/** How far above the local mean a peak must sit, in units of the ODF's own std. */
const DELTA_SIGMA = 0.55;
/** Two onsets closer than this are one onset. */
const MIN_ONSET_GAP_S = 0.03;

/**
 * The SuperFlux onset detection function, one value per spectrogram frame.
 *
 * Exported separately from {@link detectOnsets} because the tempo estimator
 * consumes it directly: tempo is a property of the *continuous* detection
 * function, and running it on discrete picked onsets throws away exactly the
 * weak-but-regular pulse that makes a tempo obvious.
 */
export function onsetStrengthSignal(
  spec: Spectrogram,
  options: {
    highWeight?: number;
  } = {},
): Float32Array {
  const {
    data,
    frames,
    bands,
  } =
    spec;
  const odf =
    new Float32Array(
      frames,
    );
  if (
    frames ===
      0 ||
    bands ===
      0
  )
    return odf;

  // Per-band weights. 1 everywhere for onset detection; for BEAT tracking the
  // hat/cymbal region is turned down (see `BEAT_HIGH_WEIGHT`) so the tracker
  // follows the kick and snare rather than the subdivision.
  const highWeight =
    options.highWeight ??
    1;
  const weight =
    new Float32Array(
      bands,
    ).fill(
      1,
    );
  if (
    highWeight !==
    1
  ) {
    for (
      let b = 0;
      b <
      bands;
      b++
    )
      if (
        spec
          .bandFreqs[
          b
        ] >=
        BEAT_HIGH_HZ
      )
        weight[
          b
        ] =
          highWeight;
  }

  const filtered =
    new Float32Array(
      bands,
    );

  for (
    let f =
      FLUX_LAG;
    f <
    frames;
    f++
  ) {
    const refRow =
      (f -
        FLUX_LAG) *
      bands;
    const row =
      f *
      bands;

    // Max-filter the reference frame across frequency.
    for (
      let b = 0;
      b <
      bands;
      b++
    ) {
      let peak =
        data[
          refRow +
            b
        ];
      for (
        let d = 1;
        d <=
        MAX_FILTER_RADIUS;
        d++
      ) {
        if (
          b -
            d >=
          0
        )
          peak =
            Math.max(
              peak,
              data[
                refRow +
                  b -
                  d
              ],
            );
        if (
          b +
            d <
          bands
        )
          peak =
            Math.max(
              peak,
              data[
                refRow +
                  b +
                  d
              ],
            );
      }
      filtered[
        b
      ] =
        peak;
    }

    let flux = 0;
    for (
      let b = 0;
      b <
      bands;
      b++
    ) {
      const diff =
        data[
          row +
            b
        ] -
        filtered[
          b
        ];
      if (
        diff >
        0
      )
        flux +=
          diff *
          weight[
            b
          ];
    }
    odf[
      f
    ] =
      flux;
  }

  return odf;
}

/** Mean and standard deviation of the non-zero part of a signal. */
function stats(
  signal: Float32Array,
): {
  mean: number;
  std: number;
} {
  if (
    signal.length ===
    0
  )
    return {
      mean: 0,
      std: 0,
    };
  let sum = 0;
  for (
    let i = 0;
    i <
    signal.length;
    i++
  )
    sum +=
      signal[
        i
      ];
  const mean =
    sum /
    signal.length;
  let varianceSum = 0;
  for (
    let i = 0;
    i <
    signal.length;
    i++
  ) {
    const d =
      signal[
        i
      ] -
      mean;
    varianceSum +=
      d *
      d;
  }
  return {
    mean,
    std: Math.sqrt(
      varianceSum /
        signal.length,
    ),
  };
}

/**
 * The attack's body, measured over the frames it occupies (not just the one the
 * flux peaked on, which is mostly the click): band ratios and the spectral
 * centroid. A kick's weight is in its first three or four frames, and reading
 * only the first of them is why kicks used to come out looking like hi-hats.
 */
const BODY_FRAMES = 3;

function bodyProfile(
  spec: Spectrogram,
  frame: number,
): {
  low: number;
  high: number;
  centroid: number;
} {
  const {
    data,
    frames,
    bands,
    bandFreqs,
  } =
    spec;
  let total = 0;
  let low = 0;
  let high = 0;
  let weighted = 0;
  const last =
    Math.min(
      frames -
        1,
      frame +
        BODY_FRAMES -
        1,
    );
  for (
    let f =
      Math.max(
        0,
        frame,
      );
    f <=
    last;
    f++
  ) {
    const row =
      f *
      bands;
    for (
      let b = 0;
      b <
      bands;
      b++
    ) {
      const value =
        Math.expm1(
          data[
            row +
              b
          ],
        );
      const hz =
        bandFreqs[
          b
        ];
      total +=
        value;
      weighted +=
        value *
        Math.log2(
          hz,
        );
      if (
        hz <
        LOW_BAND_HZ
      )
        low +=
          value;
      else if (
        hz >=
        HIGH_BAND_HZ
      )
        high +=
          value;
    }
  }
  if (
    !(
      total >
      0
    )
  )
    return {
      low: 0,
      high: 0,
      centroid:
        Math.log2(
          1000,
        ),
    };
  return {
    low:
      low /
      total,
    high:
      high /
      total,
    centroid:
      weighted /
      total,
  };
}

export interface DetectOnsetsOptions {
  /** Longest hold the charter will consider, seconds. Bounds the sustain scan. */
  maxSustainSeconds?: number;
  /** Low-passed RMS per spectrogram frame (see `lowband.ts`), for bass holds. */
  lowEnvelope?: Float32Array;
}

/** Run the full detector and return picked onsets in time order. */
export function detectOnsets(
  spec: Spectrogram,
  odf: Float32Array,
  options: DetectOnsetsOptions = {},
): Onset[] {
  const {
    frames,
    frameDuration,
  } =
    spec;
  if (
    frames ===
    0
  )
    return [];

  const {
    mean,
    std,
  } =
    stats(
      odf,
    );
  const delta =
    std *
    DELTA_SIGMA;

  const framesFor =
    (
      seconds: number,
    ) =>
      Math.max(
        1,
        Math.round(
          seconds /
            frameDuration,
        ),
      );
  const preMax =
    framesFor(
      PRE_MAX_S,
    );
  const postMax =
    framesFor(
      POST_MAX_S,
    );
  const preAvg =
    framesFor(
      PRE_AVG_S,
    );
  const postAvg =
    framesFor(
      POST_AVG_S,
    );
  const minGapFrames =
    framesFor(
      MIN_ONSET_GAP_S,
    );

  // Normalising by the 99th percentile rather than the maximum keeps a single
  // clipped transient — a rimshot, a vinyl pop — from squashing the entire
  // song's strengths into the bottom of the range, which would then fail the
  // charter's percentile-based difficulty selection.
  const sorted =
    Float32Array.from(
      odf,
    ).sort();
  const p99 =
    sorted[
      Math.floor(
        sorted.length *
          0.99,
      )
    ] ||
    1;
  const scale =
    p99 >
    0
      ? p99
      : 1;

  const onsets: Onset[] =
    [];
  let lastOnsetFrame =
    -Infinity;

  for (
    let f = 1;
    f <
    frames;
    f++
  ) {
    const value =
      odf[
        f
      ];
    if (
      value <=
      mean
    )
      continue;

    let isLocalMax = true;
    for (
      let j =
        Math.max(
          0,
          f -
            preMax,
        );
      j <=
      Math.min(
        frames -
          1,
        f +
          postMax,
      );
      j++
    ) {
      if (
        odf[
          j
        ] >
        value
      ) {
        isLocalMax = false;
        break;
      }
    }
    if (
      !isLocalMax
    )
      continue;

    let sum = 0;
    let count = 0;
    for (
      let j =
        Math.max(
          0,
          f -
            preAvg,
        );
      j <=
      Math.min(
        frames -
          1,
        f +
          postAvg,
      );
      j++
    ) {
      sum +=
        odf[
          j
        ];
      count++;
    }
    const localMean =
      count >
      0
        ? sum /
          count
        : 0;
    if (
      value <
      localMean +
        delta
    )
      continue;

    if (
      f -
        lastOnsetFrame <
      minGapFrames
    ) {
      // Same attack seen twice — keep whichever peak is higher.
      const previous =
        onsets[
          onsets.length -
            1
        ];
      if (
        previous &&
        value >
          previous.strength *
            scale
      ) {
        onsets.pop();
      } else {
        continue;
      }
    }

    lastOnsetFrame =
      f;
    const body =
      bodyProfile(
        spec,
        f,
      );
    onsets.push(
      {
        time: spec.frameTime(
          f,
        ),
        strength:
          Math.min(
            1,
            value /
              scale,
          ),
        frame:
          f,
        lowRatio:
          body.low,
        highRatio:
          body.high,
        sustain: 0,
        centroid:
          body.centroid,
      },
    );
  }

  // Held notes, from what each attack's own bands do afterwards.
  const ends =
    measureSustainEnds(
      spec,
      onsets,
      options.maxSustainSeconds ??
        2,
      options.lowEnvelope,
    );
  for (
    let i = 0;
    i <
    onsets.length;
    i++
  ) {
    const end =
      ends[
        i
      ];
    if (
      end !==
        null &&
      end >
        onsets[
          i
        ]
          .time
    ) {
      onsets[
        i
      ].holdEnd =
        end;
      onsets[
        i
      ].sustain =
        end -
        onsets[
          i
        ]
          .time;
    }
  }

  return onsets;
}
