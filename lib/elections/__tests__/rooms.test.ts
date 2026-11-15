import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  ROOM_CODE_ALPHABET,
  isRoomCode,
} from '../room-config';
import {
  REACTIONS,
  describeConfig,
  generateRoomCode,
  isReaction,
  roomChannel,
  roomExpiry,
  roomPath,
  tallyReactions,
} from '../rooms';

describe('generateRoomCode', () => {
  it('makes 8 characters from the unambiguous alphabet, deterministically for a given source', () => {
    let i = 0;
    const code =
      generateRoomCode(
        (
          max,
        ) =>
          i++ %
          max,
      );
    expect(
      code,
    ).toHaveLength(
      8,
    );
    expect(
      isRoomCode(
        code,
      ),
    ).toBe(
      true,
    );
    expect(
      code,
    ).toBe(
      ROOM_CODE_ALPHABET.slice(
        0,
        8,
      ),
    );
  });
  it('never produces ambiguous characters over many draws', () => {
    for (
      let n = 0;
      n <
      200;
      n++
    ) {
      const c =
        generateRoomCode(
          (
            max,
          ) =>
            Math.floor(
              Math.random() *
                max,
            ),
        );
      expect(
        c,
      ).not.toMatch(
        /[IO01]/,
      );
      expect(
        isRoomCode(
          c,
        ),
      ).toBe(
        true,
      );
    }
  });
});

describe('roomExpiry', () => {
  it('lasts four days from the start of Election Day (Eastern)', () => {
    expect(
      roomExpiry(
        '2026-11-03',
      ).toISOString(),
    ).toBe(
      '2026-11-07T05:00:00.000Z',
    );
  });
});

describe('channels and links', () => {
  it('addresses a room or the election day main room', () => {
    expect(
      roomChannel(
        'K7M2QXH9',
        '2026-11-03',
      ),
    ).toBe(
      'room:K7M2QXH9',
    );
    expect(
      roomChannel(
        null,
        '2026-11-03',
      ),
    ).toBe(
      '2026-11-03',
    );
    expect(
      roomPath(
        'K7M2QXH9',
      ),
    ).toBe(
      '/elections?room=K7M2QXH9',
    );
  });
  it('keeps a room channel from ever colliding with a date channel', () => {
    expect(
      roomChannel(
        'K7M2QXH9',
        '2026-11-03',
      ),
    ).not.toMatch(
      /^\d{4}-/,
    );
  });
});

describe('reactions', () => {
  it('is a closed vocabulary', () => {
    for (const r of REACTIONS)
      expect(
        isReaction(
          r,
        ),
      ).toBe(
        true,
      );
    for (const bad of [
      '😈',
      'fire',
      '',
      null,
      5,
      '🔥🔥',
    ])
      expect(
        isReaction(
          bad,
        ),
      ).toBe(
        false,
      );
  });
  it('tallies only the recent window', () => {
    const now = 100_000;
    const t =
      tallyReactions(
        [
          {
            emoji:
              '🔥',
            at:
              now -
              1000,
          },
          {
            emoji:
              '🔥',
            at:
              now -
              2000,
          },
          {
            emoji:
              '😮',
            at:
              now -
              9000,
          },
          {
            emoji:
              '👏',
            at:
              now -
              11_000,
          },
        ],
        now,
      );
    expect(
      t,
    ).toEqual(
      {
        '🔥': 2,
        '😮': 1,
      },
    );
  });
});

describe('describeConfig', () => {
  it('summarises panes by kind', () => {
    expect(
      describeConfig(
        {
          panes:
            [
              {
                kind: 'stream',
              },
              {
                kind: 'stream',
              },
              {
                kind: 'chat',
              },
              {
                kind: 'race',
              },
            ],
        },
      ),
    ).toBe(
      '2 streams · chat · race',
    );
    expect(
      describeConfig(
        null,
      ),
    ).toBe(
      '',
    );
    expect(
      describeConfig(
        {
          panes:
            'x',
        },
      ),
    ).toBe(
      '',
    );
    expect(
      describeConfig(
        {
          panes:
            [
              null,
              {
                kind: 5,
              },
            ],
        },
      ),
    ).toBe(
      '',
    );
  });
});
