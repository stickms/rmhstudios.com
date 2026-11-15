import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  loadModelIndex,
  parseModelIndex,
  resetModelIndexForTests,
  resolveModelFiles,
} from '../model-index';

const sha =
  (
    c: string,
  ) =>
    c.repeat(
      40,
    );

const INDEX =
  {
    'models/humans/group01/male_01.mdl':
      {
        glb: `${sha('a')}.glb`,
        anims: `${sha('b')}.glb`,
        skins: 1,
        skinned: true,
        bones: 56,
        kind: 'model',
      },
    'models/player/scout.mdl':
      {
        glb: `${sha('c')}.glb`,
        anims: `${sha('d')}.glb`,
        skins: 8,
        kind: 'player',
      },
    'models/static_prop.mdl':
      {
        glb: `${sha('e')}.glb`,
      },
  };

const respond =
  (
    body: unknown,
    status = 200,
  ) =>
    vi.fn(
      async (
        _url?: unknown,
        _init?: unknown,
      ) =>
        ({
          ok:
            status >=
              200 &&
            status <
              300,
          status,
          json: async () =>
            body,
        }) as unknown as Response,
    );

describe('parseModelIndex', () => {
  it('keeps the entries that name a mesh file and what Hearthworks reads of them', () => {
    const idx =
      parseModelIndex(
        INDEX,
      );
    expect(
      Object.keys(
        idx,
      ),
    ).toHaveLength(
      3,
    );
    expect(
      idx[
        'models/player/scout.mdl'
      ],
    ).toMatchObject(
      {
        glb: `${sha('c')}.glb`,
        anims: `${sha('d')}.glb`,
        skins: 8,
      },
    );
    expect(
      idx[
        'models/static_prop.mdl'
      ]
        .anims,
    ).toBeUndefined();
  });

  it('refuses entries whose file names are not content-addressed GLBs (no paths, no URLs)', () => {
    const idx =
      parseModelIndex(
        {
          'models/a.mdl':
            {
              glb: '../../secret.glb',
            },
          'models/b.mdl':
            {
              glb: 'https://evil.example/x.glb',
            },
          'models/c.mdl':
            {
              glb: 'plain.glb',
            },
          'models/d.mdl':
            {
              glb: `${sha('f')}.glb`,
              anims:
                '../x.glb',
            },
          'models/e.mdl':
            'nope',
          'models/f.mdl':
            null,
        },
      );
    expect(
      Object.keys(
        idx,
      ),
    ).toEqual(
      [
        'models/d.mdl',
      ],
    );
    expect(
      idx[
        'models/d.mdl'
      ]
        .anims,
    ).toBeUndefined();
  });

  it.each(
    [
      null,
      undefined,
      3,
      'x',
      [],
      true,
    ],
  )(
    'answers an empty index for garbage: %j',
    (
      junk,
    ) => {
      expect(
        Object.keys(
          parseModelIndex(
            junk,
          ),
        ),
      ).toEqual(
        [],
      );
    },
  );

  it('is not poisoned by keys like __proto__', () => {
    const idx =
      parseModelIndex(
        JSON.parse(
          '{"__proto__": {"glb": "' +
            sha(
              'a',
            ) +
            '.glb"}}',
        ),
      );
    expect(
      Object.getPrototypeOf(
        idx,
      ),
    ).toBeNull();
  });
});

describe('resolveModelFiles', () => {
  const idx =
    parseModelIndex(
      INDEX,
    );

  it('builds same-origin asset URLs for the mesh and the anim pack in the entry’s game', () => {
    expect(
      resolveModelFiles(
        idx,
        {
          game: 'hl2',
          mdl: 'models/humans/group01/male_01.mdl',
        },
      ),
    ).toEqual(
      {
        meshUrl: `/api/hl2-game/assets/mdl/${sha('a')}.glb`,
        animsUrl: `/api/hl2-game/assets/mdl/${sha('b')}.glb`,
        skins: 1,
      },
    );
    expect(
      resolveModelFiles(
        idx,
        {
          game: 'tf2',
          mdl: 'models/player/scout.mdl',
        },
      ),
    ).toMatchObject(
      {
        meshUrl: `/api/tf2-game/assets/mdl/${sha('c')}.glb`,
        skins: 8,
      },
    );
  });

  it('answers null for a model the index does not list, and no pack for a model without one', () => {
    expect(
      resolveModelFiles(
        idx,
        {
          game: 'hl2',
          mdl: 'models/combine_soldier.mdl',
        },
      ),
    ).toBeNull();
    expect(
      resolveModelFiles(
        null,
        {
          game: 'hl2',
          mdl: 'models/barney.mdl',
        },
      ),
    ).toBeNull();
    expect(
      resolveModelFiles(
        idx,
        {
          game: 'hl2',
          mdl: 'models/static_prop.mdl',
        },
      )
        ?.animsUrl,
    ).toBeNull();
  });
});

