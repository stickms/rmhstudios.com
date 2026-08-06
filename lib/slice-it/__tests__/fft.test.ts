/**
 * `RealFFT` is an optimisation of a thing that already worked, on the code path
 * where a wrong answer is hardest to notice: a subtly wrong spectrum yields a
 * chart that is merely *slightly* off, and nothing throws.
 *
 * So it is tested against the complex transform rather than against intuition.
 * The complex `FFT` is the oracle — it is the code that shipped, and it is
 * simple enough to read — and `RealFFT` has to agree with it on random signals,
 * on the degenerate ones (silence, a DC offset, an impulse, alternating ±1 at
 * Nyquist), and on the real windowed frames the analyser actually feeds it.
 */

import { describe, it, expect } from 'vitest';
import { FFT, RealFFT, hannWindow } from '../beatmap/fft';
import { FRAME_SIZE } from '../beatmap/spectrum';

/** Bin magnitudes via the complex transform, the way the STFT used to. */
function oracle(input: Float32Array, window?: Float64Array): Float64Array {
  const n = input.length;
  const fft = new FFT(n);
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let i = 0; i < n; i++) re[i] = input[i] * (window ? window[i] : 1);
  fft.transform(re, im);
  const out = new Float64Array(n / 2);
  for (let k = 0; k < n / 2; k++) out[k] = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
  return out;
}

function actual(input: Float32Array, window?: Float64Array): Float64Array {
  const rfft = new RealFFT(input.length);
  const out = new Float64Array(input.length / 2);
  rfft.magnitudes(input, out, 0, window);
  return out;
}

/** Relative agreement, so a 1e6-magnitude bin is not held to an absolute 1e-9. */
function expectAgrees(a: Float64Array, b: Float64Array, label: string) {
  expect(a.length).toBe(b.length);
  let worst = 0;
  let worstBin = -1;
  for (let k = 0; k < a.length; k++) {
    const scale = Math.max(1, Math.abs(a[k]), Math.abs(b[k]));
    const err = Math.abs(a[k] - b[k]) / scale;
    if (err > worst) {
      worst = err;
      worstBin = k;
    }
  }
  expect(worst, `${label}: worst relative error at bin ${worstBin}`).toBeLessThan(1e-9);
}

/** Deterministic PRNG so a failure is reproducible. */
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

describe('RealFFT', () => {
  it('agrees with the complex transform on random signals, at every size', () => {
    for (const size of [4, 8, 16, 64, 256, 1024, 2048]) {
      const rand = seeded(size * 7919);
      const input = Float32Array.from({ length: size }, () => rand() * 2 - 1);
      expectAgrees(actual(input), oracle(input), `size ${size}`);
    }
  });

  it('agrees on the degenerate inputs', () => {
    const size = 256;
    const cases: Record<string, Float32Array> = {
      silence: new Float32Array(size),
      dc: Float32Array.from({ length: size }, () => 0.5),
      impulse: Float32Array.from({ length: size }, (_, i) => (i === 0 ? 1 : 0)),
      lateImpulse: Float32Array.from({ length: size }, (_, i) => (i === size - 1 ? 1 : 0)),
      nyquist: Float32Array.from({ length: size }, (_, i) => (i % 2 ? -1 : 1)),
      // A bin-centred sinusoid: all the energy lands in exactly one bin, which
      // is where a packing error shows up as leakage into its mirror.
      tone: Float32Array.from({ length: size }, (_, i) => Math.sin((2 * Math.PI * 7 * i) / size)),
      huge: Float32Array.from({ length: size }, (_, i) => (i % 3 ? 1e6 : -1e6)),
    };
    for (const [name, input] of Object.entries(cases)) {
      expectAgrees(actual(input), oracle(input), name);
    }
  });

  it('agrees on the windowed frames the STFT actually computes', () => {
    const window = hannWindow(FRAME_SIZE);
    const rand = seeded(4242);
    // Something with real structure: a decaying kick under broadband noise.
    const input = Float32Array.from({ length: FRAME_SIZE }, (_, i) => {
      const env = Math.exp(-i / 200);
      return env * Math.sin((2 * Math.PI * 60 * i) / 22050) + (rand() - 0.5) * 0.05;
    });
    expectAgrees(actual(input, window), oracle(input, window), 'windowed frame');
  });

  it('reads from an offset without copying the frame out first', () => {
    const rand = seeded(99);
    const size = 128;
    const long = Float32Array.from({ length: size * 4 }, () => rand() * 2 - 1);
    const offset = size * 2 + 64;

    const rfft = new RealFFT(size);
    const out = new Float64Array(size / 2);
    rfft.magnitudes(long, out, offset);

    expectAgrees(out, oracle(long.slice(offset, offset + size)), 'offset frame');
  });

  it('rejects a size it cannot transform', () => {
    expect(() => new RealFFT(100)).toThrow(/power of two/);
    expect(() => new RealFFT(2)).toThrow(/power of two/);
  });
});
