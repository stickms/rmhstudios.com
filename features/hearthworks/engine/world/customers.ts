/**
 * Customers are people, not spawn effects. One walks in from a shore "gate" to a free tile beside a stall (only if
 * the stall can actually be reached), waits there with growing impatience, and when served or fed up walks back to
 * the gate and is gone. Their route is found by the nav module, so they climb ledges, hop down drops, skirt trees
 * and water, and re-plan if someone builds in their way.
 */

import {
  ITEMS,
  ITEM_IDS,
  type ItemId,
} from '../content';
import {
  findPath,
  nearestWalkable,
  newMover,
} from '../nav';
import { SKIN_IDS } from '../skins';
import {
  assignRoute,
  faceToward,
  routeTo,
  staticBlockers,
  STUCK_GIVE_UP_TICKS,
  walk,
  type Budget,
} from './agents';
import {
  FLAG_CONNECTED,
  cellLevel,
  cellZone,
} from './city-cells';
import { tileDistance } from './helpers';
import { draw } from './rng';
import type {
  Building,
  Npc,
  World,
  WorldEvent,
} from './types';

export const CUSTOMER_EVERY_TICKS = 200;
export const CUSTOMER_PATIENCE_TICKS = 1200;
/** A gate is at least this many tiles from the stall, so a customer visibly walks in. */
export const MIN_GATE_DISTANCE = 8;
/** Residents live nearby, so they only need to be this far from the stall to be seen walking over. */
const MIN_HOME_DISTANCE = 3;
const RESIDENT_EVERY_MIN = 100;
const RESIDENT_CAP_BONUS = 4;
/** A town of this many people sends half its customers from home. */
const RESIDENT_HALF_SHARE = 12;
/** Gates tried (and route searches spent) per arrival. */
const SPAWN_ATTEMPTS = 3;
/** Longest route (in tile-costs) a customer will set out on. */
const MAX_ROUTE_COST = 90;
const CUSTOMER_LOOKS =
  [
    'citizen',
    'worker',
    'rebel',
  ] as const;

/** Customers prefer what is worth cooking: pick an item weighted toward dearer goods. */
function pickWant(
  w: World,
): ItemId {
  const items =
    ITEM_IDS.filter(
      (
        i,
      ) =>
        ITEMS[
          i
        ]
          .price >=
          5 &&
        !ITEMS[
          i
        ]
          .contraband,
    );
  const total =
    items.reduce(
      (
        s,
        i,
      ) =>
        s +
        ITEMS[
          i
        ]
          .price,
      0,
    );
  let roll =
    draw(
      w,
    ) *
    total;
  for (const i of items) {
    roll -=
      ITEMS[
        i
      ]
        .price;
    if (
      roll <=
      0
    )
      return i;
  }
  return items[
    items.length -
      1
  ];
}

/** A random open tile on the shore, somewhere out toward the rim of the map. */
function pickGate(
  w: World,
  stall: Building,
): {
  x: number;
  z: number;
} | null {
  const n =
    w.size;
  const side =
    Math.floor(
      draw(
        w,
      ) *
        4,
    );
  const t =
    1 +
    Math.floor(
      draw(
        w,
      ) *
        (n -
          2),
    );
  const [
    px,
    pz,
  ] =
    side ===
    0
      ? [
          t,
          1,
        ]
      : side ===
          1
        ? [
            n -
              2,
            t,
          ]
        : side ===
            2
          ? [
              t,
              n -
                2,
            ]
          : [
              1,
              t,
            ];
  const gate =
    nearestWalkable(
      w,
      px,
      pz,
      undefined,
      10,
    );
  if (
    !gate ||
    tileDistance(
      gate.x,
      gate.z,
      stall.x,
      stall.z,
    ) <
      MIN_GATE_DISTANCE
  )
    return null;
  return gate;
}

