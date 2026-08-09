/**
 * Generate Slice It's synthesised hit-sound samples.
 *
 *   pnpm slice-it:hit-sounds            # (re)write the WAVs into public/
 *   pnpm slice-it:hit-sounds --check    # fail if a file on disk differs
 *
 * ## Why a generator and not 15 committed blobs
 *
 * A hit sound is heard hundreds of times a run, so the set has to be *matched*
 * — same format, same onset, same perceived loudness — far more carefully than
 * it has to be interesting. Recipes make that checkable: every sample here goes
 * through the same trim → DC-block → fade → normalise tail, so "why is this one
 * louder" has an answer in code rather than in a DAW someone no longer has. The
 * WAVs are still ordinary committed assets (the game fetches files, it does not
 * synthesise at runtime); this script is how they are reproduced.
 *
 * Output matches the format the existing samples in that directory already use:
 * RIFF PCM, 44.1 kHz, 16-bit, stereo. Deterministic — every noise source is a
 * seeded PRNG, so a re-run is byte-identical and `--check` is meaningful.
 *
 * Nothing here is sampled, downloaded or derived from another game's assets:
 * each sound is oscillators, filtered noise and envelopes.
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SAMPLE_RATE = 44_100;
const CHANNELS = 2;
const BITS = 16;

/** −1 dBFS. Headroom is deliberate: the engine plays these over the song. */
const PEAK_CEILING = 10 ** (-1 / 20);
/**
 * Loudness target, dBFS, measured as the loudest 100 ms window RMS.
 *
 * −11 dB is the median of the 23 samples already in the directory (they span
 * −4.3 to −33). A short click cannot reach it under the peak ceiling — 25 ms of
 * signal in a 100 ms window is 6 dB down before crest factor — so this is a
 * ceiling on loudness, not a floor, and the sharp sounds sit a few dB under it
 * exactly as the existing sharp sounds do.
 */
const LOUDNESS_TARGET = 10 ** (-11 / 20);

const OUT_DIR = join(process.cwd(), 'public', 'music', 'slice-it', 'sounds');

/* ─── Signal helpers ─────────────────────────────────────────────────────── */

/** Seeded PRNG — noise has to be reproducible for `--check` to mean anything. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function seedFor(id: string): number {
  return createHash('sha256').update(id).digest().readUInt32LE(0);
}

const buffer = (seconds: number) => new Float32Array(Math.round(seconds * SAMPLE_RATE));

/**
 * Amplitude envelope: linear attack into exponential decay.
 *
 * The attack is what keeps a hard gate from reading as a pop of its own; a few
 * tenths of a millisecond is inaudible as an attack but removes the step.
 */
function env(t: number, attack: number, decay: number): number {
  if (t < 0) return 0;
  const a = attack > 0 ? Math.min(1, t / attack) : 1;
  return a * Math.exp(-t / decay);
}

/** Exponential glide from `from` to `to` with time constant `tau`. */
const glide = (t: number, from: number, to: number, tau: number) =>
  to + (from - to) * Math.exp(-t / tau);

type Wave = 'sine' | 'triangle' | 'square' | 'saw';

function shape(kind: Wave, phase: number): number {
  const p = phase - Math.floor(phase);
  switch (kind) {
    case 'sine':
      return Math.sin(2 * Math.PI * p);
    case 'triangle':
      return 4 * Math.abs(p - 0.5) - 1;
    case 'square':
      return p < 0.5 ? 1 : -1;
    case 'saw':
      return 2 * p - 1;
  }
}

interface ToneSpec {
  wave?: Wave;
  freq: number;
  /** Glide target; omitted means a steady pitch. */
  toFreq?: number;
  /** Time constant of the glide, seconds. */
  glideTau?: number;
  amp: number;
  attack?: number;
  decay: number;
  /** Seconds from the start of the buffer. */
  start?: number;
}

/** Add an oscillator with its own pitch and amplitude envelope. */
function tone(buf: Float32Array, spec: ToneSpec): void {
  const { wave = 'sine', freq, toFreq, glideTau = 0.01, amp, attack = 0.0005, decay } = spec;
  const start = Math.round((spec.start ?? 0) * SAMPLE_RATE);
  let phase = 0;
  for (let i = start; i < buf.length; i++) {
    const t = (i - start) / SAMPLE_RATE;
    const f = toFreq === undefined ? freq : glide(t, freq, toFreq, glideTau);
    phase += f / SAMPLE_RATE;
    buf[i] += shape(wave, phase) * amp * env(t, attack, decay);
  }
}

