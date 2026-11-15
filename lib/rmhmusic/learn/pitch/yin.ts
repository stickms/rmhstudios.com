/**
 * Monophonic pitch detection for the RMH Music learning programme, using the YIN
 * algorithm (de Cheveigné & Kawahara, 2002). The tuner and "play this note"
 * lesson checks feed it ~2048-sample microphone frames every ~25 ms and get back
 * a fundamental frequency, or `null` when there is nothing trustworthy to report.
 *
 * Plain autocorrelation latches onto strong harmonics and reports an octave (or a
 * twelfth) too high on guitar and piano tones. YIN instead takes the *first* lag
 * whose normalised difference dips below a threshold, which is the fundamental
 * period. Returning `null` for silence and noise matters just as much as
 * accuracy: a phantom note would mark a learner right or wrong for no reason.
 *
 * Cost. The difference function is O(lags × window): about a million
 * multiply-adds for a 2048-sample frame at 44.1 kHz. Nothing above `maxFreq`
 * (1400 Hz) is a candidate, so the lag search runs on the frame low-passed and
 * decimated to ~11 kHz (a short windowed-sinc FIR, then every `factor`-th
 * sample), roughly ten times cheaper; the winning period is then refined at
 * the full rate over a few lags around it, so the answer keeps full-rate
 * (sub-cent) accuracy. Frames too short for the decimated search fall back to
 * the full-rate search.
 *
 * Pure and client-safe. Scratch buffers are module-level and reused across
 * calls, so a steady 25 ms poll allocates nothing.
 */

export interface PitchResult {
  /** Fundamental frequency in Hz; always finite and > 0. */
  freq: number;
  /** Confidence 0..1 (1 − the normalised difference at the chosen lag). */
  clarity: number;
}

export interface DetectPitchOptions {
  /** Lowest frequency to consider, in Hz (default 60, below guitar low E). */
  minFreq?: number;
  /** Highest frequency to consider, in Hz (default 1400). */
  maxFreq?: number;
  /** YIN absolute threshold on the normalised difference (default 0.15). */
  threshold?: number;
  /** Frames quieter than this RMS are treated as silence (default 0.01). */
  minRms?: number;
}

/** Frames quieter than this RMS are silence (the default `minRms`); exported for the mic's early out. */
export const DEFAULT_MIN_RMS = 0.01;

/** The decimated rate stays at or above this (and at least 7× `maxFreq`). */
const MIN_DECIMATED_RATE = 10_000;
/** Low-pass taps per unit of decimation factor (31 taps at factor 4). */
const TAPS_PER_FACTOR = 8;

// ─── Reused scratch ──────────────────────────────────────────────

let lowpassed: Float32Array =
  new Float32Array(
    0,
  );
let diff: Float32Array =
  new Float32Array(
    0,
  );
const firs =
  new Map<
    number,
    Float32Array
  >();

function scratch(
  buf: Float32Array,
  n: number,
): Float32Array {
  return buf.length >=
    n
    ? buf
    : new Float32Array(
        Math.max(
          n,
          buf.length *
            2,
        ),
      );
}

/** Windowed-sinc (Hamming) low-pass for decimating by `factor`, unity gain at DC. */
function fir(
  factor: number,
): Float32Array {
  let h =
    firs.get(
      factor,
    );
  if (
    h
  )
    return h;
  const len =
    TAPS_PER_FACTOR *
      factor -
    1;
  // Cutoff at 80% of the decimated Nyquist, in cycles per input sample.
  const fc =
    0.4 /
    factor;
  const mid =
    (len -
      1) /
    2;
  h =
    new Float32Array(
      len,
    );
  let sum = 0;
  for (
    let k = 0;
    k <
    len;
    k++
  ) {
    const x =
      k -
      mid;
    const sinc =
      x ===
      0
        ? 2 *
          fc
        : Math.sin(
            2 *
              Math.PI *
              fc *
              x,
          ) /
          (Math.PI *
            x);
    const w =
      0.54 -
      0.46 *
        Math.cos(
          (2 *
            Math.PI *
            k) /
            (len -
              1),
        );
    h[
      k
    ] =
      sinc *
      w;
    sum +=
      h[
        k
      ];
  }
  for (
    let k = 0;
    k <
    len;
    k++
  )
    h[
      k
    ] /=
      sum;
  firs.set(
    factor,
    h,
  );
  return h;
}

