import { describe, expect, it } from 'vitest';
import { createRunner } from '../machines/runner';
import { PERFECT_MS } from '../scoring/timing';
import { createSongMachine } from './machine';
import { parseBars } from './notation';
import { notesOf, type Song } from './score';
import { checkSongRun, type PlayNoteResult, type SongRunRecord } from './scoring';
import {
  MAX_MERGED_BARS,
  MAX_SEGMENTS,
  MAX_SEGMENT_BARS,
  MAX_TEMPO_PCT,
  MIN_BPM,
  MIN_TEMPO_PCT,
  START_TEMPO_PCT,
  autoLoops,
  barNumber,
  barProblems,
  nextTempoPct,
  passProblems,
  problemNotes,
  segmentSong,
  spotBpm,
  spotReducer,
  spotSegments,
  type SpotState,
} from './spot';

/** Twelve bars of four quarter notes: note n is in bar floor(n / 4). */
const BAR = 'C4 D4 E4 F4 |';
function songOf(bars: number, pickup = 0): Song {
  return {
    id: 'twelve',
    title: 'Twelve',
    composer: 'Traditional',
    key: 'C',
    beatsPerBar: 4,
    bpm: 100,
    pickup,
    bars: parseBars(BAR.repeat(bars)),
  };
}
const SONG = songOf(12);

const RIGHT: PlayNoteResult = { outcome: 'right', offMs: 0 };
const MISSED: PlayNoteResult = { outcome: 'missed', offMs: null };

/** A play-along record for `song` where the notes of the bars in `weak` (a bar → how many) were missed. */
function playRecord(song: Song, weak: Record<number, number>): SongRunRecord {
  const seen: Record<number, number> = {};
  return {
    mode: 'play',
    extras: 0,
    notes: notesOf(song).map((n) => {
      seen[n.bar] = (seen[n.bar] ?? 0) + 1;
      return seen[n.bar]! <= (weak[n.bar] ?? 0) ? MISSED : RIGHT;
    }),
  };
}

describe('problem notes', () => {
  it('Wait for me: a note with a wrong note before it is a problem', () => {
    expect(problemNotes({ mode: 'wait', wrong: [0, 1, 0, 3] })).toEqual([false, true, false, true]);
  });

  it('play along: missed, wrong and far-off notes are problems; a note a little off is not', () => {
    const record: SongRunRecord = {
      mode: 'play',
      extras: 0,
      notes: [
        { outcome: 'right', offMs: 0 },
        { outcome: 'right', offMs: PERFECT_MS + 20 }, // a little late: still most of the points
        { outcome: 'right', offMs: 150 }, // under half the points
        { outcome: 'wrong', offMs: 30 },
        { outcome: 'missed', offMs: null },
      ],
    };
    expect(problemNotes(record)).toEqual([false, false, true, true, true]);
    expect(passProblems(record)).toBe(3);
  });

  it('counts problems per bar of the song', () => {
    expect(barProblems(SONG, playRecord(SONG, { 2: 1, 5: 3 }))).toEqual([0, 0, 1, 0, 0, 3, 0, 0, 0, 0, 0, 0]);
  });
});

