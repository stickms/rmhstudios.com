import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  CROPS,
  ITEMS,
} from '../../content';
import {
  LEVEL_HEIGHT,
  MAX_LEVEL,
  MEADOW_LEVEL,
  TICK_MS,
  START_MONEY,
  WATER_LEVEL,
  buildingAt,
  createWorld,
  cropStage,
  stepWorld,
  tileTop,
  type Command,
} from '..';

const P =
  'p1';
function fresh(
  seed = 7,
) {
  const w =
    createWorld(
      seed,
      24,
    );
  stepWorld(
    w,
    0,
    [
      {
        type: 'join',
        playerId:
          P,
      },
    ],
  );
  // Stand off to the side so tests can build on the middle tiles (a solid building cannot go up under someone).
  w.players[
    P
  ].x =
    2;
  w.players[
    P
  ].z =
    2;
  return w;
}
const center =
  (w: {
    size: number;
  }) =>
    Math.floor(
      w.size /
        2,
    );

describe('createWorld', () => {
  it('is deterministic and shaped size×size with a water rim and a grass spawn', () => {
    const a =
      createWorld(
        42,
        24,
      );
    const b =
      createWorld(
        42,
        24,
      );
    expect(
      JSON.stringify(
        a,
      ),
    ).toBe(
      JSON.stringify(
        b,
      ),
    );
    expect(
      a.terrain,
    ).toHaveLength(
      24 *
        24,
    );
    expect(
      a
        .terrain[0],
    ).toBe(
      'water',
    );
    const m =
      center(
        a,
      );
    for (
      let dz =
        -3;
      dz <=
      3;
      dz++
    )
      for (
        let dx =
          -3;
        dx <=
        3;
        dx++
      )
        expect(
          a
            .terrain[
            (m +
              dz) *
              24 +
              (m +
                dx)
          ],
        ).toBe(
          'grass',
        );
    expect(
      JSON.stringify(
        createWorld(
          43,
          24,
        ),
      ),
    ).not.toBe(
      JSON.stringify(
        a,
      ),
    );
  });

  it('clamps absurd sizes', () => {
    expect(
      createWorld(
        1,
        5,
      )
        .size,
    ).toBe(
      8,
    );
    expect(
      createWorld(
        1,
        5000,
      )
        .size,
    ).toBe(
      96,
    );
  });
});

