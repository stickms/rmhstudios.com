/**
 * Friends' progress sentences, under a real i18next instance with no catalog (every string is its
 * `t()` default), as `board-text.test.ts` does.
 */
import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  createInstance,
  type TFunction,
} from 'i18next';
import {
  friendDailyLine,
  friendShortLine,
  friendSongLine,
  friendUnitsLine,
} from './friends-text';

const i18n =
  createInstance();
void i18n.init(
  {
    lng: 'en',
    fallbackLng:
      'en',
    resources:
      {},
    initAsync: false,
    interpolation:
      {
        escapeValue: false,
      },
  },
);
const t =
  i18n.t.bind(
    i18n,
  ) as unknown as TFunction<'c-rmhmusic'>;

const friend =
  {
    user: {
      name: 'Ann',
      image:
        null,
    },
    daily:
      {
        streak: 12,
        today: true,
      },
    units:
      {
        finished: 3,
        total: 5,
        last: 'Train your ear',
      },
    songs:
      [
        {
          songId:
            'ode-to-joy',
          title:
            'Ode to Joy',
          composer:
            'Ludwig van Beethoven',
          mode: 'play' as const,
          bestScore: 98,
        },
      ],
  };

describe('friends-text', () => {
  it('says the Daily challenge streak, and whether today is done', () => {
    expect(
      friendDailyLine(
        t,
        {
          streak: 12,
          today: true,
        },
      ),
    ).toBe(
      'Daily challenge: 12 days in a row, done today',
    );
    expect(
      friendDailyLine(
        t,
        {
          streak: 1,
          today: false,
        },
      ),
    ).toBe(
      'Daily challenge: 1 day in a row',
    );
    expect(
      friendDailyLine(
        t,
        {
          streak: 0,
          today: false,
        },
      ),
    ).toBe(
      'Daily challenge: no streak yet',
    );
  });

  it('says finished units, with the last one when there is one', () => {
    expect(
      friendUnitsLine(
        t,
        friend.units,
      ),
    ).toBe(
      '3 of 5 units finished, last Train your ear',
    );
    expect(
      friendUnitsLine(
        t,
        {
          finished: 0,
          total: 5,
          last: null,
        },
      ),
    ).toBe(
      '0 of 5 units finished',
    );
  });

  it('gives the home one short line', () => {
    expect(
      friendShortLine(
        t,
        friend,
      ),
    ).toBe(
      'Daily: 12 days · 3 of 5 units',
    );
    expect(
      friendShortLine(
        t,
        {
          ...friend,
          daily:
            {
              streak: 1,
              today: true,
            },
        },
      ),
    ).toBe(
      'Daily: 1 day · 3 of 5 units',
    );
  });

  it('names a song best by its title and mode', () => {
    expect(
      friendSongLine(
        t,
        friend
          .songs[0]!,
      ),
    ).toBe(
      'Ode to Joy, Play along: 98',
    );
    expect(
      friendSongLine(
        t,
        {
          ...friend
            .songs[0]!,
          mode: 'wait',
          bestScore: 100,
        },
      ),
    ).toBe(
      'Ode to Joy, Wait for me: 100',
    );
  });
});
