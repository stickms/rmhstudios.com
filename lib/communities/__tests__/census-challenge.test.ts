import { describe, expect, it } from 'vitest';
import {
  buildCensusQuestions,
  buildCensusResults,
  censusResultsVisible,
  validateCensusAnswers,
} from '@/lib/communities/census';
import { challengePhase, pickWinner, validateChallengeWindows } from '@/lib/communities/challenge';

const questions = buildCensusQuestions([
  { prompt: 'Platform?', kind: 'single', options: ['PC', 'Console'] },
  { prompt: 'Genres?', kind: 'multi', options: ['RPG', 'FPS', 'Puzzle'] },
]);

describe('census answers', () => {
  it('accepts a complete valid submission', () => {
    const r = validateCensusAnswers(questions, [
      { questionId: 'q1', optionIds: ['q1o1'] },
      { questionId: 'q2', optionIds: ['q2o1', 'q2o3', 'q2o3'] },
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.picks).toHaveLength(3);
  });
  it('rejects missing, extra, unknown and duplicate answers', () => {
    expect(validateCensusAnswers(questions, [{ questionId: 'q1', optionIds: ['q1o1'] }]).ok).toBe(
      false,
    );
    expect(
      validateCensusAnswers(questions, [
        { questionId: 'q1', optionIds: ['q1o1', 'q1o2'] },
        { questionId: 'q2', optionIds: ['q2o1'] },
      ]).ok,
    ).toBe(false);
    expect(
      validateCensusAnswers(questions, [
        { questionId: 'q1', optionIds: ['nope'] },
        { questionId: 'q2', optionIds: ['q2o1'] },
      ]).ok,
    ).toBe(false);
    expect(
      validateCensusAnswers(questions, [
        { questionId: 'q1', optionIds: ['q1o1'] },
        { questionId: 'q1', optionIds: ['q1o2'] },
      ]).ok,
    ).toBe(false);
  });
});

describe('census results visibility', () => {
  const NOW = 1_000_000;
  it('hides results while open, and below the minimum', () => {
    expect(censusResultsVisible({ closedAt: null, closesAt: null, responseCount: 50 }, NOW)).toBe(
      false,
    );
    expect(censusResultsVisible({ closedAt: new Date(1), responseCount: 4 }, NOW)).toBe(false);
  });
  it('shows once closed with at least 5 responses', () => {
    expect(censusResultsVisible({ closedAt: new Date(1), responseCount: 5 }, NOW)).toBe(true);
    expect(censusResultsVisible({ closesAt: new Date(NOW - 1), responseCount: 9 }, NOW)).toBe(true);
    expect(censusResultsVisible({ closesAt: new Date(NOW + 1), responseCount: 9 }, NOW)).toBe(
      false,
    );
  });
  it('computes percentages of respondents', () => {
    const res = buildCensusResults(
      questions,
      [{ questionId: 'q1', optionId: 'q1o1', count: 3 }],
      4,
    );
    expect(res[0].options[0]).toMatchObject({ count: 3, pct: 75 });
    expect(res[0].options[1]).toMatchObject({ count: 0, pct: 0 });
  });
});

describe('challenge', () => {
  it('moves submit, vote, closed', () => {
    const c = { submitEndsAt: new Date(100), voteEndsAt: new Date(200) };
    expect(challengePhase(c, 50)).toBe('submit');
    expect(challengePhase(c, 150)).toBe('vote');
    expect(challengePhase(c, 200)).toBe('closed');
  });
  it('validates windows', () => {
    const now = 0;
    const h = 3_600_000;
    expect(validateChallengeWindows(new Date(2 * h), new Date(4 * h), now)).toBeNull();
    expect(validateChallengeWindows(new Date(h / 2), new Date(4 * h), now)).not.toBeNull();
    expect(validateChallengeWindows(new Date(2 * h), new Date(2 * h + 1000), now)).not.toBeNull();
    expect(validateChallengeWindows(new Date(2 * h), new Date(90 * 24 * h), now)).not.toBeNull();
  });
  it('picks the most-voted, earliest on ties, nobody on zero votes', () => {
    expect(pickWinner([])).toBeNull();
    expect(pickWinner([{ id: 'a', voteCount: 0, createdAt: new Date(1) }])).toBeNull();
    expect(
      pickWinner([
        { id: 'a', voteCount: 3, createdAt: new Date(5) },
        { id: 'b', voteCount: 3, createdAt: new Date(2) },
        { id: 'c', voteCount: 1, createdAt: new Date(1) },
      ]),
    ).toBe('b');
  });
});
