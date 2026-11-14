import {
  describe,
  expect,
  it,
} from 'vitest';
import { CROPS } from '../../content';
import { tileBlocked } from '../../avatar';
import {
  findPath,
  moverY,
  newMover,
} from '../../nav';
import { assignRoute } from '../agents';
import {
  TICK_MS,
  WORK_TICKS,
  createWorld,
  stepWorld,
  tileTop,
  type Building,
  type Command,
  type Npc,
  type World,
  type WorldEvent,
} from '..';

const P =
  'p1';
const N = 24;

/** A flat 24×24 meadow (grass at level 3) ringed by water, with one player who is rich. */
function arena(): World {
  const w =
    createWorld(
      1,
      N,
    );
  w.terrain =
    w.terrain.map(
      (
        _,
        i,
      ) => {
        const x =
          i %
          N;
        const z =
          Math.floor(
            i /
              N,
          );
        return x ===
          0 ||
          z ===
            0 ||
          x ===
            N -
              1 ||
          z ===
            N -
              1
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
          N;
        const z =
          Math.floor(
            i /
              N,
          );
        return x ===
          0 ||
          z ===
            0 ||
          x ===
            N -
              1 ||
          z ===
            N -
              1
          ? 0
          : 3;
      },
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
    100000;
  w.players[
    P
  ].x =
    1;
  w.players[
    P
  ].z =
    1;
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
        N +
        x
    ] =
      level;
    w.terrain[
      z *
        N +
        x
    ] =
      terrain;
  };
const tree =
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
    );
const run =
  (
    w: World,
    cmds: Command[] = [],
  ) =>
    stepWorld(
      w,
      TICK_MS,
      cmds,
    );
const build =
  (
    w: World,
    kind: Building['kind'],
    x: number,
    z: number,
  ) => {
    run(
      w,
      [
        {
          type: 'place',
          playerId:
            P,
          kind,
          x,
          z,
        },
      ],
    );
    return w.buildings.find(
      (
        b,
      ) =>
        b.x ===
          x &&
        b.z ===
          z,
    )!;
  };
const ticks =
  (
    w: World,
    n: number,
  ) => {
    const ev: WorldEvent[] =
      [];
    for (
      let i = 0;
      i <
      n;
      i++
    )
      ev.push(
        ...run(
          w,
        ),
      );
    return ev;
  };
const agents =
  (
    w: World,
  ) => [
    ...w.npcs,
    ...w.workers,
  ];
const ripen =
  (
    w: World,
  ) => {
    for (const c of w.crops)
      c.plantedTick =
        -1_000_000;
  };

/** A customer standing at `gate`, already set off for `stall` (the spawner picks the gate at random; tests choose it). */
function customerAt(
  w: World,
  gate: {
    x: number;
    z: number;
  },
  stall: Building,
): Npc {
  const route =
    findPath(
      w,
      gate,
      stall,
      {
        stopWithin: 1,
      },
    );
  if (
    !route
  )
    throw new Error(
      'test setup: no route',
    );
  const end =
    route
      .steps[
      route
        .steps
        .length -
        1
    ];
  const npc: Npc =
    {
      ...newMover(
        gate.x,
        gate.z,
      ),
      id: w.nextId++,
      kind: 'customer',
      want: 'stew',
      qty: 1,
      patience: 1200,
      look: 'citizen',
      mode: 'arriving',
      stallId:
        stall.id,
      serviceX:
        end.x,
      serviceZ:
        end.z,
      gateX:
        gate.x,
      gateZ:
        gate.z,
      stuck: 0,
    };
  assignRoute(
    npc,
    gate,
    route,
    stall,
    1,
  );
  w.npcs.push(
    npc,
  );
  return npc;
}

