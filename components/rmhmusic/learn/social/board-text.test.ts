/**
 * The Daily board's sentences, under a real i18next instance with no catalog (every string is its
 * `t()` default), as `sprint-text.test.ts` does.
 */
import { describe, expect, it } from 'vitest';
import { createInstance, type TFunction } from 'i18next';
import { boardRowSentence, boardStatusSentence, learnerName, nextBoardLine, secondsANote } from './board-text';

const i18n = createInstance();
void i18n.init({
  lng: 'en',
  fallbackLng: 'en',
  resources: {},
  initAsync: false,
  interpolation: {
    escapeValue: false,
  },
});
const t = i18n.t.bind(i18n) as unknown as TFunction<'c-rmhmusic'>;

const row = {
  rank: 14,
  rowId: 'r',
  user: {
    id: 'u',
    name: 'Alex',
    image: null,
  },
  score: 92,
  avgMs: 912,
  withoutChords: false,
  you: false,
};

describe('board-text', () => {
  it('reads a row as one sentence, with "without chords" only when chords were skipped', () => {
    expect(boardRowSentence(t, 'en', row)).toBe('Place 14, Alex, 92 points, 0.9 seconds a note');
    expect(
      boardRowSentence(t, 'en', {
        ...row,
        withoutChords: true,
      }),
    ).toBe('Place 14, Alex, 92 points, 0.9 seconds a note, without chords');
    expect(
      boardRowSentence(t, 'en', {
        ...row,
        avgMs: null,
        user: {
          ...row.user,
          name: null,
        },
      }),
    ).toBe('Place 14, A learner, 92 points');
  });

  it('a learner with no name is "A learner"; the seconds are a locale number', () => {
    expect(learnerName(t, null)).toBe('A learner');
    expect(learnerName(t, 'Sam')).toBe('Sam');
    expect(secondsANote('en', 912)).toBe('0.9');
    expect(secondsANote('de', 912)).toBe('0,9');
  });

  it("says where the viewer's run stands in every state, never naming a threshold", () => {
    expect(
      boardStatusSentence(t, {
        state: 'not-played',
      }),
    ).toBe("You haven't played today's challenge yet.");
    expect(
      boardStatusSentence(t, {
        state: 'started',
      }),
    ).toBe("Your run started but didn't finish, so this day has no score.");
    expect(
      boardStatusSentence(t, {
        state: 'ranked',
        rank: 14,
        total: 230,
        score: 92,
      }),
    ).toBe('Place 14 of 230');
    expect(
      boardStatusSentence(t, {
        state: 'private',
        rank: 14,
        total: 230,
        score: 92,
      }),
    ).toBe('Your 92 would place 14 of 230. Only you can see this.');
    expect(
      boardStatusSentence(t, {
        state: 'unranked',
        reason: 'no-start',
        score: 92,
      }),
    ).toBe('This run is not on the board: the start of this run did not reach us.');
    for (const reason of ['clock', 'too-fast', 'too-even'] as const) {
      expect(
        boardStatusSentence(t, {
          state: 'unranked',
          reason,
          score: 92,
        }),
      ).toBe("This run is not on the board: it did not pass the board's timing checks.");
    }
    expect(
      boardStatusSentence(t, {
        state: 'hidden',
        score: 92,
      }),
    ).toBe('A moderator took this run off the board.');
  });

  it("says when the next board starts in the viewer's own time", () => {
    expect(nextBoardLine(t, 'en-GB', Date.UTC(2026, 10, 16, 12), 'Europe/Berlin')).toBe(
      'The board starts again at 01:00 your time.',
    );
    // The clock style is the locale's own.
    expect(nextBoardLine(t, 'en-US', Date.UTC(2026, 10, 16, 12), 'America/New_York')).toBe(
      'The board starts again at 07:00 PM your time.',
    );
  });

  it('a row without chords is one whole sentence in either form', () => {
    expect(
      boardRowSentence(t, 'en', {
        ...row,
        avgMs: null,
        withoutChords: true,
      }),
    ).toBe('Place 14, Alex, 92 points, without chords');
    // One complete string per case: translators never see a sentence inside a sentence.
    const keys: string[] = [];
    const spy = ((key: string, opts: unknown) => {
      keys.push(key);
      // Forward unchanged: the spy only records which key was asked for.
      return (t as unknown as (k: string, o?: unknown) => string)(key, opts);
    }) as unknown as typeof t;
    boardRowSentence(spy, 'en', {
      ...row,
      withoutChords: true,
    });
    expect(keys).toEqual(['board-row-time-chordless']);
  });

  it("names yesterday's board on yesterday's page", () => {
    const yesterday = {
      day: 'yesterday',
      scope: 'everyone',
    } as const;
    expect(
      boardStatusSentence(
        t,
        {
          state: 'not-played',
        },
        yesterday,
      ),
    ).toBe("You didn't play yesterday's challenge.");
    expect(
      boardStatusSentence(
        t,
        {
          state: 'ranked',
          rank: 3,
          total: 9,
          score: 92,
        },
        yesterday,
      ),
    ).toBe('Place 3 of 9');
  });

  it('on the Friends tab the place is among friends', () => {
    expect(
      boardStatusSentence(
        t,
        {
          state: 'ranked',
          rank: 2,
          total: 5,
          score: 92,
        },
        {
          day: 'today',
          scope: 'friends',
        },
      ),
    ).toBe('Place 2 of 5 among your friends');
  });

  it('a run scored before the board started says so, not that its start was lost', () => {
    expect(
      boardStatusSentence(t, {
        state: 'unranked',
        reason: null,
        score: 92,
      }),
    ).toBe('This run was before the board started.');
  });
});
