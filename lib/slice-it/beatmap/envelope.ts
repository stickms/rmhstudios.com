/**
 * Slice It — the waveform peak envelope the editor draws.
 *
 * Design doc: `docs/slice-it-chart-editor.md` §6.
 *
 * ## Why persist anything at all
 *
 * The analyser decodes four minutes of audio, computes a spectrogram, and
 * throws all of it away. The editor then needs a waveform, and its only options
 * are to re-download and re-decode the audio (seconds, and a second decode of a
 * file the tab may not have) or to draw nothing. Keeping ~48 KB of the thing we
 * already computed is what makes the editor open instantly.
 *
 * ## Why a PEAK envelope and not RMS
 *
 * A waveform in an editor is a navigation aid: the author is looking for the
 * moment the snare enters, not for the average loudness of the bar. RMS
 * smooths exactly the transients they are looking for. Per-bucket peak keeps
 * them, and it is what every audio editor draws.
 *
 * ## Size, precisely
 *
 * {@link ENVELOPE_RATE} = 200 samples/second. A 4-minute track is 240 × 200 =
 * 48 000 samples. Stored as **one byte each** (0–255, linear in amplitude) that
 * is 48 KB, ~64 KB once base64'd into the `analysisData` JSON. A `Float32Array`
 * would be 192 KB for a curve that is drawn 2 px tall, and the raw spectrogram
 * this is derived from is ~40 MB — which is why neither of those is what gets
 * persisted. 8-bit is roughly a quarter of a pixel of error on a 64 px strip:
 * invisible, and the cheapest honest representation.
 */

/** Envelope samples per second. 200 is ~5 ms — finer than a drawn pixel at any editor zoom. */
export const ENVELOPE_RATE = 200;

export interface PeakEnvelope {
  /**
   * Samples per second. Stored rather than assumed, so the rate can change later.
   *
   * The rate the buckets were ACTUALLY built at, which is not always the one
   * that was asked for — see {@link computeEnvelope}. Rarely a round number.
   */
  rate: number;
  /** Base64 of one unsigned byte per sample: peak absolute amplitude, 0–255. */
  data: string;
}

/**
 * Peak-per-bucket over decoded mono samples.
 *
 * Runs on the already-decimated analysis signal (22.05 kHz mono) rather than the
 * source: at 200 buckets/second that is ~110 samples per bucket, and the peak of
 * a decimated signal is within a hair of the peak of the original for anything a
 * human is going to look at.
 */
export function computeEnvelope(
  samples: Float32Array,
  sampleRate: number,
  rate = ENVELOPE_RATE,
): PeakEnvelope {
  const perBucket = Math.max(1, Math.round(sampleRate / rate));
  // The rate the buckets are really at, which is the requested one only when the
  // sample rate divides it. It does not: the analysis signal is 22 050 Hz and
  // `perBucket` rounds 110.25 to 110, so the true rate is 200.4545 and a reader
  // that assumes 200 drifts 0.23% — an inaudible 6 ms at the start of a track
  // and **half a second** by the end of a four-minute one.
  //
  // That was not a theoretical error. It is the timebase the editor's waveform
  // is drawn against, and a waveform whose transients slide away from the notes
  // they belong to over the course of a song defeats the one thing the waveform
  // is there for. V7's `bars` backdrop reads the same curve and would have
  // scrolled visibly out of time with the music it was drawing.
  //
  // Fixed here rather than at the readers because this is the only place that
  // knows `perBucket`. Nothing needs a migration: `rate` has always travelled
  // with the data and every reader already takes it from there, so a stored
  // envelope keeps its old rate (and its old drift) until the song is next
  // analysed, and new ones are simply right.
  const trueRate = sampleRate > 0 && Number.isFinite(sampleRate) ? sampleRate / perBucket : rate;
  const buckets = Math.max(0, Math.ceil(samples.length / perBucket));
  const bytes = new Uint8Array(buckets);

  for (let b = 0; b < buckets; b++) {
    const start = b * perBucket;
    const end = Math.min(samples.length, start + perBucket);
    let peak = 0;
    for (let i = start; i < end; i++) {
      const value = samples[i] < 0 ? -samples[i] : samples[i];
      if (value > peak) peak = value;
    }
    // Clamp rather than normalise by the track maximum: a chart whose waveform
    // rescales itself when a louder section is appended is a chart whose visual
    // landmarks move, and the analysis signal is already peak-normalised by
    // `prepareAudio`. Anything over 1 is clipping and reads as full height.
    bytes[b] = peak >= 1 ? 255 : Math.round(peak * 255);
  }

  return { rate: trueRate, data: bytesToBase64(bytes) };
}