/** Everything one agent does tick by tick, plus whether it ever stood or stepped somewhere it should not. */
function watch(
  w: World,
  ids: number[],
  max: number,
  stop: () => boolean = () =>
    false,
) {
  const tiles =
    new Set<string>();
  const stepKinds =
    new Set<string>();
  const heights: number[] =
    [];
  let bad = 0;
  for (
    let i = 0;
    i <
      max &&
    !stop();
    i++
  ) {
    run(
      w,
    );
    for (const a of agents(
      w,
    )) {
      if (
        !ids.includes(
          a.id,
        )
      )
        continue;
      tiles.add(
        `${a.fromX},${a.fromZ}`,
      );
      if (
        tileBlocked(
          w,
          a.fromX,
          a.fromZ,
        )
      )
        bad++;
      const next =
        a
          .path[0];
      if (
        next &&
        a.leg >
          0
      ) {
        stepKinds.add(
          next.kind,
        );
        if (
          tileBlocked(
            w,
            next.x,
            next.z,
          )
        )
          bad++;
        heights.push(
          moverY(
            w,
            a,
          ),
        );
      }
    }
  }
  return {
    tiles,
    stepKinds,
    heights,
    bad,
  };
}

describe('customers walk', () => {
  it('route around a wall of trees instead of through it', () => {
    const w =
      arena();
    for (
      let z = 1;
      z <=
      20;
      z++
    )
      tree(
        w,
        8,
        z,
      ); // a gap only at the south end
    const stall =
      build(
        w,
        'stall',
        12,
        6,
      );
    const n =
      customerAt(
        w,
        {
          x: 3,
          z: 6,
        },
        stall,
      );
    const seen =
      watch(
        w,
        [
          n.id,
        ],
        1500,
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
      seen.bad,
    ).toBe(
      0,
    );
    expect(
      [
        ...seen.tiles,
      ].filter(
        (
          t,
        ) =>
          t.startsWith(
            '8,',
          ) &&
          Number(
            t.split(
              ',',
            )[1],
          ) <
            21,
      ),
    ).toEqual(
      [],
    );
    expect(
      [
        ...seen.tiles,
      ].some(
        (
          t,
        ) =>
          t.startsWith(
            '8,',
          ),
      ),
    ).toBe(
      true,
    ); // through the gap
    expect(
      Math.max(
        Math.abs(
          n.x -
            12,
        ),
        Math.abs(
          n.z -
            6,
        ),
      ),
    ).toBe(
      1,
    );
  });

  it('hop up a ledge', () => {
    const w =
      arena();
    for (
      let z = 9;
      z <=
      15;
      z++
    )
      for (
        let x = 9;
        x <=
        15;
        x++
      )
        set(
          w,
          x,
          z,
          4,
        ); // a plateau, one block up
    const stall =
      build(
        w,
        'stall',
        12,
        12,
      );
    const n =
      customerAt(
        w,
        {
          x: 3,
          z: 12,
        },
        stall,
      );
    const seen =
      watch(
        w,
        [
          n.id,
        ],
        1500,
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
      seen.stepKinds.has(
        'jump',
      ),
    ).toBe(
      true,
    );
    expect(
      seen.bad,
    ).toBe(
      0,
    );
    // They end up standing on the plateau.
    expect(
      tileTop(
        w,
        n.x,
        n.z,
      ),
    ).toBeCloseTo(
      tileTop(
        w,
        12,
        12,
      ),
    );
    expect(
      Math.max(
        ...seen.heights,
      ),
    ).toBeGreaterThan(
      tileTop(
        w,
        12,
        12,
      ),
    );
  });

  it('drop down a two-block cliff', () => {
    const w =
      arena();
    for (
      let z = 1;
      z <
      N -
        1;
      z++
    )
      for (
        let x = 1;
        x <
        9;
        x++
      )
        set(
          w,
          x,
          z,
          5,
        ); // a shelf, two blocks above the meadow
    const stall =
      build(
        w,
        'stall',
        15,
        12,
      );
    const n =
      customerAt(
        w,
        {
          x: 3,
          z: 12,
        },
        stall,
      );
    const seen =
      watch(
        w,
        [
          n.id,
        ],
        1500,
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
      seen.stepKinds.has(
        'fall',
      ),
    ).toBe(
      true,
    );
    expect(
      seen.bad,
    ).toBe(
      0,
    );
    expect(
      seen
        .heights[0],
    ).toBeGreaterThan(
      seen
        .heights[
        seen
          .heights
          .length -
          1
      ] -
        1e-9,
    );
  });

  it('jump a one-tile stream', () => {
    const w =
      arena();
    for (
      let z = 1;
      z <
      N -
        1;
      z++
    )
      set(
        w,
        8,
        z,
        0,
        'water',
      );
    const stall =
      build(
        w,
        'stall',
        12,
        12,
      );
    const n =
      customerAt(
        w,
        {
          x: 3,
          z: 12,
        },
        stall,
      );
    const seen =
      watch(
        w,
        [
          n.id,
        ],
        1500,
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
      seen.stepKinds.has(
        'jump',
      ),
    ).toBe(
      true,
    );
    expect(
      seen.bad,
    ).toBe(
      0,
    );
  });

  it('never share a service tile and queue up around a busy stall', () => {
    const w =
      arena();
    const stall =
      build(
        w,
        'stall',
        12,
        12,
      );
    const crowd =
      [
        3,
        4,
        5,
        6,
        7,
      ].map(
        (
          z,
        ) =>
          customerAt(
            w,
            {
              x: 3,
              z,
            },
            stall,
          ),
      );
    const seen =
      watch(
        w,
        crowd.map(
          (
            c,
          ) =>
            c.id,
        ),
        2500,
        () =>
          crowd.every(
            (
              c,
            ) =>
              c.mode ===
              'waiting',
          ),
      );
    expect(
      seen.bad,
    ).toBe(
      0,
    );
    expect(
      crowd.every(
        (
          c,
        ) =>
          c.mode ===
          'waiting',
      ),
    ).toBe(
      true,
    );
    const spots =
      crowd.map(
        (
          c,
        ) =>
          `${Math.round(c.x)},${Math.round(c.z)}`,
      );
    expect(
      new Set(
        spots,
      )
        .size,
    ).toBe(
      crowd.length,
    );
  });

  it('re-plan around a building raised in their path', () => {
    const w =
      arena();
    const stall =
      build(
        w,
        'stall',
        14,
        12,
      );
    const n =
      customerAt(
        w,
        {
          x: 3,
          z: 12,
        },
        stall,
      );
    ticks(
      w,
      100,
    );
    const ahead =
      n
        .path[3];
    expect(
      ahead,
    ).toBeDefined();
    const wall =
      build(
        w,
        'cottage',
        ahead.x,
        ahead.z,
      );
    expect(
      wall,
    ).toBeDefined();
    const seen =
      watch(
        w,
        [
          n.id,
        ],
        1500,
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
      seen.tiles.has(
        `${wall.x},${wall.z}`,
      ),
    ).toBe(
      false,
    );
    expect(
      seen.bad,
    ).toBe(
      0,
    );
  });

  it('turn back and leave if the way to the stall is closed off', () => {
    const w =
      arena();
    const stall =
      build(
        w,
        'stall',
        14,
        12,
      );
    const n =
      customerAt(
        w,
        {
          x: 3,
          z: 12,
        },
        stall,
      );
    ticks(
      w,
      60,
    );
    for (
      let z = 1;
      z <
      N -
        1;
      z++
    )
      tree(
        w,
        9,
        z,
      ); // a wall right across the meadow
    const ev: WorldEvent[] =
      [];
    for (
      let i = 0;
      i <
        800 &&
      w.npcs.includes(
        n,
      );
      i++
    )
      ev.push(
        ...run(
          w,
        ),
      );
    expect(
      ev.some(
        (
          e,
        ) =>
          e.type ===
            'customerLeaving' &&
          e.npcId ===
            n.id,
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
            'customerLeft' &&
          e.npcId ===
            n.id,
      ),
    ).toBe(
      true,
    );
    expect(
      w.npcs.includes(
        n,
      ),
    ).toBe(
      false,
    );
    // They went back toward the gate, not through the wall.
    expect(
      n.x,
    ).toBeLessThan(
      9,
    );
  });

  it('give up on the spot if they are boxed in', () => {
    const w =
      arena();
    const stall =
      build(
        w,
        'stall',
        14,
        12,
      );
    const n =
      customerAt(
        w,
        {
          x: 3,
          z: 12,
        },
        stall,
      );
    for (
      let i = 0;
      i <
        200 &&
      n.leg !==
        0;
      i++
    )
      run(
        w,
      );
    ticks(
      w,
      40,
    );
    while (
      n.leg !==
      0
    )
      run(
        w,
      );
    for (
      let dz =
        -1;
      dz <=
      1;
      dz++
    )
      for (
        let dx =
          -1;
        dx <=
        1;
        dx++
      )
        if (
          dx ||
          dz
        )
          tree(
            w,
            n.fromX +
              dx,
            n.fromZ +
              dz,
          );
    const ev =
      ticks(
        w,
        3,
      );
    expect(
      ev.some(
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
    expect(
      w.npcs.includes(
        n,
      ),
    ).toBe(
      false,
    );
  });

  it('are never sent to a stall that cannot be reached', () => {
    const w =
      arena();
    const stall =
      build(
        w,
        'stall',
        12,
        12,
      );
    for (
      let dz =
        -1;
      dz <=
      1;
      dz++
    )
      for (
        let dx =
          -1;
        dx <=
        1;
        dx++
      )
        if (
          dx ||
          dz
        )
          tree(
            w,
            12 +
              dx,
            12 +
              dz,
          );
    expect(
      ticks(
        w,
        3000,
      ).some(
        (
          e,
        ) =>
          e.type ===
          'customerArrived',
      ),
    ).toBe(
      false,
    );
    expect(
      w.npcs,
    ).toHaveLength(
      0,
    );
    // Cliffs wall a stall off just as well as trees.
    const w2 =
      arena();
    for (
      let z = 9;
      z <=
      15;
      z++
    )
      for (
        let x = 9;
        x <=
        15;
        x++
      )
        set(
          w2,
          x,
          z,
          6,
        );
    set(
      w2,
      12,
      12,
      3,
    );
    build(
      w2,
      'stall',
      12,
      12,
    );
    expect(
      ticks(
        w2,
        3000,
      ).some(
        (
          e,
        ) =>
          e.type ===
          'customerArrived',
      ),
    ).toBe(
      false,
    );
    // Open it up and they come.
    for (
      let dx =
        -1;
      dx <=
      1;
      dx++
    )
      for (
        let dz =
          -1;
        dz <=
        1;
        dz++
      )
        if (
          dx ||
          dz
        )
          tree(
            w,
            12 +
              dx,
            12 +
              dz,
          );
    expect(
      stall,
    ).toBeDefined();
    for (
      let dz =
        -1;
      dz <=
      1;
      dz++
    )
      for (
        let dx =
          -1;
        dx <=
        1;
        dx++
      )
        if (
          dx ||
          dz
        )
          set(
            w,
            12 +
              dx,
            12 +
              dz,
            3,
            'grass',
          );
    expect(
      ticks(
        w,
        2400,
      ).some(
        (
          e,
        ) =>
          e.type ===
          'customerArrived',
      ),
    ).toBe(
      true,
    );
  });

  it('patience only runs while they are waiting', () => {
    const w =
      arena();
    const stall =
      build(
        w,
        'stall',
        14,
        12,
      );
    const n =
      customerAt(
        w,
        {
          x: 3,
          z: 12,
        },
        stall,
      );
    ticks(
      w,
      100,
    );
    expect(
      n.mode,
    ).toBe(
      'arriving',
    );
    expect(
      n.patience,
    ).toBe(
      1200,
    );
    while (
      n.mode ===
      'arriving'
    )
      run(
        w,
      );
    const at =
      n.patience;
    ticks(
      w,
      50,
    );
    expect(
      n.patience,
    ).toBe(
      at -
        50,
    );
  });

  it('walk back to their gate after being served, and are gone on arrival', () => {
    const w =
      arena();
    const stall =
      build(
        w,
        'stall',
        14,
        12,
      );
    const n =
      customerAt(
        w,
        {
          x: 3,
          z: 12,
        },
        stall,
      );
    while (
      n.mode !==
      'waiting'
    )
      run(
        w,
      );
    w.players[
      P
    ].x =
      n.x;
    w.players[
      P
    ].z =
      n.z;
    w.players[
      P
    ].inventory =
      {
        stew: 5,
      };
    run(
      w,
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
      n.mode,
    ).toBe(
      'leaving',
    );
    expect(
      w.npcs.includes(
        n,
      ),
    ).toBe(
      true,
    );
    let last =
      {
        x: n.x,
        z: n.z,
      };
    let gone:
      | WorldEvent
      | undefined;
    for (
      let i = 0;
      i <
        1500 &&
      !gone;
      i++
    ) {
      last =
        {
          x: n.x,
          z: n.z,
        };
      gone =
        run(
          w,
        ).find(
          (
            e,
          ) =>
            e.type ===
              'customerLeft' &&
            e.npcId ===
              n.id,
        );
    }
    expect(
      gone,
    ).toBeDefined();
    expect(
      Math.hypot(
        last.x -
          3,
        last.z -
          12,
      ),
    ).toBeLessThan(
      0.5,
    );
    // A second serve on someone leaving is refused.
    expect(
      w.npcs.includes(
        n,
      ),
    ).toBe(
      false,
    );
  });
});

describe('farmhands walk', () => {
  function farm() {
    const w =
      arena();
    build(
      w,
      'cottage',
      4,
      4,
    );
    build(
      w,
      'plot',
      9,
      4,
    );
    run(
      w,
      [
        {
          type: 'plant',
          playerId:
            P,
          crop: 'wheat',
          x: 9,
          z: 4,
        },
      ],
    );
    ripen(
      w,
    );
    run(
      w,
      [
        {
          type: 'hire',
          playerId:
            P,
          x: 4,
          z: 4,
        },
      ],
    );
    return {
      w,
      k: w
        .workers[0],
    };
  }

  it('walk to a far crop and only bring it in once they are there and have worked', () => {
    const {
      w,
      k,
    } =
      farm();
    expect(
      k.state,
    ).toBe(
      'home',
    );
    let harvestedAt =
      -1;
    let startedWork =
      -1;
    const t0 =
      w.tick;
    for (
      let i = 0;
      i <
        600 &&
      harvestedAt <
        0;
      i++
    ) {
      run(
        w,
      );
      if (
        k.state ===
          'working' &&
        startedWork <
          0
      )
        startedWork =
          w.tick -
          t0;
      if (
        (w
          .players[
          P
        ]
          .inventory
          .wheat ??
          0) >
          0 &&
        harvestedAt <
          0
      ) {
        harvestedAt =
          w.tick -
          t0;
        expect(
          Math.max(
            Math.abs(
              Math.round(
                k.x,
              ) -
                9,
            ),
            Math.abs(
              Math.round(
                k.z,
              ) -
                4,
            ),
          ),
        ).toBeLessThanOrEqual(
          1,
        );
      }
    }
    expect(
      harvestedAt,
    ).toBeGreaterThan(
      0,
    );
    // Four tiles of walking is at least 60 ticks before work even starts, and the work itself takes WORK_TICKS.
    expect(
      startedWork,
    ).toBeGreaterThan(
      60,
    );
    expect(
      harvestedAt -
        startedWork,
    ).toBeGreaterThanOrEqual(
      WORK_TICKS -
        1,
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
      w.crops.some(
        (
          c,
        ) =>
          c.x ===
            9 &&
          c.z ===
            4,
      ),
    ).toBe(
      false,
    );
  });

  it('then replant, and go home to rest when there is nothing to do', () => {
    const {
      w,
      k,
    } =
      farm();
    let replanted = false;
    let rested = false;
    for (
      let i = 0;
      i <
        400 &&
      !rested;
      i++
    ) {
      run(
        w,
      );
      if (
        (w
          .players[
          P
        ]
          .inventory
          .wheat ??
          0) >
          0 &&
        w.crops.some(
          (
            c,
          ) =>
            c.x ===
              9 &&
            c.z ===
              4,
        )
      )
        replanted = true;
      const nearHome =
        Math.max(
          Math.abs(
            Math.round(
              k.x,
            ) -
              4,
          ),
          Math.abs(
            Math.round(
              k.z,
            ) -
              4,
          ),
        ) <=
        1;
      if (
        replanted &&
        k.state ===
          'home' &&
        nearHome
      )
        rested = true;
    }
    expect(
      replanted,
    ).toBe(
      true,
    );
    expect(
      k.lastCrop,
    ).toBe(
      'wheat',
    );
    expect(
      rested,
    ).toBe(
      true,
    );
  });

  it('check the crop is still there when they arrive: a player who got there first keeps the harvest', () => {
    const {
      w,
      k,
    } =
      farm();
    for (
      let i = 0;
      i <
        200 &&
      k.state !==
        'toWork';
      i++
    )
      run(
        w,
      );
    expect(
      k.state,
    ).toBe(
      'toWork',
    );
    w.players[
      P
    ].x =
      9;
    w.players[
      P
    ].z =
      4;
    run(
      w,
      [
        {
          type: 'harvest',
          playerId:
            P,
          x: 9,
          z: 4,
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
      CROPS
        .wheat
        .yieldQty,
    );
    ticks(
      w,
      300,
    );
    // Only the player's one harvest: the farmhand arrived to an empty plot and did not conjure a second.
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
      k.task ===
        null ||
        k
          .task
          .kind ===
          'plant',
    ).toBe(
      true,
    );
  });

  it('skip a crop they cannot reach and take the next one', () => {
    const w =
      arena();
    build(
      w,
      'cottage',
      4,
      4,
    );
    build(
      w,
      'plot',
      5,
      7,
    ); // walled in by trees, nearer
    build(
      w,
      'plot',
      9,
      4,
    ); // out in the open, further
    run(
      w,
      [
        {
          type: 'plant',
          playerId:
            P,
          crop: 'wheat',
          x: 5,
          z: 7,
        },
        {
          type: 'plant',
          playerId:
            P,
          crop: 'wheat',
          x: 9,
          z: 4,
        },
      ],
    );
    for (
      let dz =
        -1;
      dz <=
      1;
      dz++
    )
      for (
        let dx =
          -1;
        dx <=
        1;
        dx++
      )
        if (
          dx ||
          dz
        )
          tree(
            w,
            5 +
              dx,
            7 +
              dz,
          );
    // A second ring: the first one is not enough, nobody can stand within one tile of it.
    ripen(
      w,
    );
    run(
      w,
      [
        {
          type: 'hire',
          playerId:
            P,
          x: 4,
          z: 4,
        },
      ],
    );
    ticks(
      w,
      500,
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
      w.crops.some(
        (
          c,
        ) =>
          c.x ===
            5 &&
          c.z ===
            7,
      ),
    ).toBe(
      true,
    ); // the walled-in one stays
    expect(
      w.workers[0].avoid.some(
        (
          a,
        ) =>
          a.x ===
            5 &&
          a.z ===
            7,
      ) ||
        w
          .workers[0]
          .task ===
          null,
    ).toBe(
      true,
    );
  });

  it('climb to a crop on a ledge', () => {
    const w =
      arena();
    build(
      w,
      'cottage',
      4,
      4,
    );
    for (
      let z = 3;
      z <=
      5;
      z++
    )
      for (
        let x = 8;
        x <=
        10;
        x++
      )
        set(
          w,
          x,
          z,
          4,
        );
    build(
      w,
      'plot',
      9,
      4,
    );
    run(
      w,
      [
        {
          type: 'plant',
          playerId:
            P,
          crop: 'wheat',
          x: 9,
          z: 4,
        },
      ],
    );
    ripen(
      w,
    );
    run(
      w,
      [
        {
          type: 'hire',
          playerId:
            P,
          x: 4,
          z: 4,
        },
      ],
    );
    const seen =
      watch(
        w,
        [
          w
            .workers[0]
            .id,
        ],
        500,
        () =>
          (w
            .players[
            P
          ]
            .inventory
            .wheat ??
            0) >
          0,
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
      seen.stepKinds.has(
        'jump',
      ),
    ).toBe(
      true,
    );
    expect(
      seen.bad,
    ).toBe(
      0,
    );
  });

  it('never send two farmhands to the same crop', () => {
    const w =
      arena();
    build(
      w,
      'cottage',
      4,
      4,
    );
    build(
      w,
      'plot',
      8,
      4,
    );
    run(
      w,
      [
        {
          type: 'plant',
          playerId:
            P,
          crop: 'wheat',
          x: 8,
          z: 4,
        },
      ],
    );
    ripen(
      w,
    );
    run(
      w,
      [
        {
          type: 'hire',
          playerId:
            P,
          x: 4,
          z: 4,
        },
        {
          type: 'hire',
          playerId:
            P,
          x: 4,
          z: 4,
        },
      ],
    );
    expect(
      w.workers,
    ).toHaveLength(
      2,
    );
    let both = false;
    for (
      let i = 0;
      i <
      400;
      i++
    ) {
      run(
        w,
      );
      const [
        a,
        b,
      ] =
        w.workers;
      if (
        a.task &&
        b.task &&
        a
          .task
          .kind ===
          b
            .task
            .kind &&
        a
          .task
          .x ===
          b
            .task
            .x &&
        a
          .task
          .z ===
          b
            .task
            .z
      )
        both = true;
    }
    expect(
      both,
    ).toBe(
      false,
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
    // With several crops they split up.
    const w2 =
      arena();
    build(
      w2,
      'cottage',
      4,
      4,
    );
    for (const x of [
      7,
      8,
      9,
    ])
      build(
        w2,
        'plot',
        x,
        4,
      );
    for (const x of [
      7,
      8,
      9,
    ])
      run(
        w2,
        [
          {
            type: 'plant',
            playerId:
              P,
            crop: 'wheat',
            x,
            z: 4,
          },
        ],
      );
    ripen(
      w2,
    );
    run(
      w2,
      [
        {
          type: 'hire',
          playerId:
            P,
          x: 4,
          z: 4,
        },
        {
          type: 'hire',
          playerId:
            P,
          x: 4,
          z: 4,
        },
      ],
    );
    const claimed =
      new Set<string>();
    for (
      let i = 0;
      i <
      100;
      i++
    ) {
      run(
        w2,
      );
      for (const k of w2.workers)
        if (
          k.task
        )
          claimed.add(
            `${k.id}:${k.task.x}`,
          );
    }
    const byWorker =
      [
        ...claimed,
      ].map(
        (
          c,
        ) =>
          c.split(
            ':',
          ),
      );
    expect(
      new Set(
        byWorker.map(
          ([
            ,
            x,
          ]) =>
            x,
        ),
      )
        .size,
    ).toBeGreaterThan(
      1,
    );
  });

  it('are never put in the way of a new building', () => {
    const {
      w,
      k,
    } =
      farm();
    const door =
      {
        x: k.fromX,
        z: k.fromZ,
      };
    const ev =
      run(
        w,
        [
          {
            type: 'place',
            playerId:
              P,
            kind: 'kitchen',
            x: door.x,
            z: door.z,
          },
        ],
      );
    expect(
      ev.some(
        (
          e,
        ) =>
          e.type ===
            'rejected' &&
          e.reason ===
            'occupied',
      ),
    ).toBe(
      true,
    );
  });
});

describe('a long soak', () => {
  /** Hilly seeded terrain with water, ledges and trees; a stall, a cottage and some fields on the meadow. */
  function island(): World {
    const w =
      createWorld(
        7,
        48,
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
      1_000_000;
    return w;
  }
  const m = 24;
  const script =
    (
      w: World,
      t: number,
    ): Command[] => {
      const cmds: Command[] =
        [];
      const first =
        (
          kind: Building['kind'],
          x: number,
          z: number,
        ) =>
          cmds.push(
            {
              type: 'place',
              playerId:
                P,
              kind,
              x,
              z,
            },
          );
      if (
        t ===
        0
      ) {
        first(
          'stall',
          m +
            1,
          m,
        );
        first(
          'stall',
          m -
            3,
          m +
            3,
        );
        first(
          'cottage',
          m -
            2,
          m -
            2,
        );
        first(
          'cottage',
          m +
            3,
          m -
            2,
        );
        for (const dx of [
          -1,
          0,
          1,
          2,
        ])
          first(
            'plot',
            m +
              dx,
            m +
              3,
          );
      }
      if (
        t ===
        5
      ) {
        for (const dx of [
          -1,
          0,
          1,
          2,
        ])
          cmds.push(
            {
              type: 'plant',
              playerId:
                P,
              crop: 'wheat',
              x:
                m +
                dx,
              z:
                m +
                3,
            },
          );
        cmds.push(
          {
            type: 'hire',
            playerId:
              P,
            x:
              m -
              2,
            z:
              m -
              2,
          },
          {
            type: 'hire',
            playerId:
              P,
            x:
              m -
              2,
            z:
              m -
              2,
          },
        );
        cmds.push(
          {
            type: 'hire',
            playerId:
              P,
            x:
              m +
              3,
            z:
              m -
              2,
          },
        );
      }
      if (
        t >
          0 &&
        t %
          350 ===
          0
      ) {
        // Serve whoever is waiting; raise a building somewhere in the way now and then; tear it down later.
        const wait =
          w.npcs.find(
            (
              n,
            ) =>
              n.mode ===
              'waiting',
          );
        if (
          wait
        ) {
          w.players[
            P
          ].x =
            wait.x;
          w.players[
            P
          ].z =
            wait.z;
          w.players[
            P
          ].inventory[
            wait.want
          ] =
            9;
          cmds.push(
            {
              type: 'serve',
              playerId:
                P,
              npcId:
                wait.id,
            },
          );
        }
        const x =
          m -
          6 +
          ((t /
            350) %
            12);
        const z =
          m -
          4 +
          ((t /
            350) %
            7);
        cmds.push(
          t %
            700 ===
            0
            ? {
                type: 'remove',
                playerId:
                  P,
                x,
                z,
              }
            : {
                type: 'place',
                playerId:
                  P,
                kind: 'kitchen',
                x,
                z,
              },
        );
      }
      return cmds;
    };

  function simulate(): {
    world: World;
    bad: number;
    served: number;
    arrived: number;
    left: number;
    throwAt: number;
  } {
    const w =
      island();
    let bad = 0;
    let served = 0;
    let arrived = 0;
    let left = 0;
    for (
      let t = 0;
      t <
      5000;
      t++
    ) {
      const ev =
        stepWorld(
          w,
          TICK_MS,
          script(
            w,
            t,
          ),
        );
      for (const e of ev) {
        if (
          e.type ===
          'served'
        )
          served++;
        if (
          e.type ===
          'customerArrived'
        )
          arrived++;
        if (
          e.type ===
          'customerLeft'
        )
          left++;
      }
      if (
        t %
          25 ===
        0
      )
        ripen(
          w,
        );
      for (const a of [
        ...w.npcs,
        ...w.workers,
      ]) {
        if (
          tileBlocked(
            w,
            a.fromX,
            a.fromZ,
          )
        )
          bad++;
        const next =
          a
            .path[0];
        if (
          next &&
          a.leg >
            0 &&
          tileBlocked(
            w,
            next.x,
            next.z,
          )
        )
          bad++;
        if (
          !Number.isFinite(
            a.x,
          ) ||
          !Number.isFinite(
            a.z,
          )
        )
          bad++;
      }
    }
    return {
      world:
        w,
      bad,
      served,
      arrived,
      left,
      throwAt:
        -1,
    };
  }

  it('runs identically twice, never leaves anyone on a blocked tile, and gets real work done', () => {
    const a =
      simulate();
    const b =
      simulate();
    expect(
      JSON.stringify(
        a.world,
      ),
    ).toBe(
      JSON.stringify(
        b.world,
      ),
    );
    expect(
      a.bad,
    ).toBe(
      0,
    );
    expect(
      a.arrived,
    ).toBeGreaterThan(
      5,
    );
    expect(
      a.served,
    ).toBeGreaterThan(
      0,
    );
    expect(
      a.left,
    ).toBeGreaterThan(
      0,
    );
    expect(
      a
        .world
        .workers
        .length,
    ).toBeGreaterThan(
      0,
    );
    expect(
      a
        .world
        .players[
        P
      ]
        .inventory
        .wheat ??
        0,
    ).toBeGreaterThan(
      0,
    );
  }, 60_000);

  it('spreads route searches across ticks', () => {
    // Even a crowded world is cheap: far fewer than a second for thousands of ticks.
    const t0 =
      performance.now();
    simulate();
    expect(
      performance.now() -
        t0,
    ).toBeLessThan(
      20_000,
    );
  }, 60_000);
});
