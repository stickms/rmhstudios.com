import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  boardCacheKey,
  friendsCacheKey,
} from './cache-keys';
import {
  DEFAULT_SOCIAL,
  readSocial,
} from './prefs';
import {
  musicSocialBody,
  musicSocialRes,
} from './social-schema';

describe('the learner social switches (Phase 6, plan 1.1)', () => {
  it('no row reads as both off: nothing is visible to anyone until the learner turns it on', () => {
    expect(
      DEFAULT_SOCIAL,
    ).toEqual(
      {
        board: false,
        friends: false,
      },
    );
    expect(
      readSocial(
        null,
      ),
    ).toEqual(
      {
        board: false,
        friends: false,
      },
    );
    expect(
      readSocial(
        {
          board: true,
          friends: false,
        },
      ),
    ).toEqual(
      {
        board: true,
        friends: false,
      },
    );
  });

  it('a PUT must change at least one switch, and only booleans', () => {
    expect(
      musicSocialBody.safeParse(
        {},
      )
        .success,
    ).toBe(
      false,
    );
    expect(
      musicSocialBody.safeParse(
        {
          board:
            'yes',
        },
      )
        .success,
    ).toBe(
      false,
    );
    expect(
      musicSocialBody.safeParse(
        {
          board: true,
        },
      )
        .success,
    ).toBe(
      true,
    );
    expect(
      musicSocialBody.safeParse(
        {
          friends: false,
        },
      )
        .success,
    ).toBe(
      true,
    );
    expect(
      musicSocialBody.safeParse(
        {
          board: true,
          friends: true,
        },
      )
        .success,
    ).toBe(
      true,
    );
  });

  it('the answer carries the two switches and nothing else', () => {
    expect(
      musicSocialRes.parse(
        {
          board: true,
          friends: false,
          extra: 1,
        },
      ),
    ).toEqual(
      {
        board: true,
        friends: false,
      },
    );
  });

  it('cache keys are per date and per viewer', () => {
    expect(
      boardCacheKey(
        '2026-11-16',
      ),
    ).not.toBe(
      boardCacheKey(
        '2026-11-15',
      ),
    );
    expect(
      friendsCacheKey(
        'u1',
      ),
    ).not.toBe(
      friendsCacheKey(
        'u2',
      ),
    );
  });
});
