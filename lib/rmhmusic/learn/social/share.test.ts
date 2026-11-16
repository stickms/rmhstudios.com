import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  SHARE_LIVE_CAP,
  SHARE_TTL_MS,
  cardLines,
  dailyPayload,
  dailySubject,
  isShareToken,
  readPayload,
  samePayload,
  shareGone,
  songPayload,
  songSubject,
} from './share';

const DAY = 86_400_000;
const NOW =
  Date.UTC(
    2026,
    10,
    16,
    12,
  );
const result =
  (
    correct: boolean,
    skipped = false,
  ) => ({
    correct,
    skipped,
    ms: 900,
    points:
      correct
        ? 100
        : 0,
  });

describe('the share rules', () => {
  it('lasts 90 days and caps live links at 50', () => {
    expect(
      SHARE_TTL_MS,
    ).toBe(
      90 *
        DAY,
    );
    expect(
      SHARE_LIVE_CAP,
    ).toBe(
      50,
    );
  });

  it('accepts only a 22-character url-safe token', () => {
    expect(
      isShareToken(
        'AbCdEfGhIjKlMnOpQrSt_-',
      ),
    ).toBe(
      true,
    );
    for (const bad of [
      '',
      'short',
      'AbCdEfGhIjKlMnOpQrSt_-x',
      'AbCdEfGhIjKlMnOpQrSt/+',
      'AbCdEfGhIjKlMnOpQrSt.=',
      42,
      null,
    ])
      expect(
        isShareToken(
          bad,
        ),
      ).toBe(
        false,
      );
  });

  it('names what was shared, so the same result reuses its link', () => {
    expect(
      dailySubject(
        '2026-11-15',
      ),
    ).toBe(
      '2026-11-15',
    );
    expect(
      songSubject(
        'ode-to-joy',
        'play',
      ),
    ).toBe(
      'ode-to-joy:play',
    );
  });

  it('is gone once stopped, hidden or expired', () => {
    const live =
      {
        expiresAt:
          new Date(
            NOW +
              DAY,
          ),
        stoppedAt:
          null,
        hiddenAt:
          null,
      };
    expect(
      shareGone(
        live,
        NOW,
      ),
    ).toBe(
      false,
    );
    expect(
      shareGone(
        {
          ...live,
          stoppedAt:
            new Date(
              NOW -
                1,
            ),
        },
        NOW,
      ),
    ).toBe(
      true,
    );
    expect(
      shareGone(
        {
          ...live,
          hiddenAt:
            new Date(
              NOW -
                1,
            ),
        },
        NOW,
      ),
    ).toBe(
      true,
    );
    expect(
      shareGone(
        {
          ...live,
          expiresAt:
            new Date(
              NOW,
            ),
        },
        NOW,
      ),
    ).toBe(
      true,
    );
  });
});

describe('snapshots are built from stored rows', () => {
  it('takes a scored Daily run: score, stars, right of played, skipped, mean time', () => {
    const results =
      [
        ...Array.from(
          {
            length: 18,
          },
          () =>
            result(
              true,
            ),
        ),
        result(
          false,
        ),
        result(
          false,
        ),
        ...Array.from(
          {
            length: 10,
          },
          () =>
            result(
              false,
              true,
            ),
        ),
      ];
    const p =
      dailyPayload(
        {
          date: '2026-11-15',
          score: 92,
          avgMs: 912,
          played: 20,
          skipped: 10,
          results,
        },
      );
    expect(
      p,
    ).toEqual(
      {
        v: 1,
        kind: 'daily',
        date: '2026-11-15',
        score: 92,
        stars: 2,
        right: 18,
        played: 20,
        skipped: 10,
        avgMs: 912,
      },
    );
  });

  it('refuses a Daily row with no score (started, never finished)', () => {
    expect(
      dailyPayload(
        {
          date: '2026-11-15',
          score:
            null,
          avgMs:
            null,
          played:
            null,
          skipped:
            null,
          results:
            null,
        },
      ),
    ).toBeNull();
  });

  it('takes a song best for a mode, with the version played', () => {
    expect(
      songPayload(
        {
          songId:
            'ode-to-joy',
          mode: 'play',
          bestScore: 98,
        },
        'guitar',
      ),
    ).toEqual(
      {
        v: 1,
        kind: 'song',
        songId:
          'ode-to-joy',
        mode: 'play',
        version:
          'guitar',
        score: 98,
        stars: 3,
      },
    );
    expect(
      songPayload(
        {
          songId:
            'no-such-song',
          mode: 'play',
          bestScore: 98,
        },
        'piano',
      ),
    ).toBeNull();
    expect(
      songPayload(
        {
          songId:
            'ode-to-joy',
          mode: 'fast',
          bestScore: 98,
        },
        'piano',
      ),
    ).toBeNull();
  });

  it('reads back only a version-1 payload of a known shape', () => {
    const p =
      songPayload(
        {
          songId:
            'ode-to-joy',
          mode: 'wait',
          bestScore: 70,
        },
        'voice',
      )!;
    expect(
      readPayload(
        JSON.parse(
          JSON.stringify(
            p,
          ),
        ),
      ),
    ).toEqual(
      p,
    );
    expect(
      readPayload(
        {
          ...p,
          v: 2,
        },
      ),
    ).toBeNull();
    expect(
      readPayload(
        {
          ...p,
          score:
            'lots',
        },
      ),
    ).toBeNull();
    expect(
      readPayload(
        null,
      ),
    ).toBeNull();
    expect(
      samePayload(
        p,
        {
          ...p,
        },
      ),
    ).toBe(
      true,
    );
    expect(
      samePayload(
        p,
        {
          ...p,
          score: 71,
        },
      ),
    ).toBe(
      false,
    );
  });
});

describe('the card’s lines', () => {
  it('says a Daily result plainly, in English', () => {
    const p =
      dailyPayload(
        {
          date: '2026-11-15',
          score: 92,
          avgMs: 912,
          played: 30,
          skipped: 0,
          results:
            Array.from(
              {
                length: 30,
              },
              (
                _,
                i,
              ) =>
                result(
                  i <
                    28,
                ),
            ),
        },
      )!;
    expect(
      cardLines(
        p,
      ),
    ).toEqual(
      {
        lead: 'Daily sight reading · 15 Nov 2026',
        title:
          '92 points',
        subtitle:
          '28 of 30 right · 0.9 s a note',
        stars:
          '2 of 3 stars',
      },
    );
  });

  it('says a song best with its title, composer, mode and version', () => {
    const p =
      songPayload(
        {
          songId:
            'ode-to-joy',
          mode: 'play',
          bestScore: 98,
        },
        'guitar',
      )!;
    expect(
      cardLines(
        p,
      ),
    ).toEqual(
      {
        lead: 'Ode to Joy — Ludwig van Beethoven',
        title:
          '98 points',
        subtitle:
          'Play along · guitar',
        stars:
          '3 of 3 stars',
      },
    );
  });
});