describe('loadModelIndex', () => {
  beforeEach(
    () =>
      resetModelIndexForTests(),
  );

  it('fetches a game’s index once, from the same-origin asset route, and caches it', async () => {
    const f =
      respond(
        INDEX,
      );
    const [
      a,
      b,
    ] =
      await Promise.all(
        [
          loadModelIndex(
            'hl2',
            {
              fetch:
                f,
            },
          ),
          loadModelIndex(
            'hl2',
            {
              fetch:
                f,
            },
          ),
        ],
      );
    await loadModelIndex(
      'hl2',
      {
        fetch:
          f,
      },
    );
    expect(
      f,
    ).toHaveBeenCalledTimes(
      1,
    );
    expect(
      f
        .mock
        .calls[0][0],
    ).toBe(
      '/api/hl2-game/assets/mdl/index.json',
    );
    expect(
      a,
    ).toBe(
      b,
    );
    expect(
      Object.keys(
        a!,
      ),
    ).toContain(
      'models/player/scout.mdl',
    );
  });

  it('keeps one index per game', async () => {
    const f =
      respond(
        INDEX,
      );
    await loadModelIndex(
      'hl2',
      {
        fetch:
          f,
      },
    );
    await loadModelIndex(
      'tf2',
      {
        fetch:
          f,
      },
    );
    expect(
      f.mock.calls.map(
        (
          c,
        ) =>
          c[0],
      ),
    ).toEqual(
      [
        '/api/hl2-game/assets/mdl/index.json',
        '/api/tf2-game/assets/mdl/index.json',
      ],
    );
  });

  it.each(
    [
      [
        'a 404 (no R2 behind the route: local dev, or a channel that was never synced)',
        () =>
          respond(
            {},
            404,
          ),
      ],
      [
        'a 500',
        () =>
          respond(
            {},
            500,
          ),
      ],
      [
        'a page instead of JSON',
        () =>
          vi.fn(
            async () =>
              ({
                ok: true,
                status: 200,
                json: async () => {
                  throw new SyntaxError(
                    '<!doctype',
                  );
                },
              }) as unknown as Response,
          ),
      ],
      [
        'a network error',
        () =>
          vi.fn(
            async () => {
              throw new TypeError(
                'offline',
              );
            },
          ),
      ],
      [
        'an index with nothing usable in it',
        () =>
          respond(
            {
              'models/a.mdl':
                {
                  nope: 1,
                },
            },
          ),
      ],
    ],
  )(
    'resolves null, never throws, on %s',
    async (
      _n,
      make,
    ) => {
      await expect(
        loadModelIndex(
          'hl2',
          {
            fetch:
              make(),
          },
        ),
      ).resolves.toBeNull();
    },
  );

  it('asks again for a missing index only after the retry window, not once per figure', async () => {
    let t = 1_000;
    const f =
      respond(
        {},
        404,
      );
    await loadModelIndex(
      'hl2',
      {
        fetch:
          f,
        now: () =>
          t,
      },
    );
    await loadModelIndex(
      'hl2',
      {
        fetch:
          f,
        now: () =>
          (t += 5_000),
      },
    );
    await loadModelIndex(
      'hl2',
      {
        fetch:
          f,
        now: () =>
          (t += 5_000),
      },
    );
    expect(
      f,
    ).toHaveBeenCalledTimes(
      1,
    );
    const good =
      respond(
        INDEX,
      );
    const idx =
      await loadModelIndex(
        'hl2',
        {
          fetch:
            good,
          now: () =>
            (t += 60_000),
        },
      );
    expect(
      good,
    ).toHaveBeenCalledTimes(
      1,
    );
    expect(
      idx,
    ).not.toBeNull();
  });

  it('has no fetch on the server: no index, no throw', async () => {
    vi.stubGlobal(
      'fetch',
      undefined,
    );
    await expect(
      loadModelIndex(
        'hl2',
      ),
    ).resolves.toBeNull();
    vi.unstubAllGlobals();
  });
});
