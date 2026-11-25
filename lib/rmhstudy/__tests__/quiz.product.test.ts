import { describe, expect, it } from 'vitest';
import {
  QUESTION_MS,
  advance,
  allAnswered,
  buildQuizQuestions,
  createQuiz,
  endQuiz,
  publicQuestion,
  quizDeckProblem,
  removeFromQuiz,
  reveal,
  snapshotFor,
  standings,
  submitAnswer,
  type QuizQuestion,
} from '../quiz';

const questions = (n: number): QuizQuestion[] =>
  Array.from({ length: n }, (_, i) => ({
    kind: 'multiple-choice',
    cardId: `c${i}`,
    prompt: `P${i}`,
    options: ['a', 'b', 'c', 'd'],
    answerIndex: 1,
  }));

const T0 = 1_000_000;

describe('room quiz state machine', () => {
  it('opens question one with the people present and takes one answer each', () => {
    const quiz = createQuiz('Deck', questions(3), ['u1', 'u2'], T0);
    expect(quiz.phase).toBe('question');
    expect(submitAnswer(quiz, 'u1', 'Ann', 1, T0 + 100)).toBe('accepted');
    expect(submitAnswer(quiz, 'u1', 'Ann', 2, T0 + 200)).toBe('ignored');
    expect(quiz.answers.get('u1')).toBe(1);
  });

  it('ignores a late answer, a stranger, and a choice out of range', () => {
    const quiz = createQuiz('Deck', questions(3), ['u1'], T0);
    expect(submitAnswer(quiz, 'u1', 'Ann', 1, T0 + QUESTION_MS)).toBe('ignored');
    expect(submitAnswer(quiz, 'late', 'Lee', 1, T0 + 1)).toBe('ignored');
    expect(submitAnswer(quiz, 'u1', 'Ann', 4, T0 + 1)).toBe('ignored');
    expect(submitAnswer(quiz, 'u1', 'Ann', -1, T0 + 1)).toBe('ignored');
    expect(submitAnswer(quiz, 'u1', 'Ann', '1', T0 + 1)).toBe('ignored');
    expect(submitAnswer(quiz, 'u1', 'Ann', 1.5, T0 + 1)).toBe('ignored');
  });

  it('is complete when everyone present has answered, not before', () => {
    const quiz = createQuiz('Deck', questions(3), ['u1', 'u2'], T0);
    submitAnswer(quiz, 'u1', 'Ann', 0, T0 + 1);
    expect(allAnswered(quiz, ['u1', 'u2'])).toBe(false);
    submitAnswer(quiz, 'u2', 'Bo', 3, T0 + 2);
    expect(allAnswered(quiz, ['u1', 'u2'])).toBe(true);
    // Someone who left is not waited for.
    const q2 = createQuiz('Deck', questions(3), ['u1', 'u2'], T0);
    submitAnswer(q2, 'u1', 'Ann', 0, T0 + 1);
    expect(allAnswered(q2, ['u1'])).toBe(true);
  });

  it('marks on the reveal, tallies each option and scores one point per correct answer', () => {
    const quiz = createQuiz('Deck', questions(2), ['u1', 'u2', 'u3'], T0);
    submitAnswer(quiz, 'u1', 'Ann', 1, T0 + 1);
    submitAnswer(quiz, 'u2', 'Bo', 1, T0 + 1);
    submitAnswer(quiz, 'u3', 'Cy', 0, T0 + 1);
    const view = reveal(quiz);
    expect(view.answerIndex).toBe(1);
    expect(view.counts).toEqual([1, 2, 0, 0]);
    expect(view.correctUserIds.sort()).toEqual(['u1', 'u2']);
    expect(view.last).toBe(false);
    expect(quiz.phase).toBe('reveal');
    // A second reveal does not score twice.
    reveal(quiz);
    expect(quiz.scores.get('u1')?.score).toBe(1);
    // Answers are refused after the reveal.
    expect(submitAnswer(quiz, 'u1', 'Ann', 1, T0 + 2)).toBe('ignored');
  });

  it('advances through every question and then ends', () => {
    const quiz = createQuiz('Deck', questions(2), ['u1'], T0);
    submitAnswer(quiz, 'u1', 'Ann', 1, T0 + 1);
    reveal(quiz);
    expect(advance(quiz, ['u1', 'u2'], T0 + 6000)).toBe('question');
    expect(quiz.index).toBe(1);
    expect(quiz.answers.size).toBe(0);
    expect(quiz.eligible.has('u2')).toBe(true);
    expect(quiz.deadline).toBe(T0 + 6000 + QUESTION_MS);
    submitAnswer(quiz, 'u1', 'Ann', 1, T0 + 7000);
    expect(reveal(quiz).last).toBe(true);
    expect(advance(quiz, ['u1'], T0 + 13000)).toBe('ended');
    expect(standings(quiz)).toEqual([{ userId: 'u1', userName: 'Ann', score: 2, place: 1 }]);
  });

  it('a late joiner is in the standings from their first answer, not before', () => {
    const quiz = createQuiz('Deck', questions(3), ['u1'], T0);
    expect(standings(quiz)).toEqual([]);
    submitAnswer(quiz, 'u1', 'Ann', 1, T0 + 1);
    reveal(quiz);
    advance(quiz, ['u1', 'late'], T0 + 6000);
    submitAnswer(quiz, 'late', 'Lee', 0, T0 + 6100);
    expect(standings(quiz).map((s) => s.userId)).toContain('late');
  });

  it('shares places between ties (1, 1, 3)', () => {
    const quiz = createQuiz('Deck', questions(1), [], T0);
    quiz.scores.set('a', { userName: 'Ann', score: 3 });
    quiz.scores.set('b', { userName: 'Bo', score: 3 });
    quiz.scores.set('c', { userName: 'Cy', score: 1 });
    quiz.scores.set('d', { userName: 'Di', score: 1 });
    expect(standings(quiz).map((s) => [s.userName, s.place])).toEqual([
      ['Ann', 1],
      ['Bo', 1],
      ['Cy', 3],
      ['Di', 3],
    ]);
  });

  it('a removed member leaves the standings', () => {
    const quiz = createQuiz('Deck', questions(1), ['u1', 'u2'], T0);
    submitAnswer(quiz, 'u1', 'Ann', 1, T0 + 1);
    removeFromQuiz(quiz, 'u1');
    expect(standings(quiz)).toEqual([]);
    expect(submitAnswer(quiz, 'u1', 'Ann', 1, T0 + 2)).toBe('ignored');
  });

  it('endQuiz gives the standings so far', () => {
    const quiz = createQuiz('Deck', questions(3), ['u1'], T0);
    submitAnswer(quiz, 'u1', 'Ann', 1, T0 + 1);
    reveal(quiz);
    const end = endQuiz(quiz);
    expect(end).toMatchObject({ deckTitle: 'Deck', total: 3 });
    expect(end.standings[0]).toMatchObject({ userId: 'u1', score: 1, place: 1 });
    expect(quiz.phase).toBe('ended');
  });
});

