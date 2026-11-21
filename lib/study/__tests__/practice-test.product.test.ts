import { describe, expect, it } from 'vitest';
import {
  availableKinds,
  buildTest,
  gradeWritten,
  normalizeAnswer,
  scoreTest,
  TEST_KINDS,
  type MatchingQuestion,
  type TestCard,
  type TestOptions,
  type TestQuestion,
} from '@/lib/study/practice-test';

const deck = (n: number): TestCard[] =>
  Array.from({ length: n }, (_, i) => ({ id: `c${i}`, front: `Term ${i}`, back: `Definition number ${i * 7}` }));

const ALL: TestOptions = { count: 20, kinds: [...TEST_KINDS], direction: 'mixed' };

describe('buildTest', () => {
  it('gives the same questions in the same order for the same seed, and others for another', () => {
    const cards = deck(30);
    expect(buildTest(cards, ALL, 42)).toEqual(buildTest(cards, ALL, 42));
    expect(buildTest(cards, ALL, 42)).not.toEqual(buildTest(cards, ALL, 43));
  });

  it('deals every selected kind and asks about each card at most once', () => {
    const qs = buildTest(deck(30), ALL, 7);
    expect(qs).toHaveLength(20);
    expect(new Set(qs.map((q) => q.kind))).toEqual(new Set(TEST_KINDS));
    const used = qs.flatMap((q) => (q.kind === 'matching' ? q.terms.map((t) => t.cardId) : [q.cardId]));
    expect(new Set(used).size).toBe(used.length);
  });

  it('multiple choice: four options, distractors never equal the answer and never repeat', () => {
    const cards = deck(40);
    for (const seed of [1, 2, 3, 4, 5]) {
      const qs = buildTest(cards, { count: 40, kinds: ['multiple-choice'], direction: 'mixed' }, seed);
      for (const q of qs) {
        if (q.kind !== 'multiple-choice') throw new Error('expected multiple choice');
        expect(q.options).toHaveLength(4);
        expect(new Set(q.options.map((o) => normalizeAnswer(o))).size).toBe(4);
        const card = cards.find((c) => c.id === q.cardId);
        expect([card?.front, card?.back]).toContain(q.options[q.answerIndex]);
      }
    }
  });

  it('does not offer a distractor that normalises to the answer', () => {
    const cards: TestCard[] = [
      { id: 'a', front: 'q1', back: 'Paris' },
      { id: 'b', front: 'q2', back: 'paris!' },
      { id: 'c', front: 'q3', back: 'Rome' },
      { id: 'd', front: 'q4', back: 'Oslo' },
      { id: 'e', front: 'q5', back: 'Bern' },
    ];
    const qs = buildTest(cards, { count: 5, kinds: ['multiple-choice'], direction: 'back' }, 3);
    for (const q of qs) {
      if (q.kind !== 'multiple-choice') continue;
      const norms = q.options.map((o) => normalizeAnswer(o));
      expect(new Set(norms).size).toBe(norms.length);
    }
  });

  it('prefers distractors of similar length', () => {
    const cards: TestCard[] = [
      { id: 'x', front: 'q', back: 'aaaaaaaaaa' },
      ...Array.from({ length: 12 }, (_, i) => ({ id: `s${i}`, front: `f${i}`, back: `${'b'.repeat(9 + (i % 3))}${i}` })),
      ...Array.from({ length: 12 }, (_, i) => ({ id: `l${i}`, front: `g${i}`, back: `${'c'.repeat(80)}${i}` })),
    ];
    const qs = buildTest(cards, { count: 25, kinds: ['multiple-choice'], direction: 'back', onlyCardIds: ['x'] }, 9);
    const q = qs[0] as TestQuestion;
    if (q.kind !== 'multiple-choice') throw new Error('expected multiple choice');
    expect(q.options.every((o) => o.length < 20)).toBe(true);
  });

  it('multiple choice is unavailable under four cards, and a requested one falls back to written', () => {
    const cards = deck(3);
    const avail = availableKinds(cards, 'mixed');
    expect(avail['multiple-choice']).toEqual({ available: false, reason: 'needs-four-answers' });
    expect(availableKinds(deck(4), 'mixed')['multiple-choice'].available).toBe(true);
    const qs = buildTest(cards, { count: 3, kinds: ['multiple-choice'], direction: 'back' }, 1);
    expect(qs).toHaveLength(3);
    expect(qs.every((q) => q.kind === 'written')).toBe(true);
  });

  it('true/false is correct half the time', () => {
    const qs = buildTest(deck(30), { count: 20, kinds: ['true-false'], direction: 'back' }, 11);
    const truths = qs.filter((q) => q.kind === 'true-false' && q.isTrue).length;
    expect(truths).toBe(10);
    for (const q of qs) {
      if (q.kind !== 'true-false') throw new Error('expected true/false');
      expect(q.isTrue ? q.shown === q.answer : q.shown !== q.answer).toBe(true);
    }
  });

  it('direction decides which side is the prompt', () => {
    const [byBack] = buildTest(deck(5), { count: 1, kinds: ['written'], direction: 'back' }, 1);
    const [byFront] = buildTest(deck(5), { count: 1, kinds: ['written'], direction: 'front' }, 1);
    expect(byBack?.kind === 'written' && byBack.prompt.startsWith('Term')).toBe(true);
    expect(byFront?.kind === 'written' && byFront.prompt.startsWith('Definition')).toBe(true);
  });

  it('matching has at most six pairs and a definition for every term', () => {
    const qs = buildTest(deck(30), { count: 5, kinds: ['matching'], direction: 'back' }, 5);
    for (const q of qs) {
      if (q.kind !== 'matching') throw new Error('expected matching');
      expect(q.terms.length).toBeGreaterThanOrEqual(2);
      expect(q.terms.length).toBeLessThanOrEqual(6);
      expect(new Set(q.definitions.map((d) => d.cardId))).toEqual(new Set(q.terms.map((t) => t.cardId)));
    }
  });

  it('caps the count at the deck size and at 50', () => {
    expect(buildTest(deck(8), { ...ALL, count: 50 }, 1)).toHaveLength(8);
    expect(buildTest(deck(80), { ...ALL, count: 99 }, 1)).toHaveLength(50);
    expect(buildTest([], ALL, 1)).toEqual([]);
  });

  it('a test on the missed cards asks about exactly those cards', () => {
    const cards = deck(30);
    const missed = ['c3', 'c9', 'c14', 'c20', 'c21'];
    const qs = buildTest(cards, { count: 50, kinds: [...TEST_KINDS], direction: 'mixed', onlyCardIds: missed }, 4);
    const used = qs.flatMap((q) => (q.kind === 'matching' ? q.terms.map((t) => t.cardId) : [q.cardId]));
    expect(new Set(used)).toEqual(new Set(missed));
    expect(used).toHaveLength(missed.length);
  });

  it('builds 50 questions from a 2,000-card deck quickly', () => {
    const cards = deck(2000);
    buildTest(cards, { ...ALL, count: 50 }, 1); // warm up
    const start = performance.now();
    buildTest(cards, { ...ALL, count: 50 }, 2);
    expect(performance.now() - start).toBeLessThan(20);
  });
});

