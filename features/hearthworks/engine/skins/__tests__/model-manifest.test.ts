import {
  readFileSync,
  readdirSync,
} from 'node:fs';
import path from 'node:path';
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { GAME_IDS } from '@/lib/tf2-game/assets/versions';
import {
  SKIN_IDS,
  SKINS,
} from '../catalog';
import {
  CLIP_FALLBACKS,
  CLIP_SLOTS,
  EMPTY_MANIFEST,
  MODEL_GAMES,
  clipNamesOf,
  getManifest,
  hasClip,
  loadManifest,
  missingRequiredClips,
  parseManifest,
  resetManifestForTests,
  subscribeManifest,
  resolveClip,
} from '../model-manifest';
import {
  FIGURE_SCALE,
  figureWorldHeight,
  modelScale,
} from '../figure-scale';
import {
  FIXTURE_CLIPS,
  MINIMAL_CLIPS,
} from './fixture-model';

const entry =
  (
    over: Record<
      string,
      unknown
    > = {},
  ) => ({
    game: 'hl2',
    mdl: 'models/humans/group01/male_01.mdl',
    skin: 0,
    handBone:
      'valvebiped.bip01_r_hand',
    provenance:
      'steam-r2',
    clips:
      {
        idle: 'idle_subtle',
        walk: 'walk_all@4',
      },
    ...over,
  });

const v2 =
  (
    models: Record<
      string,
      unknown
    >,
  ) => ({
    version: 2,
    models,
  });

