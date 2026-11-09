/**
 * Zone maths for sampled instruments — pure. A zone is one recording; any other note is that
 * recording played faster or slower. Everything here is deterministic and tested.
 */
import type { Zone } from './types';

/** The velocity a tap sends when nothing says otherwise. */
export const DEFAULT_VELOCITY = 0.8;

const clamp01 = (v: number): number =>
  Number.isFinite(v) ? Math.min(1, Math.max(0.05, v)) : DEFAULT_VELOCITY;

/**
 * The zone closest to `midi` and the playback rate that lands on it, or null when none is within
 * `maxShift` semitones. A tie goes to the zone ABOVE: shifting a sample down keeps the timbre
 * fuller, shifting up thins it.
 */
export function nearestZone(
  zones: readonly Zone[],
  midi: number,
  maxShift: number,
): { zone: Zone; rate: number } | null {
  if (!Number.isFinite(midi)) return null;
  let best: Zone | null = null;
  let bestDist = Infinity;
  for (const zone of zones) {
    const dist = Math.abs(midi - zone.keyCenter);
    if (dist < bestDist || (dist === bestDist && best && zone.keyCenter > best.keyCenter)) {
      best = zone;
      bestDist = dist;
    }
  }
  if (!best || bestDist > maxShift + 1e-9) return null;
  return { zone: best, rate: playbackRate(midi, best) };
}

/**
 * `AudioBufferSourceNode.playbackRate` for `midi` from `zone`: the semitone distance plus the
 * zone's own tuning. (`detune` would do the same, but older Safari lacks it.)
 */
export function playbackRate(midi: number, zone: Pick<Zone, 'keyCenter' | 'tuneCents'>): number {
  return 2 ** ((midi - zone.keyCenter) / 12 + zone.tuneCents / 1200);
}

/** Linear gain for a velocity: never silent, 1 at full velocity. */
export function velocityGain(v: number): number {
  return 0.2 + 0.8 * clamp01(v) ** 1.6;
}

/** Low-pass cutoff (Hz) that darkens soft notes (the piano). */
export function velocityCutoffHz(v: number): number {
  return 700 + 11000 * clamp01(v) ** 1.5;
}

/**
 * Whether every integer note in `range` has a LOADED zone within `maxShift` semitones. `loaded`
 * holds the zones' `file` names.
 */
export function coverage(
  zones: readonly Zone[],
  loaded: ReadonlySet<string>,
  range: readonly [number, number],
  maxShift: number,
): boolean {
  const have = zones.filter((z) => loaded.has(z.file));
  for (let midi = range[0]; midi <= range[1]; midi++) {
    if (!nearestZone(have, midi, maxShift)) return false;
  }
  return true;
}
