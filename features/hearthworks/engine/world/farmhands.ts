/**
 * Farmhands live at a cottage and keep its fields. A job is the nearest ripe crop (by the length of the walk, not the
 * crow's flight), else an empty plot to replant. They walk to it along a route that may climb ledges and hop down
 * drops, spend a little time working, and only then does the crop come in or the seed go down — checked again on
 * arrival, because a player may have got there first. Then the next job, or the walk home to rest.
 */

import { CROPS } from '../content';
import {
  findPath,
  newMover,
} from '../nav';
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
  cropRipe,
  tileDistance,
} from './helpers';
import type {
  Crop,
  PlayerState,
  World,
  Worker,
  WorkerTask,
} from './types';

/** How far from their cottage a farmhand will go for work (tiles), and how often they look when idle (ticks). */
export const WORK_RADIUS = 5;
export const WORK_INTERVAL_TICKS = 100;
/** Ticks a farmhand spends at the crop or plot before it is done. */
export const WORK_TICKS = 20;
/** How long a job that could not be reached is left alone. */
const AVOID_TICKS = 600;
/** Route searches one job hunt may spend. */
const MAX_JOB_SEARCHES = 5;
const JOB_SEARCH_EXPANSIONS = 1500;

/** Where a freshly hired farmhand stands: at the cottage door. */
export function newFarmhand(
  id: number,
  ownerId: string,
  home: {
    x: number;
    z: number;
  },
  door: {
    x: number;
    z: number;
  },
  tick: number,
  wageEvery: number,
): Worker {
  return {
    ...newMover(
      door.x,
      door.z,
    ),
    id,
    ownerId,
    role: 'farmer',
    homeX:
      home.x,
    homeZ:
      home.z,
    lastCrop:
      null,
    nextActTick:
      tick +
      40,
    nextWageTick:
      tick +
      wageEvery,
    state:
      'home',
    task: null,
    workLeft: 0,
    stuck: 0,
    avoid:
      [],
  };
}

const octile =
  (
    dx: number,
    dz: number,
  ) => {
    const a =
      Math.abs(
        dx,
      );
    const b =
      Math.abs(
        dz,
      );
    return (
      Math.max(
        a,
        b,
      ) +
      (Math.SQRT2 -
        1) *
        Math.min(
          a,
          b,
        )
    );
  };

const sameSpot =
  (
    t: WorkerTask | null,
    kind: WorkerTask['kind'],
    x: number,
    z: number,
  ) =>
    t !==
      null &&
    t.kind ===
      kind &&
    t.x ===
      x &&
    t.z ===
      z;

const cropAt =
  (
    w: World,
    x: number,
    z: number,
  ):
    | Crop
    | undefined =>
    w.crops.find(
      (
        c,
      ) =>
        c.x ===
          x &&
        c.z ===
          z,
    );

function taskStillValid(
  w: World,
  k: Worker,
  owner: PlayerState,
  t: WorkerTask,
): boolean {
  if (
    tileDistance(
      k.x,
      k.z,
      t.x,
      t.z,
    ) >
    1
  )
    return false;
  if (
    t.kind ===
    'harvest'
  ) {
    const c =
      cropAt(
        w,
        t.x,
        t.z,
      );
    return (
      c !==
        undefined &&
      cropRipe(
        w,
        c,
      )
    );
  }
  if (
    !k.lastCrop
  )
    return false;
  const plot =
    w.buildings.find(
      (
        b,
      ) =>
        b.kind ===
          'plot' &&
        b.x ===
          t.x &&
        b.z ===
          t.z,
    );
  return (
    plot !==
      undefined &&
    !cropAt(
      w,
      t.x,
      t.z,
    ) &&
    owner.money >=
      CROPS[
        k
          .lastCrop
      ]
        .seedPrice
  );
}

function avoidSpot(
  w: World,
  k: Worker,
  x: number,
  z: number,
) {
  if (
    k.avoid.some(
      (
        a,
      ) =>
        a.x ===
          x &&
        a.z ===
          z,
    )
  )
    return;
  k.avoid.push(
    {
      x,
      z,
      until:
        w.tick +
        AVOID_TICKS,
    },
  );
  if (
    k
      .avoid
      .length >
    12
  )
    k.avoid.shift();
}

