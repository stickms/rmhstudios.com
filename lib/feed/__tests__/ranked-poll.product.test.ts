import { describe, expect, it } from 'vitest';
import { instantRunoff } from '@/lib/feed/poll-count';
import {
  ballotRows,
  computeRankedResult,
  parseStoredResult,
  rankedAuthorNoticeText,
  rankedPollIssues,
  shapeRankedResult,
  validateRanking,
  viewRankedResult,
} from '@/lib/feed/ranked-poll';
import { rankedBallotSchema } from '@/lib/feed/ranked-poll-schema';

describe('rankedPollIssues', () => {
  it('says nothing about a plain poll', () => {
    expect(
      rankedPollIssues({
        ranked: false,
        multiSelect: true,
        optionCount: 2,
      }),
    ).toEqual([]);
  });
  it('names each rule a ranked poll breaks', () => {
    expect(
      rankedPollIssues({
        ranked: true,
        multiSelect: true,
        optionCount: 2,
        durationHours: 0,
      }),
    ).toEqual(['RANKED_MULTI_SELECT', 'RANKED_OPTION_COUNT', 'RANKED_NEEDS_END']);
    expect(
      rankedPollIssues({
        ranked: true,
        optionCount: 6,
        durationHours: 1,
      }),
    ).toEqual([]);
    expect(
      rankedPollIssues({
        ranked: true,
        optionCount: 7,
        durationHours: 1,
      }),
    ).toEqual(['RANKED_OPTION_COUNT']);
  });
});

describe('validateRanking', () => {
  const ids = ['a', 'b', 'c'];
  it('accepts a partial and a full ranking', () => {
    expect(validateRanking(['b'], ids)).toBeNull();
    expect(validateRanking(['c', 'a', 'b'], ids)).toBeNull();
  });
  it('refuses empty, too long, gapped, duplicate and foreign rankings', () => {
    expect(validateRanking([], ids)).toBe('EMPTY');
    expect(validateRanking(['a', 'b', 'c', 'a'], ids)).toBe('TOO_LONG');
    expect(validateRanking(['a', '', 'b'], ids)).toBe('GAP');
    expect(validateRanking(['a', 'a'], ids)).toBe('DUPLICATE');
    expect(validateRanking(['a', 'x'], ids)).toBe('FOREIGN');
  });
  it('numbers a ballot 1..n without gaps', () => {
    expect(ballotRows(['c', 'a'])).toEqual([
      {
        optionId: 'c',
        rank: 1,
      },
      {
        optionId: 'a',
        rank: 2,
      },
    ]);
  });
  it('the ballot body is strict and at most six long', () => {
    expect(
      rankedBallotSchema.safeParse({
        ranking: ['a'],
      }).success,
    ).toBe(true);
    expect(
      rankedBallotSchema.safeParse({
        ranking: [],
      }).success,
    ).toBe(false);
    expect(
      rankedBallotSchema.safeParse({
        ranking: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
      }).success,
    ).toBe(false);
    expect(
      rankedBallotSchema.safeParse({
        ranking: ['a'],
        extra: 1,
      }).success,
    ).toBe(false);
  });
});

describe('result shaping', () => {
  const votes = [
    {
      userId: 'u1',
      optionId: 'a',
      rank: 1,
    },
    {
      userId: 'u1',
      optionId: 'b',
      rank: 2,
    },
    {
      userId: 'u2',
      optionId: 'b',
      rank: 1,
    },
    {
      userId: 'u3',
      optionId: 'c',
      rank: 1,
    },
    {
      userId: 'u3',
      optionId: 'b',
      rank: 2,
    },
  ];
  it('is the one counter, reshaped', () => {
    const irv = instantRunoff([['a', 'b'], ['b'], ['c', 'b']], ['a', 'b', 'c']);
    const result = computeRankedResult(votes, ['a', 'b', 'c']);
    expect(result).toEqual(shapeRankedResult(irv, 3));
    expect(result.winnerOptionId).toBe('b');
  });
  it('survives a round trip through the stored column and rejects junk', () => {
    const result = computeRankedResult(votes, ['a', 'b', 'c']);
    expect(parseStoredResult(JSON.parse(JSON.stringify(result)))).toEqual(result);
    expect(parseStoredResult(null)).toBeNull();
    expect(
      parseStoredResult({
        rounds: 'x',
      }),
    ).toBeNull();
  });
  it('quiet counts: rounds become whole percents and the totals are withheld', () => {
    const result = computeRankedResult(votes, ['a', 'b', 'c']);
    const quiet = viewRankedResult(result, true);
    expect(quiet.percentOnly).toBe(true);
    expect(quiet.ballots).toBeNull();
    expect(quiet.exhausted).toBeNull();
    expect(Object.values(quiet.rounds[0]!.tally)).toEqual([33, 33, 33]);
    expect(viewRankedResult(result, false).ballots).toBe(3);
  });
  it('words the end notice around the winner', () => {
    expect(rankedAuthorNoticeText('Chess')).toBe('Your ranked poll ended: Chess won the count');
    expect(rankedAuthorNoticeText(null)).toBe('Your ranked poll ended with no votes');
  });
});
