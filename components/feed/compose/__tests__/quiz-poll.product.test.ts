/** Quiz polls (sprint 07 #19): the pure rules, and the composer draft rules beside them. */
import { describe, expect, it } from 'vitest';
import {
  QUIZ_EXPLANATION_MAX,
  normalizeExplanation,
  quizAnswerOptionId,
  quizCorrectShare,
  quizPollIssues,
  quizRevealFor,
  quizVerdict,
} from '@/lib/feed/quiz-poll';
import { emptyPoll, isPollPostable, quizCorrectAmongFilled, type PollDraft } from '@/components/feed/compose/compose-state';

const NOW = new Date('2026-11-27T12:00:00Z');
const open = { correctOptionId: 'o1', explanation: 'Because.', closesAt: null, closedAt: null };

describe('quizPollIssues', () => {
  const ok = { quiz: true, optionCount: 3, correctIndex: 1 };

  it('is empty for a valid quiz and for a plain poll', () => {
    expect(quizPollIssues(ok)).toEqual([]);
    expect(quizPollIssues({ optionCount: 2 })).toEqual([]);
  });

  it('names every way a quiz can be wrong', () => {
    expect(quizPollIssues({ ...ok, multiSelect: true })).toContain('QUIZ_MULTI_SELECT');
    expect(quizPollIssues({ ...ok, ranked: true })).toContain('QUIZ_RANKED');
    expect(quizPollIssues({ ...ok, optionCount: 1 })).toContain('QUIZ_OPTION_COUNT');
    expect(quizPollIssues({ ...ok, optionCount: 5 })).toContain('QUIZ_OPTION_COUNT');
    expect(quizPollIssues({ ...ok, correctIndex: undefined })).toContain('QUIZ_NEEDS_ANSWER');
    expect(quizPollIssues({ ...ok, correctIndex: 3 })).toContain('QUIZ_ANSWER_RANGE');
    expect(quizPollIssues({ ...ok, correctIndex: -1 })).toContain('QUIZ_ANSWER_RANGE');
    expect(quizPollIssues({ ...ok, explanation: 'x'.repeat(QUIZ_EXPLANATION_MAX + 1) })).toContain(
      'QUIZ_EXPLANATION_LENGTH',
    );
  });

  it('allows an explanation of exactly 280 characters', () => {
    expect(quizPollIssues({ ...ok, explanation: 'x'.repeat(QUIZ_EXPLANATION_MAX) })).toEqual([]);
  });

  it('refuses quiz fields on a poll that is not a quiz', () => {
    expect(quizPollIssues({ optionCount: 2, correctIndex: 0 })).toEqual(['QUIZ_FIELDS_WITHOUT_QUIZ']);
    expect(quizPollIssues({ optionCount: 2, explanation: 'why' })).toEqual(['QUIZ_FIELDS_WITHOUT_QUIZ']);
    expect(quizPollIssues({ optionCount: 2, explanation: '   ' })).toEqual([]);
  });
});

