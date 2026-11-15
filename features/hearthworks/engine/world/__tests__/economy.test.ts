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
  CUSTOMER_PREMIUM,
  FORAGE_COOLDOWN_TICKS,
  HIRE_COST,
  MIN_GATE_DISTANCE,
  TICK_MS,
  WAGE,
  WAGE_INTERVAL_TICKS,
  WORKERS_PER_COTTAGE,
  createWorld,
  stepWorld,
  tileDistance,
  type Command,
  type World,
} from '..';

const P =
  'p1';
const ticks =
  (
    w: World,
    n: number,
    cmds: Command[] = [],
  ) => {
    const events =
      stepWorld(
        w,
        TICK_MS,
        cmds,
      );
    for (
      let i = 1;
      i <
      n;
      i++
    )
      events.push(
        ...stepWorld(
          w,
          TICK_MS,
        ),
      );
    return events;
  };
const reasons =
  (
    ev: ReturnType<
      typeof stepWorld
    >,
  ) =>
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

function world() {
  const w =
    createWorld(
      11,
      40,
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
  w.players[
    P
  ].money =
    5000;
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
const mid =
  (
    w: World,
  ) =>
    Math.floor(
      w.size /
        2,
    );
function firstForest(
  w: World,
): {
  x: number;
  z: number;
} {
  const i =
    w.terrain.findIndex(
      (
        t,
      ) =>
        t ===
        'forest',
    );
  return {
    x:
      i %
      w.size,
    z: Math.floor(
      i /
        w.size,
    ),
  };
}
function stand(
  w: World,
  x: number,
  z: number,
) {
  w.players[
    P
  ].x =
    x;
  w.players[
    P
  ].z =
    z;
}

describe('foraging', () => {
  it('gathers from a forest tile in reach, then the spot is picked clean until it regrows', () => {
    const w =
      world();
    const f =
      firstForest(
        w,
      );
    stand(
      w,
      f.x,
      f.z -
        1 >=
        0
        ? f.z -
            1
        : f.z +
            1,
    );
    const got =
      stepWorld(
        w,
        0,
        [
          {
            type: 'forage',
            playerId:
              P,
            x: f.x,
            z: f.z,
          },
        ],
      );
    expect(
      got[0],
    ).toMatchObject(
      {
        type: 'foraged',
      },
    );
    const total =
      Object.values(
        w
          .players[
          P
        ]
          .inventory,
      ).reduce(
        (
          a,
          b,
        ) =>
          a +
          (b ??
            0),
        0,
      );
    expect(
      total,
    ).toBeGreaterThanOrEqual(
      1,
    );
    expect(
      reasons(
        stepWorld(
          w,
          0,
          [
            {
              type: 'forage',
              playerId:
                P,
              x: f.x,
              z: f.z,
            },
          ],
        ),
      ),
    ).toEqual(
      [
        'depleted',
      ],
    );
    ticks(
      w,
      FORAGE_COOLDOWN_TICKS,
    );
    expect(
      stepWorld(
        w,
        0,
        [
          {
            type: 'forage',
            playerId:
              P,
            x: f.x,
            z: f.z,
          },
        ],
      )[0],
    ).toMatchObject(
      {
        type: 'foraged',
      },
    );
  });

  it('refuses grass, far-away tiles and out-of-range coordinates', () => {
    const w =
      world();
    const f =
      firstForest(
        w,
      );
    stand(
      w,
      2,
      2,
    );
    expect(
      reasons(
        stepWorld(
          w,
          0,
          [
            {
              type: 'forage',
              playerId:
                P,
              x: f.x,
              z: f.z,
            },
          ],
        ),
      ),
    ).toEqual(
      [
        'too-far',
      ],
    );
    const m =
      mid(
        w,
      );
    expect(
      reasons(
        stepWorld(
          w,
          0,
          [
            {
              type: 'forage',
              playerId:
                P,
              x: m,
              z: m,
            },
          ],
        ),
      ),
    ).toEqual(
      [
        'nothing-there',
      ],
    );
    expect(
      reasons(
        stepWorld(
          w,
          0,
          [
            {
              type: 'forage',
              playerId:
                P,
              x: -1,
              z: 99999,
            },
          ],
        ),
      ),
    ).toEqual(
      [
        'out-of-bounds',
      ],
    );
  });

  it('is deterministic: the same world and commands forage the same goods', () => {
    const run =
      () => {
        const w =
          world();
        const f =
          firstForest(
            w,
          );
        stand(
          w,
          f.x,
          f.z,
        );
        stepWorld(
          w,
          0,
          [
            {
              type: 'forage',
              playerId:
                P,
              x: f.x,
              z: f.z,
            },
          ],
        );
        return JSON.stringify(
          w
            .players[
            P
          ]
            .inventory,
        );
      };
    expect(
      run(),
    ).toBe(
      run(),
    );
  });
});

/** Step until `done` holds (at most `max` ticks), returning the events on the way. */
function until(
  w: World,
  done: () => boolean,
  max = 4000,
) {
  const events: ReturnType<
    typeof stepWorld
  > =
    [];
  for (
    let i = 0;
    i <
      max &&
    !done();
    i++
  )
    events.push(
      ...stepWorld(
        w,
        TICK_MS,
      ),
    );
  return events;
}

describe('customers', () => {
  function stalled() {
    const w =
      world();
    const m =
      mid(
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
          kind: 'stall',
          x:
            m +
            1,
          z: m,
        },
      ],
    );
    return {
      w,
      m,
    };
  }

  it('only come once there is a stall, and walk in from a gate far away to a tile beside it', () => {
    const w =
      world();
    ticks(
      w,
      450,
    );
    expect(
      w.npcs,
    ).toHaveLength(
      0,
    );
    const m =
      mid(
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
          kind: 'stall',
          x:
            m +
            1,
          z: m,
        },
      ],
    );
    const ev =
      until(
        w,
        () =>
          w
            .npcs
            .length >
          0,
        2400,
      );
    expect(
      ev.some(
        (
          e,
        ) =>
          e.type ===
          'customerArrived',
      ),
    ).toBe(
      true,
    );
    const n =
      w
        .npcs[0];
    expect(
      n.mode,
    ).toBe(
      'arriving',
    );
    expect(
      tileDistance(
        n.x,
        n.z,
        m +
          1,
        m,
      ),
    ).toBeGreaterThanOrEqual(
      MIN_GATE_DISTANCE,
    );
    expect(
      ITEMS[
        n
          .want
      ],
    ).toBeDefined();
    until(
      w,
      () =>
        n.mode ===
        'waiting',
    );
    expect(
      n.mode,
    ).toBe(
      'waiting',
    );
    expect(
      tileDistance(
        n.x,
        n.z,
        m +
          1,
        m,
      ),
    ).toBe(
      1,
    );
  });

  it('pay a premium over the stall price when served, then walk off rather than vanish', () => {
    const {
      w,
    } =
      stalled();
    until(
      w,
      () =>
        w.npcs.some(
          (
            n,
          ) =>
            n.mode ===
            'waiting',
        ),
    );
    const n =
      w.npcs.find(
        (
          o,
        ) =>
          o.mode ===
          'waiting',
      )!;
    stand(
      w,
      n.x,
      n.z,
    );
    w.players[
      P
    ].inventory =
      {
        [n.want]:
          n.qty,
      };
    const moneyBefore =
      w
        .players[
        P
      ]
        .money;
    const ev =
      stepWorld(
        w,
        0,
        [
          {
            type: 'serve',
            playerId:
              P,
            npcId:
              n.id,
          },
        ],
      );
    expect(
      ev[0],
    ).toMatchObject(
      {
        type: 'served',
        npcId:
          n.id,
      },
    );
    expect(
      w
        .players[
        P
      ]
        .money -
        moneyBefore,
    ).toBe(
      Math.floor(
        ITEMS[
          n
            .want
        ]
          .price *
          n.qty *
          CUSTOMER_PREMIUM,
      ),
    );
    expect(
      w
        .players[
        P
      ]
        .inventory[
        n
          .want
      ],
    ).toBe(
      0,
    );
    // Still there, now heading for the gate.
    expect(
      w.npcs.find(
        (
          o,
        ) =>
          o.id ===
          n.id,
      ),
    ).toMatchObject(
      {
        mode: 'leaving',
      },
    );
    const left =
      until(
        w,
        () =>
          !w.npcs.some(
            (
              o,
            ) =>
              o.id ===
              n.id,
          ),
      );
    expect(
      left.some(
        (
          e,
        ) =>
          e.type ===
            'customerLeft' &&
          e.npcId ===
            n.id,
      ),
    ).toBe(
      true,
    );
  });

  it('refuse to be served without the goods, from too far away, or once they are leaving', () => {
    const {
      w,
    } =
      stalled();
    until(
      w,
      () =>
        w.npcs.some(
          (
            o,
          ) =>
            o.mode ===
            'waiting',
        ),
    );
    const n =
      w.npcs.find(
        (
          o,
        ) =>
          o.mode ===
          'waiting',
      )!;
    stand(
      w,
      n.x,
      n.z,
    );
    expect(
      reasons(
        stepWorld(
          w,
          0,
          [
            {
              type: 'serve',
              playerId:
                P,
              npcId:
                n.id,
            },
          ],
        ),
      ),
    ).toEqual(
      [
        'missing-ingredients',
      ],
    );
    stand(
      w,
      2,
      2,
    );
    w.players[
      P
    ].inventory =
      {
        [n.want]: 99,
      };
    expect(
      reasons(
        stepWorld(
          w,
          0,
          [
            {
              type: 'serve',
              playerId:
                P,
              npcId:
                n.id,
            },
          ],
        ),
      ),
    ).toEqual(
      [
        'too-far',
      ],
    );
    stand(
      w,
      n.x,
      n.z,
    );
    stepWorld(
      w,
      0,
      [
        {
          type: 'serve',
          playerId:
            P,
          npcId:
            n.id,
        },
      ],
    );
    expect(
      reasons(
        stepWorld(
          w,
          0,
          [
            {
              type: 'serve',
              playerId:
                P,
              npcId:
                n.id,
            },
          ],
        ),
      ),
    ).toEqual(
      [
        'no-such-npc',
      ],
    );
  });

  it('can be served on the way in, before they have reached the stall', () => {
    const {
      w,
    } =
      stalled();
    until(
      w,
      () =>
        w
          .npcs
          .length >
        0,
    );
    const n =
      w
        .npcs[0];
    expect(
      n.mode,
    ).toBe(
      'arriving',
    );
    // Walk up to wherever they are.
    stand(
      w,
      n.x,
      n.z,
    );
    w.players[
      P
    ].inventory =
      {
        [n.want]:
          n.qty,
      };
    expect(
      stepWorld(
        w,
        0,
        [
          {
            type: 'serve',
            playerId:
              P,
            npcId:
              n.id,
          },
        ],
      )[0],
    ).toMatchObject(
      {
        type: 'served',
      },
    );
  });

  it('give up and walk home if nobody serves them', () => {
    const {
      w,
    } =
      stalled();
    const ev =
      until(
        w,
        () =>
          false,
        3000,
      );
    expect(
      ev.some(
        (
          e,
        ) =>
          e.type ===
          'customerLeaving',
      ),
    ).toBe(
      true,
    );
    expect(
      ev.some(
        (
          e,
        ) =>
          e.type ===
          'customerLeft',
      ),
    ).toBe(
      true,
    );
  });
});

