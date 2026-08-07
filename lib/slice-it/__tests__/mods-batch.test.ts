/**
 * M2, M5, M7 and M10.
 *
 * The two assertions worth reading are the chord one in M2 (the failure mode
 * that makes a naive per-note shuffle unplayable) and the M5 note-count one
 * (an accessibility modifier that adds notes is not an accessibility modifier).
 */

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MODIFIERS,
  applyExclusions,
  incompatibleReason,
  isRankedModifierSet,
  legalFor,
} from '../modifiers';
import { applyChartModifiers, createSeededRandom } from '../chart';
import { calculateScoreMultiplier } from '../scoring';
import type { Slice } from '../types';

const rng = () => createSeededRandom('fixed-seed');

const CHART: Slice[] = [
  { id: 'a', time: 1.0, lane: 0, type: 'STANDARD' },
  { id: 'b', time: 1.0, lane: 1, type: 'STANDARD' }, // a chord with `a`
  { id: 'c', time: 2.0, lane: 0, type: 'LONG', duration: 1.5 },
  { id: 'd', time: 4.0, lane: 1, type: 'STANDARD' },
];

describe('M2 — S-Random', () => {
  it('keeps a chord in two different lanes', () => {
    // The failure this exists to prevent: drawing each note's lane
    // independently puts both halves of a chord in one lane, which at best
    // silently drops one and at worst is unhittable.
    const out = applyChartModifiers(CHART, { ...DEFAULT_MODIFIERS, sRandom: true }, rng());
    const chord = out.filter((slice) => slice.time === 1.0);
    expect(chord).toHaveLength(2);
    expect(chord[0].lane).not.toBe(chord[1].lane);
  });

  it('is deterministic for the same seed', () => {
    const a = applyChartModifiers(CHART, { ...DEFAULT_MODIFIERS, sRandom: true }, rng());
    const b = applyChartModifiers(CHART, { ...DEFAULT_MODIFIERS, sRandom: true }, rng());
    expect(a.map((s) => s.lane)).toEqual(b.map((s) => s.lane));
  });

  it('yields to One Track rather than fighting it', () => {
    const out = applyChartModifiers(
      CHART,
      { ...DEFAULT_MODIFIERS, sRandom: true, oneTrack: true },
      rng(),
    );
    expect(out.every((slice) => slice.lane === 0)).toBe(true);
  });

  it('pays a bonus, because it is genuinely harder', () => {
    expect(calculateScoreMultiplier({ ...DEFAULT_MODIFIERS, sRandom: true })).toBeGreaterThan(
      calculateScoreMultiplier(DEFAULT_MODIFIERS),
    );
  });
});

describe('M5 — holds as taps', () => {
  it('converts the head and DROPS the tail, never adding a note', () => {
    const out = applyChartModifiers(CHART, { ...DEFAULT_MODIFIERS, tapHolds: true }, rng());
    expect(out).toHaveLength(CHART.length);
    expect(out.every((slice) => slice.type !== 'LONG')).toBe(true);
    expect(out.every((slice) => slice.duration === undefined)).toBe(true);
  });

  it('is an assist: unranked, and worth nothing', () => {
    expect(isRankedModifierSet({ ...DEFAULT_MODIFIERS, tapHolds: true })).toBe(false);
    expect(calculateScoreMultiplier({ ...DEFAULT_MODIFIERS, tapHolds: true })).toBe(
      calculateScoreMultiplier(DEFAULT_MODIFIERS),
    );
  });
});

describe('M10 — per-chart modifier legality', () => {
  const map = {
    incompatible: [{ key: 'spin', reason: 'This chart reads by lane position.' }],
  };

  it('turns a named modifier off rather than leaving it on and inert', () => {
    const out = legalFor({ ...DEFAULT_MODIFIERS, spin: true }, map);
    expect(out.spin).toBe(false);
  });

  it('never touches speed or difficulty — a chart does not dictate those', () => {
    const out = legalFor(
      { ...DEFAULT_MODIFIERS, speed: 1.5, difficulty: 'expert' },
      { incompatible: [{ key: 'speed', reason: 'nope' }] },
    );
    expect(out.speed).toBe(1.5);
    expect(out.difficulty).toBe('expert');
  });

  it('surfaces the chart’s own reason for the UI to show', () => {
    expect(incompatibleReason('spin', map)).toBe('This chart reads by lane position.');
    expect(incompatibleReason('bombs', map)).toBeNull();
  });

  it('still applies the global exclusions on the way out', () => {
    const out = legalFor({ ...DEFAULT_MODIFIERS, noFail: true, suddenDeath: true }, null);
    expect(out.suddenDeath).toBe(false);
  });
});

describe('M7 — presets normalise on the way out', () => {
  it('fills in a modifier that did not exist when the preset was saved', () => {
    // A preset stored before `sRandom` existed has no such key. Spreading it
    // over the defaults is what stops `undefined` reaching the engine.
    const stored = { speed: 1.2, difficulty: 'hard' } as Record<string, unknown>;
    const restored = applyExclusions({
      ...DEFAULT_MODIFIERS,
      ...stored,
    } as typeof DEFAULT_MODIFIERS);
    expect(restored.sRandom).toBe(false);
    expect(restored.speed).toBe(1.2);
  });
});
