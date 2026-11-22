import { describe, expect, it } from 'vitest';
import { createRunner } from './runner';
import {
  createPlayScaleMachine,
  fingering,
  gradeScale,
  guitarPosition,
  isRight,
  playScaleQuestions,
  scaleStart,
  step,
  type ScaleQuestion,
} from './play-scale';
import { sessionInitial } from './session';
import { fretMidi } from '../theory/fretboard';
import { MAJOR_TONICS, parseNote, scaleMidis, type SpelledNote } from '../theory/scales';

const tonic = (id: string) => parseNote(id) as SpelledNote;
const gMajor: ScaleQuestion = {
  tonic: tonic('G'),
  kind: 'major',
  start: 67,
  octaveFree: false,
};
const G_MAJOR = [67, 69, 71, 72, 74, 76, 78, 79];

describe('play-scale grading', () => {
  it('is right only with F sharp, in order', () => {
    expect(gradeScale(gMajor, G_MAJOR)).toEqual(Array(8).fill('right'));
    expect(
      isRight(gMajor, {
        midis: G_MAJOR,
      }),
    ).toBe(true);
    // F natural (77) in place of F sharp (78) marks that note, and the scale is wrong.
    const withF = [67, 69, 71, 72, 74, 76, 77, 79];
    expect(gradeScale(gMajor, withF)[6]).toBe('wrong');
    expect(
      isRight(gMajor, {
        midis: withF,
      }),
    ).toBe(false);
  });

  it('marks a wrong note and carries on from it', () => {
    const midis = [67, 69, 70, 72, 74, 76, 78, 79];
    expect(gradeScale(gMajor, midis)).toEqual(['right', 'right', 'wrong', 'right', 'right', 'right', 'right', 'right']);
  });

  it('wants the notes in order and rising', () => {
    const shuffled = [67, 71, 69, 72, 74, 76, 78, 79];
    const marks = gradeScale(gMajor, shuffled);
    expect(marks[1]).toBe('wrong');
    expect(marks[2]).toBe('wrong');
    expect(
      isRight(gMajor, {
        midis: [...G_MAJOR].reverse(),
      }),
    ).toBe(false);
  });

  it('does not accept a short scale', () => {
    expect(
      isRight(gMajor, {
        midis: G_MAJOR.slice(0, 7),
      }),
    ).toBe(false);
  });

  it('on piano takes the exact pitches only', () => {
    const octaveDown = G_MAJOR.map((m) => m - 12);
    expect(
      isRight(gMajor, {
        midis: octaveDown,
      }),
    ).toBe(false);
  });

  it('on guitar takes any octave, but still rising', () => {
    const guitar: ScaleQuestion = {
      ...gMajor,
      start: 43,
      octaveFree: true,
    };
    expect(
      isRight(guitar, {
        midis: G_MAJOR.map((m) => m - 24),
      }),
    ).toBe(true);
    expect(
      isRight(guitar, {
        midis: G_MAJOR,
      }),
    ).toBe(true);
    // Same pitch classes, but the third note drops an octave: not a rising scale.
    const dropped = [43, 45, 47 - 12 + 0, 48, 50, 52, 54, 55];
    expect(
      isRight(guitar, {
        midis: dropped,
      }),
    ).toBe(false);
  });
});

describe('play-scale questions', () => {
  it('asks the four white-key majors first, with their pitches on the keys of middle C', () => {
    const qs = playScaleQuestions('scales-major-white', 'piano');
    expect(qs.map((q) => q.tonic.letter)).toEqual(['C', 'G', 'D', 'F']);
    expect(qs.map((q) => q.start)).toEqual([60, 67, 62, 65]);
    expect(qs.every((q) => !q.octaveFree && q.kind === 'major')).toBe(true);
  });

  it('asks every major key in the all-keys lesson and natural minors in the minor lesson', () => {
    expect(playScaleQuestions('scales-major-all', 'piano')).toHaveLength(MAJOR_TONICS.length);
    const minors = playScaleQuestions('scales-minor-natural', 'piano');
    expect(minors.every((q) => q.kind === 'natural-minor')).toBe(true);
    expect(minors[0]?.start).toBe(69);
    expect(playScaleQuestions('chord-play-c-major', 'piano')).toEqual([]);
  });

  it('keeps every guitar scale within the first five frets, octave free', () => {
    for (const lesson of ['scales-major-white', 'scales-major-all', 'scales-minor-natural']) {
      for (const q of playScaleQuestions(lesson, 'guitar')) {
        expect(q.octaveFree).toBe(true);
        expect(q.start).toBeGreaterThanOrEqual(40);
        const pos = guitarPosition(q);
        expect(pos).toHaveLength(8);
        const want = scaleMidis(q.kind, q.start);
        pos.forEach((p, i) => {
          expect(fretMidi(p.string, p.fret)).toBe(want[i]);
          expect(p.fret).toBeLessThanOrEqual(5);
        });
      }
    }
    expect(scaleStart(tonic('E'), 'guitar')).toBe(40);
  });

  it('gives right-hand fingering for the white-key majors only', () => {
    const q = (id: string): ScaleQuestion => ({
      tonic: tonic(id),
      kind: 'major',
      start: scaleStart(tonic(id), 'piano'),
      octaveFree: false,
    });
    expect(fingering(q('C'))).toEqual([1, 2, 3, 1, 2, 3, 4, 5]);
    expect(fingering(q('F'))).toEqual([1, 2, 3, 4, 1, 2, 3, 4]);
    expect(fingering(q('Bb'))).toBeNull();
    expect(
      fingering({
        ...q('A'),
        kind: 'natural-minor',
      }),
    ).toBeNull();
    expect(
      fingering({
        ...q('C'),
        octaveFree: true,
      }),
    ).toBeNull();
  });
});

describe('play-scale session', () => {
  const questions = playScaleQuestions('scales-major-white', 'piano').slice(0, 2);
  const whole = (start: number, shift = 0) => ({
    type: 'answer' as const,
    answer: {
      midis: scaleMidis('major', start).map((m) => m + shift),
    },
  });

  it('ignores a half-played scale and grades a whole one', () => {
    const asking = sessionInitial<
      ScaleQuestion,
      {
        midis: number[];
      }
    >(questions);
    expect(
      step(asking, {
        type: 'answer',
        answer: {
          midis: [60, 62],
        },
      }).state,
    ).toBe(asking);
    expect(step(asking, whole(60)).state.kind).toBe('feedback');
  });

  it('completes exactly once per attempt, after the last scale', () => {
    const runner = createRunner(createPlayScaleMachine(questions));
    const effects: unknown[] = [];
    const send = (e: Parameters<typeof runner.send>[0]) => effects.push(...runner.send(e));
    send(whole(60));
    send(whole(60)); // a double send finds nothing to answer
    send({
      type: 'next',
    });
    send(whole(67, 1)); // every note a semitone off: wrong
    expect(effects).toEqual([]);
    send({
      type: 'next',
    });
    send({
      type: 'next',
    }); // a repeat finds nothing to advance
    expect(effects).toHaveLength(1);
    expect(effects[0]).toMatchObject({
      type: 'complete',
      attempt: 1,
      score: 50,
    });
    expect(runner.get().kind).toBe('saving');
    send({
      type: 'answered',
      attempt: 1,
      outcome: 'saved',
    });
    expect(runner.get().kind).toBe('saved');
  });
});