/** The cheapest reachable spot among `spots` (nearest first by the crow's flight), skipping unreachable ones. */
function nearestByRoute(
  w: World,
  k: Worker,
  spots: readonly {
    x: number;
    z: number;
  }[],
  budget: Budget,
): {
  spot: {
    x: number;
    z: number;
  };
  route: NonNullable<
    ReturnType<
      typeof findPath
    >
  >;
} | null {
  const here =
    {
      x: Math.round(
        k.x,
      ),
      z: Math.round(
        k.z,
      ),
    };
  const blocked =
    staticBlockers(
      w,
      k,
    );
  const ordered =
    spots
      .map(
        (
          s,
        ) => ({
          s,
          d: octile(
            s.x -
              here.x,
            s.z -
              here.z,
          ),
        }),
      )
      .sort(
        (
          a,
          b,
        ) =>
          a.d -
            b.d ||
          a
            .s
            .z -
            b
              .s
              .z ||
          a
            .s
            .x -
            b
              .s
              .x,
      );
  let best: {
    spot: {
      x: number;
      z: number;
    };
    route: NonNullable<
      ReturnType<
        typeof findPath
      >
    >;
  } | null =
    null;
  let searches = 0;
  for (const {
    s,
    d,
  } of ordered) {
    // A route is never shorter than the straight line, so nothing further out can beat what we have.
    if (
      best &&
      d >=
        best
          .route
          .cost
    )
      break;
    if (
      searches >=
        MAX_JOB_SEARCHES ||
      budget.searches <=
        0
    )
      break;
    searches += 1;
    budget.searches -= 1;
    const route =
      findPath(
        w,
        here,
        s,
        {
          stopWithin: 1,
          blocked,
          maxExpansions:
            JOB_SEARCH_EXPANSIONS,
        },
      );
    if (
      !route
    ) {
      avoidSpot(
        w,
        k,
        s.x,
        s.z,
      );
      continue;
    }
    if (
      !best ||
      route.cost <
        best
          .route
          .cost
    )
      best =
        {
          spot: s,
          route,
        };
  }
  return best;
}

function startWorking(
  k: Worker,
  task: WorkerTask,
) {
  k.state =
    'working';
  k.workLeft =
    WORK_TICKS;
  k.path =
    [];
  k.leg = 0;
  k.goalX =
    null;
  k.goalZ =
    null;
  k.stuck = 0;
  faceToward(
    k,
    task.x,
    task.z,
  );
}

/** Head for the cottage (or just rest if already beside it). */
function goHome(
  w: World,
  k: Worker,
  budget: Budget,
) {
  k.task =
    null;
  if (
    tileDistance(
      k.x,
      k.z,
      k.homeX,
      k.homeZ,
    ) <=
      1 &&
    k
      .path
      .length ===
      0
  ) {
    k.state =
      'home';
    return;
  }
  if (
    budget.searches >
      0 &&
    routeTo(
      w,
      k,
      {
        x: k.homeX,
        z: k.homeZ,
      },
      {
        stopWithin: 1,
        blocked:
          staticBlockers(
            w,
            k,
          ),
      },
      budget,
    )
  ) {
    k.state =
      'toHome';
    return;
  }
  // No way home right now: stand and try again later.
  k.path =
    [];
  k.leg = 0;
  k.goalX =
    null;
  k.goalZ =
    null;
  k.state =
    'home';
}

/** Look for work and set off for it. Returns true if a job was taken. */
function seekWork(
  w: World,
  k: Worker,
  owner: PlayerState,
  budget: Budget,
): boolean {
  if (
    budget.searches <=
    0
  )
    return false; // ask again next tick
  k.avoid =
    k.avoid.filter(
      (
        a,
      ) =>
        a.until >
        w.tick,
    );
  const others =
    w.workers.filter(
      (
        o,
      ) =>
        o !==
        k,
    );
  const free =
    (
      kind: WorkerTask['kind'],
      s: {
        x: number;
        z: number;
      },
    ) =>
      tileDistance(
        s.x,
        s.z,
        k.homeX,
        k.homeZ,
      ) <=
        WORK_RADIUS &&
      !k.avoid.some(
        (
          a,
        ) =>
          a.x ===
            s.x &&
          a.z ===
            s.z,
      ) &&
      !others.some(
        (
          o,
        ) =>
          sameSpot(
            o.task,
            kind,
            s.x,
            s.z,
          ),
      );

  let kind: WorkerTask['kind'] =
    'harvest';
  let found =
    nearestByRoute(
      w,
      k,
      w.crops.filter(
        (
          c,
        ) =>
          cropRipe(
            w,
            c,
          ) &&
          free(
            'harvest',
            c,
          ),
      ),
      budget,
    );
  if (
    !found &&
    k.lastCrop &&
    owner.money >=
      CROPS[
        k
          .lastCrop
      ]
        .seedPrice
  ) {
    kind =
      'plant';
    found =
      nearestByRoute(
        w,
        k,
        w.buildings.filter(
          (
            b,
          ) =>
            b.kind ===
              'plot' &&
            !cropAt(
              w,
              b.x,
              b.z,
            ) &&
            free(
              'plant',
              b,
            ),
        ),
        budget,
      );
  }
  if (
    !found
  ) {
    k.nextActTick =
      budget.searches <=
      0
        ? w.tick +
          1
        : w.tick +
          WORK_INTERVAL_TICKS;
    if (
      k.state !==
      'toHome'
    )
      goHome(
        w,
        k,
        budget,
      );
    return false;
  }
  const task: WorkerTask =
    {
      kind,
      x: found
        .spot
        .x,
      z: found
        .spot
        .z,
    };
  k.task =
    task;
  assignRoute(
    k,
    {
      x: Math.round(
        k.x,
      ),
      z: Math.round(
        k.z,
      ),
    },
    found.route,
    found.spot,
    1,
  );
  if (
    found
      .route
      .steps
      .length ===
    0
  )
    startWorking(
      k,
      task,
    );
  else
    k.state =
      'toWork';
  return true;
}

