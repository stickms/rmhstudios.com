import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  RUN_SPEED,
  WALK_SPEED,
  locomotionBlend,
} from '../../avatar/controller';
import {
  AIR_ENTER,
  AIR_EXIT,
  MotionEstimator,
  SNAP_DISTANCE,
  airFromVelocity,
} from '../motion-estimator';

const DT =
  1 /
  60;

/** A remote player seen only every `every` frames (a 20 Hz host over a 60 fps screen), walking at `speed` along +x. */
function follow(
  speed: number,
  seconds: number,
  every = 3,
) {
  const m =
    new MotionEstimator();
  let x = 5;
  m.observe(
    x,
    0,
    5,
  );
  let last =
    m.sample;
  for (
    let f = 0;
    f <
    seconds *
      60;
    f++
  ) {
    x +=
      speed *
      DT;
    if (
      f %
        every ===
      0
    )
      m.observe(
        x,
        0,
        5,
      );
    last =
      m.step(
        DT,
      );
  }
  return last;
}

describe('MotionEstimator', () => {
  it('reads walking and running speed off position updates that arrive in jumps', () => {
    const walk =
      follow(
        WALK_SPEED,
        2,
      );
    expect(
      walk.speed,
    ).toBeGreaterThan(
      WALK_SPEED *
        0.85,
    );
    expect(
      walk.speed,
    ).toBeLessThan(
      WALK_SPEED *
        1.15,
    );
    const run =
      follow(
        RUN_SPEED,
        2,
      );
    expect(
      run.speed,
    ).toBeGreaterThan(
      RUN_SPEED *
        0.85,
    );
    // ...and those speeds drive the right clips
    expect(
      locomotionBlend(
        walk.speed,
      )
        .walk,
    ).toBeGreaterThan(
      0.7,
    );
    expect(
      locomotionBlend(
        run.speed,
      )
        .run,
    ).toBeGreaterThan(
      0.7,
    );
  });

  it('is at rest when nobody moves, and idles to a stop after moving', () => {
    const m =
      new MotionEstimator();
    m.observe(
      3,
      0,
      3,
    );
    for (
      let i = 0;
      i <
      120;
      i++
    )
      m.step(
        DT,
      );
    expect(
      m
        .sample
        .speed,
    ).toBe(
      0,
    );
    m.observe(
      6,
      0,
      3,
    );
    for (
      let i = 0;
      i <
      20;
      i++
    )
      m.step(
        DT,
      );
    expect(
      m
        .sample
        .speed,
    ).toBeGreaterThan(
      0.5,
    );
    for (
      let i = 0;
      i <
      180;
      i++
    )
      m.step(
        DT,
      );
    expect(
      m
        .sample
        .speed,
    ).toBeLessThan(
      0.02,
    );
    expect(
      m
        .sample
        .x,
    ).toBeCloseTo(
      6,
      2,
    );
  });

  it('faces the way it is heading and keeps facing it when it stops', () => {
    const m =
      new MotionEstimator();
    m.observe(
      5,
      0,
      5,
    );
    m.observe(
      5,
      0,
      9,
    ); // moving toward +z
    for (
      let i = 0;
      i <
      60;
      i++
    )
      m.step(
        DT,
      );
    expect(
      m
        .sample
        .yaw,
    ).toBeCloseTo(
      0,
      1,
    );
    const m2 =
      new MotionEstimator();
    m2.observe(
      5,
      0,
      5,
    );
    m2.observe(
      9,
      0,
      5,
    ); // toward +x: yaw = +pi/2
    for (
      let i = 0;
      i <
      45;
      i++
    )
      m2.step(
        DT,
      );
    expect(
      m2
        .sample
        .yaw,
    ).toBeCloseTo(
      Math.PI /
        2,
      1,
    );
    for (
      let i = 0;
      i <
      240;
      i++
    )
      m2.step(
        DT,
      );
    expect(
      m2
        .sample
        .yaw,
    ).toBeCloseTo(
      Math.PI /
        2,
      1,
    );
  });

  it('snaps on the first sighting and on a teleport instead of running across the map', () => {
    const m =
      new MotionEstimator();
    m.observe(
      20,
      0,
      20,
    );
    expect(
      m
        .sample
        .x,
    ).toBe(
      20,
    );
    expect(
      m
        .sample
        .speed,
    ).toBe(
      0,
    );
    m.observe(
      20 +
        SNAP_DISTANCE +
        1,
      0,
      20,
    );
    expect(
      m
        .sample
        .x,
    ).toBe(
      20 +
        SNAP_DISTANCE +
        1,
    );
    expect(
      m.step(
        DT,
      )
        .speed,
    ).toBe(
      0,
    );
  });

  it('ignores garbage sightings', () => {
    const m =
      new MotionEstimator();
    m.observe(
      1,
      0,
      1,
    );
    m.observe(
      NaN,
      0,
      1,
    );
    m.observe(
      Infinity,
      0,
      1,
    );
    expect(
      Number.isFinite(
        m.step(
          DT,
        )
          .x,
      ),
    ).toBe(
      true,
    );
    expect(
      m.step(
        0,
      )
        .x,
    ).toBeCloseTo(
      1,
      10,
    );
  });

  it('calls a hop up a ledge a jump and a drop a fall, then lands', () => {
    const up =
      new MotionEstimator();
    up.observe(
      5,
      0,
      5,
    );
    up.observe(
      5,
      0.38,
      5,
    );
    const states =
      new Set<string>();
    for (
      let i = 0;
      i <
      60;
      i++
    )
      states.add(
        up.step(
          DT,
        )
          .air,
      );
    expect(
      states.has(
        'jump',
      ),
    ).toBe(
      true,
    );
    expect(
      up
        .sample
        .air,
    ).toBe(
      'ground',
    );

    const down =
      new MotionEstimator();
    down.observe(
      5,
      1.14,
      5,
    );
    down.observe(
      5,
      0,
      5,
    );
    const s2 =
      new Set<string>();
    for (
      let i = 0;
      i <
      60;
      i++
    )
      s2.add(
        down.step(
          DT,
        )
          .air,
      );
    expect(
      s2.has(
        'fall',
      ),
    ).toBe(
      true,
    );
    expect(
      down
        .sample
        .air,
    ).toBe(
      'ground',
    );
  });
});

