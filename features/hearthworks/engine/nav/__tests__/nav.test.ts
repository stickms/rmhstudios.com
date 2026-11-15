import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  createWorld,
  tileTop,
  type World,
} from '../../world';
import {
  MAX_FALL,
  adjacentMove,
  findPath,
  gapMove,
  moverY,
  newMover,
  startPath,
  stepMover,
  stepTicks,
  moveBetween,
} from '..';

/** A flat 16×16 arena (all grass at level 3) with a water rim. */
function arena(): World {
  const w =
    createWorld(
      1,
      16,
    );
  w.terrain =
    w.terrain.map(
      (
        _,
        i,
      ) => {
        const x =
          i %
          16;
        const z =
          Math.floor(
            i /
              16,
          );
        return x ===
          0 ||
          z ===
            0 ||
          x ===
            15 ||
          z ===
            15
          ? 'water'
          : 'grass';
      },
    );
  w.height =
    w.height.map(
      (
        _,
        i,
      ) => {
        const x =
          i %
          16;
        const z =
          Math.floor(
            i /
              16,
          );
        return x ===
          0 ||
          z ===
            0 ||
          x ===
            15 ||
          z ===
            15
          ? 0
          : 3;
      },
    );
  return w;
}
const set =
  (
    w: World,
    x: number,
    z: number,
    level: number,
    terrain: World['terrain'][number] = 'grass',
  ) => {
    w.height[
      z *
        16 +
        x
    ] =
      level;
    w.terrain[
      z *
        16 +
        x
    ] =
      terrain;
  };
const wall =
  (
    w: World,
    x: number,
    z: number,
  ) =>
    set(
      w,
      x,
      z,
      3,
      'forest',
    ); // trees: impassable