/**
 * Steps 1–3 of YIN over `x[0..n)`: the cumulative-mean-normalised difference
 * into `d[0..tauMax]`, then the first lag in [tauMin, tauMax] below the
 * threshold, walked down to its local minimum. Returns -1 when none is.
 */
function yinLag(
  x: Float32Array,
  n: number,
  d: Float32Array,
  tauMin: number,
  tauMax: number,
  threshold: number,
): number {
  // Difference function over a fixed window, so every lag compares the same number of samples.
  const window =
    n -
    tauMax;
  for (
    let tau = 1;
    tau <=
    tauMax;
    tau++
  ) {
    let sum = 0;
    for (
      let i = 0;
      i <
      window;
      i++
    ) {
      const delta =
        x[
          i
        ] -
        x[
          i +
            tau
        ];
      sum +=
        delta *
        delta;
    }
    d[
      tau
    ] =
      sum;
  }
  // Cumulative mean normalised difference d'(tau), in place; d'(0) = 1 removes the small-lag bias.
  let running = 0;
  d[0] = 1;
  for (
    let tau = 1;
    tau <=
    tauMax;
    tau++
  ) {
    running +=
      d[
        tau
      ];
    d[
      tau
    ] =
      running >
      0
        ? (d[
            tau
          ] *
            tau) /
          running
        : 1;
  }
  for (
    let t =
      tauMin;
    t <=
    tauMax;
    t++
  ) {
    if (
      d[
        t
      ] <
      threshold
    ) {
      while (
        t +
          1 <=
          tauMax &&
        d[
          t +
            1
        ] <
          d[
            t
          ]
      )
        t++;
      return t;
    }
  }
  return -1;
}

/** Parabolic interpolation of the minimum at `tau` from its neighbours (sub-sample period). */
function parabolic(
  s0: number,
  s1: number,
  s2: number,
  tau: number,
): number {
  const denom =
    2 *
    (2 *
      s1 -
      s2 -
      s0);
  if (
    denom ===
    0
  )
    return tau;
  const shift =
    (s2 -
      s0) /
    denom;
  return Number.isFinite(
    shift,
  ) &&
    Math.abs(
      shift,
    ) <=
      1
    ? tau +
        shift
    : tau;
}

/** Plain squared difference of `buf` against itself shifted by `tau`, over `window` samples. */
function rawDiff(
  buf: Float32Array,
  tau: number,
  window: number,
): number {
  let sum = 0;
  for (
    let i = 0;
    i <
    window;
    i++
  ) {
    const delta =
      buf[
        i
      ] -
      buf[
        i +
          tau
      ];
    sum +=
      delta *
      delta;
  }
  return sum;
}

