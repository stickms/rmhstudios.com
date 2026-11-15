import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  createWorld,
  stepWorld,
  TICK_MS,
  type World,
} from '../../world';
import {
  EXTRAPOLATE_MAX_MS,
  INTERP_DELAY_MS,
  MAX_SAMPLES,
  PoseBuffer,
  REWIND_RESET_TICKS,
  RemotePoses,
  SNAP_DISTANCE,
} from '../poses';

/** Sim time of a tick, ms. */
const at =
  (
    tick: number,
  ) =>
    tick *
    TICK_MS;

describe('PoseBuffer', () => {
  it('interpolates linearly between the two samples around the render time', () => {
    const b =
      new PoseBuffer();
    b.push(
      10,
      0,
      0,
    );
    b.push(
      12,
      2,
      4,
    );
    const p =
      b.sample(
        at(
          11,
        ),
      )!;
    expect(
      p.x,
    ).toBeCloseTo(
      1,
    );
    expect(
      p.z,
    ).toBeCloseTo(
      2,
    );
    expect(
      p.extrapolated,
    ).toBe(
      false,
    );
    expect(
      b.sample(
        at(
          10,
        ),
      ),
    ).toMatchObject(
      {
        x: 0,
        z: 0,
      },
    );
    expect(
      b.sample(
        at(
          11.5,
        ),
      )!
        .x,
    ).toBeCloseTo(
      1.5,
    );
  });

  it('holds the first sample for a render time before the data and has no pose until the first sample', () => {
    const b =
      new PoseBuffer();
    expect(
      b.sample(
        0,
      ),
    ).toBeNull();
    b.push(
      10,
      3,
      4,
    );
    expect(
      b.sample(
        at(
          2,
        ),
      ),
    ).toMatchObject(
      {
        x: 3,
        z: 4,
      },
    );
  });

  it('puts a late (out-of-order) sample in its place instead of moving the avatar backwards', () => {
    const b =
      new PoseBuffer();
    b.push(
      10,
      0,
      0,
    );
    b.push(
      14,
      4,
      0,
    );
    b.push(
      12,
      2,
      0,
    ); // arrives after 14
    expect(
      b.size,
    ).toBe(
      3,
    );
    expect(
      b.sample(
        at(
          12,
        ),
      )!
        .x,
    ).toBeCloseTo(
      2,
    );
    expect(
      b.sample(
        at(
          13,
        ),
      )!
        .x,
    ).toBeCloseTo(
      3,
    );
    // …and the order of arrival does not change the result.
    const c =
      new PoseBuffer();
    c.push(
      12,
      2,
      0,
    );
    c.push(
      10,
      0,
      0,
    );
    c.push(
      14,
      4,
      0,
    );
    for (const t of [
      10,
      11,
      12.5,
      13,
      14,
    ]) {
      const [
        p,
        q,
      ] =
        [
          c.sample(
            at(
              t,
            ),
          )!,
          b.sample(
            at(
              t,
            ),
          )!,
        ];
      expect(
        [
          p.x,
          p.z,
        ],
      ).toEqual(
        [
          q.x,
          q.z,
        ],
      );
    }
  });

  it('treats a duplicate tick as the same sample (the newest value wins)', () => {
    const b =
      new PoseBuffer();
    b.push(
      10,
      0,
      0,
    );
    b.push(
      11,
      1,
      0,
    );
    b.push(
      11,
      1,
      0,
    );
    b.push(
      11,
      1.2,
      0,
    );
    expect(
      b.size,
    ).toBe(
      2,
    );
    expect(
      b.sample(
        at(
          11,
        ),
      )!
        .x,
    ).toBeCloseTo(
      1.2,
    );
  });

  it('interpolates straight across a gap of missing ticks', () => {
    const b =
      new PoseBuffer();
    b.push(
      10,
      0,
      0,
    );
    b.push(
      20,
      5,
      0,
    ); // ten ticks never arrived
    expect(
      b.sample(
        at(
          15,
        ),
      )!
        .x,
    ).toBeCloseTo(
      2.5,
    );
  });

  it('extrapolates along the recent velocity for at most 250 ms, then holds', () => {
    const b =
      new PoseBuffer();
    for (
      let i = 0;
      i <=
      6;
      i++
    )
      b.push(
        10 +
          i,
        i *
          0.1,
        0,
      ); // 2 tiles/s (0.1 per 50 ms)
    const end =
      at(
        16,
      );
    const inside =
      b.sample(
        end,
      )!;
    expect(
      inside.extrapolated,
    ).toBe(
      false,
    );
    const ahead =
      b.sample(
        end +
          100,
      )!;
    expect(
      ahead.extrapolated,
    ).toBe(
      true,
    );
    expect(
      ahead.x,
    ).toBeCloseTo(
      0.6 +
        0.2,
      1,
    );
    const capped =
      b.sample(
        end +
          EXTRAPOLATE_MAX_MS,
      )!;
    const farther =
      b.sample(
        end +
          5_000,
      )!;
    expect(
      farther.x,
    ).toBeCloseTo(
      capped.x,
      6,
    ); // held past the cap
    expect(
      capped.x,
    ).toBeCloseTo(
      0.6 +
        0.5,
      1,
    );
  });

  it('does not run on when the player stopped: no velocity, no extrapolation drift', () => {
    const b =
      new PoseBuffer();
    for (
      let i = 0;
      i <=
      4;
      i++
    )
      b.push(
        10 +
          i,
        i *
          0.1,
        0,
      );
    for (
      let i = 5;
      i <=
      12;
      i++
    )
      b.push(
        10 +
          i,
        0.4,
        0,
      ); // standing for 8 ticks
    const p =
      b.sample(
        at(
          22,
        ) +
          200,
      )!;
    expect(
      p.x,
    ).toBeCloseTo(
      0.4,
      3,
    );
    expect(
      p.speed,
    ).toBe(
      0,
    );
  });

  it('snaps across a teleport instead of sliding the avatar over the map', () => {
    const b =
      new PoseBuffer();
    b.push(
      10,
      1,
      1,
    );
    b.push(
      11,
      1,
      1,
    );
    b.push(
      12,
      1 +
        SNAP_DISTANCE +
        10,
      1,
    ); // respawn
    b.push(
      13,
      1 +
        SNAP_DISTANCE +
        10,
      1,
    );
    for (const t of [
      11.1,
      11.4,
      11.6,
      11.9,
    ]) {
      const p =
        b.sample(
          at(
            t,
          ),
        )!;
      expect(
        p.x ===
          1 ||
          p.x ===
            1 +
              SNAP_DISTANCE +
              10,
        `x at ${t} = ${p.x}`,
      ).toBe(
        true,
      );
    }
    // A teleport is not a sprint.
    expect(
      b.sample(
        at(
          12.2,
        ),
      )!
        .speed,
    ).toBe(
      0,
    );
  });

  it('reports speed and a heading from the motion, and holds the heading while standing', () => {
    const b =
      new PoseBuffer();
    for (
      let i = 0;
      i <=
      10;
      i++
    )
      b.push(
        i,
        0,
        i *
          0.15,
      ); // walking +z at 3 tiles/s
    const walking =
      b.sample(
        at(
          8,
        ),
      )!;
    expect(
      walking.speed,
    ).toBeCloseTo(
      3,
      1,
    );
    expect(
      walking.yaw,
    ).toBeCloseTo(
      0,
      5,
    ); // atan2(0, +z)
    for (
      let i = 11;
      i <=
      20;
      i++
    )
      b.push(
        i,
        0,
        1.5,
      );
    const standing =
      b.sample(
        at(
          20,
        ),
      )!;
    expect(
      standing.speed,
    ).toBe(
      0,
    );
    expect(
      standing.yaw,
    ).toBeCloseTo(
      0,
      5,
    );
    const east =
      new PoseBuffer();
    for (
      let i = 0;
      i <=
      10;
      i++
    )
      east.push(
        i,
        i *
          0.1,
        0,
      );
    expect(
      east.sample(
        at(
          8,
        ),
      )!
        .yaw,
    ).toBeCloseTo(
      Math.PI /
        2,
      5,
    );
  });

  it('a host migration that rewinds the clock drops the samples of the dead timeline', () => {
    const b =
      new PoseBuffer();
    for (
      let i = 0;
      i <=
      10;
      i++
    )
      b.push(
        100 +
          i,
        i,
        0,
      );
    b.rewindTo(
      109,
    ); // the new host's checkpoint is one tick behind what we had applied
    expect(
      b.newestTick,
    ).toBe(
      108,
    );
    b.push(
      109,
      50,
      0,
    ); // the new timeline says something else happened
    expect(
      b.sample(
        at(
          109,
        ),
      )!
        .x,
    ).toBe(
      50,
    );
    // A rewind far beyond the threshold forgets the track altogether.
    const c =
      new PoseBuffer();
    for (
      let i = 0;
      i <=
      10;
      i++
    )
      c.push(
        500 +
          i,
        i,
        0,
      );
    c.rewindTo(
      500 -
        REWIND_RESET_TICKS -
        5,
    );
    expect(
      c.size,
    ).toBe(
      0,
    );
  });

  it('keeps a bounded history and ignores non-finite input', () => {
    const b =
      new PoseBuffer();
    for (
      let i = 0;
      i <
      MAX_SAMPLES *
        3;
      i++
    )
      b.push(
        i,
        i,
        0,
      );
    expect(
      b.size,
    ).toBe(
      MAX_SAMPLES,
    );
    b.push(
      Number.NaN,
      1,
      1,
    );
    b.push(
      5000,
      Number.POSITIVE_INFINITY,
      1,
    );
    b.push(
      5001,
      1,
      Number.NaN,
    );
    expect(
      b.size,
    ).toBe(
      MAX_SAMPLES,
    );
    expect(
      b.sample(
        at(
          MAX_SAMPLES *
            3 -
            3,
        ),
      ),
    ).not.toBeNull();
  });

  it('survives a fuzz of shuffled, duplicated and rewound input without ever producing NaN', () => {
    let seed = 12345;
    const rnd =
      () =>
        (seed =
          (seed *
            1664525 +
            1013904223) >>>
          0) /
        2 **
          32;
    const b =
      new PoseBuffer();
    for (
      let i = 0;
      i <
      5000;
      i++
    ) {
      const roll =
        rnd();
      if (
        roll <
        0.05
      )
        b.rewindTo(
          Math.floor(
            rnd() *
              300,
          ),
        );
      else
        b.push(
          Math.floor(
            rnd() *
              300,
          ),
          rnd() *
            60 -
            10,
          rnd() *
            60 -
            10,
        );
      const p =
        b.sample(
          rnd() *
            at(
              320,
            ),
        );
      if (
        p
      ) {
        expect(
          Number.isFinite(
            p.x,
          ) &&
            Number.isFinite(
              p.z,
            ) &&
            Number.isFinite(
              p.speed,
            ) &&
            Number.isFinite(
              p.yaw,
            ),
        ).toBe(
          true,
        );
      }
      expect(
        b.size,
      ).toBeLessThanOrEqual(
        MAX_SAMPLES,
      );
    }
  });
});