describe('movement rules', () => {
  it('walks level ground and gentle steps down, jumps up one block, falls two or three, refuses more', () => {
    const w =
      arena();
    set(
      w,
      6,
      5,
      4,
    ); // +1
    set(
      w,
      7,
      5,
      5,
    ); // +2 from 3
    set(
      w,
      4,
      5,
      2,
    ); // -1
    set(
      w,
      3,
      5,
      1,
      'grass',
    ); // -2 from 3
    set(
      w,
      2,
      5,
      0,
      'grass',
    ); // -3
    expect(
      adjacentMove(
        w,
        5,
        5,
        6,
        5,
      )
        ?.kind,
    ).toBe(
      'jump',
    );
    expect(
      adjacentMove(
        w,
        6,
        5,
        7,
        5,
      )
        ?.kind,
    ).toBe(
      'jump',
    ); // 4 → 5 is one block
    expect(
      adjacentMove(
        w,
        5,
        5,
        7,
        5,
      ),
    ).toBeNull(); // not adjacent
    expect(
      adjacentMove(
        w,
        5,
        5,
        4,
        5,
      )
        ?.kind,
    ).toBe(
      'walk',
    ); // down one
    expect(
      adjacentMove(
        w,
        4,
        5,
        3,
        5,
      )
        ?.kind,
    ).toBe(
      'walk',
    ); // 2→1 is down one
    expect(
      adjacentMove(
        w,
        5,
        5,
        5,
        6,
      )
        ?.kind,
    ).toBe(
      'walk',
    );
    set(
      w,
      9,
      9,
      3 -
        MAX_FALL,
    );
    set(
      w,
      10,
      9,
      3 -
        MAX_FALL -
        1,
    );
    expect(
      adjacentMove(
        w,
        8,
        9,
        9,
        9,
      )
        ?.kind,
    ).toBe(
      'fall',
    );
    expect(
      adjacentMove(
        w,
        8,
        9,
        10,
        9,
      ),
    ).toBeNull();
    w.height[
      9 *
        16 +
        9
    ] =
      0;
    set(
      w,
      9,
      9,
      0,
    );
    expect(
      adjacentMove(
        w,
        8,
        9,
        9,
        9,
      )
        ?.kind,
    ).toBe(
      'fall',
    );
    expect(
      adjacentMove(
        w,
        6,
        5,
        7,
        5,
      )
        ?.cost,
    ).toBeGreaterThan(
      adjacentMove(
        w,
        5,
        6,
        5,
        7,
      )!
        .cost,
    );
  });

  it('will not climb a two-block wall or drop off a four-block cliff', () => {
    const w =
      arena();
    set(
      w,
      6,
      5,
      5,
    ); // +2
    set(
      w,
      4,
      5,
      -1 +
        0,
    ); // keep legal; cliff below
    w.height[
      5 *
        16 +
        4
    ] =
      3;
    set(
      w,
      4,
      6,
      3,
    );
    w.height[
      6 *
        16 +
        4
    ] =
      3 -
      4; // would be negative
    w.height[
      6 *
        16 +
        4
    ] =
      0;
    expect(
      adjacentMove(
        w,
        5,
        5,
        6,
        5,
      ),
    ).toBeNull();
    // 3 → 0 is a three-block fall: allowed; to go further we need a taller start
    set(
      w,
      8,
      8,
      7,
    );
    set(
      w,
      9,
      8,
      3,
    );
    expect(
      adjacentMove(
        w,
        8,
        8,
        9,
        8,
      ),
    ).toBeNull(); // 7 → 3 is a four-block drop
  });

  it('never cuts a corner through something solid', () => {
    const w =
      arena();
    wall(
      w,
      6,
      5,
    );
    expect(
      adjacentMove(
        w,
        5,
        5,
        6,
        6,
      ),
    ).toBeNull(); // diagonal beside a tree
    expect(
      adjacentMove(
        w,
        5,
        5,
        5,
        6,
      )
        ?.kind,
    ).toBe(
      'walk',
    );
  });

  it('jumps a single tile of water in a straight line, but not two tiles or diagonals', () => {
    const w =
      arena();
    set(
      w,
      8,
      8,
      1,
      'water',
    );
    expect(
      gapMove(
        w,
        7,
        8,
        9,
        8,
      )
        ?.kind,
    ).toBe(
      'jump',
    );
    expect(
      moveBetween(
        w,
        9,
        8,
        7,
        8,
      )
        ?.kind,
    ).toBe(
      'jump',
    );
    set(
      w,
      9,
      8,
      1,
      'water',
    );
    expect(
      gapMove(
        w,
        7,
        8,
        10,
        8,
      ),
    ).toBeNull();
    expect(
      gapMove(
        w,
        7,
        7,
        9,
        9,
      ),
    ).toBeNull();
    // and not over a tree or a building
    wall(
      w,
      5,
      8,
    );
    expect(
      gapMove(
        w,
        4,
        8,
        6,
        8,
      ),
    ).toBeNull();
  });
});

