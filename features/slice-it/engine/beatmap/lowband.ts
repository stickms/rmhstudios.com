/**
 * The low end, at a resolution the spectrogram cannot give it.
 *
 * The log-band spectrogram uses 46 ms frames, whose FFT bins are 21.5 Hz wide, and
 * its filterbank drops any band narrower than one bin. Below about 200 Hz that
 * leaves a handful of coarse bands — the fundamental of a 49 Hz bass note does not
 * appear in it at all (its strongest band read 1.0 against 500 for the next kick).
 * A bass line is the most common held note in popular music, so it needs its own
 * measurement: low-pass the waveform and take its RMS per spectrogram frame.
 */

import {
  FRAME_SIZE,
  HOP_SIZE,
} from './spectrum';

/** Everything below this is "low". */
export const LOW_BAND_CUTOFF_HZ = 150;

/**
 * RMS of the low-passed signal, one value per spectrogram frame (same window, so
 * index `i` is the same moment as spectrogram frame `i`).
 */
export function lowBandEnvelope(
  samples: Float32Array,
  sampleRate: number,
  frames: number,
  frameSize = FRAME_SIZE,
  hopSize = HOP_SIZE,
): Float32Array {
  const out =
    new Float32Array(
      frames,
    );
  if (
    frames ===
      0 ||
    samples.length ===
      0
  )
    return out;

  // Two cascaded one-pole low-passes (-12 dB/oct): plenty to separate a kick or
  // bass from a snare, and exact enough for an energy envelope.
  const alpha =
    1 -
    Math.exp(
      (-2 *
        Math.PI *
        LOW_BAND_CUTOFF_HZ) /
        sampleRate,
    );
  const filtered =
    new Float32Array(
      samples.length,
    );
  let y1 = 0;
  let y2 = 0;
  for (
    let i = 0;
    i <
    samples.length;
    i++
  ) {
    y1 +=
      alpha *
      (samples[
        i
      ] -
        y1);
    y2 +=
      alpha *
      (y1 -
        y2);
    filtered[
      i
    ] =
      y2;
  }

  // Running sum of squares, so each frame is O(1) however long the window is.
  const prefix =
    new Float64Array(
      filtered.length +
        1,
    );
  for (
    let i = 0;
    i <
    filtered.length;
    i++
  )
    prefix[
      i +
        1
    ] =
      prefix[
        i
      ] +
      filtered[
        i
      ] *
        filtered[
          i
        ];
  for (
    let f = 0;
    f <
    frames;
    f++
  ) {
    const start =
      f *
      hopSize;
    const end =
      Math.min(
        filtered.length,
        start +
          frameSize,
      );
    if (
      end <=
      start
    )
      break;
    out[
      f
    ] =
      Math.sqrt(
        (prefix[
          end
        ] -
          prefix[
            start
          ]) /
          (end -
            start),
      );
  }
  return out;
}