describe('spotSegments', () => {
  it('is empty when nothing was wrong', () => {
    expect(spotSegments(SONG, playRecord(SONG, {}))).toEqual([]);
  });

  it('gives one weak bar a lead-in bar, and names both bars as the score numbers them', () => {
    const [seg, ...rest] = spotSegments(SONG, playRecord(SONG, { 5: 2 }));
    expect(rest).toEqual([]);
    expect(seg).toMatchObject({ from: 4, to: 5, weakFrom: 5, weakTo: 5, problems: 2, fromNumber: 5, toNumber: 6 });
  });

  it('has no lead-in before the first bar', () => {
    const [seg] = spotSegments(SONG, playRecord(SONG, { 0: 1 }));
    expect(seg).toMatchObject({ from: 0, to: 0, fromNumber: 1, toNumber: 1 });
  });

  it('joins consecutive weak bars into one segment', () => {
    const segs = spotSegments(SONG, playRecord(SONG, { 4: 1, 5: 2, 6: 1 }));
    expect(segs).toHaveLength(1);
    expect(segs[0]).toMatchObject({ from: 3, to: 6, weakFrom: 4, weakTo: 6, problems: 4 });
  });

  it('merges two segments that touch (one clean bar between the weak bars) while it stays short', () => {
    const segs = spotSegments(SONG, playRecord(SONG, { 2: 1, 4: 1 }));
    // Bar 2 with lead-in 1 is [1..2]; bar 4 with lead-in 3 is [3..4]: they touch.
    expect(segs).toHaveLength(1);
    expect(segs[0]).toMatchObject({ from: 1, to: 4, problems: 2 });
  });

  it('keeps separate segments that are apart, worst first, ties in song order', () => {
    const segs = spotSegments(SONG, playRecord(SONG, { 1: 1, 6: 3, 10: 1 }));
    expect(segs.map((s) => [s.weakFrom, s.problems])).toEqual([
      [6, 3],
      [1, 1],
      [10, 1],
    ]);
  });

  it(`offers at most ${MAX_SEGMENTS}, dropping the least wrong`, () => {
    const segs = spotSegments(SONG, playRecord(SONG, { 0: 1, 3: 2, 6: 3, 9: 4 }));
    expect(segs).toHaveLength(MAX_SEGMENTS);
    expect(segs.map((s) => s.problems)).toEqual([4, 3, 2]);
  });

  it('cuts a long run of weak bars into pieces, none longer than the cap plus the lead-in bar', () => {
    const all = Object.fromEntries([0, 1, 2, 3, 4, 5, 6, 7, 8].map((b) => [b, 1]));
    const segs = spotSegments(SONG, playRecord(SONG, all));
    expect(segs.length).toBeGreaterThan(1);
    for (const s of segs)
      expect(s.to - s.from + 1).toBeLessThanOrEqual(Math.max(MAX_MERGED_BARS, MAX_SEGMENT_BARS + 1));
  });

  it('numbers an opening pickup 0 and the first full bar 1', () => {
    const song = songOf(5, 2);
    expect(barNumber(song, 0)).toBe(0);
    expect(barNumber(song, 1)).toBe(1);
    expect(barNumber(SONG, 0)).toBe(1);
    // Weak bar 1 (the first full bar) is led in by the pickup bar.
    const [seg] = spotSegments(song, playRecord(song, { 1: 1 }));
    expect(seg).toMatchObject({ from: 0, to: 1, fromNumber: 0, toNumber: 1 });
  });

  it('reads a Wait for me run too', () => {
    const wrong = notesOf(SONG).map((n) => (n.bar === 7 ? 2 : 0));
    const segs = spotSegments(SONG, { mode: 'wait', wrong });
    expect(segs).toHaveLength(1);
    expect(segs[0]).toMatchObject({ weakFrom: 7, weakTo: 7, problems: 4 });
  });
});

describe('segmentSong', () => {
  it('is just the segment bars, with the song otherwise as it was', () => {
    const seg = { from: 4, to: 5 };
    const part = segmentSong(SONG, seg);
    expect(part.bars).toEqual(SONG.bars.slice(4, 6));
    expect(part).toMatchObject({ id: SONG.id, bpm: SONG.bpm, key: SONG.key, beatsPerBar: 4, pickup: 0 });
    expect(notesOf(part)).toHaveLength(8);
    expect(notesOf(part)[0]).toMatchObject({ bar: 0, onset: 0 });
  });

  it('keeps the pickup only when the segment starts at the song start', () => {
    const song = songOf(5, 2);
    expect(segmentSong(song, { from: 0, to: 1 }).pickup).toBe(2);
    expect(segmentSong(song, { from: 1, to: 2 }).pickup).toBe(0);
  });
});

describe('tempo', () => {
  it('starts at 60%, speeds up 10 points after a clean pass and stops at the song tempo', () => {
    expect(START_TEMPO_PCT).toBe(60);
    expect(nextTempoPct(60, 0)).toBe(70);
    expect(nextTempoPct(95, 0)).toBe(100);
    expect(nextTempoPct(MAX_TEMPO_PCT, 0)).toBe(MAX_TEMPO_PCT);
  });

  it('repeats the tempo after one or two problems and drops a step after three or more, never below 50%', () => {
    expect(nextTempoPct(80, 1)).toBe(80);
    expect(nextTempoPct(80, 2)).toBe(80);
    expect(nextTempoPct(80, 3)).toBe(70);
    expect(nextTempoPct(80, 40)).toBe(70);
    expect(nextTempoPct(MIN_TEMPO_PCT + 5, 5)).toBe(MIN_TEMPO_PCT);
    expect(nextTempoPct(MIN_TEMPO_PCT, 5)).toBe(MIN_TEMPO_PCT);
  });

  it('turns a percentage into a metronome tempo, repairing nonsense and never going near zero', () => {
    expect(spotBpm(SONG, 60)).toBe(60);
    expect(spotBpm(SONG, 100)).toBe(100);
    expect(spotBpm({ ...SONG, bpm: 120 }, 70)).toBe(84);
    expect(spotBpm(SONG, Number.NaN)).toBe(60);
    expect(spotBpm(SONG, 5)).toBe(50);
    expect(spotBpm({ ...SONG, bpm: 10 }, 50)).toBe(MIN_BPM);
  });
});

