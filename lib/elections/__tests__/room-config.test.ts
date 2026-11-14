import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  LAYOUT_PANES,
  defaultRoomConfig,
  isRoomCode,
  newPane,
  sanitizeRoomConfig,
  validateRoomConfig,
  visiblePanes,
  withLayout,
  withPane,
  type Layout,
} from '../room-config';

const YT =
  'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

describe('sanitizeRoomConfig', () => {
  it('returns the default for junk', () => {
    for (const bad of [
      null,
      undefined,
      5,
      'x',
      [],
      {},
    ]) {
      const c =
        sanitizeRoomConfig(
          bad,
        );
      expect(
        c.layout,
      ).toBe(
        '3l',
      );
      expect(
        c.panes,
      ).toHaveLength(
        3,
      );
    }
  });

  it('keeps valid panes, drops invalid ones, and pads to the layout size', () => {
    const c =
      sanitizeRoomConfig(
        {
          layout:
            '4',
          panes:
            [
              {
                id: 'a',
                kind: 'chat',
              },
              {
                id: 'b',
                kind: 'nope',
              },
              {
                id: 'c',
                kind: 'map',
                office:
                  'house',
              },
            ],
        },
      );
    expect(
      c.panes.map(
        (
          p,
        ) =>
          p.kind,
      ),
    ).toEqual(
      [
        'chat',
        'map',
        'stream',
        'race',
      ],
    ); // the invalid pane was dropped, defaults filled in
    expect(
      c.panes,
    ).toHaveLength(
      4,
    );
    expect(
      c
        .panes[1],
    ).toMatchObject(
      {
        kind: 'map',
        office:
          'house',
      },
    );
  });

  it.each(
    Object.entries(
      LAYOUT_PANES,
    ) as [
      Layout,
      number,
    ][],
  )(
    'layout %s always has at least %i panes',
    (
      layout,
      n,
    ) => {
      expect(
        sanitizeRoomConfig(
          {
            layout,
            panes:
              [],
          },
        )
          .panes
          .length,
      ).toBeGreaterThanOrEqual(
        n,
      );
    },
  );

  it('applies defaults inside a pane and rejects an unknown state', () => {
    const c =
      sanitizeRoomConfig(
        {
          layout:
            '1',
          panes:
            [
              {
                id: 'r',
                kind: 'race',
              },
            ],
        },
      );
    expect(
      c
        .panes[0],
    ).toMatchObject(
      {
        kind: 'race',
        follow:
          'off',
        state:
          null,
        office:
          'senate',
      },
    );
    const bad =
      sanitizeRoomConfig(
        {
          layout:
            '1',
          panes:
            [
              {
                id: 'r',
                kind: 'race',
                state:
                  'ZZ',
              },
              {
                id: 'w',
                kind: 'wire',
                state:
                  'PA',
              },
            ],
        },
      );
    expect(
      bad
        .panes[0]
        .kind,
    ).toBe(
      'wire',
    ); // the ZZ pane was dropped
  });

  it('blanks a stream URL that cannot be embedded, but keeps the pane', () => {
    const c =
      sanitizeRoomConfig(
        {
          layout:
            '2h',
          panes:
            [
              {
                id: 's',
                kind: 'stream',
                url: 'https://evil.example/x',
              },
              {
                id: 't',
                kind: 'stream',
                url: YT,
              },
            ],
        },
      );
    expect(
      c
        .panes[0],
    ).toEqual(
      {
        id: 's',
        kind: 'stream',
        url: '',
      },
    );
    expect(
      c
        .panes[1],
    ).toEqual(
      {
        id: 't',
        kind: 'stream',
        url: YT,
      },
    );
  });

  it('caps panes and de-duplicates ids', () => {
    const many =
      Array.from(
        {
          length: 9,
        },
        () => ({
          id: 'same',
          kind: 'chat',
        }),
      );
    const c =
      sanitizeRoomConfig(
        {
          layout:
            '4',
          panes:
            many,
        },
      );
    expect(
      c.panes,
    ).toHaveLength(
      4,
    );
    expect(
      new Set(
        c.panes.map(
          (
            p,
          ) =>
            p.id,
        ),
      )
        .size,
    ).toBe(
      4,
    );
  });

  it('limits streams to four and ignores unknown layouts', () => {
    const c =
      sanitizeRoomConfig(
        {
          layout:
            'huge',
          panes:
            Array.from(
              {
                length: 4,
              },
              (
                _,
                i,
              ) => ({
                id: `s${i}`,
                kind: 'stream',
                url: YT,
              }),
            ),
        },
      );
    expect(
      c.layout,
    ).toBe(
      '3l',
    );
    expect(
      c.panes.filter(
        (
          p,
        ) =>
          p.kind ===
          'stream',
      )
        .length,
    ).toBeLessThanOrEqual(
      4,
    );
  });
});

