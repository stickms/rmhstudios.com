/**
 * V1 — reading a chart as notation.
 *
 * The load-bearing test here is the grouping one. Beaming looked correct on a
 * synthetic chart and was wrong on a real one, because a real chart's beat grid
 * has a PHASE against the audio clock's zero: the first note of every triplet
 * sat one side of a beat boundary and the other two sat on the other, so every
 * group of three rendered as a lone note plus a pair. The fixtures below carry
 * that phase on purpose.
 */

import { describe, expect, it } from 'vitest';
import { beamNeighbour, flagsForQuant, type BeamCandidate } from '../notation';

const BPM = 139.67;
const BEAT = 60 / BPM;

/** A run of `count` notes at `quant`, starting at `start` in one lane. */
function run(start: number, quant: number, count: number, lane = 0): BeamCandidate[] {
  const step = BEAT / quant;
  return Array.from({ length: count }, (_, i) => ({
    lane,
    time: start + i * step,
    type: 'STANDARD',
    quant,
  }));
}

/** Sizes of the beamed groups a run resolves into, left to right. */
function groupSizes(slices: BeamCandidate[]): number[] {
  const sizes: number[] = [];
  let current = 1;
  for (let i = 0; i < slices.length; i++) {
    const next = beamNeighbour(slices, i, 1, BEAT);
    if (next >= 0) current++;
    else {
      sizes.push(current);
      current = 1;
    }
  }
  return sizes;
}

describe('flags per subdivision', () => {
  it('follows notation', () => {
    expect(flagsForQuant(1)).toEqual({ flags: 0, triplet: false });
    expect(flagsForQuant(2)).toEqual({ flags: 1, triplet: false });
    expect(flagsForQuant(3)).toEqual({ flags: 1, triplet: true });
    expect(flagsForQuant(4)).toEqual({ flags: 2, triplet: false });
  });

  it('says nothing for a chart that says nothing', () => {
    // Not `{flags: 0}` — that is a quarter note, and `Slice.quant` documents
    // that a missing value must NOT be read as "on the beat". The renderer
    // draws a bare head for null, which claims nothing.
    expect(flagsForQuant(undefined)).toBeNull();
    expect(flagsForQuant(0)).toBeNull();
    expect(flagsForQuant(7)).toBeNull();
  });
});

describe('beam grouping', () => {
  it('groups a run into the size its rhythm has', () => {
    // Two beamed eighths, three beamed triplets, four beamed sixteenths.
    expect(groupSizes(run(0, 2, 8))).toEqual([2, 2, 2, 2]);
    expect(groupSizes(run(0, 3, 9))).toEqual([3, 3, 3]);
    expect(groupSizes(run(0, 4, 12))).toEqual([4, 4, 4]);
  });

  it('survives a beat grid that is out of phase with the clock', () => {
    // The bug this file exists for. 79.0213 is where the harness chart's
    // triplet run actually started, and it is nowhere near a beat boundary.
    expect(groupSizes(run(79.0213, 3, 9))).toEqual([3, 3, 3]);
    expect(groupSizes(run(79.0213, 4, 12))).toEqual([4, 4, 4]);
    // A phase offset may cost one SHORT group at the head of a run, but never
    // a wrong-sized one after it.
    for (const offset of [0.031, 0.07, 0.111, 0.2]) {
      const sizes = groupSizes(run(offset, 4, 16));
      expect(sizes.slice(1, -1).every((n) => n === 4), `offset ${offset}: ${sizes}`).toBe(true);
      expect(sizes.reduce((a, b) => a + b, 0)).toBe(16);
    }
  });

  it('never joins notes a player does not hear as a group', () => {
    const quarters = run(0, 1, 4);
    // A quarter note has no flag, so there is nothing to beam with.
    expect(groupSizes(quarters)).toEqual([1, 1, 1, 1]);

    // Different subdivisions do not share a beam.
    const mixed: BeamCandidate[] = [
      { lane: 0, time: 0, type: 'STANDARD', quant: 2 },
      { lane: 0, time: BEAT / 2, type: 'STANDARD', quant: 4 },
    ];
    expect(beamNeighbour(mixed, 0, 1, BEAT)).toBe(-1);

    // A gap wider than the subdivision ends the group.
    const gapped: BeamCandidate[] = [
      { lane: 0, time: 0, type: 'STANDARD', quant: 2 },
      { lane: 0, time: BEAT * 1.5, type: 'STANDARD', quant: 2 },
    ];
    expect(beamNeighbour(gapped, 0, 1, BEAT)).toBe(-1);

    // A hold or a bomb is not a tap and ends the group.
    const interrupted: BeamCandidate[] = [
      { lane: 0, time: 0, type: 'STANDARD', quant: 2 },
      { lane: 0, time: BEAT / 2, type: 'LONG', quant: 2 },
    ];
    expect(beamNeighbour(interrupted, 0, 1, BEAT)).toBe(-1);
  });

  it('steps over the other lane rather than ending the group', () => {
    // The array is time-sorted across BOTH lanes, so a partner is usually not
    // the adjacent entry. Treating the other lane as a terminator would mean
    // nothing ever beams on a chart that uses both.
    const interleaved: BeamCandidate[] = [];
    for (const note of run(0, 4, 4)) {
      interleaved.push(note, { ...note, lane: 1 });
    }
    interleaved.sort((a, b) => a.time - b.time || a.lane - b.lane);
    expect(groupSizes(interleaved.filter((n) => n.lane === 0))).toEqual([4]);
    // And in place, against the full interleaved array.
    const first = interleaved.findIndex((n) => n.lane === 0);
    expect(beamNeighbour(interleaved, first, 1, BEAT)).toBeGreaterThan(first);
    expect(interleaved[beamNeighbour(interleaved, first, 1, BEAT)].lane).toBe(0);
  });

  it('looks both ways', () => {
    const notes = run(0, 4, 4);
    expect(beamNeighbour(notes, 0, -1, BEAT)).toBe(-1);
    expect(beamNeighbour(notes, 1, -1, BEAT)).toBe(0);
    expect(beamNeighbour(notes, 3, 1, BEAT)).toBe(-1);
  });

  it('refuses to divide by a tempo it does not have', () => {
    const notes = run(0, 4, 4);
    expect(beamNeighbour(notes, 0, 1, 0)).toBe(-1);
    expect(beamNeighbour(notes, 0, 1, Number.NaN)).toBe(-1);
  });

  it('cannot walk the whole chart looking for a partner', () => {
    // Bounded because it runs per visible note per frame. A lane-0 note with a
    // wall of lane-1 notes after it must give up, not scan to the end.
    const wall: BeamCandidate[] = [
      { lane: 0, time: 0, type: 'STANDARD', quant: 4 },
      ...Array.from({ length: 200 }, (_, i) => ({
        lane: 1,
        time: 0.001 * (i + 1),
        type: 'STANDARD',
        quant: 4,
      })),
    ];
    expect(beamNeighbour(wall, 0, 1, BEAT)).toBe(-1);
  });
});
