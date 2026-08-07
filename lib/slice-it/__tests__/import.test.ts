/**
 * C9 — importing charts from other games.
 *
 * The tests that matter are about the two things a conversion silently gets
 * wrong: the column formula (off by one lane looks like a bad chart, not a bad
 * constant) and the timing map (a chart imported with one BPM against a file
 * that changes tempo does not drift a little — it drifts unboundedly).
 */

import { describe, expect, it } from 'vitest';
import {
  ImportError,
  beatToSeconds,
  dedupeFolded,
  detectFormat,
  foldLanes,
  importChart,
  parseChart,
  parseOsu,
  parseStepMania,
} from '../import';
import { biasedBudget } from '../beatmap/charter';

const OSU = `osu file format v14

[General]
Mode: 3

[Metadata]
Title:Test Track
Artist:Someone
Version:Another

[Difficulty]
CircleSize:4

[HitObjects]
64,192,1000,1,0,0:0:0:0:
192,192,1500,1,0,0:0:0:0:
320,192,2000,128,0,2500:0:0:0:0:
448,192,3000,1,0,0:0:0:0:
`;

const SM = `#TITLE:Test;
#ARTIST:Someone;
#OFFSET:0.000;
#BPMS:0.000=120.000;
#NOTES:
     dance-single:
     :
     Challenge:
     10:
     0,0,0,0,0:
1000
0100
0010
0001
,
1000
0000
0000
0000
;
`;

const CHART = `[Song]
{
  Name = "Test"
  Artist = "Someone"
  Resolution = 192
}
[SyncTrack]
{
  0 = B 120000
}
[ExpertSingle]
{
  0 = N 0 0
  192 = N 4 0
  384 = N 2 192
  576 = N 0 0
  576 = N 5 0
}
`;

describe('format detection', () => {
  it('reads the file, not the extension', () => {
    expect(detectFormat(OSU)).toBe('osu');
    expect(detectFormat(SM)).toBe('stepmania');
    expect(detectFormat(CHART)).toBe('chart');
    expect(detectFormat('just some text')).toBeNull();
  });
});

describe('lane folding', () => {
  it('folds by position so hands stay on hands', () => {
    // Round-robin (`column % 2`) turns an alternating 4K stream into a jack,
    // which is unplayable and reads as the import being broken.
    expect([0, 1, 2, 3].map((c) => foldLanes(c, 4))).toEqual([0, 0, 1, 1]);
    expect([0, 1, 2, 3, 4, 5, 6].map((c) => foldLanes(c, 7))).toEqual([0, 0, 0, 0, 1, 1, 1]);
  });

  it('handles a one-key source', () => {
    expect(foldLanes(0, 1)).toBe(0);
  });

  it('drops folded notes that cannot be hit, and says how many', () => {
    // Folding turns a source chord into two notes on one lane at gap zero,
    // which the engine's per-lane debounce makes literally unhittable.
    const chord = [
      { id: 'a', time: 1, lane: 0, type: 'STANDARD' as const },
      { id: 'b', time: 1, lane: 0, type: 'STANDARD' as const },
      { id: 'c', time: 1, lane: 1, type: 'STANDARD' as const },
    ];
    const result = dedupeFolded(chord, 0.03);
    expect(result.dropped).toBe(1);
    expect(result.notes).toHaveLength(2);
    // Both lanes survive — the drop is per lane, not per instant.
    expect(new Set(result.notes.map((n) => n.lane))).toEqual(new Set([0, 1]));
  });
});

describe('osu!mania', () => {
  it('refuses a non-mania chart', () => {
    // Standard's x/y are positions on a circle; importing one would attach real
    // note times to meaningless lanes.
    expect(() => parseOsu(OSU.replace('Mode: 3', 'Mode: 0'))).toThrow(ImportError);
  });

  it('uses the 512-unit column formula', () => {
    // x=64 → column 0, x=192 → column 1, x=320 → column 2, x=448 → column 3 at
    // 4K. Off by one here shifts every note a lane.
    const chart = parseOsu(OSU);
    expect(chart.notes.map((n) => n.lane)).toEqual([0, 0, 1, 1]);
  });

  it('reads a hold’s end time out of the extras field', () => {
    const hold = parseOsu(OSU).notes.find((n) => n.type === 'LONG');
    expect(hold).toBeDefined();
    expect(hold!.duration).toBeCloseTo(0.5, 3);
  });

  it('carries the source metadata across', () => {
    const chart = parseOsu(OSU);
    expect(chart.title).toBe('Test Track');
    expect(chart.artist).toBe('Someone');
    expect(chart.name).toBe('Another');
    expect(chart.warnings.some((w) => w.includes('4 columns'))).toBe(true);
  });

  it('refuses a file with no hit objects', () => {
    expect(() => parseOsu(OSU.replace(/^\d+,192.*$/gm, ''))).toThrow(ImportError);
  });
});

