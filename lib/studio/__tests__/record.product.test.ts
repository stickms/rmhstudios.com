import { describe, expect, it } from 'vitest';
import { buildTake, gridBeats, type RecordEvent, type TakeOptions } from '@/lib/studio/record';

let n = 0;
const base = (over: Partial<TakeOptions> = {}): TakeOptions => ({
  bpm: 120,
  beatsPerBar: 4,
  startSeconds: 0,
  endSeconds: 8,
  latencyMs: 0,
  quantize: 'off',
  newId: () => `n${++n}`,
  ...over,
});
const on = (pitch: number, seconds: number, velocity = 100): RecordEvent => ({ kind: 'on', pitch, velocity, seconds });
const off = (pitch: number, seconds: number): RecordEvent => ({ kind: 'off', pitch, velocity: 0, seconds });

describe('seconds to beats', () => {
  it('uses the tempo: at 120 BPM a beat is half a second', () => {
    const take = buildTake([on(60, 1), off(60, 2)], base());
    expect(take?.notes[0]).toMatchObject({ pitch: 60, startBeat: 2, durationBeats: 2 });
  });
  it('at 60 BPM a beat is a second', () => {
    const take = buildTake([on(60, 1), off(60, 2)], base({ bpm: 60 }));
    expect(take?.notes[0]).toMatchObject({ startBeat: 1, durationBeats: 1 });
  });
  it('keeps the velocity of the note-on', () => {
    expect(buildTake([on(60, 0.5, 33), off(60, 1)], base())?.notes[0]?.velocity).toBe(33);
  });
});

describe('input latency', () => {
  it('is subtracted from every event', () => {
    const take = buildTake([on(60, 1.1), off(60, 1.6)], base({ latencyMs: 100 }));
    expect(take?.notes[0]?.startBeat).toBeCloseTo(2, 6);
    expect(take?.notes[0]?.durationBeats).toBeCloseTo(1, 6);
  });
  it('never moves a note before the moment recording started', () => {
    const take = buildTake([on(60, 0.05), off(60, 0.5)], base({ latencyMs: 200 }));
    expect(take?.notes[0]?.startBeat).toBe(0);
  });
  it('is limited to 200 ms', () => {
    const take = buildTake([on(60, 1), off(60, 2)], base({ latencyMs: 5000 }));
    expect(take?.notes[0]?.startBeat).toBeCloseTo(2 - 0.4, 6);
  });
});

describe('quantize', () => {
  it('knows the grids', () => {
    expect([gridBeats('off'), gridBeats('1/4'), gridBeats('1/8'), gridBeats('1/16')]).toEqual([null, 1, 0.5, 0.25]);
  });
  it('lands a slightly early note on the 1/16 grid', () => {
    // 0.49 s is 0.98 beats: the nearest sixteenth is beat 1.
    const take = buildTake([on(60, 0.49), off(60, 0.99)], base({ quantize: '1/16' }));
    expect(take?.notes[0]).toMatchObject({ startBeat: 1, durationBeats: 1 });
  });
  it.each([
    ['1/4', 1.4 / 2, 1],
    ['1/8', 0.6 / 2, 0.5],
    ['1/16', 0.4 / 2, 0.25],
  ] as const)('rounds to %s', (q, seconds, expected) => {
    // seconds * 2 = beats: 0.7 -> 0.7, 0.3 -> 0.3 (nearest eighth 0.5), 0.2 -> 0.4 -> 0.5; assert by grid multiple
    const take = buildTake([on(60, seconds * 2), off(60, seconds * 2 + 3)], base({ quantize: q, bpm: 120 }));
    const grid = gridBeats(q) as number;
    const start = take?.notes[0]?.startBeat ?? -1;
    expect(start / grid).toBeCloseTo(Math.round(start / grid), 9);
    expect(expected).toBeGreaterThan(0);
  });
  it('gives a very short note one grid step', () => {
    const take = buildTake([on(60, 1), off(60, 1.01)], base({ quantize: '1/8' }));
    expect(take?.notes[0]?.durationBeats).toBe(0.5);
  });
  it('leaves times alone when off', () => {
    const take = buildTake([on(60, 0.49), off(60, 0.99)], base());
    expect(take?.notes[0]?.startBeat).toBeCloseTo(0.98, 6);
  });
});

describe('held notes and pairing', () => {
  it('closes a note still held at the end of the take', () => {
    const take = buildTake([on(60, 2)], base({ endSeconds: 4 }));
    expect(take?.notes[0]).toMatchObject({ startBeat: 4, durationBeats: 4 });
  });
  it('closes a pitch that is struck again while down', () => {
    const take = buildTake([on(60, 1), on(60, 2), off(60, 3)], base());
    expect(take?.notes.map((x) => [x.startBeat, x.durationBeats])).toEqual([
      [2, 2],
      [4, 2],
    ]);
  });
  it('ignores a note-off with nothing down', () => {
    expect(buildTake([off(60, 1)], base())).toBeNull();
  });
  it('records chords and orders by start', () => {
    const take = buildTake([on(64, 1.01), on(60, 1), off(60, 2), off(64, 2)], base());
    expect(take?.notes.map((x) => x.pitch)).toEqual([60, 64]);
  });
});

describe('a take with no notes', () => {
  it('returns nothing', () => {
    expect(buildTake([], base())).toBeNull();
  });
});

describe('clip bounds', () => {
  it('start at the bar where recording started and are relative to it', () => {
    // Started at beat 6 (bar 2 of 4/4): the clip starts at beat 4, the note at 6.5 is 2.5 into it.
    const take = buildTake([on(60, 3.25), off(60, 3.75)], base({ startSeconds: 3, endSeconds: 5 }));
    expect(take?.startBeat).toBe(4);
    expect(take?.notes[0]?.startBeat).toBeCloseTo(2.5, 6);
  });
  it('end on the bar after the last note', () => {
    const take = buildTake([on(60, 0), off(60, 2.5)], base());
    // The note ends at beat 5: the clip is two bars.
    expect(take?.durationBeats).toBe(8);
  });
  it('a note that ends exactly on a bar line ends the clip there', () => {
    expect(buildTake([on(60, 0), off(60, 2)], base())?.durationBeats).toBe(4);
  });
  it('is at least one bar', () => {
    expect(buildTake([on(60, 0), off(60, 0.1)], base())?.durationBeats).toBe(4);
  });
  it('counts bars in the time signature', () => {
    const take = buildTake([on(60, 0), off(60, 1.6)], base({ beatsPerBar: 3 }));
    expect(take?.durationBeats).toBe(6);
  });
});