/** Residents of the town who can walk to a stall: the home lots (and cottages) on the road network, with the tile in front of each. */
function homeGates(
  w: World,
): {
  x: number;
  z: number;
}[] {
  if (
    w
      .city
      .population <=
    0
  )
    return [];
  const out: {
    x: number;
    z: number;
  }[] =
    [];
  const n =
    w.size;
  for (
    let i = 0;
    i <
    w
      .city
      .cells
      .length;
    i++
  ) {
    const cell =
      w
        .city
        .cells[
        i
      ];
    if (
      cellZone(
        cell,
      ) !==
        'homes' ||
      cellLevel(
        cell,
      ) ===
        0 ||
      (w
        .city
        .flags[
        i
      ] &
        FLAG_CONNECTED) ===
        0
    )
      continue;
    out.push(
      {
        x:
          i %
          n,
        z: Math.floor(
          i /
            n,
        ),
      },
    );
  }
  return out;
}

/** A road-side tile beside a random home lot — where a resident sets out from — or null if they are all walled in. */
function pickHomeGate(
  w: World,
  homes: {
    x: number;
    z: number;
  }[],
  stall: Building,
): {
  x: number;
  z: number;
} | null {
  const home =
    homes[
      Math.floor(
        draw(
          w,
        ) *
          homes.length,
      )
    ];
  const gate =
    nearestWalkable(
      w,
      home.x,
      home.z,
      undefined,
      2,
    );
  if (
    !gate ||
    tileDistance(
      gate.x,
      gate.z,
      stall.x,
      stall.z,
    ) <
      MIN_HOME_DISTANCE
  )
    return null;
  return gate;
}

/** More residents, more footfall: a bigger town keeps more customers about, and sends them more often. */
export function customerRhythm(
  w: World,
): {
  every: number;
  bonus: number;
} {
  const pop =
    w
      .city
      .population;
  return {
    every:
      Math.max(
        RESIDENT_EVERY_MIN,
        CUSTOMER_EVERY_TICKS -
          pop *
            3,
      ),
    bonus:
      Math.min(
        RESIDENT_CAP_BONUS,
        Math.floor(
          pop /
            8,
        ),
      ),
  };
}

/**
 * Send a customer home: they walk back to the gate they came from. Returns false if there is no way back, in which
 * case they give up on the spot (a `customerLeft` is announced) and the caller must drop them from the world.
 */
export function sendHome(
  w: World,
  n: Npc,
  ev: WorldEvent[],
  budget: Budget,
): boolean {
  if (
    n.mode !==
    'leaving'
  )
    ev.push(
      {
        type: 'customerLeaving',
        npcId:
          n.id,
      },
    );
  n.mode =
    'leaving';
  n.stuck = 0;
  n.path =
    [];
  n.leg = 0;
  n.goalX =
    null;
  n.goalZ =
    null;
  const gate =
    {
      x: n.gateX,
      z: n.gateZ,
    };
  if (
    routeTo(
      w,
      n,
      gate,
      {},
      budget,
    ) ||
    routeTo(
      w,
      n,
      gate,
      {
        stopWithin: 2,
      },
      budget,
    )
  )
    return true;
  ev.push(
    {
      type: 'customerLeft',
      npcId:
        n.id,
    },
  );
  return false;
}

/** One tick of one customer. Returns false when they are gone. */
function tickCustomer(
  w: World,
  n: Npc,
  ev: WorldEvent[],
  budget: Budget,
): boolean {
  if (
    n.mode !==
    'leaving'
  ) {
    // The stall is gone: nothing left to wait for.
    if (
      !w.buildings.some(
        (
          b,
        ) =>
          b.id ===
            n.stallId &&
          b.kind ===
            'stall',
      )
    )
      return sendHome(
        w,
        n,
        ev,
        budget,
      );
    if (
      n.mode ===
      'waiting'
    ) {
      n.patience -= 1;
      if (
        n.patience <=
        0
      )
        return sendHome(
          w,
          n,
          ev,
          budget,
        );
    }
  }
  const status =
    walk(
      w,
      n,
      budget,
    );
  const stuckForGood =
    status ===
      'yield' &&
    n.stuck >=
      STUCK_GIVE_UP_TICKS;
  if (
    n.mode ===
    'leaving'
  ) {
    if (
      status ===
        'arrived' ||
      status ===
        'idle' ||
      status ===
        'blocked' ||
      stuckForGood
    ) {
      ev.push(
        {
          type: 'customerLeft',
          npcId:
            n.id,
        },
      );
      return false;
    }
    return true;
  }
  if (
    n.mode ===
    'arriving'
  ) {
    if (
      status ===
        'arrived' ||
      status ===
        'idle'
    ) {
      n.mode =
        'waiting';
      n.serviceX =
        Math.round(
          n.x,
        );
      n.serviceZ =
        Math.round(
          n.z,
        );
      const stall =
        w.buildings.find(
          (
            b,
          ) =>
            b.id ===
            n.stallId,
        );
      if (
        stall
      )
        faceToward(
          n,
          stall.x,
          stall.z,
        );
    } else if (
      status ===
        'blocked' ||
      stuckForGood
    ) {
      // No way through to the stall any more: try the way back.
      return sendHome(
        w,
        n,
        ev,
        budget,
      );
    }
  }
  return true;
}