describe('gradeWritten', () => {
  it('accepts case, whitespace, punctuation and diacritic differences', () => {
    expect(gradeWritten('café', 'cafe')).toBe('correct');
    expect(gradeWritten('Café', '  CAFÉ ')).toBe('correct');
    expect(gradeWritten("Don't panic!", 'dont panic')).toBe('correct');
    expect(gradeWritten('New   York', 'new york')).toBe('correct');
    expect(gradeWritten('naïve', 'naive')).toBe('correct');
  });

  it('flags a one-edit slip as almost only for answers of six or more characters', () => {
    expect(gradeWritten('receive', 'recieve')).toBe('almost'); // swap
    expect(gradeWritten('receive', 'receve')).toBe('almost'); // deletion
    expect(gradeWritten('receive', 'receivee')).toBe('almost'); // insertion
    expect(gradeWritten('receive', 'receivd')).toBe('almost'); // substitution
    expect(gradeWritten('receive', 'recvieve')).toBe('wrong'); // two edits
    expect(gradeWritten('house', 'hause')).toBe('wrong'); // five characters
    expect(gradeWritten('sixsix', 'sixsax')).toBe('almost'); // exactly six
  });

  it('is wrong for empty or unrelated input', () => {
    expect(gradeWritten('receive', '')).toBe('wrong');
    expect(gradeWritten('receive', '   ')).toBe('wrong');
    expect(gradeWritten('receive', 'banana')).toBe('wrong');
  });

  it('works for non-Latin scripts and locale case rules', () => {
    expect(gradeWritten('Москва', 'москва')).toBe('correct');
    expect(gradeWritten('東京タワー', '東京タワー')).toBe('correct');
    expect(gradeWritten('İstanbul', 'istanbul', 'tr')).toBe('correct');
    expect(gradeWritten('café', 'cafe', 'not a locale')).toBe('correct');
  });

  it('compares an answer that is only punctuation literally', () => {
    expect(gradeWritten('?!', '?!')).toBe('correct');
    expect(gradeWritten('?!', '!?')).toBe('wrong');
  });
});