interface NoiseSpec {
  amp: number;
  attack?: number;
  decay: number;
  start?: number;
  rng: () => number;
}

function noise(buf: Float32Array, spec: NoiseSpec): void {
  const { amp, attack = 0.0002, decay, rng } = spec;
  const start = Math.round((spec.start ?? 0) * SAMPLE_RATE);
  for (let i = start; i < buf.length; i++) {
    const t = (i - start) / SAMPLE_RATE;
    buf[i] += (rng() * 2 - 1) * amp * env(t, attack, decay);
  }
}

/**
 * FM operator — the cheapest way to an inharmonic, metallic partial stack.
 *
 * The modulation index decays faster than the amplitude, which is what makes
 * the sound clang on the transient and settle to a tone, rather than buzzing
 * for its whole length.
 */
function fm(
  buf: Float32Array,
  spec: {
    carrier: number;
    ratio: number;
    index: number;
    indexDecay: number;
    amp: number;
    attack?: number;
    decay: number;
  },
): void {
  const { carrier, ratio, index, indexDecay, amp, attack = 0.0004, decay } = spec;
  let cPhase = 0;
  let mPhase = 0;
  for (let i = 0; i < buf.length; i++) {
    const t = i / SAMPLE_RATE;
    mPhase += (carrier * ratio) / SAMPLE_RATE;
    const mod = Math.sin(2 * Math.PI * mPhase) * index * Math.exp(-t / indexDecay);
    cPhase += carrier / SAMPLE_RATE;
    buf[i] += Math.sin(2 * Math.PI * cPhase + mod) * amp * env(t, attack, decay);
  }
}

/* ─── Filters (RBJ biquad) ───────────────────────────────────────────────── */

type BiquadKind = 'lowpass' | 'highpass' | 'bandpass';

function biquad(input: Float32Array, kind: BiquadKind, freq: number, q = 0.707): Float32Array {
  const w0 = (2 * Math.PI * freq) / SAMPLE_RATE;
  const cos = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * q);
  let b0: number;
  let b1: number;
  let b2: number;
  if (kind === 'lowpass') {
    b0 = (1 - cos) / 2;
    b1 = 1 - cos;
    b2 = (1 - cos) / 2;
  } else if (kind === 'highpass') {
    b0 = (1 + cos) / 2;
    b1 = -(1 + cos);
    b2 = (1 + cos) / 2;
  } else {
    b0 = alpha;
    b1 = 0;
    b2 = -alpha;
  }
  const a0 = 1 + alpha;
  const a1 = -2 * cos;
  const a2 = 1 - alpha;
  const out = new Float32Array(input.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < input.length; i++) {
    const x0 = input[i];
    const y0 = (b0 / a0) * x0 + (b1 / a0) * x1 + (b2 / a0) * x2 - (a1 / a0) * y1 - (a2 / a0) * y2;
    out[i] = y0;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
  }
  return out;
}

/** Remove any DC the saturation stage introduced — inaudible, but it eats headroom. */
function dcBlock(input: Float32Array): Float32Array {
  const out = new Float32Array(input.length);
  const r = 0.9985;
  let x1 = 0;
  let y1 = 0;
  for (let i = 0; i < input.length; i++) {
    const y = input[i] - x1 + r * y1;
    out[i] = y;
    x1 = input[i];
    y1 = y;
  }
  return out;
}

/** tanh saturation, gain-compensated so `drive` changes tone and not level. */
function saturate(input: Float32Array, drive: number): Float32Array {
  const norm = Math.tanh(drive);
  const out = new Float32Array(input.length);
  for (let i = 0; i < input.length; i++) out[i] = Math.tanh(input[i] * drive) / norm;
  return out;
}

/** Quantise to `bits` — the digital sounds' grit, not a mastering step. */
function bitcrush(input: Float32Array, bits: number): Float32Array {
  const steps = 2 ** (bits - 1);
  const out = new Float32Array(input.length);
  for (let i = 0; i < input.length; i++) out[i] = Math.round(input[i] * steps) / steps;
  return out;
}

/** Sample-and-hold decimation — aliasing on purpose. */
function decimate(input: Float32Array, hold: number): Float32Array {
  const out = new Float32Array(input.length);
  let held = 0;
  for (let i = 0; i < input.length; i++) {
    if (i % hold === 0) held = input[i];
    out[i] = held;
  }
  return out;
}

