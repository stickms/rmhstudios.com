import { describe, expect, it } from 'vitest';
import {
  RHYTHM_READING_LESSONS,
  RHYTHM_READ_BPM,
  badPatterns,
  rhythmReadingPatterns,
} from '../content/rhythm-patterns';
import {
  barBeats,
  barMs,
  beamGroups,
  beatMs,
  describeBar,
  meterBeats,
  noteBeats,
  noteStarts,
  onsetBeats,
  onsetTimesMs,
  patternProblem,
  soundEvents,
  type RhythmNote,
  type RhythmPattern,
  type RhythmValue,
} from './rhythm';

const n = (value: RhythmValue, extra: Partial<RhythmNote> = {}): RhythmNote => ({
  value,
  dotted: false,
  rest: false,
  tieToNext: false,
  ...extra,
});
const pattern = (meter: RhythmPattern['meter'], ...notes: RhythmNote[]): RhythmPattern => ({ meter, notes });

const ALL = RHYTHM_READING_LESSONS.flatMap((l) => l.patterns.map((p, i) => ({ id: `${l.id} #${i + 1}`, p })));

describe('the forty patterns', () => {
  it('are five lessons of eight', () => {
    expect(RHYTHM_READING_LESSONS).toHaveLength(5);
    for (const l of RHYTHM_READING_LESSONS) expect(l.patterns, l.id).toHaveLength(8);
    expect(ALL).toHaveLength(40);
  });

  it('every bar sums to its meter, and none has a bad tie', () => {
    expect(badPatterns()).toEqual([]);
    for (const { id, p } of ALL) {
      expect(barBeats(p), id).toBeCloseTo(meterBeats(p.meter), 9);
      expect(patternProblem(p), id).toBeNull();
    }
  });

  it('give every bar at least one sound, in order, inside the bar', () => {
    for (const { id, p } of ALL) {
      const onsets = onsetBeats(p);
      expect(onsets.length, id).toBeGreaterThan(0);
      for (let i = 0; i < onsets.length; i++) {
        expect(onsets[i]!, id).toBeGreaterThanOrEqual(0);
        expect(onsets[i]!, id).toBeLessThan(meterBeats(p.meter));
        if (i > 0) expect(onsets[i]!, id).toBeGreaterThan(onsets[i - 1]!);
      }
    }
  });

  it('put 3/4 only in the last lesson, and the lesson ids are the ones the path stores', () => {
    for (const l of RHYTHM_READING_LESSONS) {
      const threes = l.patterns.filter((p) => p.meter === '3/4').length;
      expect(threes > 0, l.id).toBe(l.id === 'rhythm-read-ties-34');
    }
    expect(RHYTHM_READING_LESSONS.map((l) => l.id)).toEqual([
      'rhythm-read-quarters-halves',
      'rhythm-read-eighths',
      'rhythm-read-rests',
      'rhythm-read-dotted',
      'rhythm-read-ties-34',
    ]);
    expect(rhythmReadingPatterns('rhythm-read-rests')).toBe(RHYTHM_READING_LESSONS[2]!.patterns);
    expect(rhythmReadingPatterns('rhythm-tap-the-beat')).toBeNull();
    expect(rhythmReadingPatterns('toString')).toBeNull();
  });
});

describe('durations', () => {
  it('counts a dot as half again', () => {
    expect(noteBeats(n('whole'))).toBe(4);
    expect(noteBeats(n('half', { dotted: true }))).toBe(3);
    expect(noteBeats(n('quarter', { dotted: true }))).toBe(1.5);
    expect(noteBeats(n('eighth'))).toBe(0.5);
    expect(meterBeats('3/4')).toBe(3);
  });

  it('names what is wrong with a bar', () => {
    expect(patternProblem(pattern('4/4', n('quarter'), n('quarter')))).toMatch(/adds up to 2/);
    expect(patternProblem(pattern('3/4', n('half'), n('half')))).toMatch(/adds up to 4/);
    expect(patternProblem(pattern('4/4'))).toBe('empty bar');
    expect(patternProblem(pattern('4/4', n('half'), n('half', { tieToNext: true })))).toMatch(/tied to nothing/);
    expect(patternProblem(pattern('4/4', n('half', { rest: true, tieToNext: true }), n('half')))).toMatch(/rest/);
    expect(patternProblem(pattern('4/4', n('half', { tieToNext: true }), n('half', { rest: true })))).toMatch(/rest/);
  });
});