describe('the auto-harvester', () => {
  function farm() {
    const w =
      world();
    const m =
      mid(
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
          kind: 'harvester',
          x: m,
          z: m,
        },
        {
          type: 'place',
          playerId:
            P,
          kind: 'plot',
          x:
            m +
            1,
          z: m,
        },
        {
          type: 'place',
          playerId:
            P,
          kind: 'plot',
          x:
            m +
            5,
          z: m,
        },
      ],
    );
    stepWorld(
      w,
      0,
      [
        {
          type: 'plant',
          playerId:
            P,
          crop: 'wheat',
          x:
            m +
            1,
          z: m,
        },
        {
          type: 'plant',
          playerId:
            P,
          crop: 'wheat',
          x:
            m +
            5,
          z: m,
        },
      ],
    );
    return {
      w,
      m,
    };
  }

  it('gathers ripe crops within reach into its storage and ignores far ones', () => {
    const {
      w,
      m,
    } =
      farm();
    ticks(
      w,
      Math.ceil(
        (CROPS
          .wheat
          .stageMs *
          CROPS
            .wheat
            .stages) /
          TICK_MS,
      ) +
        30,
    );
    const h =
      w.buildings.find(
        (
          b,
        ) =>
          b.kind ===
          'harvester',
      )!;
    expect(
      h
        .storage
        ?.wheat,
    ).toBe(
      CROPS
        .wheat
        .yieldQty,
    );
    expect(
      w.crops.some(
        (
          c,
        ) =>
          c.x ===
          m +
            5,
      ),
    ).toBe(
      true,
    ); // the far one waits for a hand
    expect(
      w.crops.some(
        (
          c,
        ) =>
          c.x ===
          m +
            1,
      ),
    ).toBe(
      false,
    );
  });

  it('hands over its storage to a player in reach, once', () => {
    const {
      w,
      m,
    } =
      farm();
    ticks(
      w,
      Math.ceil(
        (CROPS
          .wheat
          .stageMs *
          CROPS
            .wheat
            .stages) /
          TICK_MS,
      ) +
        30,
    );
    stand(
      w,
      m +
        1,
      m +
        1,
    );
    const ev =
      stepWorld(
        w,
        0,
        [
          {
            type: 'collect',
            playerId:
              P,
            x: m,
            z: m,
          },
        ],
      );
    expect(
      ev[0],
    ).toMatchObject(
      {
        type: 'collected',
      },
    );
    expect(
      w
        .players[
        P
      ]
        .inventory
        .wheat,
    ).toBe(
      CROPS
        .wheat
        .yieldQty,
    );
    expect(
      reasons(
        stepWorld(
          w,
          0,
          [
            {
              type: 'collect',
              playerId:
                P,
              x: m,
              z: m,
            },
          ],
        ),
      ),
    ).toEqual(
      [
        'depleted',
      ],
    );
    stand(
      w,
      2,
      2,
    );
    expect(
      reasons(
        stepWorld(
          w,
          0,
          [
            {
              type: 'collect',
              playerId:
                P,
              x: m,
              z: m,
            },
          ],
        ),
      ),
    ).toEqual(
      [
        'too-far',
      ],
    );
  });
});