const gain = (input: Float32Array, g: number): Float32Array => {
  const out = new Float32Array(input.length);
  for (let i = 0; i < input.length; i++) out[i] = input[i] * g;
  return out;
};

const mix = (...parts: Float32Array[]): Float32Array => {
  const n = Math.max(...parts.map((p) => p.length));
  const out = new Float32Array(n);
  for (const p of parts) for (let i = 0; i < p.length; i++) out[i] += p[i];
  return out;
};

/* ─── Master chain ───────────────────────────────────────────────────────── */

const SILENCE = 10 ** (-72 / 20);

/** Loudest 100 ms window RMS — the loudness metric the whole set is matched on. */
function windowedRms(x: Float32Array): number {
  const win = Math.min(x.length, Math.round(SAMPLE_RATE * 0.1));
  if (win === 0) return 0;
  let acc = 0;
  let best = 0;
  for (let i = 0; i < x.length; i++) {
    acc += x[i] * x[i];
    if (i >= win) acc -= x[i - win] * x[i - win];
    if (i >= win - 1) best = Math.max(best, acc / win);
  }
  return Math.sqrt(best);
}

const peakOf = (x: Float32Array) => x.reduce((m, v) => Math.max(m, Math.abs(v)), 0);

/**
 * Peak including what falls BETWEEN samples, at 4× via a windowed sinc.
 *
 * The sample peak is not the peak a listener hears. A wideband transient can
 * sit at −1 dBFS on every stored sample and still reconstruct to +2 dB between
 * two of them — and this engine resamples on playback (`playbackRate` is 0.667×
 * or 1.5× for a low/high register note), which is exactly where that overshoot
 * becomes real, audible clipping. Normalising against this number instead of
 * the sample peak costs a fraction of a dB on the two noisiest sounds and
 * nothing at all on the other thirteen.
 */
function truePeak(x: Float32Array): number {
  const L = 16;
  let peak = 0;
  for (let i = 0; i < x.length; i++) {
    peak = Math.max(peak, Math.abs(x[i]));
    for (let f = 1; f < 4; f++) {
      const t = i + f / 4;
      let acc = 0;
      for (let k = -L; k <= L; k++) {
        const n = i + k;
        if (n < 0 || n >= x.length) continue;
        const d = t - n;
        const sinc = Math.sin(Math.PI * d) / (Math.PI * d);
        // Hann window on the kernel — an untapered sinc rings for ever and
        // reports overshoot that is not there.
        acc += x[n] * sinc * (0.5 + 0.5 * Math.cos((Math.PI * d) / (L + 1)));
      }
      peak = Math.max(peak, Math.abs(acc));
    }
  }
  return peak;
}

/**
 * Trim → fade → normalise.
 *
 * The leading trim is the one that matters for a rhythm game: a filter's group
 * delay or a 2 ms attack puts the audible onset a few samples in, and a hit
 * sound that starts late is a hit sound that reads as *you* being late. Every
 * sample here starts on its first non-silent sample.
 */
function master(raw: Float32Array): Float32Array {
  const blocked = dcBlock(raw);

  let first = 0;
  while (first < blocked.length && Math.abs(blocked[first]) < SILENCE) first++;
  let last = blocked.length - 1;
  while (last > first && Math.abs(blocked[last]) < SILENCE) last--;
  if (first >= last) return new Float32Array(0);

  const body = blocked.slice(first, last + 1);

  // 2 ms release to zero — the trim above can land mid-cycle, and a sample that
  // ends on a non-zero value clicks on every playback.
  const fade = Math.min(Math.round(0.002 * SAMPLE_RATE), body.length);
  for (let i = 0; i < fade; i++) {
    body[body.length - fade + i] *= 1 - i / fade;
  }

  const peak = truePeak(body);
  const loud = windowedRms(body);
  if (peak === 0) return body;
  const g = Math.min(PEAK_CEILING / peak, loud > 0 ? LOUDNESS_TARGET / loud : Infinity);
  return gain(body, g);
}

/* ─── WAV encoding ───────────────────────────────────────────────────────── */