describe('airFromVelocity', () => {
  it('needs a firm vertical speed to leave the ground and a gentler one to stay airborne', () => {
    expect(
      airFromVelocity(
        'ground',
        AIR_ENTER -
          0.1,
      ),
    ).toBe(
      'ground',
    );
    expect(
      airFromVelocity(
        'ground',
        AIR_ENTER +
          0.1,
      ),
    ).toBe(
      'jump',
    );
    expect(
      airFromVelocity(
        'ground',
        -AIR_ENTER -
          0.1,
      ),
    ).toBe(
      'fall',
    );
    expect(
      airFromVelocity(
        'jump',
        AIR_EXIT +
          0.1,
      ),
    ).toBe(
      'jump',
    );
    expect(
      airFromVelocity(
        'jump',
        AIR_EXIT -
          0.1,
      ),
    ).toBe(
      'ground',
    );
    expect(
      airFromVelocity(
        'jump',
        -AIR_ENTER -
          0.1,
      ),
    ).toBe(
      'fall',
    );
    expect(
      airFromVelocity(
        'fall',
        -AIR_EXIT -
          0.1,
      ),
    ).toBe(
      'fall',
    );
    expect(
      airFromVelocity(
        'fall',
        -AIR_EXIT +
          0.1,
      ),
    ).toBe(
      'ground',
    );
    expect(
      airFromVelocity(
        'fall',
        NaN,
      ),
    ).toBe(
      'ground',
    );
  });
});
