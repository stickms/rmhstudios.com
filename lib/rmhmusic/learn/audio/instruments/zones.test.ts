import { describe, expect, it } from 'vitest';
import {
  coverage,
  nearestZone,
  playbackRate,
  velocityCutoffHz,
  velocityGain,
  DEFAULT_VELOCITY,
} from './zones';
import type { Zone } from './types';

const z = (keyCenter: number, tuneCents = 0): Zone => ({
  file: `${keyCenter}.mp3`,
  keyCenter,
  tuneCents,
  gainDb: 0,
  startOffsetS: 0,
  durationS: 3,
});

describe('nearestZone', () => {
  const zones = [z(60), z(63), z(66)];
  it('picks the closest key centre and its rate', () => {
    const hit = nearestZone(zones, 62, 1);
    expect(hit?.zone.keyCenter).toBe(63);
    expect(hit?.rate).toBeCloseTo(2 ** (-1 / 12), 10);
  });
  it('sends a tie to the zone above (shifting down keeps the timbre fuller)', () => {
    expect(nearestZone([z(60), z(62)], 61, 1)?.zone.keyCenter).toBe(62);
  });
  it('is null beyond maxShift, for no zones and for a bad note', () => {
    expect(nearestZone(zones, 68, 1)).toBeNull();
    expect(nearestZone(zones, 61, 0)).toBeNull();
    expect(nearestZone([], 60, 2)).toBeNull();
    expect(nearestZone(zones, Number.NaN, 2)).toBeNull();
  });
  it('does not depend on the order of the zones', () => {
    expect(nearestZone([z(66), z(60), z(63)], 61, 1)?.zone.keyCenter).toBe(60);
  });
});

describe('playbackRate', () => {
  it('is exactly 1 on the key centre with no tuning', () => {
    expect(playbackRate(60, z(60))).toBe(1);
  });
  it('adds the zone tuning in cents', () => {
    expect(playbackRate(61, z(60, -6))).toBeCloseTo(2 ** (1 / 12 - 6 / 1200), 12);
  });
  it('doubles an octave up', () => {
    expect(playbackRate(72, z(60))).toBe(2);
  });
});

describe('velocity curves', () => {
  it('velocityGain is monotone, finite at both ends, and defaults on NaN', () => {
    expect(velocityGain(0)).toBeGreaterThan(0.2);
    expect(velocityGain(1)).toBeCloseTo(1, 10);
    let last = 0;
    for (let v = 0; v <= 1.0001; v += 0.05) {
      const g = velocityGain(v);
      expect(Number.isFinite(g)).toBe(true);
      expect(g).toBeGreaterThanOrEqual(last);
      last = g;
    }
    expect(velocityGain(Number.NaN)).toBe(velocityGain(DEFAULT_VELOCITY));
    expect(velocityGain(5)).toBe(velocityGain(1));
  });
  it('velocityCutoffHz rises with velocity and stays finite', () => {
    expect(velocityCutoffHz(1)).toBeCloseTo(11700, 6);
    expect(velocityCutoffHz(0.2)).toBeLessThan(velocityCutoffHz(0.9));
    expect(Number.isFinite(velocityCutoffHz(Number.NaN))).toBe(true);
  });
});

describe('coverage', () => {
  const every3 = Array.from({ length: 21 }, (_, i) => z(36 + i * 3));
  const all = new Set(every3.map((x) => x.file));
  it('is true when every note in range has a loaded zone within the shift', () => {
    expect(coverage(every3, all, [36, 96], 1)).toBe(true);
  });
  it('is false with shift 0 on zones three semitones apart', () => {
    expect(coverage(every3, all, [36, 96], 0)).toBe(false);
  });
  it('is false while a zone is missing, true once it loads', () => {
    const loaded = new Set(all);
    loaded.delete('60.mp3');
    expect(coverage(every3, loaded, [36, 96], 1)).toBe(false);
    loaded.add('60.mp3');
    expect(coverage(every3, loaded, [36, 96], 1)).toBe(true);
  });
  it('a nearby loaded zone covers for a failed one when the shift allows', () => {
    const loaded = new Set(all);
    loaded.delete('60.mp3');
    expect(coverage(every3, loaded, [58, 62], 3)).toBe(true);
  });
});