function encodeWav(mono: Float32Array): Buffer {
  const frames = mono.length;
  const blockAlign = (CHANNELS * BITS) / 8;
  const dataSize = frames * blockAlign;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8, 'ascii');
  buf.write('fmt ', 12, 'ascii');
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(CHANNELS, 22);
  buf.writeUInt32LE(SAMPLE_RATE, 24);
  buf.writeUInt32LE(SAMPLE_RATE * blockAlign, 28);
  buf.writeUInt16LE(blockAlign, 32);
  buf.writeUInt16LE(BITS, 34);
  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < frames; i++) {
    // Centred (identical channels): a hit sound belongs on the player's
    // centre line, and dual mono cannot comb-filter when a device sums it.
    const s = Math.max(-1, Math.min(1, mono[i]));
    const v = Math.max(-32_768, Math.min(32_767, Math.round(s * 32_767)));
    buf.writeInt16LE(v, 44 + i * blockAlign);
    buf.writeInt16LE(v, 44 + i * blockAlign + 2);
  }
  return buf;
}

/* ─── The 15 recipes ─────────────────────────────────────────────────────── */

interface Recipe {
  file: string;
  render: (rng: () => number) => Float32Array;
}

const RECIPES: Recipe[] = [
  // ── Clicks ────────────────────────────────────────────────────────────────
  {
    // Sharp click: an impulse with just enough pitch to have a colour.
    file: 'click_sharp.wav',
    render: (rng) => {
      const n = buffer(0.06);
      noise(n, { amp: 1, attack: 0.00005, decay: 0.0035, rng });
      const air = biquad(biquad(n, 'highpass', 3200, 0.9), 'lowpass', 12000, 0.7);
      const body = buffer(0.06);
      tone(body, { freq: 4200, toFreq: 2900, glideTau: 0.004, amp: 0.55, decay: 0.016 });
      tone(body, { freq: 950, amp: 0.16, decay: 0.009 });
      return saturate(mix(air, body), 1.6);
    },
  },
  {
    // Glass click: a bright partial pair over a very short bandpassed spit.
    file: 'click_glass.wav',
    render: (rng) => {
      const n = buffer(0.11);
      noise(n, { amp: 0.9, decay: 0.011, rng });
      const spit = biquad(biquad(n, 'bandpass', 6500, 3), 'bandpass', 6500, 3);
      const body = buffer(0.11);
      tone(body, { freq: 3140, amp: 0.7, attack: 0.0004, decay: 0.05 });
      tone(body, { freq: 4710, amp: 0.28, attack: 0.0004, decay: 0.026 });
      tone(body, { freq: 6280, amp: 0.12, attack: 0.0004, decay: 0.014 });
      return mix(gain(spit, 1.6), body);
    },
  },
  {
    // Synthetic tick: a crushed square, gone before you notice the pitch.
    file: 'synth_tick.wav',
    render: () => {
      const sq = buffer(0.045);
      tone(sq, { wave: 'square', freq: 2600, amp: 0.75, attack: 0.0001, decay: 0.0085 });
      tone(sq, { wave: 'square', freq: 5200, amp: 0.2, attack: 0.0001, decay: 0.004 });
      return biquad(bitcrush(sq, 6), 'highpass', 800, 0.8);
    },
  },

  // ── Taps ──────────────────────────────────────────────────────────────────
  {
    // Crisp tap: woodblock partials, a fifth apart, plus a scrape of attack.
    file: 'tap_crisp.wav',
    render: (rng) => {
      const body = buffer(0.09);
      tone(body, { freq: 1180, amp: 0.85, decay: 0.038 });
      tone(body, { freq: 1770, amp: 0.34, decay: 0.021 });
      tone(body, { freq: 2670, amp: 0.14, decay: 0.011 });
      const n = buffer(0.09);
      noise(n, { amp: 0.55, decay: 0.0022, rng });
      return saturate(mix(body, biquad(n, 'bandpass', 4200, 1.4)), 1.35);
    },
  },
  {
    // Rim tap: dry mid-band snap with just enough shell under it.
    file: 'tap_rim.wav',
    render: (rng) => {
      const n = buffer(0.085);
      noise(n, { amp: 1, decay: 0.016, rng });
      const snap = biquad(n, 'bandpass', 2600, 1.8);
      const body = buffer(0.085);
      tone(body, { freq: 1800, toFreq: 1300, glideTau: 0.006, amp: 0.52, decay: 0.024 });
      tone(body, { freq: 420, amp: 0.3, attack: 0.0008, decay: 0.034 });
      return mix(gain(snap, 2.1), body);
    },
  },
  {
    // Soft pop: a pitch drop with the corners taken off. No noise at all.
    file: 'pop_soft.wav',
    render: () => {
      const b = buffer(0.09);
      tone(b, { freq: 620, toFreq: 190, glideTau: 0.018, amp: 1, attack: 0.0015, decay: 0.04 });
      tone(b, { freq: 1240, toFreq: 380, glideTau: 0.018, amp: 0.16, attack: 0.0015, decay: 0.02 });
      return biquad(b, 'lowpass', 2400, 0.8);
    },
  },
  {
    // Bubble pop: the same idea inverted — pitch rises, so it reads as a lift.
    file: 'pop_bubble.wav',
    render: () => {
      const b = buffer(0.1);
      tone(b, { freq: 260, toFreq: 900, glideTau: 0.014, amp: 1, attack: 0.002, decay: 0.038 });
      tone(b, { freq: 520, toFreq: 1800, glideTau: 0.014, amp: 0.2, attack: 0.002, decay: 0.02 });
      return biquad(b, 'lowpass', 3200, 0.9);
    },
  },

  // ── Impacts ───────────────────────────────────────────────────────────────
  {
    // Snappy impact: mostly transient, with a body short enough to stay out of
    // the way of the next note.
    file: 'impact_snap.wav',
    render: (rng) => {
      const n = buffer(0.12);
      noise(n, { amp: 1, decay: 0.024, rng });
      // Band-limited rather than open-topped: the last octave of a full-range
      // noise crack is inaudible on most speakers and is where the inter-sample
      // overshoot comes from, so leaving it in costs 3 dB of level for nothing.
      const crack = biquad(biquad(n, 'highpass', 1500, 0.9), 'lowpass', 8500, 0.7);
      const body = buffer(0.12);
      tone(body, { freq: 230, toFreq: 150, glideTau: 0.012, amp: 0.68, decay: 0.036 });
      return saturate(mix(gain(crack, 1.15), body), 2);
    },
  },
  {
    // Punchy transient: the click carries the timing, the drop carries the
    // weight. Saturated together so they read as one hit, not two layers.
    // Pitched a good deal higher than `bass_thump` on purpose — otherwise the
    // two are the same sine drop with a different name.
    file: 'impact_punch.wav',
    render: (rng) => {
      const b = buffer(0.14);
      tone(b, { freq: 210, toFreq: 88, glideTau: 0.016, amp: 0.85, decay: 0.055 });
      tone(b, { freq: 940, amp: 0.6, decay: 0.012 });
      tone(b, { freq: 1600, amp: 0.26, decay: 0.006 });
      const n = buffer(0.14);
      noise(n, { amp: 0.55, decay: 0.003, rng });
      return saturate(mix(b, biquad(n, 'highpass', 2200, 0.8)), 2.4);
    },
  },
  {
    // Bass-heavy impact. High-passed at 34 Hz on the way out: the fundamental
    // is meant to be felt, the rumble under it is only headroom being spent.
    file: 'bass_thump.wav',
    render: (rng) => {
      const b = buffer(0.2);
      tone(b, { freq: 120, toFreq: 48, glideTau: 0.035, amp: 1, decay: 0.105 });
      const n = buffer(0.2);
      noise(n, { amp: 0.28, decay: 0.0015, rng });
      const click = biquad(n, 'highpass', 3000, 0.8);
      return biquad(saturate(mix(b, click), 1.8), 'highpass', 34, 0.7);
    },
  },

  // ── Digital ───────────────────────────────────────────────────────────────
  {
    // Glitch: three crushed steps in 70 ms. Reads as data, not as a drum.
    file: 'glitch_bit.wav',
    render: () => {
      const b = buffer(0.095);
      tone(b, { wave: 'square', freq: 1600, amp: 0.6, attack: 0.0002, decay: 0.012, start: 0 });
      tone(b, { wave: 'square', freq: 2400, amp: 0.5, attack: 0.0002, decay: 0.012, start: 0.024 });
      tone(b, {
        wave: 'square',
        freq: 3200,
        amp: 0.42,
        attack: 0.0002,
        decay: 0.014,
        start: 0.048,
      });
      return biquad(decimate(bitcrush(b, 4), 6), 'highpass', 600, 0.8);
    },
  },
  {
    // Digital zap: a fast downward sweep, decimated so it aliases on the way.
    file: 'glitch_zap.wav',
    render: (rng) => {
      const b = buffer(0.085);
      tone(b, { wave: 'saw', freq: 5200, toFreq: 700, glideTau: 0.016, amp: 0.8, decay: 0.038 });
      const n = buffer(0.085);
      noise(n, { amp: 0.35, decay: 0.0025, rng });
      const sparkle = biquad(n, 'highpass', 6000, 0.8);
      return biquad(mix(decimate(bitcrush(b, 7), 4), sparkle), 'lowpass', 9000, 0.7);
    },
  },
  {
    // Arcade confirm: two blips a fifth apart. The only sound in the set that
    // says something ("yes") rather than just marking a moment.
    file: 'arcade_confirm.wav',
    render: () => {
      const b = buffer(0.13);
      tone(b, { wave: 'square', freq: 1046.5, amp: 0.5, attack: 0.0006, decay: 0.016 });
      tone(b, { freq: 1046.5, amp: 0.3, attack: 0.0006, decay: 0.022 });
      tone(b, { wave: 'square', freq: 1568, amp: 0.5, attack: 0.0006, decay: 0.026, start: 0.042 });
      tone(b, { freq: 1568, amp: 0.32, attack: 0.0006, decay: 0.034, start: 0.042 });
      return saturate(biquad(b, 'lowpass', 8000, 0.7), 1.3);
    },
  },

  // ── Metallic ──────────────────────────────────────────────────────────────
  {
    // Metal ping: FM with an inharmonic ratio — clangs, then settles to a tone.
    file: 'metal_ping.wav',
    render: () => {
      const b = buffer(0.13);
      fm(b, { carrier: 1240, ratio: 1.87, index: 6.5, indexDecay: 0.016, amp: 0.9, decay: 0.05 });
      tone(b, { freq: 3140, amp: 0.22, decay: 0.022 });
      return biquad(b, 'highpass', 420, 0.8);
    },
  },
  {
    // Anvil: struck-bar mode ratios (1, 2.76, 5.40, 8.93) over a noise strike.
    file: 'metal_anvil.wav',
    render: (rng) => {
      const b = buffer(0.19);
      const f = 690;
      const modes: [number, number, number][] = [
        [1, 0.9, 0.095],
        [2.76, 0.5, 0.062],
        [5.4, 0.3, 0.04],
        [8.93, 0.18, 0.026],
      ];
      for (const [ratio, amp, decay] of modes) tone(b, { freq: f * ratio, amp, decay });
      const n = buffer(0.19);
      noise(n, { amp: 0.8, decay: 0.003, rng });
      const strike = biquad(n, 'bandpass', 5000, 1.2);
      return biquad(saturate(mix(b, gain(strike, 1.4)), 1.4), 'highpass', 260, 0.8);
    },
  },
];