describe('scoreTest', () => {
  const cards = deck(12);
  const questions = buildTest(cards, { count: 12, kinds: [...TEST_KINDS], direction: 'back' }, 21);

  const perfect = (q: TestQuestion) => {
    switch (q.kind) {
      case 'multiple-choice':
        return { kind: 'multiple-choice' as const, choice: q.answerIndex };
      case 'written':
        return { kind: 'written' as const, text: q.answer };
      case 'true-false':
        return { kind: 'true-false' as const, answer: q.isTrue };
      case 'matching':
        return { kind: 'matching' as const, pairs: Object.fromEntries(q.terms.map((t) => [t.cardId, t.cardId])) };
    }
  };

  it('scores a perfect test and counts one point per matching pair', () => {
    const score = scoreTest(questions, questions.map(perfect));
    const points = questions.reduce((n, q) => n + (q.kind === 'matching' ? q.terms.length : 1), 0);
    expect(score).toMatchObject({ correct: points, total: points, answered: questions.length, missedCardIds: [] });
  });

  it('scores matching per pair and lists only the wrong terms as missed', () => {
    const q = buildTest(deck(6), { count: 1, kinds: ['matching'], direction: 'back' }, 2)[0] as MatchingQuestion;
    const ids = q.terms.map((t) => t.cardId);
    const pairs: Record<string, string> = Object.fromEntries(ids.map((id) => [id, id]));
    pairs[ids[0] as string] = ids[1] as string;
    pairs[ids[1] as string] = ids[0] as string;
    delete pairs[ids[2] as string];
    const score = scoreTest([q], [{ kind: 'matching', pairs }]);
    expect(score.total).toBe(ids.length);
    expect(score.correct).toBe(ids.length - 3);
    expect(new Set(score.missedCardIds)).toEqual(new Set(ids.slice(0, 3)));
  });

  it('counts an accepted almost as right, and an unaccepted one as missed', () => {
    const q = { kind: 'written' as const, cardId: 'c1', prompt: 'p', answer: 'receive' };
    expect(scoreTest([q], [{ kind: 'written', text: 'recieve', accepted: true }]).correct).toBe(1);
    const declined = scoreTest([q], [{ kind: 'written', text: 'recieve' }]);
    expect(declined.correct).toBe(0);
    expect(declined.missedCardIds).toEqual(['c1']);
  });

  it('leaves unanswered questions (ended early) out of the total', () => {
    const score = scoreTest(questions, [perfect(questions[0] as TestQuestion)]);
    expect(score.answered).toBe(1);
    expect(score.perQuestion.slice(1).every((s) => s === null)).toBe(true);
    expect(score.total).toBe(score.correct);
  });

  it('treats a wrong choice or a response of the wrong shape as missed', () => {
    const mc = buildTest(deck(8), { count: 1, kinds: ['multiple-choice'], direction: 'back' }, 1)[0] as TestQuestion;
    if (mc.kind !== 'multiple-choice') throw new Error('expected multiple choice');
    const wrong = scoreTest([mc], [{ kind: 'multiple-choice', choice: (mc.answerIndex + 1) % 4 }]);
    expect(wrong.missedCardIds).toEqual([mc.cardId]);
    const shape = scoreTest([mc], [{ kind: 'true-false', answer: true }]);
    expect(shape.correct).toBe(0);
  });
});