describe('what a member is sent', () => {
  it('the public question and the snapshot never carry the answer', () => {
    const quiz = createQuiz('Deck', questions(2), ['u1'], T0);
    submitAnswer(quiz, 'u1', 'Ann', 2, T0 + 1);
    expect(JSON.stringify(publicQuestion(quiz))).not.toMatch(/answerIndex|cardId/);
    const snap = snapshotFor(quiz, 'u1');
    expect(snap.myChoice).toBe(2);
    expect(snap.reveal).toBeNull();
    expect(JSON.stringify(snap)).not.toMatch(/answerIndex|cardId/);
    expect(snapshotFor(quiz, 'u9').myChoice).toBeNull();
  });
});

describe('building the questions', () => {
  const cards = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ id: `c${i}`, front: `Front ${i}`, back: `Back ${i}` }));

  it('builds multiple choice only, as many as asked, with four options each', () => {
    const qs = buildQuizQuestions(cards(20), 10, 7);
    expect(qs).toHaveLength(10);
    for (const q of qs) {
      expect(q.kind).toBe('multiple-choice');
      expect(q.options).toHaveLength(4);
      expect(q.options[q.answerIndex]).toMatch(/^Back/);
    }
  });

  it('uses as many facts as the deck has when it is short', () => {
    expect(buildQuizQuestions(cards(6), 15, 1)).toHaveLength(6);
  });

  it('refuses a deck with fewer than four distinct answers', () => {
    expect(quizDeckProblem(cards(3))).toBe('too-few-answers');
    expect(quizDeckProblem([])).toBe('empty');
    expect(buildQuizQuestions(cards(3), 5, 1)).toEqual([]);
  });
});