/** The whole customer side of one tick: those already here, then maybe someone new through the gate. */
export function tickCustomers(
  w: World,
  ev: WorldEvent[],
  budget: Budget,
): void {
  const gone =
    new Set<number>();
  for (const n of [
    ...w.npcs,
  ])
    if (
      !tickCustomer(
        w,
        n,
        ev,
        budget,
      )
    )
      gone.add(
        n.id,
      );
  if (
    gone.size >
    0
  )
    w.npcs =
      w.npcs.filter(
        (
          n,
        ) =>
          !gone.has(
            n.id,
          ),
      );

  const rhythm =
    customerRhythm(
      w,
    );
  if (
    w.tick %
      rhythm.every !==
    0
  )
    return;
  const stalls =
    w.buildings.filter(
      (
        b,
      ) =>
        b.kind ===
        'stall',
    );
  const active =
    w.npcs.filter(
      (
        n,
      ) =>
        n.mode !==
        'leaving',
    ).length;
  if (
    stalls.length ===
      0 ||
    active >=
      Math.min(
        4,
        1 +
          stalls.length *
            2,
      ) +
        rhythm.bonus
  )
    return;
  const stall =
    stalls[
      Math.floor(
        draw(
          w,
        ) *
          stalls.length,
      )
    ];
  // Once the town has people, most customers are residents walking over from their own front doors.
  const homes =
    homeGates(
      w,
    );
  const resident =
    homes.length >
      0 &&
    draw(
      w,
    ) <
      w
        .city
        .population /
        (w
          .city
          .population +
          RESIDENT_HALF_SHARE);
  for (
    let attempt = 0;
    attempt <
      SPAWN_ATTEMPTS &&
    budget.searches >
      0;
    attempt++
  ) {
    const gate =
      resident
        ? pickHomeGate(
            w,
            homes,
            stall,
          )
        : pickGate(
            w,
            stall,
          );
    if (
      !gate
    )
      continue;
    budget.searches -= 1;
    // Reach any free tile beside the stall; others' standing places and destinations are not offered.
    const route =
      findPath(
        w,
        gate,
        stall,
        {
          stopWithin: 1,
          blocked:
            staticBlockers(
              w,
              null,
            ),
        },
      );
    const end =
      route
        ?.steps[
        route
          .steps
          .length -
          1
      ];
    if (
      !route ||
      !end ||
      route.cost >
        MAX_ROUTE_COST
    )
      continue;
    const npc: Npc =
      {
        ...newMover(
          gate.x,
          gate.z,
        ),
        id: w.nextId++,
        kind: 'customer',
        want: pickWant(
          w,
        ),
        qty:
          1 +
          Math.floor(
            draw(
              w,
            ) *
              3,
          ),
        patience:
          CUSTOMER_PATIENCE_TICKS,
        look:
          CUSTOMER_LOOKS[
            Math.floor(
              draw(
                w,
              ) *
                CUSTOMER_LOOKS.length,
            )
          ] ??
          SKIN_IDS[0],
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
    faceToward(
      npc,
      end.x,
      end.z,
    );
    w.npcs.push(
      npc,
    );
    ev.push(
      {
        type: 'customerArrived',
        npc: {
          ...npc,
          path: [
            ...npc.path,
          ],
        },
      },
    );
    return;
  }
}