describe('StepMania', () => {
  it('refuses a file with no BPM map', () => {
    // The BPM list is not decoration: it IS the timing, and without it a chart
    // does not drift a little, it drifts unboundedly.
    expect(() => parseStepMania(SM.replace(/#BPMS:[^;]*;/, ''))).toThrow(ImportError);
  });

  it('times rows from the measure subdivision', () => {
    // 120 BPM, 4 rows in a measure: 0.5 s per row.
    const times = parseStepMania(SM).notes.map((n) => n.time);
    expect(times[0]).toBeCloseTo(0, 3);
    expect(times[1]).toBeCloseTo(0.5, 3);
    expect(times[2]).toBeCloseTo(1.0, 3);
    expect(times[3]).toBeCloseTo(1.5, 3);
    // Second measure starts at beat 4 = 2 s.
    expect(times[4]).toBeCloseTo(2.0, 3);
  });

  it('subtracts the offset, per StepMania’s inverted sign convention', () => {
    const shifted = parseStepMania(SM.replace('#OFFSET:0.000;', '#OFFSET:0.100;'));
    expect(shifted.notes[0].time).toBeCloseTo(-0.1, 3);
  });

  it('walks a mid-song BPM change', () => {
    const bpms = [
      { beat: 0, bpm: 120 },
      { beat: 4, bpm: 240 },
    ];
    // First 4 beats at 120 = 2 s; the next 4 at 240 = 1 s.
    expect(beatToSeconds(4, bpms)).toBeCloseTo(2, 6);
    expect(beatToSeconds(8, bpms)).toBeCloseTo(3, 6);
  });

  it('pairs hold heads with their tails and ignores an orphan tail', () => {
    const withHold = SM.replace('1000\n0100\n0010\n0001', '2000\n0000\n3000\n0001');
    const chart = parseStepMania(withHold);
    const hold = chart.notes.find((n) => n.type === 'LONG');
    expect(hold?.duration).toBeCloseTo(1.0, 3);

    // A tail with no head is malformed input, not a crash.
    const orphan = SM.replace('1000\n0100\n0010\n0001', '3000\n0000\n0000\n0001');
    expect(parseStepMania(orphan).notes.every((n) => n.type === 'STANDARD')).toBe(true);
  });

  it('says so when it converts a roll to a hold', () => {
    const withRoll = SM.replace('1000\n0100\n0010\n0001', '4000\n0000\n3000\n0001');
    expect(parseStepMania(withRoll).warnings.some((w) => w.includes('Roll'))).toBe(true);
  });

  it('skips mines rather than charting them', () => {
    const withMine = SM.replace('0100', 'M000');
    expect(parseStepMania(withMine).notes).toHaveLength(4);
  });
});

describe('Clone Hero .chart', () => {
  it('times ticks against the stated resolution', () => {
    // Resolution 192 at 120 BPM: 192 ticks = 1 beat = 0.5 s.
    const chart = parseChart(CHART);
    expect(chart.notes[0].time).toBeCloseTo(0, 3);
    expect(chart.notes[1].time).toBeCloseTo(0.5, 3);
  });

  it('reads a sustain as a hold', () => {
    const sustain = parseChart(CHART).notes.find((n) => n.type === 'LONG');
    expect(sustain?.duration).toBeCloseTo(0.5, 3);
  });

  it('ignores the force and tap modifier frets', () => {
    // 5 and 6 are flags, not notes; charting them doubles the note at that tick.
    expect(parseChart(CHART).notes).toHaveLength(4);
  });

  it('falls back to 120 BPM rather than failing on an empty SyncTrack', () => {
    const noTempo = CHART.replace('0 = B 120000', '');
    expect(parseChart(noTempo).notes[1].time).toBeCloseTo(0.5, 3);
  });

  it('refuses a file with no note track', () => {
    expect(() => parseChart(CHART.replace('ExpertSingle', 'PartVocals'))).toThrow(ImportError);
  });
});

describe('importChart', () => {
  it('renumbers ids densely after dropping', () => {
    const chart = importChart(OSU, 0.03);
    expect(chart.notes.map((n) => n.id)).toEqual(chart.notes.map((_, i) => `i${i}`));
  });

  it('tells the uploader what the fold cost', () => {
    // Two 4K notes at the same instant in the same half of the playfield.
    const chorded = OSU.replace(
      '64,192,1000,1,0,0:0:0:0:',
      '64,192,1000,1,0,0:0:0:0:\n192,192,1000,1,0,0:0:0:0:',
    );
    const chart = importChart(chorded, 0.03);
    expect(chart.warnings.some((w) => w.includes('unhittable'))).toBe(true);
  });

  it('refuses something that is not a chart at all', () => {
    expect(() => importChart('hello', 0.03)).toThrow(ImportError);
  });
});

describe('C10 — the density bias', () => {
  it('is exponential, so −2 is about half and +2 about double', () => {
    // Linear steps of 0.25 deliver neither, because a 25% cut at the sparse end
    // is a handful of notes.
    expect(biasedBudget(1000, 0)).toBe(1000);
    expect(biasedBudget(1000, -2)).toBeLessThan(500);
    expect(biasedBudget(1000, 2)).toBeGreaterThan(2000);
    expect(biasedBudget(1000, -1)).toBeLessThan(750);
  });

  it('clamps out of range, and survives a garbage value', () => {
    expect(biasedBudget(1000, -50)).toBe(biasedBudget(1000, -2));
    expect(biasedBudget(1000, 50)).toBe(biasedBudget(1000, 2));
    expect(biasedBudget(1000, NaN)).toBe(1000);
  });

  it('keeps the floor of 8 outside the bias', () => {
    // A chart with three notes in it is not a chart, however sparse the
    // uploader asked for.
    expect(biasedBudget(4, -2)).toBe(8);
  });
});