describe('validateRoomConfig (strict, for API bodies)', () => {
  it('accepts a good config and returns the repaired form', () => {
    const r =
      validateRoomConfig(
        {
          layout:
            '2h',
          panes:
            [
              {
                id: 'a',
                kind: 'stream',
                url: YT,
              },
              {
                id: 'b',
                kind: 'chat',
              },
            ],
        },
      );
    expect(
      r.ok,
    ).toBe(
      true,
    );
  });
  it.each(
    [
      [
        null,
        'config must be an object',
      ],
      [
        {
          layout:
            'x',
          panes:
            [
              {
                id: 'a',
                kind: 'chat',
              },
            ],
        },
        'unknown layout',
      ],
      [
        {
          layout:
            '1',
          panes:
            [],
        },
        '1–4 panes',
      ],
      [
        {
          layout:
            '1',
          panes:
            [
              {
                id: 'a',
                kind: 'bogus',
              },
            ],
        },
        'invalid pane',
      ],
      [
        {
          layout:
            '1',
          panes:
            [
              {
                id: 'a',
                kind: 'stream',
                url: 'https://evil.example/x',
              },
            ],
        },
        'stream link is not an embeddable YouTube or Twitch link',
      ],
    ],
  )(
    'rejects %j',
    (
      raw,
      error,
    ) => {
      expect(
        validateRoomConfig(
          raw,
        ),
      ).toEqual(
        {
          ok: false,
          error,
        },
      );
    },
  );
});

describe('editing helpers', () => {
  it('replaces a pane by id keeping the id', () => {
    const c =
      withPane(
        defaultRoomConfig(),
        'p3',
        newPane(
          'wire',
          'ignored',
        ),
      );
    expect(
      c
        .panes[2],
    ).toEqual(
      {
        id: 'p3',
        kind: 'wire',
        state:
          null,
      },
    );
  });
  it('shrinking a layout hides, and growing back restores, panes', () => {
    const c =
      defaultRoomConfig();
    const small =
      withLayout(
        c,
        '1',
      );
    expect(
      visiblePanes(
        small,
      ),
    ).toHaveLength(
      1,
    );
    expect(
      small
        .panes
        .length,
    ).toBeGreaterThanOrEqual(
      3,
    );
    expect(
      visiblePanes(
        withLayout(
          small,
          '3l',
        ),
      ).map(
        (
          p,
        ) =>
          p.kind,
      ),
    ).toEqual(
      [
        'stream',
        'race',
        'chat',
      ],
    );
  });
  it('makes sensible new panes', () => {
    expect(
      newPane(
        'graph',
        'g',
      ),
    ).toMatchObject(
      {
        kind: 'graph',
        follow:
          'off',
        office:
          'senate',
        state:
          null,
      },
    );
  });
});

describe('isRoomCode', () => {
  it('accepts only 8 unambiguous characters', () => {
    expect(
      isRoomCode(
        'K7M2QXH9',
      ),
    ).toBe(
      true,
    );
    for (const bad of [
      'k7m2qxh9',
      'K7M2QXH',
      'K7M2QXH90',
      'K7M2QXHO',
      'K7M2QXH1',
      '',
      null,
      5,
    ])
      expect(
        isRoomCode(
          bad,
        ),
      ).toBe(
        false,
      );
  });
});