describe('findPath', () => {
  it('goes straight across open ground and returns an empty path when already there', () => {
    const w =
      arena();
    const r =
      findPath(
        w,
        {
          x: 2,
          z: 2,
        },
        {
          x: 8,
          z: 2,
        },
      )!;
    expect(
      r.steps,
    ).toHaveLength(
      6,
    );
    expect(
      r.steps.every(
        (
          s,
        ) =>
          s.kind ===
          'walk',
      ),
    ).toBe(
      true,
    );
    expect(
      findPath(
        w,
        {
          x: 4,
          z: 4,
        },
        {
          x: 4,
          z: 4,
        },
      )!
        .steps,
    ).toEqual(
      [],
    );
  });

  it('routes around a wall rather than through it', () => {
    const w =
      arena();
    for (
      let z = 2;
      z <=
      12;
      z++
    )
      wall(
        w,
        8,
        z,
      );
    const r =
      findPath(
        w,
        {
          x: 4,
          z: 7,
        },
        {
          x: 12,
          z: 7,
        },
      )!;
    expect(
      r,
    ).not.toBeNull();
    expect(
      r.steps.some(
        (
          s,
        ) =>
          s.x ===
            8 &&
          s.z >=
            2 &&
          s.z <=
            12,
      ),
    ).toBe(
      false,
    );
    expect(
      r
        .steps
        .length,
    ).toBeGreaterThan(
      8,
    );
  });

  it('returns null for an unreachable or blocked goal, and for a sealed pocket', () => {
    const w =
      arena();
    for (
      let x = 6;
      x <=
      10;
      x++
    )
      for (const z of [
        6,
        10,
      ])
        wall(
          w,
          x,
          z,
        );
    for (
      let z = 6;
      z <=
      10;
      z++
    )
      for (const x of [
        6,
        10,
      ])
        wall(
          w,
          x,
          z,
        );
    expect(
      findPath(
        w,
        {
          x: 2,
          z: 2,
        },
        {
          x: 8,
          z: 8,
        },
      ),
    ).toBeNull();
    expect(
      findPath(
        w,
        {
          x: 2,
          z: 2,
        },
        {
          x: 6,
          z: 6,
        },
      ),
    ).toBeNull(); // the goal itself is a tree
    expect(
      findPath(
        w,
        {
          x: 2,
          z: 2,
        },
        {
          x: -3,
          z: 99,
        },
      ),
    ).toBeNull();
  });

  it('can stop beside a goal that is itself solid (reach the counter, not the stall)', () => {
    const w =
      arena();
    wall(
      w,
      8,
      8,
    );
    const r =
      findPath(
        w,
        {
          x: 2,
          z: 2,
        },
        {
          x: 8,
          z: 8,
        },
        {
          stopWithin: 1,
        },
      )!;
    const last =
      r
        .steps[
        r
          .steps
          .length -
          1
      ];
    expect(
      Math.max(
        Math.abs(
          last.x -
            8,
        ),
        Math.abs(
          last.z -
            8,
        ),
      ),
    ).toBe(
      1,
    );
  });

  it('jumps up a ledge to take a shortcut and hops a gap of water when that is the only way', () => {
    const w =
      arena();
    // a river across the arena with one jumpable crossing: x=8 water for every z, except the whole thing needs a hop
    for (
      let z = 1;
      z <=
      14;
      z++
    )
      set(
        w,
        8,
        z,
        1,
        'water',
      );
    const r =
      findPath(
        w,
        {
          x: 3,
          z: 7,
        },
        {
          x: 13,
          z: 7,
        },
      )!;
    expect(
      r.steps.some(
        (
          s,
        ) =>
          s.kind ===
          'jump',
      ),
    ).toBe(
      true,
    );
    // widen the river to two tiles: now impassable
    for (
      let z = 1;
      z <=
      14;
      z++
    )
      set(
        w,
        9,
        z,
        1,
        'water',
      );
    expect(
      findPath(
        w,
        {
          x: 3,
          z: 7,
        },
        {
          x: 13,
          z: 7,
        },
      ),
    ).toBeNull();
  });

  it('prefers walking round a ledge to jumping when the detour is short, and jumps when it is long', () => {
    const w =
      arena();
    set(
      w,
      8,
      7,
      4,
    ); // a one-block ledge directly ahead; open ground either side
    const r =
      findPath(
        w,
        {
          x: 6,
          z: 7,
        },
        {
          x: 10,
          z: 7,
        },
      )!;
    expect(
      r.steps.every(
        (
          s,
        ) =>
          s.kind !==
          'jump',
      ),
    ).toBe(
      true,
    ); // round it
    for (
      let z = 1;
      z <=
      14;
      z++
    )
      if (
        z !==
        7
      )
        set(
          w,
          8,
          z,
          4,
        ); // a long one-block ridge: jumping is cheaper
    const r2 =
      findPath(
        w,
        {
          x: 6,
          z: 7,
        },
        {
          x: 10,
          z: 7,
        },
      )!;
    expect(
      r2
        .steps
        .length,
    ).toBeLessThanOrEqual(
      5,
    );
  });

  it('takes a controlled fall off a ledge when going down is the shortest way', () => {
    const w =
      arena();
    for (
      let z = 1;
      z <=
      14;
      z++
    )
      for (
        let x = 1;
        x <=
        6;
        x++
      )
        set(
          w,
          x,
          z,
          5,
        );
    const r =
      findPath(
        w,
        {
          x: 3,
          z: 7,
        },
        {
          x: 10,
          z: 7,
        },
      )!;
    expect(
      r.steps.some(
        (
          s,
        ) =>
          s.kind ===
          'fall',
      ),
    ).toBe(
      true,
    );
  });

  it('is deterministic and respects temporary blockers', () => {
    const w =
      arena();
    const a =
      findPath(
        w,
        {
          x: 2,
          z: 2,
        },
        {
          x: 12,
          z: 11,
        },
      )!;
    const b =
      findPath(
        w,
        {
          x: 2,
          z: 2,
        },
        {
          x: 12,
          z: 11,
        },
      )!;
    expect(
      JSON.stringify(
        a,
      ),
    ).toBe(
      JSON.stringify(
        b,
      ),
    );
    const blocked =
      (
        x: number,
        z: number,
      ) =>
        a.steps.some(
          (
            s,
          ) =>
            s.x ===
              x &&
            s.z ===
              z &&
            s ===
              a
                .steps[3],
        );
    const detour =
      findPath(
        w,
        {
          x: 2,
          z: 2,
        },
        {
          x: 12,
          z: 11,
        },
        {
          blocked,
        },
      )!;
    expect(
      detour.steps.some(
        (
          s,
        ) =>
          s.x ===
            a
              .steps[3]
              .x &&
          s.z ===
            a
              .steps[3]
              .z,
      ),
    ).toBe(
      false,
    );
  });

  it('gives up on an enormous search instead of hanging', () => {
    const big =
      createWorld(
        2,
        96,
      );
    const r =
      findPath(
        big,
        {
          x: 48,
          z: 48,
        },
        {
          x: 5,
          z: 5,
        },
        {
          maxExpansions: 5,
        },
      );
    expect(
      r,
    ).toBeNull();
  });
});