describe('stepWorld', () => {
  it('is deterministic for the same seed and command stream', () => {
    const run =
      () => {
        const w =
          fresh();
        const m =
          center(
            w,
          );
        const cmds: Command[] =
          [
            {
              type: 'place',
              playerId:
                P,
              kind: 'plot',
              x: m,
              z: m,
            },
            {
              type: 'plant',
              playerId:
                P,
              crop: 'wheat',
              x: m,
              z: m,
            },
          ];
        stepWorld(
          w,
          0,
          cmds,
        );
        for (
          let i = 0;
          i <
          200;
          i++
        )
          stepWorld(
            w,
            TICK_MS,
          );
        return JSON.stringify(
          w,
        );
      };
    expect(
      run(),
    ).toBe(
      run(),
    );
  });

  it('accumulates sub-tick time and ignores bad dt', () => {
    const w =
      fresh();
    stepWorld(
      w,
      TICK_MS /
        2,
    );
    expect(
      w.tick,
    ).toBe(
      0,
    );
    stepWorld(
      w,
      TICK_MS /
        2,
    );
    expect(
      w.tick,
    ).toBe(
      1,
    );
    stepWorld(
      w,
      Number.NaN,
    );
    stepWorld(
      w,
      -500,
    );
    expect(
      w.tick,
    ).toBe(
      1,
    );
  });

  it('rejects building on occupied, water, or when broke', () => {
    const w =
      fresh();
    const m =
      center(
        w,
      );
    stepWorld(
      w,
      0,
      [
        {
          type: 'place',
          playerId:
            P,
          kind: 'cottage',
          x: m,
          z: m,
        },
      ],
    );
    const ev =
      stepWorld(
        w,
        0,
        [
          {
            type: 'place',
            playerId:
              P,
            kind: 'road',
            x: m,
            z: m,
          },
          {
            type: 'place',
            playerId:
              P,
            kind: 'road',
            x: 0,
            z: 0,
          },
          {
            type: 'place',
            playerId:
              P,
            kind: 'kitchen',
            x:
              m +
              1,
            z: m,
          },
          {
            type: 'place',
            playerId:
              P,
            kind: 'kitchen',
            x:
              m +
              2,
            z: m,
          },
        ],
      );
    const reasons =
      ev
        .filter(
          (
            e,
          ) =>
            e.type ===
            'rejected',
        )
        .map(
          (
            e,
          ) =>
            (
              e as {
                reason: string;
              }
            )
              .reason,
        );
    expect(
      reasons,
    ).toEqual(
      [
        'occupied',
        'bad-terrain',
        'cannot-afford',
      ],
    );
  });

  it('refunds half on remove and clears a crop on that tile', () => {
    const w =
      fresh();
    const m =
      center(
        w,
      );
    stepWorld(
      w,
      0,
      [
        {
          type: 'place',
          playerId:
            P,
          kind: 'plot',
          x: m,
          z: m,
        },
        {
          type: 'plant',
          playerId:
            P,
          crop: 'wheat',
          x: m,
          z: m,
        },
      ],
    );
    const before =
      w
        .players[
        P
      ]
        .money;
    stepWorld(
      w,
      0,
      [
        {
          type: 'remove',
          playerId:
            P,
          x: m,
          z: m,
        },
      ],
    );
    expect(
      w
        .players[
        P
      ]
        .money,
    ).toBe(
      before +
        10,
    );
    expect(
      buildingAt(
        w,
        m,
        m,
      ),
    ).toBeUndefined();
    expect(
      w.crops,
    ).toHaveLength(
      0,
    );
  });

  it('grows a crop through stages, refuses an early harvest, then yields on ripe', () => {
    const w =
      fresh();
    const m =
      center(
        w,
      );
    const def =
      CROPS.wheat;
    stepWorld(
      w,
      0,
      [
        {
          type: 'place',
          playerId:
            P,
          kind: 'plot',
          x: m,
          z: m,
        },
        {
          type: 'plant',
          playerId:
            P,
          crop: 'wheat',
          x: m,
          z: m,
        },
      ],
    );
    const early =
      stepWorld(
        w,
        0,
        [
          {
            type: 'harvest',
            playerId:
              P,
            x: m,
            z: m,
          },
        ],
      );
    expect(
      early,
    ).toEqual(
      [
        {
          type: 'rejected',
          command:
            'harvest',
          playerId:
            P,
          reason:
            'not-ripe',
        },
      ],
    );
    const grew =
      stepWorld(
        w,
        def.stageMs *
          def.stages,
      ).filter(
        (
          e,
        ) =>
          e.type ===
          'cropGrew',
      );
    expect(
      grew.map(
        (
          e,
        ) =>
          (
            e as {
              stage: number;
            }
          )
            .stage,
      ),
    ).toEqual(
      [
        1,
        2,
        3,
      ],
    );
    expect(
      cropStage(
        w,
        w
          .crops[0],
      ),
    ).toBe(
      def.stages,
    );
    stepWorld(
      w,
      0,
      [
        {
          type: 'harvest',
          playerId:
            P,
          x: m,
          z: m,
        },
      ],
    );
    expect(
      w
        .players[
        P
      ]
        .inventory
        .wheat,
    ).toBe(
      def.yieldQty,
    );
    expect(
      w.crops,
    ).toHaveLength(
      0,
    );
  });

  it('only plants on a plot', () => {
    const w =
      fresh();
    const m =
      center(
        w,
      );
    const ev =
      stepWorld(
        w,
        0,
        [
          {
            type: 'plant',
            playerId:
              P,
            crop: 'wheat',
            x: m,
            z: m,
          },
        ],
      );
    expect(
      ev,
    ).toEqual(
      [
        {
          type: 'rejected',
          command:
            'plant',
          playerId:
            P,
          reason:
            'no-plot',
        },
      ],
    );
  });

  it('closes the loop: harvest → cook at a kitchen → sell at a stall', () => {
    const w =
      fresh();
    const m =
      center(
        w,
      );
    w.players[
      P
    ].money =
      1000;
    w.players[
      P
    ].inventory =
      {
        wheat: 6,
      };
    const ev =
      stepWorld(
        w,
        0,
        [
          {
            type: 'cook',
            playerId:
              P,
            recipe:
              'flour',
          }, // no kitchen yet
          {
            type: 'place',
            playerId:
              P,
            kind: 'kitchen',
            x: m,
            z: m,
          },
          {
            type: 'cook',
            playerId:
              P,
            recipe:
              'flour',
          },
          {
            type: 'cook',
            playerId:
              P,
            recipe:
              'flour',
          },
          {
            type: 'cook',
            playerId:
              P,
            recipe:
              'bread',
          },
          {
            type: 'sell',
            playerId:
              P,
            item: 'bread',
            qty: 1,
          }, // no stall yet
          {
            type: 'place',
            playerId:
              P,
            kind: 'stall',
            x:
              m +
              1,
            z: m,
          },
          {
            type: 'sell',
            playerId:
              P,
            item: 'bread',
            qty: 1,
          },
        ],
      );
    const types =
      ev.map(
        (
          e,
        ) =>
          e.type ===
          'rejected'
            ? `x:${e.reason}`
            : e.type,
      );
    expect(
      types,
    ).toEqual(
      [
        'x:no-kitchen',
        'placed',
        'cooked',
        'cooked',
        'cooked',
        'x:no-stall',
        'placed',
        'sold',
      ],
    );
    const p =
      w
        .players[
        P
      ];
    expect(
      p
        .inventory
        .wheat,
    ).toBe(
      0,
    );
    expect(
      p.money,
    ).toBe(
      1000 -
        150 -
        80 +
        ITEMS
          .bread
          .price,
    );
  });

  it('rejects hostile input without throwing or minting money', () => {
    const w =
      fresh();
    const before =
      JSON.stringify(
        w
          .players[
          P
        ],
      );
    const ev =
      stepWorld(
        w,
        0,
        [
          {
            type: 'sell',
            playerId:
              P,
            item: 'bread',
            qty: -5,
          },
          {
            type: 'sell',
            playerId:
              P,
            item: 'bread',
            qty: 1.5,
          },
          {
            type: 'sell',
            playerId:
              P,
            item: '__proto__' as never,
            qty: 1,
          },
          {
            type: 'cook',
            playerId:
              P,
            recipe:
              '__proto__',
          },
          {
            type: 'cook',
            playerId:
              P,
            recipe:
              'constructor',
          },
          {
            type: 'move',
            playerId:
              P,
            x: Number.NaN,
            z: 0,
          },
          {
            type: 'place',
            playerId:
              'ghost',
            kind: 'road',
            x: 5,
            z: 5,
          },
        ],
      );
    expect(
      ev.every(
        (
          e,
        ) =>
          e.type ===
          'rejected',
      ),
    ).toBe(
      true,
    );
    expect(
      JSON.stringify(
        w
          .players[
          P
        ],
      ),
    ).toBe(
      before,
    );
    expect(
      w
        .players[
        P
      ]
        .money,
    ).toBe(
      START_MONEY,
    );
  });
});

