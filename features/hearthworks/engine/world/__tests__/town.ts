import {
  createWorld,
  stepWorld,
  TICK_MS,
  type Command,
  type World,
  type WorldEvent,
} from '..';
import {
  arena,
  P,
} from './arena';

/** Helpers for the city tests: a flat arena with one player, a way to run commands and to run time. */

export function townWorld(
  size = 32,
  seed = 1,
): World {
  const w =
    arena(
      size,
      seed,
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
  // Stand off to the side so tiles near the green are free to build on.
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

export const mid =
  (w: {
    size: number;
  }) =>
    Math.floor(
      w.size /
        2,
    );

export type CityCmd =
  Command extends infer C
    ? C extends {
        playerId: string;
      }
      ? Omit<
          C,
          'playerId'
        >
      : never
    : never;

export function run(
  w: World,
  ...cmds: CityCmd[]
): WorldEvent[] {
  return stepWorld(
    w,
    0,
    cmds.map(
      (
        c,
      ) =>
        ({
          ...c,
          playerId:
            P,
        }) as Command,
    ),
  );
}

export function rejects(
  ev: WorldEvent[],
): string[] {
  return ev
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
}

/** Run `ticks` whole ticks of game time. */
export function ticks(
  w: World,
  n: number,
): WorldEvent[] {
  const out: WorldEvent[] =
    [];
  for (
    let i = 0;
    i <
    n;
    i++
  )
    out.push(
      ...stepWorld(
        w,
        TICK_MS,
      ),
    );
  return out;
}

/**
 * A first town on the green: a street east from the town green with homes along it, two shops at the end, one
 * well and one windmill. Costs 275 of the 300 a new player starts with. Returns the street's end tile.
 */
export function buildFirstTown(
  w: World,
): {
  endX: number;
  z: number;
} {
  const m =
    mid(
      w,
    );
  run(
    w,
    {
      type: 'placeRoad',
      x: m,
      z: m,
      x2:
        m +
        10,
      z2: m,
    },
  );
  // Wells and mills sit at the end of the street, on its sides.
  run(
    w,
    {
      type: 'placeUtility',
      kind: 'windmill',
      x:
        m +
        10,
      z:
        m -
        1,
    },
  );
  run(
    w,
    {
      type: 'placeUtility',
      kind: 'well',
      x:
        m +
        10,
      z:
        m +
        1,
    },
  );
  for (const z of [
    m -
      1,
    m +
      1,
  ]) {
    run(
      w,
      {
        type: 'zone',
        zone: 'homes',
        x:
          m +
          1,
        z,
        x2:
          m +
          6,
        z2: z,
      },
    );
    run(
      w,
      {
        type: 'zone',
        zone: 'market',
        x:
          m +
          7,
        z,
        x2:
          m +
          8,
        z2: z,
      },
    );
  }
  return {
    endX:
      m +
      10,
    z: m,
  };
}

export {
  createWorld,
  P,
  arena,
};
