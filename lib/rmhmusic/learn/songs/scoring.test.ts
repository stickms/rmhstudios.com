import { describe, expect, it } from 'vitest';
import { PERFECT_MS, ZERO_MS } from '../scoring/timing';
import { songById } from './catalog';
import { notesOf } from './score';
import { checkSongRun, summarizePlay, summarizeWait, timingPoints, waitPoints, type PlayNoteResult } from './scoring';

const right = (offMs: number): PlayNoteResult => ({
  outcome: 'right',
  offMs,
});
const wrong = (offMs: number): PlayNoteResult => ({
  outcome: 'wrong',
  offMs,
});
const missed: PlayNoteResult = {
  outcome: 'missed',
  offMs: null,
};

describe('waitPoints', () => {
  it('is 100 first time, 50 after one wrong note, 0 after more', () => {
    expect(waitPoints(0)).toBe(100);
    expect(waitPoints(1)).toBe(50);
    expect(waitPoints(2)).toBe(0);
    expect(waitPoints(9)).toBe(0);
    expect(waitPoints(-1)).toBe(0);
    expect(waitPoints(Number.NaN)).toBe(0);
  });
});

describe('timingPoints', () => {
  it('uses the tap lesson windows: full marks within PERFECT_MS, nothing at ZERO_MS', () => {
    expect(timingPoints(0)).toBe(100);
    expect(timingPoints(PERFECT_MS)).toBe(100);
    expect(timingPoints(-PERFECT_MS)).toBe(100);
    expect(timingPoints((PERFECT_MS + ZERO_MS) / 2)).toBeCloseTo(50, 5);
    expect(timingPoints(ZERO_MS)).toBe(0);
    expect(timingPoints(-ZERO_MS - 1)).toBe(0);
    expect(timingPoints(Number.NaN)).toBe(0);
  });
});

describe('summarizePlay', () => {
  it('scores every note in time with three stars', () => {
    const s = summarizePlay([right(0), right(10), right(-60), right(70)], 0);
    expect(s).toEqual({
      score: 100,
      stars: 3,
      right: 4,
      total: 4,
      early: 0,
      late: 0,
      wrong: 0,
      missed: 0,
      extras: 0,
    });
  });

  it('scores late notes lower and counts them', () => {
    const s = summarizePlay([right(150), right(150), right(0), right(0)], 0);
    expect(s.score).toBeLessThan(100);
    expect(s.late).toBe(2);
    expect(s.right).toBe(4);
  });

  it('gives a wrong or missed note nothing, and charges an extra note half a note', () => {
    expect(summarizePlay([right(0), wrong(0), missed, right(0)], 0)).toEqual(
      expect.objectContaining({
        score: 50,
        right: 2,
        wrong: 1,
        missed: 1,
      }),
    );
    expect(summarizePlay([right(0), right(0), right(0), right(0)], 1).score).toBe(88);
    expect(summarizePlay([right(0)], 9).score).toBe(0);
  });

  it('scores an empty run 0', () => {
    expect(summarizePlay([], 0).score).toBe(0);
  });
});

describe('summarizeWait', () => {
  it('is the mean of the notes’ points, counting the notes right first time', () => {
    const s = summarizeWait([0, 0, 1, 3]);
    expect(s.score).toBe(63);
    expect(s.right).toBe(2);
    expect(s.wrong).toBe(2);
    expect(s.total).toBe(4);
    expect(s.stars).toBe(1);
  });
});

describe('checkSongRun (what the server keeps)', () => {
  const song = songById('mary-had-a-little-lamb');
  if (!song) throw new Error('song');
  const n = notesOf(song).length;

  it('recomputes a wait run from its wrong counts, ignoring any score the client sent', () => {
    expect(
      checkSongRun(song, {
        mode: 'wait',
        wrong: new Array<number>(n).fill(0),
      })?.score,
    ).toBe(100);
    expect(
      checkSongRun(song, {
        mode: 'wait',
        wrong: new Array<number>(n).fill(1),
      })?.score,
    ).toBe(50);
  });

  it('recomputes a play run from each note and its timing', () => {
    const perfect = new Array<PlayNoteResult>(n).fill(right(0));
    expect(
      checkSongRun(song, {
        mode: 'play',
        notes: perfect,
        extras: 0,
      })?.score,
    ).toBe(100);
    const late = new Array<PlayNoteResult>(n).fill(right(150));
    expect(
      checkSongRun(song, {
        mode: 'play',
        notes: late,
        extras: 0,
      })?.score,
    ).toBeLessThan(60);
  });

  it('refuses a run of the wrong length or with impossible results', () => {
    expect(
      checkSongRun(song, {
        mode: 'wait',
        wrong: [0, 0],
      }),
    ).toBeNull();
    expect(
      checkSongRun(song, {
        mode: 'wait',
        wrong: new Array<number>(n).fill(-1),
      }),
    ).toBeNull();
    expect(
      checkSongRun(song, {
        mode: 'wait',
        wrong: new Array<number>(n).fill(0.5),
      }),
    ).toBeNull();
    const far = new Array<PlayNoteResult>(n).fill(right(ZERO_MS + 1));
    expect(
      checkSongRun(song, {
        mode: 'play',
        notes: far,
        extras: 0,
      }),
    ).toBeNull();
    const untimed = new Array<PlayNoteResult>(n).fill({
      outcome: 'right',
      offMs: null,
    });
    expect(
      checkSongRun(song, {
        mode: 'play',
        notes: untimed,
        extras: 0,
      }),
    ).toBeNull();
    const timedMiss = new Array<PlayNoteResult>(n).fill({
      outcome: 'missed',
      offMs: 3,
    });
    expect(
      checkSongRun(song, {
        mode: 'play',
        notes: timedMiss,
        extras: 0,
      }),
    ).toBeNull();
    const perfect = new Array<PlayNoteResult>(n).fill(right(0));
    expect(
      checkSongRun(song, {
        mode: 'play',
        notes: perfect,
        extras: -1,
      }),
    ).toBeNull();
    expect(
      checkSongRun(song, {
        mode: 'play',
        notes: perfect,
        extras: 4 * n + 1,
      }),
    ).toBeNull();
  });
});
