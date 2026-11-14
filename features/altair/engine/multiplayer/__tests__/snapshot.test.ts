// Snapshot wire format and client interpolation (pure). Multiplayer sync logic
// is the stated exception to "mission-critical tests only" in docs/testing.md.
import {
  describe,
  it,
  expect,
} from 'vitest';
import {
  encodeSnapshot,
  decodeSnapshot,
  interpolateSnapshots,
  snapshotAlpha,
  quantise,
  DEF_IDS,
  INTEREST_RADIUS,
  MAX_SNAPSHOT_ENEMIES,
  MAX_ALPHA,
  SNAP_DISTANCE,
  type SnapshotSource,
  type DecodedSnapshot,
} from '../snapshot';
import {
  ENEMY_STRIDE,
  PLAYER_ALIVE,
  PLAYER_DOWNED,
  type PlayerStateSnapshot,
} from '../types';

const player =
  (
    over: Partial<PlayerStateSnapshot> = {},
  ): PlayerStateSnapshot => ({
    playerId:
      'a',
    x: quantise(
      100,
    ),
    y: quantise(
      -50,
    ),
    hp: 80,
    maxHp: 100,
    fx: 100,
    fy: 0,
    state:
      PLAYER_ALIVE,
    downTimer: 0,
    revive: 0,
    invuln: false,
    classId:
      'knight',
    slot: 0,
    level: 3,
    kills: 7,
    coins: 2,
    levelUpPending: false,
    ...over,
  });

const enemy =
  (
    id: number,
    x: number,
    y: number,
    over: Record<
      string,
      unknown
    > = {},
  ) => ({
    id,
    defId:
      DEF_IDS[0],
    x,
    y,
    hp: 5,
    maxHp: 10,
    isBoss: false,
    isDead: false,
    ...over,
  });

function source(
  over: Partial<SnapshotSource> = {},
): SnapshotSource {
  return {
    tick: 30,
    time: 12.3456,
    sharedKills: 4,
    bossActive: false,
    bossWarning:
      null,
    players:
      [
        player(),
      ],
    enemies:
      [
        enemy(
          1,
          120.04,
          -40.06,
        ),
      ],
    projectiles:
      [
        {
          id: 9,
          x: 90.5,
          y: -49.5,
          vx: 300.4,
          vy: -12,
          radius: 5.4,
          isEnemy: true,
          color:
            '#ff8800',
        },
      ],
    pickups:
      [
        {
          id: 5,
          type: 'xp_small',
          x: 110,
          y: -45,
          value: 3,
        },
      ],
    ...over,
  };
}

const NEAR =
  [
    {
      x: 100,
      y: -50,
    },
  ];

