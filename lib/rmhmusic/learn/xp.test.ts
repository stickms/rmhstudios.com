import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  mergeLessonResult,
  xpForCompletion,
} from './xp';

describe('xpForCompletion', () => {
  it('pays 10 XP per newly earned star', () => {
    expect(
      xpForCompletion(
        0,
        3,
      ),
    ).toBe(
      30,
    );
    expect(
      xpForCompletion(
        1,
        3,
      ),
    ).toBe(
      20,
    );
  });
  it('pays nothing for a replay or a worse result', () => {
    expect(
      xpForCompletion(
        3,
        3,
      ),
    ).toBe(
      0,
    );
    expect(
      xpForCompletion(
        2,
        1,
      ),
    ).toBe(
      0,
    );
    expect(
      xpForCompletion(
        0,
        0,
      ),
    ).toBe(
      0,
    );
  });
});

describe('mergeLessonResult', () => {
  it('pays in full on a first completion', () => {
    expect(
      mergeLessonResult(
        null,
        {
          stars: 3,
          score: 80,
        },
      ),
    ).toEqual(
      {
        stars: 3,
        bestScore: 80,
        xpAwarded: 30,
      },
    );
  });
  it('pays nothing when the same result is replayed', () => {
    expect(
      mergeLessonResult(
        {
          stars: 3,
          bestScore: 80,
        },
        {
          stars: 3,
          score: 80,
        },
      ),
    ).toEqual(
      {
        stars: 3,
        bestScore: 80,
        xpAwarded: 0,
      },
    );
  });
  it('never lowers stars or best score on a worse replay', () => {
    expect(
      mergeLessonResult(
        {
          stars: 3,
          bestScore: 80,
        },
        {
          stars: 1,
          score: 40,
        },
      ),
    ).toEqual(
      {
        stars: 3,
        bestScore: 80,
        xpAwarded: 0,
      },
    );
  });
  it('pays only for the stars gained when improving', () => {
    expect(
      mergeLessonResult(
        {
          stars: 1,
          bestScore: 40,
        },
        {
          stars: 3,
          score: 95,
        },
      ),
    ).toEqual(
      {
        stars: 3,
        bestScore: 95,
        xpAwarded: 20,
      },
    );
  });
  it('keeps the higher score even when stars do not change', () => {
    expect(
      mergeLessonResult(
        {
          stars: 2,
          bestScore: 60,
        },
        {
          stars: 2,
          score: 75,
        },
      ),
    ).toEqual(
      {
        stars: 2,
        bestScore: 75,
        xpAwarded: 0,
      },
    );
  });
});