describe('movers', () => {
  it('walk a path tile by tile in the right number of ticks and arrive exactly', () => {
    const w =
      arena();
    const m =
      newMover(
        2,
        2,
      );
    expect(
      startPath(
        w,
        m,
        {
          x: 5,
          z: 2,
        },
      ),
    ).toBe(
      true,
    );
    let ticks = 0;
    let status =
      stepMover(
        w,
        m,
      );
    while (
      status ===
        'moving' &&
      ticks <
        500
    ) {
      ticks++;
      status =
        stepMover(
          w,
          m,
        );
    }
    expect(
      status,
    ).toBe(
      'arrived',
    );
    expect(
      m.x,
    ).toBe(
      5,
    );
    expect(
      m.z,
    ).toBe(
      2,
    );
    expect(
      ticks +
        1,
    ).toBe(
      stepTicks(
        'walk',
        1,
        0,
      ) *
        3,
    );
  });

  it('re-plan when something is built in the way, and report blocked when there is no way', () => {
    const w =
      arena();
    const m =
      newMover(
        2,
        5,
      );
    startPath(
      w,
      m,
      {
        x: 12,
        z: 5,
      },
    );
    for (
      let i = 0;
      i <
      25;
      i++
    )
      stepMover(
        w,
        m,
      ); // part-way along
    for (
      let z = 1;
      z <=
      14;
      z++
    )
      wall(
        w,
        8,
        z,
      ); // now the way is sealed
    let status: string =
      'moving';
    for (
      let i = 0;
      i <
        400 &&
      status ===
        'moving';
      i++
    )
      status =
        stepMover(
          w,
          m,
        );
    expect(
      status,
    ).toBe(
      'blocked',
    );
    expect(
      w
        .terrain[
        5 *
          16 +
          Math.round(
            m.x,
          )
      ],
    ).not.toBe(
      'forest',
    ); // never inside a wall
  });

  it('rise on a jump and drop on a fall, ending on the ground', () => {
    const w =
      arena();
    set(
      w,
      6,
      5,
      4,
    );
    const m =
      newMover(
        5,
        5,
      );
    startPath(
      w,
      m,
      {
        x: 6,
        z: 5,
      },
    );
    expect(
      m
        .path[0]
        .kind,
    ).toBe(
      'jump',
    );
    let peak = 0;
    for (
      let i = 0;
      i <
      40;
      i++
    ) {
      stepMover(
        w,
        m,
      );
      peak =
        Math.max(
          peak,
          moverY(
            w,
            m,
          ),
        );
    }
    expect(
      peak,
    ).toBeGreaterThan(
      tileTop(
        w,
        6,
        5,
      ),
    ); // arced above the ledge it landed on
    expect(
      moverY(
        w,
        m,
      ),
    ).toBeCloseTo(
      tileTop(
        w,
        6,
        5,
      ),
      6,
    );
  });
});
