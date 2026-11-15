import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  createWorld,
  stepWorld,
} from '../../world';
import {
  SaveFormatError,
  SAVE_VERSION,
  decodeWorld,
  encodeWorld,
} from '..';

function sample() {
  const w =
    createWorld(
      9,
      16,
    );
  stepWorld(
    w,
    0,
    [
      {
        type: 'join',
        playerId:
          'a',
      },
      {
        type: 'place',
        playerId:
          'a',
        kind: 'plot',
        x: 8,
        z: 8,
      },
      {
        type: 'plant',
        playerId:
          'a',
        crop: 'corn',
        x: 8,
        z: 8,
      },
    ],
  );
  stepWorld(
    w,
    1234,
  );
  return w;
}

describe('world save format', () => {
  it('round-trips a world exactly', () => {
    const w =
      sample();
    expect(
      decodeWorld(
        encodeWorld(
          w,
        ),
      ),
    ).toEqual(
      w,
    );
  });

  it('refuses garbage, truncation, a future version and bad bodies with a typed error', () => {
    const good =
      encodeWorld(
        sample(),
      );
    expect(
      () =>
        decodeWorld(
          new Uint8Array(
            [
              1,
              2,
              3,
            ],
          ),
        ),
    ).toThrow(
      SaveFormatError,
    );
    expect(
      () =>
        decodeWorld(
          good.subarray(
            0,
            12,
          ),
        ),
    ).toThrow(
      SaveFormatError,
    );
    const future =
      good.slice();
    future[4] =
      SAVE_VERSION +
      1;
    expect(
      () =>
        decodeWorld(
          future,
        ),
    ).toThrow(
      /version/,
    );
    const corrupt =
      good.slice();
    corrupt[10] = 0x00;
    expect(
      () =>
        decodeWorld(
          corrupt,
        ),
    ).toThrow(
      SaveFormatError,
    );
  });

  it('refuses a structurally valid world that lies (terrain length, negative money, unknown ids)', () => {
    const lie =
      (
        mutate: (
          w: Record<
            string,
            unknown
          >,
        ) => void,
      ) => {
        const w =
          JSON.parse(
            JSON.stringify(
              sample(),
            ),
          );
        mutate(
          w,
        );
        const body =
          new TextEncoder().encode(
            JSON.stringify(
              w,
            ),
          );
        const bytes =
          new Uint8Array(
            5 +
              body.length,
          );
        bytes.set(
          [
            0x48,
            0x57,
            0x4c,
            0x44,
            SAVE_VERSION,
          ],
        );
        bytes.set(
          body,
          5,
        );
        return bytes;
      };
    expect(
      () =>
        decodeWorld(
          lie(
            (
              w,
            ) =>
              ((
                w.terrain as unknown[]
              ).length =
                3),
          ),
        ),
    ).toThrow(
      SaveFormatError,
    );
    expect(
      () =>
        decodeWorld(
          lie(
            (
              w,
            ) =>
              ((
                w.players as Record<
                  string,
                  {
                    money: number;
                  }
                >
              ).a.money =
                -1),
          ),
        ),
    ).toThrow(
      SaveFormatError,
    );
    expect(
      () =>
        decodeWorld(
          lie(
            (
              w,
            ) =>
              ((
                w.buildings as {
                  kind: string;
                }[]
              )[0].kind =
                'nuke'),
          ),
        ),
    ).toThrow(
      SaveFormatError,
    );
  });
});