describe('parseManifest (v2: remote sources, no files)', () => {
  it('accepts the documented shape and keeps only skins in the catalog', () => {
    const m =
      parseManifest(
        v2(
          {
            citizen:
              entry(),
            'not-a-skin':
              entry(),
          },
        ),
      );
    expect(
      Object.keys(
        m.models,
      ),
    ).toEqual(
      [
        'citizen',
      ],
    );
    expect(
      m
        .models
        .citizen,
    ).toMatchObject(
      {
        game: 'hl2',
        mdl: 'models/humans/group01/male_01.mdl',
        skin: 0,
        yaw: 0,
      },
    );
    // a bare string is a clip name; every spec comes out as an object
    expect(
      m
        .models
        .citizen
        ?.clips
        .idle,
    ).toEqual(
      {
        clip: 'idle_subtle',
      },
    );
    expect(
      m
        .models
        .citizen
        ?.clips
        .walk,
    ).toEqual(
      {
        clip: 'walk_all@4',
      },
    );
  });

  it('defaults skin to family 0, yaw to 0 and the hand bone to none', () => {
    const m =
      parseManifest(
        v2(
          {
            citizen:
              {
                game: 'tf2',
                mdl: 'models/player/scout.mdl',
                provenance:
                  'steam-r2',
                clips:
                  {
                    idle: 'i',
                    walk: 'w',
                  },
              },
          },
        ),
      );
    expect(
      m
        .models
        .citizen,
    ).toMatchObject(
      {
        skin: 0,
        yaw: 0,
        handBone:
          null,
      },
    );
    expect(
      m
        .models
        .citizen
        ?.height,
    ).toBeUndefined();
  });

  it('keeps the team skin, height, yaw and hold offset when given', () => {
    const m =
      parseManifest(
        v2(
          {
            scout:
              entry(
                {
                  game: 'tf2',
                  mdl: 'models/player/scout.mdl',
                  skin: 1,
                  height: 1.7,
                  yaw: 3.14,
                  hold: {
                    pos: [
                      0,
                      0.01,
                      0,
                    ],
                    rot: [
                      0,
                      1,
                      0,
                    ],
                  },
                },
              ),
          },
        ),
      );
    expect(
      m
        .models
        .scout,
    ).toMatchObject(
      {
        skin: 1,
        height: 1.7,
        yaw: 3.14,
        hold: {
          rot: [
            0,
            1,
            0,
          ],
        },
      },
    );
  });

  it('reads a clip given as { clip, trim } and treats null optional clips as absent', () => {
    const m =
      parseManifest(
        v2(
          {
            citizen:
              entry(
                {
                  clips:
                    {
                      idle: 'i',
                      walk: 'w',
                      death:
                        {
                          clip: 'cit_door',
                          trim: [
                            12,
                            52,
                          ],
                        },
                      run: null,
                      shoot:
                        null,
                    },
                },
              ),
          },
        ),
      );
    const c =
      m
        .models
        .citizen!
        .clips;
    expect(
      c.death,
    ).toEqual(
      {
        clip: 'cit_door',
        trim: [
          12,
          52,
        ],
      },
    );
    expect(
      c.run,
    ).toBeUndefined();
    expect(
      c.shoot,
    ).toBeUndefined();
    expect(
      clipNamesOf(
        m
          .models
          .citizen!,
      ),
    ).toEqual(
      {
        idle: 'i',
        walk: 'w',
        death:
          'cit_door',
      },
    );
  });

  it('allows a null hand bone', () => {
    expect(
      parseManifest(
        v2(
          {
            citizen:
              entry(
                {
                  handBone:
                    null,
                },
              ),
          },
        ),
      )
        .models
        .citizen
        ?.handBone,
    ).toBeNull();
  });

  it('drops a bad entry but keeps the good ones', () => {
    const m =
      parseManifest(
        v2(
          {
            citizen:
              entry(
                {
                  height:
                    -1,
                },
              ),
            worker:
              entry(),
            rebel:
              entry(
                {
                  clips:
                    {
                      idle: 'x',
                    },
                },
              ),
            barney:
              entry(
                {
                  clips:
                    {
                      idle: 'i',
                      walk: 'w',
                      death:
                        {
                          clip: 'd',
                          trim: [
                            50,
                            10,
                          ],
                        },
                    },
                },
              ),
          },
        ),
      );
    expect(
      Object.keys(
        m.models,
      ),
    ).toEqual(
      [
        'worker',
      ],
    );
  });

  it.each(
    [
      [
        'a url',
        'https://evil.example/models/a.mdl',
      ],
      [
        'a path out of the channel',
        '../../etc/passwd.mdl',
      ],
      [
        'an upper-case path (the index is lower-case)',
        'models/Barney.mdl',
      ],
      [
        'a non-mdl',
        'models/barney.glb',
      ],
      [
        'a path outside models/',
        'maps/x.mdl',
      ],
    ],
  )(
    'refuses %s as a model path',
    (
      _n,
      mdl,
    ) => {
      expect(
        parseManifest(
          v2(
            {
              citizen:
                entry(
                  {
                    mdl,
                  },
                ),
            },
          ),
        )
          .models
          .citizen,
      ).toBeUndefined();
    },
  );

  it('refuses a game that is not an asset channel, and the retired v1 `file` shape', () => {
    expect(
      parseManifest(
        v2(
          {
            citizen:
              entry(
                {
                  game: 'gmod',
                },
              ),
          },
        ),
      )
        .models
        .citizen,
    ).toBeUndefined();
    const v1 =
      {
        version: 1,
        models:
          {
            citizen:
              {
                file: 'citizen.glb',
                height: 1.8,
                yaw: 0,
                handBone:
                  null,
                bytes: 1,
                provenance:
                  'valve-source',
                clips:
                  {
                    idle: 'a',
                    walk: 'b',
                  },
              },
          },
      };
    expect(
      parseManifest(
        v1,
      ),
    ).toBe(
      EMPTY_MANIFEST,
    );
    expect(
      parseManifest(
        v2(
          {
            citizen:
              {
                file: 'citizen.glb',
                provenance:
                  'valve-source',
                clips:
                  {
                    idle: 'a',
                    walk: 'b',
                  },
              },
          },
        ),
      )
        .models
        .citizen,
    ).toBeUndefined();
  });

  it('lists the skins the file marks as stand-ins and gives them no model', () => {
    const m =
      parseManifest(
        v2(
          {
            breen:
              {
                provenance:
                  'stand-in',
                reason:
                  'not in the channel',
              },
            citizen:
              entry(),
          },
        ),
      );
    expect(
      m.standIns,
    ).toEqual(
      [
        'breen',
      ],
    );
    expect(
      m
        .models
        .breen,
    ).toBeUndefined();
    expect(
      Object.keys(
        m.models,
      ),
    ).toEqual(
      [
        'citizen',
      ],
    );
  });

  it.each(
    [
      null,
      undefined,
      3,
      'x',
      [],
      {
        version: 1,
        models:
          {},
      },
      {
        version: 3,
        models:
          {},
      },
      {
        version: 2,
      },
      {
        version: 2,
        models:
          [],
      },
    ],
  )(
    'answers "no models" for garbage: %j',
    (
      junk,
    ) => {
      expect(
        parseManifest(
          junk,
        ),
      ).toBe(
        EMPTY_MANIFEST,
      );
    },
  );

  it('keeps the asset channel list in step with the site’s GAME_IDS', () => {
    expect(
      [
        ...MODEL_GAMES,
      ],
    ).toEqual(
      [
        ...GAME_IDS,
      ],
    );
  });
});

