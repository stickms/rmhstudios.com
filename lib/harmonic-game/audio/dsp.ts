/**
 * Pure, deterministic renderer for `Recipe`s: PCM out, no Web Audio. The same recipe gives the same
 * samples in Node and in every browser (Web Audio's own filters are not bit-identical across
 * engines), so the sound bank is testable headlessly and cacheable. `synth.ts` copies the result
 * into an `AudioBuffer`.
 */
import { mulberry32 } from './rng';
import type {
  Env,
  FilterSpec,
  FormantLayer,
  Layer,
  ModalLayer,
  NoiseLayer,
  Recipe,
  ToneLayer,
} from './types';

const TAU = Math.PI * 2;
/** Filter coefficients are refreshed every this many samples while a sweep runs. */
const COEF_BLOCK = 16;
/** Fade at both ends of a one-shot, seconds (kills clicks). */
const EDGE_FADE = 0.0012;
/** Loop crossfade, seconds. */
const LOOP_XFADE = 1.5;

export interface Pcm {
  rate: number;
  /** One Float32Array per channel. */
  channels: Float32Array[];
}

/** Attack/hold/release gain at time `t` (s): smooth attack, flat hold, exponential release to ~-60 dB. */
export function envGain(env: Env, t: number): number {
  const [a, h, r] = env;
  if (t < 0) return 0;
  if (t < a) {
    const x = t / a;
    return x * x * (3 - 2 * x);
  }
  if (t < a + h) return 1;
  if (r <= 0) return 0;
  const x = (t - a - h) / r;
  if (x >= 1) return 0;
  // Exponential to -60 dB, trimmed so it lands exactly on 0 at x = 1.
  return Math.max(0, Math.pow(0.001, x) - 0.001 * x);
}

export function envLength(env: Env): number {
  return env[0] + env[1] + env[2];
}

// ─── Biquad ──────────────────────────────────────────────────────────────

class Biquad {
  private b0 = 1;
  private b1 = 0;
  private b2 = 0;
  private a1 = 0;
  private a2 = 0;
  private x1 = 0;
  private x2 = 0;
  private y1 = 0;
  private y2 = 0;

  constructor(
    private readonly spec: FilterSpec,
    private readonly rate: number,
  ) {
    this.setFreq(spec.freq);
  }

  setFreq(freq: number): void {
    const { type, q, gainDb = 0 } = this.spec;
    const f = Math.min(Math.max(freq, 10), this.rate * 0.45);
    const w = (TAU * f) / this.rate;
    const cos = Math.cos(w);
    const sin = Math.sin(w);
    const alpha = sin / (2 * Math.max(q, 0.05));
    let b0: number, b1: number, b2: number, a0: number, a1: number, a2: number;
    switch (type) {
      case 'lp':
        b0 = (1 - cos) / 2;
        b1 = 1 - cos;
        b2 = b0;
        a0 = 1 + alpha;
        a1 = -2 * cos;
        a2 = 1 - alpha;
        break;
      case 'hp':
        b0 = (1 + cos) / 2;
        b1 = -(1 + cos);
        b2 = b0;
        a0 = 1 + alpha;
        a1 = -2 * cos;
        a2 = 1 - alpha;
        break;
      case 'bp':
        // Constant 0 dB peak gain.
        b0 = alpha;
        b1 = 0;
        b2 = -alpha;
        a0 = 1 + alpha;
        a1 = -2 * cos;
        a2 = 1 - alpha;
        break;
      case 'notch':
        b0 = 1;
        b1 = -2 * cos;
        b2 = 1;
        a0 = 1 + alpha;
        a1 = -2 * cos;
        a2 = 1 - alpha;
        break;
      default: {
        const A = Math.pow(10, gainDb / 40);
        b0 = 1 + alpha * A;
        b1 = -2 * cos;
        b2 = 1 - alpha * A;
        a0 = 1 + alpha / A;
        a1 = -2 * cos;
        a2 = 1 - alpha / A;
      }
    }
    this.b0 = b0 / a0;
    this.b1 = b1 / a0;
    this.b2 = b2 / a0;
    this.a1 = a1 / a0;
    this.a2 = a2 / a0;
  }

  process(x: number): number {
    const y =
      this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
}

/** A chain of biquads with optional exponential sweeps over `n` samples. */
class FilterChain {
  private readonly filters: Biquad[];
  private readonly specs: readonly FilterSpec[];
  private readonly sweeping: boolean;