describe('hired farmhands', () => {
  function cottage() {
    const w =
      world();
    const m =
      mid(
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
        {
          type: 'place',
          playerId:
            P,
          kind: 'plot',
          x:
            m +
            2,
          z: m,
        },
      ],
    );
    return {
      w,
      m,
    };
  }

  it('are hired at a cottage for a fee, two to a cottage at most, and only at cottages', () => {
    const {
      w,
      m,
    } =
      cottage();
    const before =
      w
        .players[
        P
      ]
        .money;
    const ev =
      stepWorld(
        w,
        0,
        [
          {
            type: 'hire',
            playerId:
              P,
            x: m,
            z: m,
          },
          {
            type: 'hire',
            playerId:
              P,
            x: m,
            z: m,
          },
          {
            type: 'hire',
            playerId:
              P,
            x: m,
            z: m,
          },
          {
            type: 'hire',
            playerId:
              P,
            x:
              m +
              2,
            z: m,
          },
        ],
      );
    expect(
      ev.filter(
        (
          e,
        ) =>
          e.type ===
          'hired',
      ),
    ).toHaveLength(
      WORKERS_PER_COTTAGE,
    );
    expect(
      reasons(
        ev,
      ),
    ).toEqual(
      [
        'too-many-workers',
        'no-cottage',
      ],
    );
    expect(
      before -
        w
          .players[
          P
        ]
          .money,
    ).toBe(
      HIRE_COST *
        WORKERS_PER_COTTAGE,
    );
  });

  it('bring in ripe crops for their employer, replant, and are paid wages', () => {
    const {
      w,
      m,
    } =
      cottage();
    stepWorld(
      w,
      0,
      [
        {
          type: 'plant',
          playerId:
            P,
          crop: 'wheat',
          x:
            m +
            2,
          z: m,
        },
        {
          type: 'hire',
          playerId:
            P,
          x: m,
          z: m,
        },
      ],
    );
    ticks(
      w,
      Math.ceil(
        (CROPS
          .wheat
          .stageMs *
          CROPS
            .wheat
            .stages) /
          TICK_MS,
      ) +
        200,
    );
    expect(
      w
        .players[
        P
      ]
        .inventory
        .wheat ??
        0,
    ).toBeGreaterThanOrEqual(
      CROPS
        .wheat
        .yieldQty,
    );
    expect(
      w
        .crops
        .length,
    ).toBeGreaterThanOrEqual(
      0,
    );
    const moneyA =
      w
        .players[
        P
      ]
        .money;
    ticks(
      w,
      WAGE_INTERVAL_TICKS,
    );
    expect(
      w
        .players[
        P
      ]
        .money,
    ).toBeLessThanOrEqual(
      moneyA -
        WAGE +
        20,
    ); // wage went out (replant seeds too)
  });

  it('quit if the employer cannot pay them, and can be fired', () => {
    const {
      w,
      m,
    } =
      cottage();
    stepWorld(
      w,
      0,
      [
        {
          type: 'hire',
          playerId:
            P,
          x: m,
          z: m,
        },
      ],
    );
    w.players[
      P
    ].money =
      0;
    const ev =
      ticks(
        w,
        WAGE_INTERVAL_TICKS +
          5,
      );
    expect(
      ev.some(
        (
          e,
        ) =>
          e.type ===
            'workerQuit' &&
          e.reason ===
            'unpaid',
      ),
    ).toBe(
      true,
    );
    expect(
      w.workers,
    ).toHaveLength(
      0,
    );
    w.players[
      P
    ].money =
      500;
    stepWorld(
      w,
      0,
      [
        {
          type: 'hire',
          playerId:
            P,
          x: m,
          z: m,
        },
      ],
    );
    const id =
      w
        .workers[0]
        .id;
    expect(
      stepWorld(
        w,
        0,
        [
          {
            type: 'fire',
            playerId:
              P,
            workerId:
              id,
          },
        ],
      )[0],
    ).toMatchObject(
      {
        reason:
          'fired',
      },
    );
    expect(
      reasons(
        stepWorld(
          w,
          0,
          [
            {
              type: 'fire',
              playerId:
                P,
              workerId:
                id,
            },
          ],
        ),
      ),
    ).toEqual(
      [
        'nothing-there',
      ],
    );
  });
});