describe('the bundled models.manifest.json', () => {
  const raw =
    JSON.parse(
      readFileSync(
        path.join(
          process.cwd(),
          'features/hearthworks/engine/skins/models.manifest.json',
        ),
        'utf8',
      ),
    ) as {
      version: number;
      models: Record<
        string,
        unknown
      >;
    };
  const parsed =
    parseManifest(
      raw,
    );

  it('is v2 and accounts for every skin: a remote model or an explicit stand-in', () => {
    expect(
      raw.version,
    ).toBe(
      2,
    );
    for (const id of SKIN_IDS)
      expect(
        Boolean(
          parsed
            .models[
            id
          ],
        ) !==
          parsed.standIns.includes(
            id,
          ),
        id,
      ).toBe(
        true,
      );
    // nothing in the file is dropped by validation
    expect(
      Object.keys(
        raw.models,
      ).sort(),
    ).toEqual(
      [
        ...SKIN_IDS,
      ].sort(),
    );
  });

  it('names the catalog’s own source model for each skin that has one', () => {
    for (const id of SKIN_IDS) {
      const e =
        parsed
          .models[
          id
        ];
      if (
        !e
      )
        continue;
      const source =
        SKINS[
          id
        ]
          .source;
      expect(
        source,
        id,
      ).not.toBeNull();
      // citizen/worker/rebel are mapped to the group01 models the hl2 channel does have (group03 is absent there)
      if (
        e.game ===
        'tf2'
      )
        expect(
          source,
        ).toBe(
          `tf2:${e.mdl}`,
        );
      else
        expect(
          e.game,
        ).toBe(
          source!.split(
            ':',
          )[0],
        );
    }
  });

  it('gives every model the two required clips, by a plain glTF animation name', () => {
    for (const e of Object.values(
      parsed.models,
    )) {
      const names =
        clipNamesOf(
          e!,
        );
      expect(
        missingRequiredClips(
          {
            clips:
              names,
          },
          new Set(
            Object.values(
              names,
            ),
          ),
        ),
      ).toEqual(
        [],
      );
      for (const n of Object.values(
        names,
      ))
        expect(
          n,
        ).toMatch(
          /^[A-Za-z0-9_]+(@\d+)?$/,
        );
    }
  });

  it('ships no model data: nothing but the credits in the public folder (the manifest is bundled)', () => {
    const files =
      readdirSync(
        path.join(
          process.cwd(),
          'public/models/hearthworks',
        ),
      );
    expect(
      files.sort(),
    ).toEqual(
      [
        'CREDITS.md',
      ],
    );
  });
});