describe('older saves', () => {
  it('loads a save written before skins existed, defaulting the skin fields', () => {
    const w =
      JSON.parse(
        JSON.stringify(
          sample(),
        ),
      );
    delete w
      .players
      .a
      .skin;
    delete w
      .players
      .a
      .ownedSkins;
    const body =
      new TextEncoder().encode(
        JSON.stringify(
          w,
        ),
      );
    const bytes =
      new Uint8Array(
        5 +
          body.length,
      );
    bytes.set(
      [
        0x48,
        0x57,
        0x4c,
        0x44,
        SAVE_VERSION,
      ],
    );
    bytes.set(
      body,
      5,
    );
    const loaded =
      decodeWorld(
        bytes,
      );
    expect(
      loaded
        .players
        .a
        .skin,
    ).toBe(
      'citizen',
    );
    expect(
      loaded
        .players
        .a
        .ownedSkins,
    ).toEqual(
      [
        'citizen',
      ],
    );
  });

  it('refuses a save that claims a skin that does not exist', () => {
    const w =
      JSON.parse(
        JSON.stringify(
          sample(),
        ),
      );
    w.players.a.skin =
      'nuke';
    const body =
      new TextEncoder().encode(
        JSON.stringify(
          w,
        ),
      );
    const bytes =
      new Uint8Array(
        5 +
          body.length,
      );
    bytes.set(
      [
        0x48,
        0x57,
        0x4c,
        0x44,
        SAVE_VERSION,
      ],
    );
    bytes.set(
      body,
      5,
    );
    expect(
      () =>
        decodeWorld(
          bytes,
        ),
    ).toThrow(
      SaveFormatError,
    );
  });

  const pack =
    (
      w: unknown,
    ) => {
      const body =
        new TextEncoder().encode(
          JSON.stringify(
            w,
          ),
        );
      const bytes =
        new Uint8Array(
          5 +
            body.length,
        );
      bytes.set(
        [
          0x48,
          0x57,
          0x4c,
          0x44,
          SAVE_VERSION,
        ],
      );
      bytes.set(
        body,
        5,
      );
      return bytes;
    };

  it('loads customers and farmhands saved before they walked, standing where they were', () => {
    const w =
      JSON.parse(
        JSON.stringify(
          sample(),
        ),
      );
    w.npcs =
      [
        {
          id: 7,
          kind: 'customer',
          x: 5,
          z: 6,
          want: 'stew',
          qty: 2,
          patience: 300,
          look: 'citizen',
        },
      ];
    w.workers =
      [
        {
          id: 8,
          ownerId:
            'a',
          role: 'farmer',
          homeX: 3,
          homeZ: 3,
          x: 3,
          z: 4,
          lastCrop:
            null,
          nextActTick: 10,
          nextWageTick: 99,
        },
      ];
    const loaded =
      decodeWorld(
        pack(
          w,
        ),
      );
    expect(
      loaded
        .npcs[0],
    ).toMatchObject(
      {
        mode: 'waiting',
        fromX: 5,
        fromZ: 6,
        path: [],
        gateX: 5,
        gateZ: 6,
        serviceX: 5,
        serviceZ: 6,
      },
    );
    expect(
      loaded
        .workers[0],
    ).toMatchObject(
      {
        state:
          'home',
        task: null,
        workLeft: 0,
        fromX: 3,
        fromZ: 4,
        path: [],
        avoid:
          [],
      },
    );
  });

  it('round-trips agents in the middle of a walk', () => {
    const w =
      createWorld(
        9,
        16,
      );
    stepWorld(
      w,
      0,
      [
        {
          type: 'join',
          playerId:
            'a',
        },
      ],
    );
    w.npcs.push(
      {
        id: 3,
        kind: 'customer',
        x: 4.5,
        z: 5,
        fromX: 4,
        fromZ: 5,
        path: [
          {
            x: 5,
            z: 5,
            kind: 'jump',
          },
          {
            x: 6,
            z: 5,
            kind: 'walk',
          },
        ],
        leg: 7,
        goalX: 8,
        goalZ: 8,
        stopWithin: 1,
        yaw: 1.57,
        want: 'stew',
        qty: 1,
        patience: 1200,
        look: 'rebel',
        mode: 'arriving',
        stallId: 2,
        serviceX: 7,
        serviceZ: 8,
        gateX: 1,
        gateZ: 5,
        stuck: 0,
      },
    );
    expect(
      decodeWorld(
        encodeWorld(
          w,
        ),
      ),
    ).toEqual(
      w,
    );
  });
});