describe('terrain heights', () => {
  it('has one height per tile, in range, consistent with water, and a flat meadow at spawn', () => {
    const w =
      createWorld(
        42,
        32,
      );
    expect(
      w.height,
    ).toHaveLength(
      w
        .terrain
        .length,
    );
    const m =
      Math.floor(
        w.size /
          2,
      );
    for (
      let i = 0;
      i <
      w
        .height
        .length;
      i++
    ) {
      expect(
        Number.isInteger(
          w
            .height[
            i
          ],
        ),
      ).toBe(
        true,
      );
      expect(
        w
          .height[
          i
        ],
      ).toBeGreaterThanOrEqual(
        0,
      );
      expect(
        w
          .height[
          i
        ],
      ).toBeLessThanOrEqual(
        MAX_LEVEL,
      );
      expect(
        w
          .terrain[
          i
        ] ===
          'water',
      ).toBe(
        w
          .height[
          i
        ] <=
          WATER_LEVEL,
      );
    }
    for (
      let dz =
        -3;
      dz <=
      3;
      dz++
    )
      for (
        let dx =
          -3;
        dx <=
        3;
        dx++
      ) {
        expect(
          w
            .height[
            (m +
              dz) *
              w.size +
              (m +
                dx)
          ],
        ).toBe(
          MEADOW_LEVEL,
        );
        expect(
          w
            .terrain[
            (m +
              dz) *
              w.size +
              (m +
                dx)
          ],
        ).toBe(
          'grass',
        );
      }
  });

  it('is varied: several heights and several terrain kinds, deterministically', () => {
    const a =
      createWorld(
        7,
        40,
      );
    expect(
      new Set(
        a.height,
      )
        .size,
    ).toBeGreaterThanOrEqual(
      4,
    );
    expect(
      new Set(
        a.terrain,
      )
        .size,
    ).toBeGreaterThanOrEqual(
      3,
    );
    expect(
      JSON.stringify(
        createWorld(
          7,
          40,
        ),
      ),
    ).toBe(
      JSON.stringify(
        a,
      ),
    );
  });

  it('never steps more than two levels between neighbours (rolling, not spiky)', () => {
    const w =
      createWorld(
        99,
        48,
      );
    for (
      let z = 0;
      z <
      w.size;
      z++
    )
      for (
        let x = 0;
        x <
        w.size -
          1;
        x++
      ) {
        expect(
          Math.abs(
            w
              .height[
              z *
                w.size +
                x
            ] -
              w
                .height[
                z *
                  w.size +
                  x +
                  1
              ],
          ),
        ).toBeLessThanOrEqual(
          2,
        );
        if (
          z <
          w.size -
            1
        )
          expect(
            Math.abs(
              w
                .height[
                z *
                  w.size +
                  x
              ] -
                w
                  .height[
                  (z +
                    1) *
                    w.size +
                    x
                ],
            ),
          ).toBeLessThanOrEqual(
            2,
          );
      }
  });

  it('puts water at one level and land at LEVEL_HEIGHT × level', () => {
    const w =
      createWorld(
        42,
        32,
      );
    const m =
      Math.floor(
        w.size /
          2,
      );
    expect(
      tileTop(
        w,
        m,
        m,
      ),
    ).toBeCloseTo(
      MEADOW_LEVEL *
        LEVEL_HEIGHT,
      6,
    );
    expect(
      tileTop(
        w,
        0,
        0,
      ),
    ).toBeCloseTo(
      WATER_LEVEL *
        LEVEL_HEIGHT,
      6,
    );
    expect(
      tileTop(
        w,
        -5,
        3,
      ),
    ).toBe(
      0,
    );
  });
});