describe('RemotePoses', () => {
  function worldWith(
    tick: number,
    players: Record<
      string,
      [
        number,
        number,
      ]
    >,
  ): World {
    const w =
      createWorld(
        3,
        16,
      );
    for (const id of Object.keys(
      players,
    ))
      stepWorld(
        w,
        0,
        [
          {
            type: 'join',
            playerId:
              id,
          },
        ],
      );
    for (const [
      id,
      [
        x,
        z,
      ],
    ] of Object.entries(
      players,
    )) {
      w.players[
        id
      ].x =
        x;
      w.players[
        id
      ].z =
        z;
    }
    w.tick =
      tick;
    return w;
  }

  it('draws other players about 100 ms in the past, smoothly, and never the local player', () => {
    const poses =
      new RemotePoses(
        () =>
          'me',
      );
    // Ann walks 0.1 tile per tick (2 tiles/s); ticks arrive on time.
    for (
      let tick = 0;
      tick <=
      20;
      tick++
    )
      poses.observe(
        worldWith(
          tick,
          {
            me: [
              5,
              5,
            ],
            ann: [
              tick *
                0.1,
              3,
            ],
          },
        ),
        tick *
          TICK_MS,
      );
    expect(
      poses.sample(
        'me',
        20 *
          TICK_MS,
      ),
    ).toBeNull();
    const now =
      20 *
      TICK_MS;
    const drawn =
      poses.sample(
        'ann',
        now,
      )!;
    // 100 ms behind the newest data (x = 2.0): 2.0 - 0.2.
    expect(
      drawn.x,
    ).toBeCloseTo(
      2 -
        (2 *
          INTERP_DELAY_MS) /
          1000,
      1,
    );
    // Between frames it moves continuously, not in 100 ms steps.
    const a =
      poses.sample(
        'ann',
        now +
          5,
      )!.x;
    const b =
      poses.sample(
        'ann',
        now +
          10,
      )!.x;
    expect(
      b,
    ).toBeGreaterThan(
      a,
    );
    expect(
      b -
        a,
    ).toBeLessThan(
      0.05,
    );
  });

  it('forgets a player who left and survives the migration rewind (new host a tick behind)', () => {
    const poses =
      new RemotePoses(
        () =>
          'me',
      );
    for (
      let tick = 0;
      tick <=
      10;
      tick++
    )
      poses.observe(
        worldWith(
          tick,
          {
            me: [
              1,
              1,
            ],
            ann: [
              tick,
              0,
            ],
            bob: [
              0,
              tick,
            ],
          },
        ),
        tick *
          TICK_MS,
      );
    expect(
      poses.sample(
        'bob',
        10 *
          TICK_MS,
      ),
    ).not.toBeNull();
    poses.observe(
      worldWith(
        11,
        {
          me: [
            1,
            1,
          ],
          ann: [
            11,
            0,
          ],
        },
      ),
      11 *
        TICK_MS,
    ); // bob left
    expect(
      poses.sample(
        'bob',
        11 *
          TICK_MS,
      ),
    ).toBeNull();
    poses.observe(
      worldWith(
        10,
        {
          me: [
            1,
            1,
          ],
          ann: [
            10,
            0,
          ],
        },
      ),
      11 *
        TICK_MS +
        30,
    ); // rewound by a tick
    const p =
      poses.sample(
        'ann',
        11 *
          TICK_MS +
          30,
      )!;
    expect(
      Number.isFinite(
        p.x,
      ),
    ).toBe(
      true,
    );
    poses.observe(
      worldWith(
        11,
        {
          me: [
            1,
            1,
          ],
          ann: [
            10.2,
            0,
          ],
        },
      ),
      11 *
        TICK_MS +
        80,
    );
    expect(
      poses.sample(
        'ann',
        11 *
          TICK_MS +
          80,
      ),
    ).not.toBeNull();
  });

  it('is cheap when nothing changed: observing the same tick twice records one sample', () => {
    const poses =
      new RemotePoses(
        () =>
          'me',
      );
    const w =
      worldWith(
        5,
        {
          me: [
            0,
            0,
          ],
          ann: [
            1,
            1,
          ],
        },
      );
    poses.observe(
      w,
      0,
    );
    poses.observe(
      w,
      16,
    );
    poses.observe(
      w,
      33,
    );
    expect(
      poses.sample(
        'ann',
        100,
      ),
    ).toMatchObject(
      {
        x: 1,
        z: 1,
      },
    );
  });

  it('re-anchors its clock after a hitch (a hidden tab) instead of fast-forwarding through it', () => {
    const poses =
      new RemotePoses(
        () =>
          'me',
      );
    for (
      let tick = 0;
      tick <=
      10;
      tick++
    )
      poses.observe(
        worldWith(
          tick,
          {
            me: [
              0,
              0,
            ],
            ann: [
              tick *
                0.1,
              0,
            ],
          },
        ),
        tick *
          TICK_MS,
      );
    // 30 s pass with no frames; the next observed tick is 3 later.
    poses.observe(
      worldWith(
        13,
        {
          me: [
            0,
            0,
          ],
          ann: [
            1.3,
            0,
          ],
        },
      ),
      30_000,
    );
    const p =
      poses.sample(
        'ann',
        30_000,
      )!;
    expect(
      p.x,
    ).toBeGreaterThan(
      1.0,
    );
    expect(
      p.x,
    ).toBeLessThanOrEqual(
      1.3 +
        1e-9,
    );
  });
});