function finishJob(
  w: World,
  k: Worker,
  owner: PlayerState,
  budget: Budget,
) {
  const t =
    k.task;
  k.task =
    null;
  if (
    t &&
    taskStillValid(
      w,
      k,
      owner,
      t,
    )
  ) {
    if (
      t.kind ===
      'harvest'
    ) {
      const c =
        cropAt(
          w,
          t.x,
          t.z,
        )!;
      const def =
        CROPS[
          c
            .kind
        ];
      owner.inventory[
        def.yieldItem
      ] =
        (owner
          .inventory[
          def
            .yieldItem
        ] ??
          0) +
        def.yieldQty;
      w.crops =
        w.crops.filter(
          (
            o,
          ) =>
            o.id !==
            c.id,
        );
      k.lastCrop =
        c.kind;
    } else if (
      k.lastCrop
    ) {
      owner.money -=
        CROPS[
          k.lastCrop
        ].seedPrice;
      w.crops.push(
        {
          id: w.nextId++,
          kind: k.lastCrop,
          x: t.x,
          z: t.z,
          plantedTick:
            w.tick,
        },
      );
    }
  }
  // On to the next job straight away, or rest.
  k.state =
    'home';
  k.nextActTick =
    w.tick;
  seekWork(
    w,
    k,
    owner,
    budget,
  );
}

/** One tick of one farmhand (wages are the caller's business). */
export function tickFarmhand(
  w: World,
  k: Worker,
  owner: PlayerState,
  budget: Budget,
): void {
  switch (
    k.state
  ) {
    case 'home': {
      if (
        k
          .path
          .length >
        0
      )
        k.state =
          'toHome';
      else if (
        w.tick >=
        k.nextActTick
      )
        seekWork(
          w,
          k,
          owner,
          budget,
        );
      return;
    }
    case 'toWork': {
      const status =
        walk(
          w,
          k,
          budget,
        );
      const task =
        k.task;
      if (
        !task
      )
        return goHome(
          w,
          k,
          budget,
        );
      if (
        status ===
          'arrived' ||
        status ===
          'idle'
      ) {
        if (
          taskStillValid(
            w,
            k,
            owner,
            task,
          )
        )
          startWorking(
            k,
            task,
          );
        else {
          // Someone beat them to it.
          k.task =
            null;
          k.state =
            'home';
          k.nextActTick =
            w.tick;
          seekWork(
            w,
            k,
            owner,
            budget,
          );
        }
      } else if (
        status ===
          'blocked' ||
        (status ===
          'yield' &&
          k.stuck >=
            STUCK_GIVE_UP_TICKS)
      ) {
        avoidSpot(
          w,
          k,
          task.x,
          task.z,
        );
        k.stuck = 0;
        k.path =
          [];
        k.leg = 0;
        k.state =
          'home';
        k.nextActTick =
          w.tick +
          1;
        k.task =
          null;
      }
      return;
    }
    case 'working': {
      k.workLeft -= 1;
      if (
        k.workLeft <=
        0
      )
        finishJob(
          w,
          k,
          owner,
          budget,
        );
      return;
    }
    case 'toHome': {
      if (
        k.leg ===
          0 &&
        w.tick >=
          k.nextActTick &&
        seekWork(
          w,
          k,
          owner,
          budget,
        )
      )
        return;
      const status =
        walk(
          w,
          k,
          budget,
        );
      if (
        status ===
          'arrived' ||
        status ===
          'idle'
      ) {
        k.state =
          'home';
        k.stuck = 0;
        const home =
          {
            x: k.homeX,
            z: k.homeZ,
          };
        faceToward(
          k,
          home.x,
          home.z,
        );
      } else if (
        status ===
          'blocked' ||
        (status ===
          'yield' &&
          k.stuck >=
            STUCK_GIVE_UP_TICKS)
      ) {
        k.path =
          [];
        k.leg = 0;
        k.goalX =
          null;
        k.goalZ =
          null;
        k.stuck = 0;
        k.state =
          'home';
        k.nextActTick =
          w.tick +
          WORK_INTERVAL_TICKS;
      }
    }
  }
}