  constructor(specs: readonly FilterSpec[] | undefined, rate: number) {
    this.specs = specs ?? [];
    this.filters = this.specs.map((s) => new Biquad(s, rate));
    this.sweeping = this.specs.some((s) => s.freqEnd !== undefined);
  }

  /** Update sweeps at progress `p` (0..1). */
  sweep(p: number): void {
    if (!this.sweeping) return;
    for (let i = 0; i < this.specs.length; i++) {
      const s = this.specs[i];
      if (s.freqEnd !== undefined)
        this.filters[i].setFreq(s.freq * Math.pow(s.freqEnd / s.freq, p));
    }
  }

  get active(): boolean {
    return this.filters.length > 0;
  }

  process(x: number): number {
    let y = x;
    for (const f of this.filters) y = f.process(y);
    return y;
  }
}

// ─── Sources ─────────────────────────────────────────────────────────────

class NoiseSource {
  private b0 = 0;
  private b1 = 0;
  private b2 = 0;
  private b3 = 0;
  private b4 = 0;
  private b5 = 0;
  private b6 = 0;
  private brown = 0;

  constructor(
    private readonly rng: () => number,
    private readonly color: 'white' | 'pink' | 'brown',
  ) {}

  next(): number {
    const w = this.rng() * 2 - 1;
    if (this.color === 'white') return w;
    if (this.color === 'brown') {
      this.brown = (this.brown + 0.02 * w) / 1.02;
      return this.brown * 3.5;
    }
    // Pink (Paul Kellet's economy filter).
    this.b0 = 0.99886 * this.b0 + w * 0.0555179;
    this.b1 = 0.99332 * this.b1 + w * 0.0750759;
    this.b2 = 0.969 * this.b2 + w * 0.153852;
    this.b3 = 0.8665 * this.b3 + w * 0.3104856;
    this.b4 = 0.55 * this.b4 + w * 0.5329522;
    this.b5 = -0.7616 * this.b5 - w * 0.016898;
    const pink = this.b0 + this.b1 + this.b2 + this.b3 + this.b4 + this.b5 + this.b6 + w * 0.5362;
    this.b6 = w * 0.115926;
    return pink * 0.11;
  }
}

function wave(kind: ToneLayer['wave'], phase: number): number {
  const x = phase - Math.floor(phase);
  switch (kind) {
    case 'sine':
      return Math.sin(TAU * x);
    case 'triangle':
      return 4 * Math.abs(x - 0.5) - 1;
    case 'saw':
      return 2 * x - 1;
    default:
      return x < 0.5 ? 1 : -1;
  }
}

// ─── Layers ──────────────────────────────────────────────────────────────

interface Span {
  start: number;
  /** Samples in the layer's own envelope. */
  length: number;
}

function span(layer: Layer, rate: number, total: number): Span {
  const start = Math.max(0, Math.round(layer.at * rate));
  let seconds = envLength(layer.env);
  if (layer.kind === 'modal') {
    const longest = layer.modes.reduce((m, x) => Math.max(m, x.decay), 0);
    seconds = Math.max(seconds, longest);
  }
  return { start, length: Math.max(0, Math.min(total - start, Math.ceil(seconds * rate))) };
}

function tremoloGain(layer: Layer, t: number): number {
  const lfo = layer.tremolo;
  if (!lfo) return 1;
  return 1 - lfo.depth * 0.5 * (1 - Math.sin(TAU * lfo.rate * t));
}

function renderNoise(
  layer: NoiseLayer,
  out: Float32Array,
  sp: Span,
  rate: number,
  rng: () => number,
): void {
  const src = new NoiseSource(rng, layer.color);
  const chain = new FilterChain(layer.filters, rate);
  const len = Math.max(1, sp.length);
  for (let i = 0; i < sp.length; i++) {
    if (i % COEF_BLOCK === 0) chain.sweep(i / len);
    const t = i / rate;
    out[sp.start + i] +=
      chain.process(src.next()) * envGain(layer.env, t) * tremoloGain(layer, t) * layer.gain;
  }
}

function renderTone(
  layer: ToneLayer,
  out: Float32Array,
  sp: Span,
  rate: number,
  rng: () => number,
): void {
  const chain = new FilterChain(layer.filters, rate);
  const len = Math.max(1, sp.length);
  const phase0 = rng();
  const fmPhase0 = rng();
  let phase = phase0;
  let mod = fmPhase0;
  const nyq = rate * 0.45;
  const gl = layer.freqEnd !== undefined ? Math.log(layer.freqEnd / layer.freq) : 0;
  for (let i = 0; i < sp.length; i++) {
    if (i % COEF_BLOCK === 0) chain.sweep(i / len);
    const t = i / rate;
    const p = i / len;
    let f = layer.freq * Math.exp(gl * p);
    if (layer.vibrato) f *= 1 + layer.vibrato.depth * Math.sin(TAU * layer.vibrato.rate * t);
    let s: number;
    if (layer.fm) {
      const idx = layer.fm.index + ((layer.fm.indexEnd ?? layer.fm.index) - layer.fm.index) * p;
      mod += (f * layer.fm.ratio) / rate;
      s = Math.sin(TAU * phase + idx * Math.sin(TAU * mod));
    } else if (layer.partials) {
      s = 0;
      for (let k = 0; k < layer.partials.length; k++) {
        if (f * (k + 1) > nyq) break;
        s += layer.partials[k] * Math.sin(TAU * phase * (k + 1));
      }
    } else {
      s = wave(layer.wave, phase);
    }
    phase += f / rate;
    if (phase > 1e6) phase -= Math.floor(phase);
    const g = envGain(layer.env, t) * tremoloGain(layer, t) * layer.gain;
    out[sp.start + i] += (chain.active ? chain.process(s) : s) * g;
  }
}

function renderModal(
  layer: ModalLayer,
  out: Float32Array,
  sp: Span,
  rate: number,
  rng: () => number,
): void {
  const nyq = rate * 0.45;
  for (const m of layer.modes) {
    if (m.freq >= nyq) continue;
    const phase = rng() * TAU;
    const w = (TAU * m.freq) / rate;
    // Amplitude falls 60 dB over `decay`.
    const k = Math.pow(0.001, 1 / (m.decay * rate));
    let amp = m.gain;
    for (let i = 0; i < sp.length; i++) {
      out[sp.start + i] +=
        Math.sin(phase + w * i) *
        amp *
        Math.min(1, i / 24) *
        tremoloGain(layer, i / rate) *
        layer.gain;
      amp *= k;
    }
  }
  // The envelope here only trims the end (modes carry their own decay).
}

function renderFormant(
  layer: FormantLayer,
  out: Float32Array,
  sp: Span,
  rate: number,
  rng: () => number,
): void {
  const bank = layer.formants.map((f) => ({
    bi: new Biquad({ type: 'bp', freq: f.freq, q: f.q }, rate),
    gain: f.gain,
  }));
  const noise = new NoiseSource(rng, 'white');
  const chain = new FilterChain(layer.filters, rate);
  const len = Math.max(1, sp.length);
  const gl = layer.f0End !== undefined ? Math.log(layer.f0End / layer.f0) : 0;
  let phase = rng();
  let jitter = 0;
  for (let i = 0; i < sp.length; i++) {
    if (i % COEF_BLOCK === 0) chain.sweep(i / len);
    const t = i / rate;
    let f = layer.f0 * Math.exp(gl * (i / len));
    if (layer.vibrato) f *= 1 + layer.vibrato.depth * Math.sin(TAU * layer.vibrato.rate * t);
    // Slow random pitch drift: a voice that never quite settles.
    if (i % 256 === 0) jitter = jitter * 0.9 + (rng() - 0.5) * 0.012;
    phase += (f * (1 + jitter)) / rate;
    // Glottal-ish pulse: a leaky saw with a soft closure.
    const x = phase - Math.floor(phase);
    const glottal = (1 - x) * (1 - x) * (x < 0.9 ? 1 : (1 - x) * 10) * 2 - 0.66;
    const src = glottal * (1 - layer.breath) + noise.next() * layer.breath;
    let y = 0;
    for (const b of bank) y += b.bi.process(src) * b.gain;
    out[sp.start + i] +=
      (chain.active ? chain.process(y) : y) *
      envGain(layer.env, t) *
      tremoloGain(layer, t) *
      layer.gain;
  }
}

function renderLayer(layer: Layer, out: Float32Array, rate: number, rng: () => number): void {
  const sp = span(layer, rate, out.length);
  if (sp.length <= 0) return;
  switch (layer.kind) {
    case 'noise':
      return renderNoise(layer, out, sp, rate, rng);
    case 'tone':
      return renderTone(layer, out, sp, rate, rng);
    case 'modal':
      return renderModal(layer, out, sp, rate, rng);
    case 'formant':
      return renderFormant(layer, out, sp, rate, rng);
  }
}

// ─── Recipe ──────────────────────────────────────────────────────────────

function renderChannel(recipe: Recipe, channel: number, length: number): Float32Array {
  const out = new Float32Array(length);
  recipe.layers.forEach((layer, i) => {
    // Each layer and channel has its own stream: stereo beds decorrelate, adding a layer never
    // reshuffles another layer's noise.
    const rng = mulberry32(
      (recipe.seed + Math.imul(i + 1, 0x9e3779b1) + Math.imul(channel, 0x85ebca6b)) >>> 0,
    );
    renderLayer(layer, out, recipe.rate, rng);
  });
  return out;
}

/** Render a recipe to PCM, normalised to `recipe.peak`. */
export function renderRecipe(recipe: Recipe): Pcm {
  const rate = recipe.rate;
  const len = Math.max(1, Math.round(recipe.duration * rate));
  const xf = recipe.loop ? Math.min(Math.round(LOOP_XFADE * rate), Math.floor(len / 2)) : 0;
  const channels: Float32Array[] = [];
  for (let c = 0; c < recipe.channels; c++) {
    const raw = renderChannel(recipe, c, len + xf);
    if (recipe.loop) {
      // Fold the extra tail onto the head with an equal-power crossfade: the loop point is seamless.
      const out = new Float32Array(len);
      out.set(raw.subarray(0, len));
      for (let i = 0; i < xf; i++) {
        const x = i / xf;
        out[i] = raw[i] * Math.sin((x * Math.PI) / 2) + raw[len + i] * Math.cos((x * Math.PI) / 2);
      }
      channels.push(out);
    } else {
      channels.push(raw);
    }
  }
  // Normalise across channels, remove DC, then fade the edges of one-shots.
  let peak = 0;
  for (const ch of channels) {
    let mean = 0;
    for (let i = 0; i < ch.length; i++) mean += ch[i];
    mean /= ch.length;
    if (recipe.loop) for (let i = 0; i < ch.length; i++) ch[i] -= mean;
    for (let i = 0; i < ch.length; i++) peak = Math.max(peak, Math.abs(ch[i]));
  }
  const scale = peak > 1e-9 ? recipe.peak / peak : 0;
  const edge = Math.min(Math.round(EDGE_FADE * rate), Math.floor(len / 4));
  for (const ch of channels) {
    for (let i = 0; i < ch.length; i++) ch[i] *= scale;
    if (!recipe.loop) {
      for (let i = 0; i < edge; i++) {
        const g = i / edge;
        ch[i] *= g;
        ch[ch.length - 1 - i] *= g;
      }
    }
  }
  return { rate, channels };
}

// ─── Measurement (tests, the smoke script and the WAV export) ────────────

export function measure(pcm: Pcm): { peak: number; rms: number; seconds: number } {
  let peak = 0;
  let sum = 0;
  let n = 0;
  for (const ch of pcm.channels) {
    for (let i = 0; i < ch.length; i++) {
      const a = Math.abs(ch[i]);
      if (a > peak) peak = a;
      sum += ch[i] * ch[i];
      n++;
    }
  }
  return { peak, rms: n ? Math.sqrt(sum / n) : 0, seconds: pcm.channels[0].length / pcm.rate };
}

/** FNV-1a over the samples quantised to 16 bits — a stable fingerprint for determinism tests. */
export function pcmHash(pcm: Pcm): number {
  let h = 0x811c9dc5;
  for (const ch of pcm.channels) {
    for (let i = 0; i < ch.length; i++) {
      h ^= Math.round(ch[i] * 32767) & 0xffff;
      h = Math.imul(h, 0x01000193);
    }
  }
  return h >>> 0;
}

/** 16-bit PCM WAV bytes (interleaved). */
export function encodeWav(pcm: Pcm): Uint8Array {
  const n = pcm.channels.length;
  const frames = pcm.channels[0].length;
  const bytes = new Uint8Array(44 + frames * n * 2);
  const v = new DataView(bytes.buffer);
  const str = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  str(0, 'RIFF');
  v.setUint32(4, 36 + frames * n * 2, true);
  str(8, 'WAVEfmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, n, true);
  v.setUint32(24, pcm.rate, true);
  v.setUint32(28, pcm.rate * n * 2, true);
  v.setUint16(32, n * 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, frames * n * 2, true);
  let o = 44;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < n; c++) {
      v.setInt16(o, Math.round(Math.max(-1, Math.min(1, pcm.channels[c][i])) * 32767), true);
      o += 2;
    }
  }
  return bytes;
}