describe('spotReducer', () => {
  const segments = spotSegments(SONG, playRecord(SONG, { 1: 1, 6: 3, 10: 1 }));
  const open = (mode: 'play' | 'wait') => spotReducer(null, { type: 'open', segments, mode }) as SpotState;

  it('opens on the worst segment, looping, at 60% in play along and with no tempo in Wait for me', () => {
    expect(open('play')).toMatchObject({ index: 0, tempoPct: 60, pass: 0, looping: true, last: null });
    expect(open('wait')).toMatchObject({ tempoPct: null });
  });

  it('does not open with nothing to practise, and ignores everything while closed', () => {
    expect(spotReducer(null, { type: 'open', segments: [], mode: 'play' })).toBeNull();
    expect(spotReducer(null, { type: 'next' })).toBeNull();
    expect(spotReducer(null, { type: 'pass', record: playRecord(SONG, {}) })).toBeNull();
  });

  it('follows the passes: clean speeds up, a bad pass slows down, an almost repeats', () => {
    let s = open('play');
    s = spotReducer(s, { type: 'pass', record: playRecord(SONG, {}) }) as SpotState;
    expect(s).toMatchObject({ tempoPct: 70, pass: 1 });
    expect(s.last).toMatchObject({ clean: true, tempoPct: 60, nextTempoPct: 70, mastered: false });
    s = spotReducer(s, { type: 'pass', record: playRecord(SONG, { 0: 2 }) }) as SpotState;
    expect(s).toMatchObject({ tempoPct: 70, pass: 2 });
    expect(s.last).toMatchObject({ clean: false, problems: 2 });
    s = spotReducer(s, { type: 'pass', record: playRecord(SONG, { 0: 4 }) }) as SpotState;
    expect(s.tempoPct).toBe(60);
  });

  it('is mastered by a clean pass at full tempo, which stops the automatic loop', () => {
    let s = open('play');
    for (let i = 0; i < 4; i++) s = spotReducer(s, { type: 'pass', record: playRecord(SONG, {}) }) as SpotState;
    expect(s.tempoPct).toBe(100);
    expect(s.last?.mastered).toBe(false); // the pass at 90% was clean, but not at full tempo
    expect(autoLoops(s)).toBe(true);
    s = spotReducer(s, { type: 'pass', record: playRecord(SONG, {}) }) as SpotState;
    expect(s.last).toMatchObject({ tempoPct: 100, mastered: true });
    expect(autoLoops(s)).toBe(false);
  });

  it('Wait for me: a clean pass is mastered, a pass with wrong notes loops again', () => {
    let s = open('wait');
    s = spotReducer(s, { type: 'pass', record: playRecord(SONG, { 0: 1 }) }) as SpotState;
    expect(s.last).toMatchObject({ clean: false, tempoPct: null, nextTempoPct: null, mastered: false });
    expect(autoLoops(s)).toBe(true);
    s = spotReducer(s, { type: 'pass', record: playRecord(SONG, {}) }) as SpotState;
    expect(s.last?.mastered).toBe(true);
  });

  it('moves to the next segment, wrapping, and starts it over', () => {
    let s = open('play');
    s = spotReducer(s, { type: 'pass', record: playRecord(SONG, {}) }) as SpotState;
    s = spotReducer(s, { type: 'toggle-loop' }) as SpotState;
    s = spotReducer(s, { type: 'next' }) as SpotState;
    expect(s).toMatchObject({ index: 1, tempoPct: 60, pass: 0, looping: true, last: null });
    s = spotReducer(s, { type: 'next' }) as SpotState;
    s = spotReducer(s, { type: 'next' }) as SpotState;
    expect(s.index).toBe(0);
  });

  it('keeps the loop switch the learner set, and exit closes it', () => {
    let s = open('play');
    s = spotReducer(s, { type: 'toggle-loop' }) as SpotState;
    expect(s.looping).toBe(false);
    expect(autoLoops(s)).toBe(false);
    s = spotReducer(s, { type: 'pass', record: playRecord(SONG, {}) }) as SpotState;
    expect(s.looping).toBe(false);
    expect(spotReducer(s, { type: 'exit' })).toBeNull();
  });
});

describe('integrity: a spot run is never a possible run of the song', () => {
  it('the machine plays a segment as a song of its own, and the server would refuse its record', () => {
    const segment = spotSegments(SONG, playRecord(SONG, { 5: 2 }))[0]!;
    const part = segmentSong(SONG, segment);
    const runner = createRunner(createSongMachine({ song: part, version: 'piano', mode: 'wait' }));
    runner.send({ type: 'start', at: 0 });
    notesOf(part).forEach((n, i) => {
      runner.send({ type: 'note', note: { type: 'on', midi: n.written, time: 10 + i, source: 'midi' } });
    });
    const state = runner.get();
    expect(state.kind).toBe('saving');
    if (!('record' in state)) throw new Error('the segment run did not finish');
    // The record has the segment's notes, not the song's: the real song's check rejects it.
    expect(state.record).toMatchObject({ mode: 'wait' });
    expect(checkSongRun(SONG, state.record)).toBeNull();
    // It is a possible run of the segment itself, which is the only thing it ever was.
    expect(checkSongRun(part, state.record)).not.toBeNull();
  });
});