describe('snapshot encode/decode', () => {
  it('round-trips through JSON within quantisation', () => {
    const wire =
      JSON.parse(
        JSON.stringify(
          encodeSnapshot(
            source(),
            NEAR,
          ),
        ),
      );
    const d =
      decodeSnapshot(
        wire,
      )!;
    expect(
      d.tick,
    ).toBe(
      30,
    );
    expect(
      d.time,
    ).toBeCloseTo(
      12.35,
      2,
    );
    expect(
      d.sharedKills,
    ).toBe(
      4,
    );
    expect(
      d
        .players[0],
    ).toMatchObject(
      {
        playerId:
          'a',
        hp: 80,
        maxHp: 100,
        classId:
          'knight',
        level: 3,
        kills: 7,
        facingX: 1,
        state:
          PLAYER_ALIVE,
      },
    );
    expect(
      d
        .players[0]
        .x,
    ).toBeCloseTo(
      100,
      1,
    );
    expect(
      d
        .players[0]
        .y,
    ).toBeCloseTo(
      -50,
      1,
    );
    expect(
      d.enemies,
    ).toHaveLength(
      1,
    );
    expect(
      d
        .enemies[0]
        .x,
    ).toBeCloseTo(
      120.04,
      1,
    );
    expect(
      d
        .enemies[0]
        .y,
    ).toBeCloseTo(
      -40.06,
      1,
    );
    expect(
      d
        .enemies[0]
        .hpFrac,
    ).toBeCloseTo(
      0.5,
      3,
    );
    expect(
      d
        .enemies[0]
        .defId,
    ).toBe(
      DEF_IDS[0],
    );
    expect(
      d
        .projectiles[0],
    ).toMatchObject(
      {
        id: 9,
        vx: 300,
        vy: -12,
        radius: 5,
        isEnemy: true,
        color: 0xff8800,
      },
    );
    expect(
      d
        .pickups[0],
    ).toMatchObject(
      {
        id: 5,
        type: 'xp_small',
        value: 3,
      },
    );
  });

  it('uses flat number arrays with a fixed stride (no per-entity objects on the wire)', () => {
    const snap =
      encodeSnapshot(
        source(
          {
            enemies:
              [
                enemy(
                  1,
                  0,
                  0,
                ),
                enemy(
                  2,
                  10,
                  10,
                ),
              ],
          },
        ),
        NEAR,
      );
    expect(
      snap.enemies,
    ).toHaveLength(
      2 *
        ENEMY_STRIDE,
    );
    expect(
      snap.enemies.every(
        (
          v,
        ) =>
          typeof v ===
            'number' &&
          Number.isInteger(
            v,
          ),
      ),
    ).toBe(
      true,
    );
    expect(
      snap.projectiles.every(
        (
          v,
        ) =>
          Number.isInteger(
            v,
          ),
      ),
    ).toBe(
      true,
    );
  });

  it('only sends entities near a living player, but always the boss', () => {
    const snap =
      encodeSnapshot(
        source(
          {
            enemies:
              [
                enemy(
                  1,
                  100 +
                    INTEREST_RADIUS -
                    10,
                  -50,
                ),
                enemy(
                  2,
                  100 +
                    INTEREST_RADIUS +
                    50,
                  -50,
                ),
                enemy(
                  3,
                  9000,
                  9000,
                  {
                    isBoss: true,
                  },
                ),
              ],
          },
        ),
        NEAR,
      );
    const d =
      decodeSnapshot(
        snap,
      )!;
    expect(
      d.enemies
        .map(
          (
            e,
          ) =>
            e.id,
        )
        .sort(),
    ).toEqual(
      [
        1,
        3,
      ],
    );
    expect(
      d.enemies.find(
        (
          e,
        ) =>
          e.id ===
          3,
      )!
        .isBoss,
    ).toBe(
      true,
    );
  });

  it('caps the entity count', () => {
    const many =
      Array.from(
        {
          length:
            MAX_SNAPSHOT_ENEMIES +
            50,
        },
        (
          _,
          i,
        ) =>
          enemy(
            i +
              1,
            100,
            -50,
          ),
      );
    const snap =
      encodeSnapshot(
        source(
          {
            enemies:
              many,
          },
        ),
        NEAR,
      );
    expect(
      snap
        .enemies
        .length /
        ENEMY_STRIDE,
    ).toBe(
      MAX_SNAPSHOT_ENEMIES,
    );
  });

  it('skips unknown definitions and pickup types instead of throwing', () => {
    const snap =
      encodeSnapshot(
        source(
          {
            enemies:
              [
                enemy(
                  1,
                  100,
                  -50,
                  {
                    defId:
                      'not_a_real_enemy',
                  },
                ),
              ],
            pickups:
              [
                {
                  id: 1,
                  type: 'mystery',
                  x: 100,
                  y: -50,
                  value: 1,
                },
              ],
          },
        ),
        NEAR,
      );
    expect(
      snap.enemies,
    ).toHaveLength(
      0,
    );
    expect(
      snap.pickups,
    ).toHaveLength(
      0,
    );
  });

  it('recycles the output object and its arrays when given one', () => {
    const first =
      encodeSnapshot(
        source(),
        NEAR,
      );
    const arr =
      first.enemies;
    const second =
      encodeSnapshot(
        source(
          {
            enemies:
              [
                enemy(
                  2,
                  100,
                  -50,
                ),
                enemy(
                  3,
                  100,
                  -50,
                ),
              ],
          },
        ),
        NEAR,
        first,
      );
    expect(
      second,
    ).toBe(
      first,
    );
    expect(
      second.enemies,
    ).toBe(
      arr,
    );
    expect(
      second.enemies,
    ).toHaveLength(
      2 *
        ENEMY_STRIDE,
    );
  });

  it('carries downed state and boss warning', () => {
    const snap =
      encodeSnapshot(
        source(
          {
            players:
              [
                player(
                  {
                    state:
                      PLAYER_DOWNED,
                    downTimer: 12,
                    revive: 40,
                  },
                ),
              ],
            bossActive: true,
            bossWarning:
              {
                bossId:
                  'hollow_king',
                timer: 2,
              },
          },
        ),
        NEAR,
      );
    const d =
      decodeSnapshot(
        JSON.parse(
          JSON.stringify(
            snap,
          ),
        ),
      )!;
    expect(
      d
        .players[0],
    ).toMatchObject(
      {
        state:
          PLAYER_DOWNED,
        downTimer: 12,
      },
    );
    expect(
      d
        .players[0]
        .revive,
    ).toBeCloseTo(
      0.4,
      5,
    );
    expect(
      d.bossActive,
    ).toBe(
      true,
    );
    expect(
      d.bossWarning,
    ).toEqual(
      {
        bossId:
          'hollow_king',
        timer: 2,
      },
    );
  });

  it('rejects malformed snapshots (guests trust nothing from the wire)', () => {
    expect(
      decodeSnapshot(
        null,
      ),
    ).toBeNull();
    expect(
      decodeSnapshot(
        'x',
      ),
    ).toBeNull();
    expect(
      decodeSnapshot(
        {},
      ),
    ).toBeNull();
    const ok =
      JSON.parse(
        JSON.stringify(
          encodeSnapshot(
            source(),
            NEAR,
          ),
        ),
      );
    expect(
      decodeSnapshot(
        {
          ...ok,
          enemies:
            [
              1,
              2,
              3,
            ],
        },
      ),
    ).toBeNull(); // not a multiple of the stride
    expect(
      decodeSnapshot(
        {
          ...ok,
          projectiles:
            [
              1,
            ],
        },
      ),
    ).toBeNull();
    expect(
      decodeSnapshot(
        {
          ...ok,
          players:
            [
              null,
            ],
        },
      ),
    ).toBeNull();
    // out-of-range indices are dropped, not trusted
    const bad =
      {
        ...ok,
        enemies:
          [
            1,
            99999,
            0,
            0,
            500,
            0,
          ],
        pickups:
          [
            1,
            99,
            0,
            0,
            1,
          ],
      };
    const d =
      decodeSnapshot(
        bad,
      )!;
    expect(
      d.enemies,
    ).toHaveLength(
      0,
    );
    expect(
      d.pickups,
    ).toHaveLength(
      0,
    );
  });
});