/* ─── Entry point ────────────────────────────────────────────────────────── */

const db = (x: number) => (x > 0 ? 20 * Math.log10(x) : -Infinity);
const check = process.argv.includes('--check');

/** `--check` on a file that was never written is a mismatch, not a crash. */
function readIfPresent(path: string): Buffer | null {
  try {
    return readFileSync(path);
  } catch {
    return null;
  }
}

let mismatched = 0;
const rows: string[] = [];

for (const recipe of RECIPES) {
  const audio = master(recipe.render(mulberry32(seedFor(recipe.file))));
  const wav = encodeWav(audio);
  const path = join(OUT_DIR, recipe.file);

  if (check) {
    const current = readIfPresent(path);
    if (!current || !current.equals(wav)) {
      mismatched++;
      console.error(`✗ ${recipe.file} ${current ? 'differs from' : 'missing from'} public/`);
    }
  } else {
    writeFileSync(path, wav);
  }

  rows.push(
    [
      recipe.file.padEnd(20),
      `${((audio.length / SAMPLE_RATE) * 1000).toFixed(0).padStart(4)} ms`,
      `peak ${db(peakOf(audio)).toFixed(2).padStart(6)} dB`,
      `tp ${db(truePeak(audio)).toFixed(2).padStart(6)} dB`,
      `loud ${db(windowedRms(audio)).toFixed(2).padStart(6)} dB`,
      `${(wav.length / 1024).toFixed(1).padStart(5)} KB`,
    ].join('  '),
  );
}

console.warn(rows.join('\n'));

if (check) {
  if (mismatched > 0) {
    console.error(`\n${mismatched} file(s) differ. Run: pnpm slice-it:hit-sounds`);
    process.exit(1);
  }
  console.warn(`\n✓ all ${RECIPES.length} samples match public/music/slice-it/sounds/`);
} else {
  console.warn(`\n✓ wrote ${RECIPES.length} samples to public/music/slice-it/sounds/`);
}