/** Decode a stored envelope back to bytes. Returns an empty array for junk. */
export function decodeEnvelope(envelope: PeakEnvelope | null | undefined): Uint8Array {
  if (!envelope || typeof envelope.data !== 'string') return new Uint8Array(0);
  try {
    return base64ToBytes(envelope.data);
  } catch {
    return new Uint8Array(0);
  }
}

/**
 * The peak over a time RANGE, for drawing one pixel column.
 *
 * The renderer asks per column, not per sample: at the editor's default zoom one
 * pixel is ~4 ms, which is under one envelope sample, and at the zoomed-out end
 * it is several hundred. Taking the max over the range (rather than the sample
 * nearest the column) is what stops a zoomed-out waveform from flickering as it
 * scrolls — nearest-sampling a 48 000-point curve into 900 columns aliases, and
 * the transient the author is navigating by disappears and reappears.
 */
export function envelopePeak(
  bytes: Uint8Array,
  rate: number,
  fromSeconds: number,
  toSeconds: number,
): number {
  if (bytes.length === 0 || !(rate > 0)) return 0;
  const start = Math.max(0, Math.floor(fromSeconds * rate));
  const end = Math.min(bytes.length - 1, Math.ceil(toSeconds * rate));
  if (end < start) return 0;
  let peak = 0;
  for (let i = start; i <= end; i++) {
    if (bytes[i] > peak) peak = bytes[i];
  }
  return peak / 255;
}

/* ── base64, without Node or the DOM ──────────────────────────────────────────
 *
 * `lib/slice-it/beatmap` is imported by the browser AND by the esbuild server
 * bundle, so it can use neither `Buffer` nor `btoa` unconditionally. Both are
 * used when present — they are native and fast — with a hand-rolled fallback so
 * this module keeps the dependency-free property the rest of the pipeline has.
 */

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function bytesToBase64(bytes: Uint8Array): string {
  const maybeBuffer = (
    globalThis as { Buffer?: { from(b: Uint8Array): { toString(e: string): string } } }
  ).Buffer;
  if (maybeBuffer) return maybeBuffer.from(bytes).toString('base64');

  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += B64[a >> 2];
    out += B64[((a & 3) << 4) | (b >> 4)];
    out += i + 1 < bytes.length ? B64[((b & 15) << 2) | (c >> 6)] : '=';
    out += i + 2 < bytes.length ? B64[c & 63] : '=';
  }
  return out;
}

export function base64ToBytes(text: string): Uint8Array {
  const maybeBuffer = (globalThis as { Buffer?: { from(s: string, e: string): Uint8Array } })
    .Buffer;
  if (maybeBuffer) return new Uint8Array(maybeBuffer.from(text, 'base64'));

  const clean = text.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let index = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = B64.indexOf(clean[i]);
    const b = B64.indexOf(clean[i + 1]);
    const c = B64.indexOf(clean[i + 2]);
    const d = B64.indexOf(clean[i + 3]);
    if (index < out.length) out[index++] = (a << 2) | (b >> 4);
    if (index < out.length && c >= 0) out[index++] = ((b & 15) << 4) | (c >> 2);
    if (index < out.length && d >= 0) out[index++] = ((c & 3) << 6) | d;
  }
  return out;
}