describe('onsets', () => {
  it('start every note of a plain bar', () => {
    const p = pattern('4/4', n('quarter'), n('quarter'), n('eighth'), n('eighth'), n('quarter'));
    expect(noteStarts(p)).toEqual([0, 1, 2, 2.5, 3]);
    expect(onsetBeats(p)).toEqual([0, 1, 2, 2.5, 3]);
  });

  it('are silent for a rest', () => {
    const p = pattern('4/4', n('quarter'), n('quarter', { rest: true }), n('half'));
    expect(onsetBeats(p)).toEqual([0, 2]);
  });

  it('read a dotted quarter and an eighth as beats 0 and 1.5', () => {
    const p = pattern('4/4', n('quarter', { dotted: true }), n('eighth'), n('quarter', { dotted: true }), n('eighth'));
    expect(onsetBeats(p)).toEqual([0, 1.5, 2, 3.5]);
    expect(onsetBeats(pattern('4/4', n('half', { dotted: true }), n('quarter')))).toEqual([0, 3]);
  });

  it('merge a tie: the tied note does not start again, and the sound lasts through it', () => {
    const p = pattern('4/4', n('quarter'), n('half', { tieToNext: true }), n('quarter'));
    expect(onsetBeats(p)).toEqual([0, 1]);
    expect(soundEvents(p)).toEqual([
      { start: 0, end: 1, notes: [0] },
      { start: 1, end: 4, notes: [1, 2] },
    ]);
  });

  it('merge a chain of ties and tie across the beat', () => {
    const p = pattern(
      '4/4',
      n('quarter'),
      n('eighth'),
      n('eighth', { tieToNext: true }),
      n('quarter', { tieToNext: true }),
      n('quarter'),
    );
    expect(onsetBeats(p)).toEqual([0, 1, 1.5]);
    expect(soundEvents(p)[2]).toEqual({ start: 1.5, end: 4, notes: [2, 3, 4] });
  });

  it('are in ms at the tempo, from the bar start', () => {
    expect(beatMs(72)).toBeCloseTo(833.333, 3);
    const p = pattern('4/4', n('quarter', { dotted: true }), n('eighth'), n('half'));
    const times = onsetTimesMs(p, 72, 10_000);
    expect(times[0]).toBe(10_000);
    expect(times[1]! - 10_000).toBeCloseTo(1.5 * beatMs(72), 6);
    expect(times[2]! - 10_000).toBeCloseTo(2 * beatMs(72), 6);
    expect(barMs(p, RHYTHM_READ_BPM)).toBeCloseTo(4 * beatMs(72), 6);
    expect(barMs(pattern('3/4', n('half', { dotted: true })), 72)).toBeCloseTo(3 * beatMs(72), 6);
  });
});

describe('beams and words', () => {
  it('beam eighths that share a beat, and leave a lone eighth to its flag', () => {
    const q = n('quarter');
    const e = n('eighth');
    expect(beamGroups(pattern('4/4', q, q, e, e, q))).toEqual([[2, 3]]);
    expect(beamGroups(pattern('4/4', e, e, e, e, q, q))).toEqual([
      [0, 1],
      [2, 3],
    ]);
    // An eighth that starts on the off-beat and one on the next beat are in different beats.
    expect(beamGroups(pattern('4/4', q, n('quarter', { dotted: true }), e, q, q))).toEqual([]);
    expect(beamGroups(pattern('4/4', e, q, e, n('half')))).toEqual([]);
  });

  it('never beam a rest', () => {
    const p = pattern('4/4', n('eighth'), n('eighth', { rest: true }), n('half'), n('quarter'));
    expect(beamGroups(p)).toEqual([]);
  });

  it('say the bar as the items a person reads, beamed eighths together', () => {
    const p = pattern('4/4', n('quarter'), n('quarter'), n('eighth'), n('eighth'), n('quarter', { rest: true }));
    expect(describeBar(p)).toEqual([
      { value: 'quarter', dotted: false, rest: false, count: 1, tied: false },
      { value: 'quarter', dotted: false, rest: false, count: 1, tied: false },
      { value: 'eighth', dotted: false, rest: false, count: 2, tied: false },
      { value: 'quarter', dotted: false, rest: true, count: 1, tied: false },
    ]);
    expect(describeBar(pattern('4/4', n('quarter'), n('half', { tieToNext: true }), n('quarter')))[1]?.tied).toBe(true);
  });
});