describe('skins in the world', () => {
  it('starts every player in the free skin, owning only it', () => {
    const w =
      fresh();
    expect(
      w
        .players[
        P
      ]
        .skin,
    ).toBe(
      'citizen',
    );
    expect(
      w
        .players[
        P
      ]
        .ownedSkins,
    ).toEqual(
      [
        'citizen',
      ],
    );
  });

  it('buys with in-game money, then equips; refuses duplicates, the broke, and the unowned', () => {
    const w =
      fresh();
    w.players[
      P
    ].money =
      2000;
    const ev =
      stepWorld(
        w,
        0,
        [
          {
            type: 'setSkin',
            playerId:
              P,
            skin: 'barney',
          }, // not owned yet
          {
            type: 'buySkin',
            playerId:
              P,
            skin: 'gman',
          }, // far too dear
          {
            type: 'buySkin',
            playerId:
              P,
            skin: 'barney',
          },
          {
            type: 'buySkin',
            playerId:
              P,
            skin: 'barney',
          }, // again
          {
            type: 'setSkin',
            playerId:
              P,
            skin: 'barney',
          },
          {
            type: 'buySkin',
            playerId:
              P,
            skin: 'nuke' as never,
          },
        ],
      );
    const tags =
      ev.map(
        (
          e,
        ) =>
          e.type ===
          'rejected'
            ? `x:${e.reason}`
            : e.type,
      );
    expect(
      tags,
    ).toEqual(
      [
        'x:not-owned',
        'x:cannot-afford',
        'skinBought',
        'x:already-owned',
        'skinChanged',
        'x:unknown-skin',
      ],
    );
    expect(
      w
        .players[
        P
      ]
        .money,
    ).toBe(
      2000 -
        1200,
    );
    expect(
      w
        .players[
        P
      ]
        .skin,
    ).toBe(
      'barney',
    );
    expect(
      w
        .players[
        P
      ]
        .ownedSkins,
    ).toEqual(
      [
        'citizen',
        'barney',
      ],
    );
  });
});

describe('building around people', () => {
  it('refuses a solid building on a tile a player is standing on, but allows a road', () => {
    const w =
      fresh();
    const m =
      center(
        w,
      );
    w.players[
      P
    ].money =
      5000;
    w.players[
      P
    ].x =
      m;
    w.players[
      P
    ].z =
      m;
    const ev =
      stepWorld(
        w,
        0,
        [
          {
            type: 'place',
            playerId:
              P,
            kind: 'cottage',
            x: m,
            z: m,
          },
          {
            type: 'place',
            playerId:
              P,
            kind: 'road',
            x: m,
            z: m,
          },
        ],
      );
    expect(
      ev.map(
        (
          e,
        ) =>
          e.type ===
          'rejected'
            ? `x:${e.reason}`
            : e.type,
      ),
    ).toEqual(
      [
        'x:occupied',
        'roadsLaid',
      ],
    );
  });
});
