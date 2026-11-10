/**
 * Slice It chart editor — the beat grid, and time ↔ beat in both directions.
 *
 * Design doc: `docs/slice-it-chart-editor.md` §4.2.
 *
 * Everything here is driven by a timing map rather than a single BPM, because
 * the grid has to survive a tempo change even though nothing generates one yet
 * (C6, phase 8). A chart with no timing points gets `singleTimingPoint(bpm)`,
 * which is what every generated chart is today.
 */

import type { SnapDivision, TimingPoint } from './types';

/** Beat number at a time, across tempo changes. */
export function beatAt(time: number, points: readonly TimingPoint[]): number {
  if (points.length === 0) return 0;
  let beats = 0;
  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    const next = points[i + 1];
    if (next && next.time <= time) {
      beats += ((next.time - point.time) * point.bpm) / 60;
      continue;
    }
    return beats + ((time - point.time) * point.bpm) / 60;
  }
  return beats;
}

/**
 * Inverse: the time of a (possibly fractional) beat.
 *
 * Walks the same segments {@link beatAt} walks and stops in the one that
 * contains `beat`, so `timeAtBeat(beatAt(t)) === t` to floating-point precision
 * on both sides of every tempo change.
 */
export function timeAtBeat(beat: number, points: readonly TimingPoint[]): number {
  if (points.length === 0) return 0;
  let acc = 0;
  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    const next = points[i + 1];
    if (next) {
      const span = ((next.time - point.time) * point.bpm) / 60;
      // `<` not `<=`: a beat that lands exactly on the boundary belongs to the
      // segment that starts there, which is the same segment `beatAt` charges it
      // to. With `<=` the two disagree at the boundary and the round-trip drifts
      // by whatever the tempo change is.
      if (acc + span < beat) {
        acc += span;
        continue;
      }
    }
    return point.time + ((beat - acc) * 60) / point.bpm;
  }
  return points[0].time;
}

/**
 * Snap a time to the nearest subdivision.
 *
 * The generator quantises to `{0, ¼, ⅓, ½, ⅔, ¾}` of a beat and DROPS anything
 * further than 55 ms (or 18% of a beat) from every subdivision, because those
 * are reverb tails and vocal consonants. The editor offers finer divisions than
 * the generator uses, because a human placing a 1/16 roll deliberately is not
 * the same thing as an onset detector firing on a reverb tail.
 */
export function snapTime(
  time: number,
  division: SnapDivision,
  points: readonly TimingPoint[],
): number {
  const beat = beatAt(time, points);
  const snappedBeat = Math.round(beat * division) / division;
  return timeAtBeat(snappedBeat, points);
}

/** Grid line colour by metric weight — downbeat > beat > subdivision. */
export function gridWeight(beat: number, meter = 4): 'measure' | 'beat' | 'sub' {
  const epsilon = 1e-6;
  const safeMeter = meter > 0 ? meter : 4;
  const fromMeasure = Math.abs(beat - Math.round(beat / safeMeter) * safeMeter);
  if (fromMeasure < epsilon) return 'measure';
  if (Math.abs(beat - Math.round(beat)) < epsilon) return 'beat';
  return 'sub';
}

/** The meter in force at a time — the last timing point at or before it. */
export function meterAt(time: number, points: readonly TimingPoint[]): number {
  let meter = 4;
  for (const point of points) {
    if (point.time > time) break;
    meter = point.meter > 0 ? point.meter : 4;
  }
  return meter;
}

/**
 * The subdivisions the quantisation colouring (§4.3) recognises, coarsest first.
 * Order matters: a note on the beat is a 1/4, not a 1/8 that happens to line up.
 */
export const QUANT_DIVISIONS = [1, 2, 3, 4, 6, 8] as const;
export type QuantDivision = (typeof QUANT_DIVISIONS)[number] | 16;

/**
 * Which subdivision a note sits on.
 *
 * Derived from the note's position on the beat grid rather than stored, so it
 * stays correct when a timing point moves under it. 16 is the "off-grid" bucket —
 * rendered grey, and phase 7 will attach an `off-grid` lint issue to it.
 */
export function quantizationOf(time: number, points: readonly TimingPoint[]): QuantDivision {
  const beat = beatAt(time, points);
  for (const division of QUANT_DIVISIONS) {
    if (Math.abs(beat * division - Math.round(beat * division)) < 0.02) return division;
  }
  return 16;
}

/** Bar/beat/tick, for the ruler and the `aria-live` announcements (§14). */
export interface BarBeat {
  /** 1-based, the way musicians count. */
  bar: number;
  /** 1-based within the bar. */
  beat: number;
  /** Fraction of the way through that beat, 0–1. */
  fraction: number;
}

export function barBeatAt(time: number, points: readonly TimingPoint[]): BarBeat {
  const beat = beatAt(time, points);
  const meter = meterAt(time, points);
  const bar = Math.floor(beat / meter);
  const within = beat - bar * meter;
  const beatIndex = Math.floor(within);
  return { bar: bar + 1, beat: beatIndex + 1, fraction: within - beatIndex };
}

/** One snap unit, in seconds, at a given time. Used by the arrow-key transport. */
export function snapStepSeconds(
  time: number,
  division: SnapDivision,
  points: readonly TimingPoint[],
): number {
  const beat = beatAt(time, points);
  const next = timeAtBeat(beat + 1 / division, points);
  return Math.max(1e-4, next - time);
}

/**
 * Every grid line in `[startTime, endTime]`, at the current snap division.
 *
 * Capped, because zooming all the way out on a fifteen-minute track at 1/32 is
 * ~115 000 lines — none of them distinguishable, all of them drawn. Past the cap
 * the grid degrades to bar lines, which is what is legible at that zoom anyway.
 */
export function gridLines(
  startTime: number,
  endTime: number,
  division: SnapDivision,
  points: readonly TimingPoint[],
  maxLines = 2000,
): { time: number; beat: number; weight: 'measure' | 'beat' | 'sub' }[] {
  if (endTime <= startTime) return [];
  const firstBeat = beatAt(startTime, points);
  const lastBeat = beatAt(endTime, points);
  if (!Number.isFinite(firstBeat) || !Number.isFinite(lastBeat)) return [];

  const meter = meterAt(startTime, points);
  let step = 1 / division;
  if ((lastBeat - firstBeat) / step > maxLines) step = meter;
  if ((lastBeat - firstBeat) / step > maxLines) return [];

  const out: { time: number; beat: number; weight: 'measure' | 'beat' | 'sub' }[] = [];
  const start = Math.ceil(firstBeat / step - 1e-9) * step;
  for (let beat = start; beat <= lastBeat + 1e-9; beat += step) {
    // Re-round: accumulating `step` drifts, and a drifting grid is a grid that
    // stops agreeing with `snapTime`.
    const exact = Math.round(beat / step) * step;
    out.push({ time: timeAtBeat(exact, points), beat: exact, weight: gridWeight(exact, meter) });
  }
  return out;
}