describe('quizRevealFor', () => {
  const stranger = { viewerId: 'reader', authorId: 'author' };

  it('says nothing for a plain poll', () => {
    expect(quizRevealFor({ correctOptionId: null }, stranger, true, NOW)).toEqual({});
    expect(quizRevealFor({}, stranger, false, NOW)).toEqual({});
  });

  it('marks a quiz and nothing more for a reader who has not earned the answer', () => {
    expect(quizRevealFor(open, stranger, false, NOW)).toEqual({ quiz: true });
    expect(quizRevealFor(open, { viewerId: null, authorId: 'author' }, false, NOW)).toEqual({ quiz: true });
  });

  it('reveals to the author, to a voter, and to everyone after the end', () => {
    const answer = { quiz: true, correctOptionId: 'o1', explanation: 'Because.' };
    expect(quizRevealFor(open, { viewerId: 'author', authorId: 'author' }, false, NOW)).toEqual(answer);
    expect(quizRevealFor(open, stranger, true, NOW)).toEqual(answer);
    expect(quizRevealFor({ ...open, closesAt: new Date(NOW.getTime() - 1) }, stranger, false, NOW)).toEqual(answer);
    expect(quizRevealFor({ ...open, closedAt: new Date(NOW.getTime() - 1) }, { viewerId: null, authorId: 'author' }, false, NOW)).toEqual(answer);
  });

  it('keeps it hidden until the effective end: an author closing early wins over a later close time', () => {
    const later = new Date(NOW.getTime() + 3600_000);
    expect(quizRevealFor({ ...open, closesAt: later }, stranger, false, NOW)).toEqual({ quiz: true });
    expect(
      quizRevealFor({ ...open, closesAt: later, closedAt: new Date(NOW.getTime() - 1) }, stranger, false, NOW),
    ).toHaveProperty('correctOptionId', 'o1');
  });

  it('omits an empty explanation and never treats an anonymous viewer as the author', () => {
    expect(quizRevealFor({ ...open, explanation: null }, { viewerId: 'author', authorId: 'author' }, false, NOW)).toEqual({
      quiz: true,
      correctOptionId: 'o1',
    });
    expect(quizRevealFor(open, { viewerId: null, authorId: '' }, false, NOW)).toEqual({ quiz: true });
  });
});

describe('helpers', () => {
  it('finds the correct option id by position, in position order', () => {
    const options = [
      { id: 'b', position: 1 },
      { id: 'a', position: 0 },
    ];
    expect(quizAnswerOptionId(options, 0)).toBe('a');
    expect(quizAnswerOptionId(options, 1)).toBe('b');
    expect(quizAnswerOptionId(options, 2)).toBeNull();
    expect(quizAnswerOptionId(options, undefined)).toBeNull();
  });

  it('trims the explanation and stores nothing for a blank one', () => {
    expect(normalizeExplanation('  why  ')).toBe('why');
    expect(normalizeExplanation('   ')).toBeNull();
    expect(normalizeExplanation(undefined)).toBeNull();
  });

  it('computes the share who answered correctly', () => {
    const options = [
      { id: 'o1', voteCount: 3 },
      { id: 'o2', voteCount: 1 },
    ];
    expect(quizCorrectShare(options, 'o1')).toBe(75);
    expect(quizCorrectShare(options, 'o2')).toBe(25);
    expect(quizCorrectShare([{ id: 'o1', voteCount: 0 }], 'o1')).toBeNull();
  });

  it('judges a vote', () => {
    expect(quizVerdict(['o1'], 'o1')).toBe('correct');
    expect(quizVerdict(['o2'], 'o1')).toBe('wrong');
    expect(quizVerdict([], 'o1')).toBeNull();
    expect(quizVerdict(undefined, 'o1')).toBeNull();
  });
});

describe('the composer draft', () => {
  const draft = (over: Partial<PollDraft>): PollDraft => ({ ...emptyPoll(), question: 'q?', ...over });

  it('maps the marked row to a position among the filled options', () => {
    expect(quizCorrectAmongFilled(draft({ quiz: true, options: ['a', '', 'c'], correctIndex: 2 }))).toBe(1);
    expect(quizCorrectAmongFilled(draft({ quiz: true, options: ['a', '', 'c'], correctIndex: 1 }))).toBeNull();
    expect(quizCorrectAmongFilled(draft({ quiz: false, options: ['a', 'b'], correctIndex: 0 }))).toBeNull();
  });

  it('is postable only with an answer marked on a filled option', () => {
    expect(isPollPostable('poll', draft({ quiz: true, options: ['a', 'b'], correctIndex: 0 }))).toBe(true);
    expect(isPollPostable('poll', draft({ quiz: true, options: ['a', 'b'] }))).toBe(false);
    expect(isPollPostable('poll', draft({ quiz: true, options: ['a', ''], correctIndex: 1 }))).toBe(false);
    expect(isPollPostable('poll', draft({ quiz: true, multiSelect: true, options: ['a', 'b'], correctIndex: 0 }))).toBe(false);
    expect(isPollPostable('poll', draft({ options: ['a', 'b'] }))).toBe(true);
  });
});