describe('resolveClip', () => {
  const full =
    FIXTURE_CLIPS;
  it('returns the model’s own clip when it has one', () => {
    for (const slot of CLIP_SLOTS) {
      expect(
        resolveClip(
          full,
          slot,
        ),
      ).toEqual(
        {
          slot,
          animation:
            full
              .clips[
              slot
            ],
        },
      );
      expect(
        hasClip(
          full,
          slot,
        ),
      ).toBe(
        true,
      );
    }
  });

  it('falls back run→walk→idle, shoot/reload/interact/hurt→idle, death→hurt→idle, jump/fall→idle', () => {
    const min =
      MINIMAL_CLIPS;
    expect(
      resolveClip(
        min,
        'run',
      ),
    ).toEqual(
      {
        slot: 'walk',
        animation:
          'Walk',
      },
    );
    for (const s of [
      'shoot',
      'reload',
      'interact',
      'hurt',
      'jump',
      'fall',
      'death',
    ] as const) {
      expect(
        resolveClip(
          min,
          s,
        ),
      ).toEqual(
        {
          slot: 'idle',
          animation:
            'Idle',
        },
      );
      expect(
        hasClip(
          min,
          s,
        ),
      ).toBe(
        false,
      );
    }
    const hurtOnly =
      {
        clips:
          {
            ...min.clips,
            hurt: 'Hurt',
          },
      };
    expect(
      resolveClip(
        hurtOnly,
        'death',
      ),
    ).toEqual(
      {
        slot: 'hurt',
        animation:
          'Hurt',
      },
    );
    const noRunOrWalkInFile =
      resolveClip(
        min,
        'run',
        new Set(
          [
            'Idle',
          ],
        ),
      );
    expect(
      noRunOrWalkInFile,
    ).toEqual(
      {
        slot: 'idle',
        animation:
          'Idle',
      },
    );
  });

  it('treats a clip the file does not contain as missing', () => {
    const available =
      new Set(
        [
          'Idle',
          'Walk',
          'Run',
        ],
      );
    expect(
      resolveClip(
        full,
        'run',
        available,
      )
        .slot,
    ).toBe(
      'run',
    );
    expect(
      resolveClip(
        full,
        'shoot',
        available,
      )
        .slot,
    ).toBe(
      'idle',
    );
  });

  it('every chain starts at the clip asked for and ends at idle', () => {
    for (const slot of CLIP_SLOTS) {
      const chain =
        CLIP_FALLBACKS[
          slot
        ];
      expect(
        chain[0],
      ).toBe(
        slot,
      );
      expect(
        chain.at(
          -1,
        ),
      ).toBe(
        'idle',
      );
    }
  });

  it('requires idle and walk to exist in the file', () => {
    expect(
      missingRequiredClips(
        FIXTURE_CLIPS,
        new Set(
          [
            'Idle',
            'Walk',
          ],
        ),
      ),
    ).toEqual(
      [],
    );
    expect(
      missingRequiredClips(
        FIXTURE_CLIPS,
        new Set(
          [
            'Walk',
          ],
        ),
      ),
    ).toEqual(
      [
        'idle',
      ],
    );
    expect(
      missingRequiredClips(
        FIXTURE_CLIPS,
        new Set(),
      ),
    ).toEqual(
      [
        'idle',
        'walk',
      ],
    );
  });
});

describe('figure size contract', () => {
  it('scales any model to the procedural figure’s height', () => {
    for (const metres of [
      1.4,
      1.8,
      2.3,
      72,
    ]) {
      expect(
        modelScale(
          metres,
          1,
        ) *
          metres,
      ).toBeCloseTo(
        figureWorldHeight(
          1,
        ),
        10,
      );
    }
    expect(
      figureWorldHeight(
        1,
      ),
    ).toBeCloseTo(
      1.26 *
        FIGURE_SCALE,
      10,
    );
    // A person is about 0.4 tile (a door is 0.44).
    expect(
      figureWorldHeight(
        1,
      ),
    ).toBeGreaterThan(
      0.3,
    );
    expect(
      figureWorldHeight(
        1,
      ),
    ).toBeLessThan(
      0.44,
    );
  });

  it('honours the skin’s height multiplier and survives bad numbers', () => {
    expect(
      figureWorldHeight(
        1.1,
      ),
    ).toBeCloseTo(
      figureWorldHeight(
        1,
      ) *
        1.1,
      10,
    );
    for (const bad of [
      0,
      -1,
      NaN,
      Infinity,
    ]) {
      expect(
        Number.isFinite(
          modelScale(
            bad,
            1,
          ),
        ),
      ).toBe(
        true,
      );
      expect(
        modelScale(
          1.8,
          bad,
        ),
      ).toBeCloseTo(
        modelScale(
          1.8,
          1,
        ),
        10,
      );
    }
  });
});

describe('the bundled manifest is what the game reads', () => {
  beforeEach(
    () =>
      resetManifestForTests(),
  );

  it('is available immediately and without any request', async () => {
    const fetchSpy =
      vi.fn();
    vi.stubGlobal(
      'fetch',
      fetchSpy,
    );
    try {
      const a =
        await loadManifest();
      const b =
        await loadManifest();
      expect(
        a,
      ).toBe(
        b,
      );
      expect(
        a,
      ).toBe(
        getManifest(),
      );
      expect(
        getManifest()
          .models
          .citizen,
      ).toBeDefined();
      expect(
        fetchSpy,
      ).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('tells subscribers when a test replaces it', () => {
    const l =
      vi.fn();
    const off =
      subscribeManifest(
        l,
      );
    resetManifestForTests(
      parseManifest(
        v2(
          {
            citizen:
              entry(),
          },
        ),
      ),
    );
    expect(
      l,
    ).toHaveBeenCalledTimes(
      1,
    );
    off();
    resetManifestForTests();
    expect(
      l,
    ).toHaveBeenCalledTimes(
      1,
    );
  });
});