function dec(
  parts: Partial<DecodedSnapshot> = {},
): DecodedSnapshot {
  return {
    tick: 0,
    time: 0,
    sharedKills: 0,
    bossActive: false,
    bossWarning:
      null,
    players:
      [],
    enemies:
      [],
    projectiles:
      [],
    pickups:
      [],
    ...parts,
  };
}
const dp =
  (
    id: string,
    x: number,
    y: number,
    over: object = {},
  ) => ({
    playerId:
      id,
    x,
    y,
    hp: 10,
    maxHp: 10,
    facingX: 1,
    facingY: 0,
    state:
      0 as const,
    downTimer: 0,
    revive: 0,
    invuln: false,
    classId:
      'knight',
    slot: 0,
    level: 1,
    kills: 0,
    coins: 0,
    levelUpPending: false,
    ...over,
  });
const de =
  (
    id: number,
    x: number,
    y: number,
    over: object = {},
  ) => ({
    id,
    defId:
      's',
    x,
    y,
    hpFrac: 1,
    isBoss: false,
    isDead: false,
    ...over,
  });

describe('interpolation', () => {
  const a =
    dec(
      {
        tick: 0,
        time: 0,
        players:
          [
            dp(
              'p',
              0,
              0,
            ),
          ],
        enemies:
          [
            de(
              1,
              0,
              0,
            ),
          ],
      },
    );
  const b =
    dec(
      {
        tick: 3,
        time: 0.05,
        players:
          [
            dp(
              'p',
              100,
              40,
              {
                hp: 7,
              },
            ),
          ],
        enemies:
          [
            de(
              1,
              50,
              0,
              {
                hpFrac: 0.4,
              },
            ),
          ],
      },
    );

  it('is exact at the endpoints and linear between', () => {
    expect(
      interpolateSnapshots(
        a,
        b,
        0,
      )
        .players[0]
        .x,
    ).toBe(
      0,
    );
    expect(
      interpolateSnapshots(
        a,
        b,
        1,
      )
        .players[0]
        .x,
    ).toBe(
      100,
    );
    const mid =
      interpolateSnapshots(
        a,
        b,
        0.5,
      );
    expect(
      mid
        .players[0]
        .x,
    ).toBeCloseTo(
      50,
      9,
    );
    expect(
      mid
        .players[0]
        .y,
    ).toBeCloseTo(
      20,
      9,
    );
    expect(
      mid
        .enemies[0]
        .x,
    ).toBeCloseTo(
      25,
      9,
    );
    expect(
      mid.time,
    ).toBeCloseTo(
      0.025,
      9,
    );
  });

  it('takes discrete state (hp, flags) from the newer snapshot', () => {
    const mid =
      interpolateSnapshots(
        a,
        b,
        0.2,
      );
    expect(
      mid
        .players[0]
        .hp,
    ).toBe(
      7,
    );
    expect(
      mid
        .enemies[0]
        .hpFrac,
    ).toBe(
      0.4,
    );
  });

  it('extrapolates at most one interval past the newer snapshot', () => {
    expect(
      interpolateSnapshots(
        a,
        b,
        1.5,
      )
        .players[0]
        .x,
    ).toBeCloseTo(
      150,
      9,
    );
    expect(
      interpolateSnapshots(
        a,
        b,
        2,
      )
        .players[0]
        .x,
    ).toBeCloseTo(
      200,
      9,
    );
    expect(
      interpolateSnapshots(
        a,
        b,
        50,
      )
        .players[0]
        .x,
    ).toBeCloseTo(
      100 +
        100 *
          (MAX_ALPHA -
            1),
      9,
    );
  });

  it('never runs backwards: negative and NaN alpha clamp to the older snapshot', () => {
    expect(
      interpolateSnapshots(
        a,
        b,
        -3,
      )
        .players[0]
        .x,
    ).toBe(
      0,
    );
    expect(
      interpolateSnapshots(
        a,
        b,
        NaN,
      )
        .players[0]
        .x,
    ).toBe(
      0,
    );
  });

  it('with no older snapshot, shows the newer one as is', () => {
    expect(
      interpolateSnapshots(
        null,
        b,
        0.5,
      ),
    ).toBe(
      b,
    );
  });

  it('entities that only exist in the newer snapshot appear in place; vanished ones are gone', () => {
    const newer =
      dec(
        {
          enemies:
            [
              de(
                2,
                500,
                500,
              ),
            ],
          players:
            [
              dp(
                'q',
                7,
                7,
              ),
            ],
        },
      );
    const older =
      dec(
        {
          enemies:
            [
              de(
                1,
                0,
                0,
              ),
            ],
          players:
            [
              dp(
                'p',
                0,
                0,
              ),
            ],
        },
      );
    const out =
      interpolateSnapshots(
        older,
        newer,
        0.5,
      );
    expect(
      out.enemies,
    ).toEqual(
      [
        de(
          2,
          500,
          500,
        ),
      ],
    );
    expect(
      out.players.map(
        (
          p,
        ) =>
          p.playerId,
      ),
    ).toEqual(
      [
        'q',
      ],
    );
    expect(
      out
        .players[0]
        .x,
    ).toBe(
      7,
    );
  });

  it('snaps instead of gliding across a teleport (revive, respawn)', () => {
    const far =
      dec(
        {
          players:
            [
              dp(
                'p',
                SNAP_DISTANCE +
                  100,
                0,
              ),
            ],
        },
      );
    const near =
      dec(
        {
          players:
            [
              dp(
                'p',
                0,
                0,
              ),
            ],
        },
      );
    expect(
      interpolateSnapshots(
        near,
        far,
        0.5,
      )
        .players[0]
        .x,
    ).toBe(
      SNAP_DISTANCE +
        100,
    );
    const justUnder =
      dec(
        {
          players:
            [
              dp(
                'p',
                SNAP_DISTANCE -
                  10,
                0,
              ),
            ],
        },
      );
    expect(
      interpolateSnapshots(
        near,
        justUnder,
        0.5,
      )
        .players[0]
        .x,
    ).toBeCloseTo(
      (SNAP_DISTANCE -
        10) /
        2,
      9,
    );
  });

  it('handles empty snapshots and does not mutate its inputs', () => {
    const before =
      JSON.stringify(
        [
          a,
          b,
        ],
      );
    expect(
      interpolateSnapshots(
        dec(),
        dec(),
        0.5,
      ),
    ).toEqual(
      dec(),
    );
    interpolateSnapshots(
      a,
      b,
      0.7,
    );
    expect(
      JSON.stringify(
        [
          a,
          b,
        ],
      ),
    ).toBe(
      before,
    );
  });

  it('snapshotAlpha: position of render time between arrival times, clamped', () => {
    expect(
      snapshotAlpha(
        1000,
        1000,
        1050,
      ),
    ).toBe(
      0,
    );
    expect(
      snapshotAlpha(
        1025,
        1000,
        1050,
      ),
    ).toBeCloseTo(
      0.5,
      9,
    );
    expect(
      snapshotAlpha(
        1050,
        1000,
        1050,
      ),
    ).toBe(
      1,
    );
    expect(
      snapshotAlpha(
        900,
        1000,
        1050,
      ),
    ).toBe(
      0,
    ); // render time before the older snapshot
    expect(
      snapshotAlpha(
        5000,
        1000,
        1050,
      ),
    ).toBe(
      MAX_ALPHA,
    ); // starved of snapshots: freeze after one interval
    expect(
      snapshotAlpha(
        1000,
        1050,
        1050,
      ),
    ).toBe(
      1,
    ); // degenerate spacing shows the newer one
    expect(
      snapshotAlpha(
        1000,
        1100,
        1050,
      ),
    ).toBe(
      1,
    ); // reversed arrival order too
    expect(
      snapshotAlpha(
        NaN,
        1000,
        1050,
      ),
    ).toBe(
      0,
    );
  });
});
