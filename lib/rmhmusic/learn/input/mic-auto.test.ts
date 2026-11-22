import { describe, expect, it } from 'vitest';
import { AUTO_GATE_MAX, AUTO_GATE_MIN, AUTO_MIN_GAIN, GATE_FACTOR, TARGET_RMS, createAutoLevel } from './mic-auto';

/** Run `frames` frames of a note whose RAW level is `raw` through the controller, applying its gain. */
function playNote(auto: ReturnType<typeof createAutoLevel>, raw: number, frames: number) {
  for (let i = 0; i < frames; i++) auto.step({ rms: raw * auto.gain, pitched: true });
}
function room(auto: ReturnType<typeof createAutoLevel>, raw: number, frames: number) {
  for (let i = 0; i < frames; i++) auto.step({ rms: raw * auto.gain, pitched: false });
}

describe('automatic gain', () => {
  it('raises a quiet note toward the target, slowly, and never past 16x', () => {
    const auto = createAutoLevel(1);
    room(auto, 0.001, 40);
    playNote(auto, 0.02, 10);
    const early = auto.gain;
    expect(early).toBeGreaterThan(1);
    expect(early).toBeLessThan(1.5); // 10 frames (a quarter second) is a nudge, not a jump
    playNote(auto, 0.02, 2000);
    expect(auto.gain).toBeGreaterThan(3);
    expect(auto.gain).toBeLessThanOrEqual(16);
    playNote(auto, 0.004, 20000); // a note the detector would never hear at gain 1: the gain climbs to the top
    expect(auto.gain).toBe(16);
  });

  it('brings a loud note down quickly and settles near the target', () => {
    const auto = createAutoLevel(1);
    playNote(auto, 0.4, 30);
    expect(auto.gain).toBeLessThan(0.6);
    playNote(auto, 0.4, 400);
    expect(auto.gain * 0.4).toBeGreaterThan(TARGET_RMS * 0.7);
    expect(auto.gain * 0.4).toBeLessThan(TARGET_RMS * 1.4);
    expect(auto.gain).toBeGreaterThanOrEqual(AUTO_MIN_GAIN);
  });

  it('holds the gain while nothing is sounding, so silence and noise are never amplified', () => {
    const auto = createAutoLevel(2);
    room(auto, 0.002, 5000);
    expect(auto.gain).toBe(2);
    room(auto, 0, 100);
    expect(auto.gain).toBe(2);
  });

  it('does rise for a quiet note that holds steady, such as a sung one', () => {
    const auto = createAutoLevel(1);
    room(auto, 0.0005, 100);
    playNote(auto, 0.01, 400);
    expect(auto.gain).toBeGreaterThan(1.5);
  });

  it('does not creep up on a note that is only dying away', () => {
    const auto = createAutoLevel(1);
    // A string ringing out from loud: the level only falls, so the gain must not chase it back up.
    for (let i = 0; i < 100; i++) auto.step({ rms: 0.12 * 0.97 ** i, pitched: true });
    expect(auto.gain).toBeLessThan(1.2);
  });
});

describe('automatic cutoff', () => {
  it('sits a fixed multiple above the room, inside its bounds', () => {
    const auto = createAutoLevel(1);
    room(auto, 0.004, 400);
    expect(auto.gate).toBeCloseTo(0.004 * GATE_FACTOR, 4);
    const quiet = createAutoLevel(1);
    room(quiet, 0.0001, 400);
    expect(quiet.gate).toBe(AUTO_GATE_MIN);
    const loud = createAutoLevel(1);
    room(loud, 0.1, 400);
    expect(loud.gate).toBe(AUTO_GATE_MAX);
  });

  it('learns a new noise (a fan) over seconds, but forgets a passing one at once', () => {
    const auto = createAutoLevel(1);
    room(auto, 0.002, 200);
    const base = auto.gate;
    room(auto, 0.01, 40); // one second of fan
    expect(auto.gate).toBeLessThan(base * 1.5);
    room(auto, 0.01, 1500); // ~40 s of fan
    expect(auto.gate).toBeGreaterThan(base * 2);
    room(auto, 0.002, 30);
    expect(auto.gate).toBeLessThan(base * 1.5);
  });

  it('keeps the floor in raw units, so changing the gain does not move it', () => {
    const auto = createAutoLevel(4);
    room(auto, 0.002, 400);
    const a = auto.gate;
    const b = createAutoLevel(1);
    room(b, 0.002, 400);
    expect(a / 4).toBeCloseTo(b.gate, 3); // same room, gate in post-gain units scales with gain
  });

  it('never chases a steady noise with the gain, however loud', () => {
    const auto = createAutoLevel(1);
    room(auto, 0.001, 100);
    room(auto, 0.05, 3000); // a fan, a TV: loud, steady and not a pitched note
    expect(auto.gain).toBe(1);
  });

  it('ignores frames that are not numbers', () => {
    const auto = createAutoLevel(1);
    for (const rms of [Number.NaN, -1, Infinity]) {
      const r = auto.step({ rms, pitched: true });
      expect(Number.isFinite(r.gain)).toBe(true);
      expect(Number.isFinite(r.gate)).toBe(true);
    }
  });
});
