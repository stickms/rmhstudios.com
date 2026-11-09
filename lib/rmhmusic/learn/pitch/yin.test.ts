import { describe, expect, it } from 'vitest';
import { centsBetween } from './notes';
import { detectPitch } from './yin';

const SAMPLE_RATE = 44100;
const LENGTH = 2048;

/** A pure sine of `freq` Hz at peak amplitude `amp`. */
function sine(freq: number, amp = 0.5, rate = SAMPLE_RATE, length = LENGTH): Float32Array {
  const buf = new Float32Array(length);
  for (let i = 0; i < length; i++) buf[i] = amp * Math.sin((2 * Math.PI * freq * i) / rate);
  return buf;
}

/** Deterministic PRNG so the noise test can never flake. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('detectPitch (YIN)', () => {
  it.each([82.41, 220, 440, 1046.5])('detects a %s Hz sine within 5 cents', (freq) => {
    const result = detectPitch(sine(freq), SAMPLE_RATE);
    expect(result).not.toBeNull();
    expect(Math.abs(centsBetween(freq, result!.freq))).toBeLessThan(5);
    expect(result!.clarity).toBeGreaterThan(0.8);
    expect(result!.clarity).toBeLessThanOrEqual(1);
  });

  it('returns the fundamental of a harmonic-rich tone, not an octave or a twelfth up', () => {
    const f0 = 110;
    const a = sine(f0, 0.3);
    const b = sine(f0 * 2, 0.3 * 0.8);
    const c = sine(f0 * 3, 0.3 * 0.6);
    const buf = new Float32Array(LENGTH);
    for (let i = 0; i < LENGTH; i++) buf[i] = a[i] + b[i] + c[i];
    const result = detectPitch(buf, SAMPLE_RATE);
    expect(result).not.toBeNull();
    expect(Math.abs(centsBetween(f0, result!.freq))).toBeLessThan(10);
  });

  it('returns null for silence', () => {
    expect(detectPitch(new Float32Array(LENGTH), SAMPLE_RATE)).toBeNull();
  });

  it('returns null for seeded background noise', () => {
    const rand = mulberry32(12345);
    const buf = new Float32Array(LENGTH);
    for (let i = 0; i < LENGTH; i++) buf[i] = (rand() * 2 - 1) * 0.3;
    expect(detectPitch(buf, SAMPLE_RATE)).toBeNull();
  });

  it('returns null for a signal below the minimum RMS', () => {
    expect(detectPitch(sine(440, 0.005), SAMPLE_RATE)).toBeNull();
  });

  it('returns null when the buffer is too short for the lowest frequency', () => {
    expect(detectPitch(new Float32Array(256).fill(0.5), SAMPLE_RATE)).toBeNull();
  });

  it('never returns a non-finite or non-positive frequency', () => {
    const bad = new Float32Array(LENGTH).fill(NaN);
    expect(detectPitch(bad, SAMPLE_RATE)).toBeNull();
    expect(detectPitch(sine(440), 0)).toBeNull();
  });

  // The lag search runs on a decimated copy of the frame; these pin that the
  // full-rate refinement keeps the accuracy at both common device rates and
  // that the full-rate fallback (short frames, low rates) still works.
  it.each([82.41, 440, 1046.5, 1396.9])('detects a %s Hz sine at 48 kHz within 5 cents', (freq) => {
    const result = detectPitch(sine(freq, 0.5, 48000), 48000);
    expect(result).not.toBeNull();
    expect(Math.abs(centsBetween(freq, result!.freq))).toBeLessThan(5);
    expect(result!.clarity).toBeGreaterThan(0.8);
  });

  it('returns the fundamental of a harmonic-rich tone at 48 kHz', () => {
    const buf = new Float32Array(LENGTH);
    for (let h = 1; h <= 6; h++) {
      const partial = sine(110 * h, 0.3 / h, 48000);
      for (let i = 0; i < LENGTH; i++) buf[i] += partial[i];
    }
    const result = detectPitch(buf, 48000);
    expect(result).not.toBeNull();
    expect(Math.abs(centsBetween(110, result!.freq))).toBeLessThan(5);
  });

  it('falls back to the full-rate search for a frame too short to decimate', () => {
    // 1480 samples: long enough for 60 Hz at 44.1 kHz, too short for the decimated search.
    const result = detectPitch(sine(220, 0.5, SAMPLE_RATE, 1480), SAMPLE_RATE);
    expect(result).not.toBeNull();
    expect(Math.abs(centsBetween(220, result!.freq))).toBeLessThan(5);
  });

  it('detects at a low sample rate where no decimation applies', () => {
    const result = detectPitch(sine(440, 0.5, 16000), 16000);
    expect(result).not.toBeNull();
    expect(Math.abs(centsBetween(440, result!.freq))).toBeLessThan(5);
  });

  it('returns the same answer when called again (reused scratch buffers)', () => {
    const a = detectPitch(sine(330), SAMPLE_RATE);
    detectPitch(sine(90, 0.5, 48000), 48000);
    const b = detectPitch(sine(330), SAMPLE_RATE);
    expect(b).toEqual(a);
  });
});
