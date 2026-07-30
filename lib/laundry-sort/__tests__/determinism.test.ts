/**
 * The fairness guarantee, as an executable check.
 *
 * Laundry Sort's multiplayer does not replicate cloth — it replicates a seed,
 * and trusts that the same seed produces the same laundry on every client. If
 * that stops being true the game silently becomes unfair (one player gets an
 * easier stream of garments than the person they are racing) with no visible
 * symptom. These tests are the thing standing between that and production.
 *
 * They also pin the two other places device-independence could leak in: the
 * fixed timestep, and the schedule's dependence on difficulty rather than on
 * anything ambient.
 */

import { describe, it, expect } from 'vitest';
import { buildDropSchedule, LaundryMatch } from '../match';
import { FIXED_DT, DIFFICULTIES, MATCH_DURATIONS } from '../constants';
import { createRng } from '../rng';

describe('createRng', () => {
  it('is a pure function of its seed', () => {
    const a = createRng(12345);
    const b = createRng(12345);
    const left = Array.from({ length: 32 }, () => a.next());
    const right = Array.from({ length: 32 }, () => b.next());
    expect(left).toEqual(right);
  });

  it('gives different seeds different streams', () => {
    const a = Array.from({ length: 16 }, createRng(1).next);
    const b = Array.from({ length: 16 }, createRng(2).next);
    expect(a).not.toEqual(b);
  });

  it('stays inside [0, 1)', () => {
    const rng = createRng(0xdeadbeef);
    for (let i = 0; i < 2000; i++) {
      const value = rng.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('normalises a negative or fractional seed rather than degenerating', () => {
    expect(() => createRng(-7.5).next()).not.toThrow();
    const first = createRng(-7.5).next();
    const second = createRng(-7.5).next();
    expect(first).toBe(second);
  });
});

describe('buildDropSchedule', () => {
  it('produces an identical schedule for an identical seed', () => {
    const a = buildDropSchedule(99, 90, 'standard');
    const b = buildDropSchedule(99, 90, 'standard');
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(10);
  });

  it('produces a different schedule for a different seed', () => {
    const a = buildDropSchedule(1, 90, 'standard');
    const b = buildDropSchedule(2, 90, 'standard');
    expect(a).not.toEqual(b);
  });

  it('fills the whole round and never spawns before it starts', () => {
    for (const duration of MATCH_DURATIONS) {
      const drops = buildDropSchedule(7, duration, 'standard');
      expect(drops.length).toBeGreaterThan(0);
      expect(drops[0].at).toBeGreaterThan(0);
      expect(drops[drops.length - 1].at).toBeLessThan(duration);
      // Monotonic, so the match's single-cursor release loop is correct.
      for (let i = 1; i < drops.length; i++) {
        expect(drops[i].at).toBeGreaterThanOrEqual(drops[i - 1].at);
      }
    }
  });

  it('ramps: a harder difficulty drops strictly more laundry', () => {
    const counts = DIFFICULTIES.map((d) => buildDropSchedule(42, 90, d).length);
    expect(counts[0]).toBeLessThan(counts[1]);
    expect(counts[1]).toBeLessThan(counts[2]);
  });

  it('gets busier as the round goes on', () => {
    const drops = buildDropSchedule(5, 120, 'standard');
    const firstThird = drops.filter((d) => d.at < 40).length;
    const lastThird = drops.filter((d) => d.at >= 80).length;
    expect(lastThird).toBeGreaterThan(firstThird);
  });

  it('keeps every garment inside the arena', () => {
    const drops = buildDropSchedule(11, 120, 'frantic');
    for (const drop of drops) {
      expect(Math.abs(drop.x)).toBeLessThan(4.1);
      expect(Math.abs(drop.z)).toBeLessThanOrEqual(0.5);
    }
  });
});

describe('simulation determinism', () => {
  /** Step a match by whole fixed ticks, the way the render loop would. */
  function run(seed: number, ticks: number): LaundryMatch {
    const match = new LaundryMatch({ seed, durationSec: 60, difficulty: 'standard' });
    for (let i = 0; i < ticks; i++) match.advance(FIXED_DT);
    return match;
  }

  it('two clients on the same seed reach bit-identical cloth', () => {
    const a = run(2024, 240);
    const b = run(2024, 240);

    expect(a.world.garments.length).toBe(b.world.garments.length);
    expect(a.world.garments.length).toBeGreaterThan(0);

    a.world.garments.forEach((garment, index) => {
      const other = b.world.garments[index];
      expect(other.kind).toBe(garment.kind);
      expect(other.colorIndex).toBe(garment.colorIndex);
      // Every particle, not just the centroid: a centroid can agree while the
      // fabric underneath has diverged.
      expect(Array.from(other.pos)).toEqual(Array.from(garment.pos));
    });
    expect(b.stats).toEqual(a.stats);
  });

  it('is not sensitive to how frame time arrives', () => {
    // Same total simulated time, delivered in different-sized frames. The
    // accumulator must quantise both to the same tick count, or a 144 Hz
    // display would play a different game from a 60 Hz one.
    const steady = new LaundryMatch({ seed: 77, durationSec: 60, difficulty: 'standard' });
    for (let i = 0; i < 120; i++) steady.advance(FIXED_DT);

    const uneven = new LaundryMatch({ seed: 77, durationSec: 60, difficulty: 'standard' });
    for (let i = 0; i < 60; i++) uneven.advance(FIXED_DT * 2);

    expect(uneven.elapsed).toBeCloseTo(steady.elapsed, 6);
    expect(uneven.world.garments.length).toBe(steady.world.garments.length);
  });

  it('ends on its own simulated clock, not a wall clock', () => {
    const match = new LaundryMatch({ seed: 3, durationSec: 60, difficulty: 'relaxed' });
    for (let i = 0; i < 60 * 60; i++) match.advance(FIXED_DT);
    expect(match.finished).toBe(true);
    expect(match.remaining).toBe(0);
  });

  it('clamps a long stall instead of trying to catch up', () => {
    const match = new LaundryMatch({ seed: 4, durationSec: 60, difficulty: 'standard' });
    // A backgrounded tab returning after a minute.
    match.advance(60);
    // At most MAX_TICKS_PER_FRAME (3) ticks were consumed.
    expect(match.elapsed).toBeLessThanOrEqual(FIXED_DT * 3 + 1e-9);
  });
});