export function detectPitch(
  buf: Float32Array,
  sampleRate: number,
  opts: DetectPitchOptions = {},
): PitchResult | null {
  const {
    minFreq = 60,
    maxFreq = 1400,
    threshold = 0.15,
    minRms = DEFAULT_MIN_RMS,
  } = opts;

  if (
    !Number.isFinite(
      sampleRate,
    ) ||
    sampleRate <=
      0
  )
    return null;
  if (
    !(
      minFreq >
      0
    ) ||
    !(
      maxFreq >
      minFreq
    )
  )
    return null;

  const tauMin =
    Math.max(
      2,
      Math.floor(
        sampleRate /
          maxFreq,
      ),
    );
  const tauMax =
    Math.ceil(
      sampleRate /
        minFreq,
    );
  // Need a full period at the lowest frequency to compare against another.
  if (
    buf.length <
      2 *
        tauMax ||
    tauMin >=
      tauMax
  )
    return null;

  // Silence gate. `!(rms >= minRms)` also rejects NaN input.
  let sumSq = 0;
  for (
    let i = 0;
    i <
    buf.length;
    i++
  )
    sumSq +=
      buf[
        i
      ] *
      buf[
        i
      ];
  const rms =
    Math.sqrt(
      sumSq /
        buf.length,
    );
  if (
    !(
      rms >=
      minRms
    )
  )
    return null;

  // ── Coarse search on the decimated frame ──
  const factor =
    Math.max(
      1,
      Math.min(
        Math.floor(
          sampleRate /
            MIN_DECIMATED_RATE,
        ),
        Math.floor(
          sampleRate /
            (7 *
              maxFreq),
        ),
      ),
    );
  if (
    factor >
    1
  ) {
    const h =
      fir(
        factor,
      );
    const n =
      Math.floor(
        (buf.length -
          h.length) /
          factor,
      ) +
      1;
    const rate =
      sampleRate /
      factor;
    const dMin =
      Math.max(
        2,
        Math.floor(
          rate /
            maxFreq,
        ),
      );
    const dMax =
      Math.ceil(
        rate /
          minFreq,
      );
    if (
      n >=
        2 *
          dMax &&
      dMin <
        dMax
    ) {
      lowpassed =
        scratch(
          lowpassed,
          n,
        );
      diff =
        scratch(
          diff,
          dMax +
            1,
        );
      const x =
        lowpassed;
      for (
        let j = 0;
        j <
        n;
        j++
      ) {
        let acc = 0;
        const o =
          j *
          factor;
        for (
          let k = 0;
          k <
          h.length;
          k++
        )
          acc +=
            h[
              k
            ] *
            buf[
              o +
                k
            ];
        x[
          j
        ] =
          acc;
      }
      const lag =
        yinLag(
          x,
          n,
          diff,
          dMin,
          dMax,
          threshold,
        );
      if (
        lag <
        0
      )
        return null;
      const clarity =
        Math.min(
          1,
          Math.max(
            0,
            1 -
              diff[
                lag
              ],
          ),
        );
      const coarse =
        lag >
          1 &&
        lag <
          dMax
          ? parabolic(
              diff[
                lag -
                  1
              ],
              diff[
                lag
              ],
              diff[
                lag +
                  1
              ],
              lag,
            )
          : lag;

      // ── Refine at the full rate: the smallest plain difference within one decimated lag ──
      const window =
        buf.length -
        tauMax;
      const centre =
        Math.round(
          coarse *
            factor,
        );
      const lo =
        Math.max(
          tauMin,
          centre -
            factor,
        );
      const hi =
        Math.min(
          tauMax -
            1,
          centre +
            factor,
        );
      if (
        lo >
        hi
      )
        return null;
      let best =
        lo;
      let bestD =
        Infinity;
      for (
        let tau =
          lo;
        tau <=
        hi;
        tau++
      ) {
        const v =
          rawDiff(
            buf,
            tau,
            window,
          );
        if (
          v <
          bestD
        ) {
          bestD =
            v;
          best =
            tau;
        }
      }
      const refined =
        best >
        1
          ? parabolic(
              rawDiff(
                buf,
                best -
                  1,
                window,
              ),
              bestD,
              rawDiff(
                buf,
                best +
                  1,
                window,
              ),
              best,
            )
          : best;
      const freq =
        sampleRate /
        refined;
      if (
        !Number.isFinite(
          freq,
        ) ||
        freq <=
          0
      )
        return null;
      return {
        freq,
        clarity,
      };
    }
  }

  // ── Full-rate search (low sample rates, or frames too short to decimate) ──
  diff =
    scratch(
      diff,
      tauMax +
        1,
    );
  const tau =
    yinLag(
      buf,
      buf.length,
      diff,
      tauMin,
      tauMax,
      threshold,
    );
  if (
    tau <
    0
  )
    return null;
  const betterTau =
    tau >
      1 &&
    tau <
      tauMax
      ? parabolic(
          diff[
            tau -
              1
          ],
          diff[
            tau
          ],
          diff[
            tau +
              1
          ],
          tau,
        )
      : tau;
  const freq =
    sampleRate /
    betterTau;
  if (
    !Number.isFinite(
      freq,
    ) ||
    freq <=
      0
  )
    return null;
  const clarity =
    Math.min(
      1,
      Math.max(
        0,
        1 -
          diff[
            tau
          ],
      ),
    );
  return {
    freq,
    clarity,
  };
}
