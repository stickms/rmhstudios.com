import { describe, expect, it } from 'vitest';
import { createRunner } from './runner';
import {
  KEY_QUESTION_COUNT,
  createKeySignatureMachine,
  isRight,
  keyLessonMode,
  keySignatureQuestions,
  step,
} from './key-signature';
import { keyId, keySignature } from '../theory/key-signatures';
import { sessionInitial } from './session';

function seeded(seed: number) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

describe('key-signature questions', () => {
  it('asks the major lesson for major keys and the minor lesson for minor keys', () => {
    expect(keyLessonMode('key-signatures-major')).toBe('major');
    expect(keyLessonMode('key-signatures-minor')).toBe('minor');
    for (const [lesson, mode] of [
      ['key-signatures-major', 'major'],
      ['key-signatures-minor', 'minor'],
    ] as const) {
      const qs = keySignatureQuestions(lesson, seeded(3));
      expect(qs).toHaveLength(KEY_QUESTION_COUNT);
      for (const q of qs) {
        expect(q.key.mode).toBe(mode);
        expect(q.choices.every((c) => c.mode === mode)).toBe(true);
      }
    }
  });

  it('deals ten different keys, each with four distinct buttons including the answer', () => {
    for (let seed = 1; seed < 30; seed++) {
      const qs = keySignatureQuestions('key-signatures-major', seeded(seed));
      expect(new Set(qs.map((q) => keyId(q.key))).size).toBe(KEY_QUESTION_COUNT);
      for (const q of qs) {
        const ids = q.choices.map(keyId);
        expect(new Set(ids).size).toBe(4);
        expect(ids).toContain(keyId(q.key));
        expect(['treble', 'bass']).toContain(q.clef);
        // exactly one button names the signature on the card
        const sig = keySignature(q.key);
        expect(
          q.choices.filter((c) => {
            const s = keySignature(c);
            return s.count === sig.count && s.accidental === sig.accidental;
          }),
        ).toHaveLength(1);
      }
    }
  });

  it('offers the neighbours on the circle of fifths as the wrong answers', () => {
    const qs = keySignatureQuestions('key-signatures-major', seeded(7));
    const g = qs.find((q) => keyId(q.key) === 'G-major');
    if (g) {
      const ids = g.choices.map(keyId);
      expect(ids).toEqual(expect.arrayContaining(['C-major', 'D-major']));
    }
    const d = keySignatureQuestions('key-signatures-major', () => 0.99).find((q) => keyId(q.key) === 'D-major');
    if (d) expect(d.choices.map(keyId)).toEqual(expect.arrayContaining(['G-major', 'A-major']));
  });
});

describe('key-signature session', () => {
  const qs = keySignatureQuestions('key-signatures-major', seeded(5));

  it('grades by the id of the key picked', () => {
    const q = qs[0]!;
    expect(
      isRight(q, {
        id: keyId(q.key),
      }),
    ).toBe(true);
    const wrong = q.choices.find((c) => keyId(c) !== keyId(q.key))!;
    expect(
      isRight(q, {
        id: keyId(wrong),
      }),
    ).toBe(false);
  });

  it('answers each question once and completes once, after the tenth', () => {
    const runner = createRunner(createKeySignatureMachine(qs));
    const effects: unknown[] = [];
    const send = (e: Parameters<typeof runner.send>[0]) => effects.push(...runner.send(e));
    for (const q of qs) {
      send({
        type: 'answer',
        answer: {
          id: keyId(q.key),
        },
      });
      send({
        type: 'answer',
        answer: {
          id: 'x-major',
        },
      }); // a second tap finds nothing to answer
      send({
        type: 'next',
      });
    }
    send({
      type: 'next',
    });
    expect(effects).toHaveLength(1);
    expect(effects[0]).toMatchObject({
      type: 'complete',
      attempt: 1,
      score: 100,
      stars: 3,
    });
    send({
      type: 'answered',
      attempt: 1,
      outcome: 'failed',
    });
    expect(runner.get().kind).toBe('failed');
    send({
      type: 'retry',
    });
    expect(effects).toHaveLength(2);
    expect(effects[1]).toMatchObject({
      type: 'complete',
      attempt: 2,
    });
    send({
      type: 'answered',
      attempt: 1,
      outcome: 'saved',
    }); // stale: ignored
    expect(runner.get().kind).toBe('saving');
  });

  it('ignores answers once the session is over', () => {
    const done = sessionInitial(qs);
    expect(
      step(
        {
          ...done,
          kind: 'saved',
          correct: 1,
          total: 1,
          stars: 3,
        } as never,
        {
          type: 'answer',
          answer: {
            id: 'C-major',
          },
        },
      ).effects,
    ).toEqual([]);
  });
});
