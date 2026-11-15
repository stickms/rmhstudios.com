/**
 * The balance simulator: scripted players run against the real police inside the real `stepWorld`, and every run
 * comes back as a plain log. It is shared by `scripts/hearthworks/balance.ts` (the report) and by the regression
 * tests that pin the tuning (`balance.test.ts`), so the number a test pins is the number the report prints.
 *
 * Everything is deterministic: the world's own generator drives the sim, and the policies draw from their own seeded
 * generator, so the same (policy, seed) always replays the same run.
 */

import {
  ITEMS,
  OFFICERS,
  WEAPONS,
  WEAPON_IDS,
  type ItemId,
  type OfficerKind,
  type WeaponId,
} from '../../content';
import {
  findPath,
  newMover,
  startPath,
  stepMover,
  stepTicks,
  type Mover,
} from '../../nav';
import {
  ARREST_REACH,
  TICK_MS,
  WANTED_HEAT,
  createWorld,
  hustleHeat,
  placeOfficer,
  sightLine,
  stepWorld,
  type Command,
  type Officer,
  type PlayerState,
  type World,
  type WorldEvent,
} from '..';
import { nextRandom } from '../rng';
import { arena } from './arena';

export const TICKS_PER_SECOND =
  1000 /
  TICK_MS;
/** The player's run speed in tiles per second (avatar/controller.ts RUN_SPEED), as a mover pace. */
export const RUN_TILES_PER_S = 3.0;
export const WALK_TILES_PER_S = 1.6;

export const secs =
  (
    ticks: number,
  ) =>
    ticks /
    TICKS_PER_SECOND;

/** A small seeded generator for policy choices (kept apart from the world's own). */
export function makeRng(
  seed: number,
): () => number {
  let s =
    seed >>>
    0;
  return () => {
    const r =
      nextRandom(
        s,
      );
    s =
      r.state;
    return r.value;
  };
}

// ---------------------------------------------------------------------------------------------------------------
// A player who can walk: a nav mover paced like the avatar.

export class Walker {
  readonly m: Mover;
  private acc = 0;
  constructor(
    x: number,
    z: number,
    public speed = RUN_TILES_PER_S,
  ) {
    this.m =
      newMover(
        x,
        z,
      );
  }
  get busy() {
    return (
      this
        .m
        .path
        .length >
      0
    );
  }
  goTo(
    w: World,
    x: number,
    z: number,
    stopWithin = 0,
  ): boolean {
    return startPath(
      w,
      this
        .m,
      {
        x,
        z,
      },
      {
        stopWithin,
        maxExpansions: 3000,
      },
    );
  }
  halt() {
    this.m.path =
      [];
    this.m.goalX =
      null;
    this.m.goalZ =
      null;
    this.m.leg = 0;
  }
  sync(
    x: number,
    z: number,
  ) {
    this.m.x =
      x;
    this.m.z =
      z;
    this.m.fromX =
      Math.round(
        x,
      );
    this.m.fromZ =
      Math.round(
        z,
      );
    this.halt();
  }
  /** Advance one tick of movement at the walker's pace. */
  step(
    w: World,
  ) {
    // A tile is TICKS_PER_TILE sub-steps and a second is as many ticks, so `speed` tiles/s is `speed` sub-steps a tick.
    this.acc +=
      this.speed;
    const subs =
      Math.floor(
        this
          .acc,
      );
    this.acc -=
      subs;
    for (
      let i = 0;
      i <
      subs;
      i++
    )
      stepMover(
        w,
        this
          .m,
      );
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Logs.

export interface RunLog {
  policy: string;
  seed: number;
  ticks: number;
  moneyStart: number;
  moneyEnd: number;
  /** Tick of the first hustle, or null. */
  firstCrime:
    | number
    | null;
  /** Ticks after the first crime at which heat first reached 20/40/60/80/100. */
  heatAt: Record<
    number,
    | number
    | null
  >;
  /** Ticks after heat first reached WANTED_HEAT until the first officer appeared. */
  firstResponse:
    | number
    | null;
  /** Ticks after the first officer appeared until one, formed up, was within reach of the player with his gun. */
  firstContact:
    | number
    | null;
  spawned: number;
  killed: number;
  left: number;
  arrests: number;
  downs: number;
  /** Ticks from first crime to the first arrest or knock-out. */
  firstCapture:
    | number
    | null;
  fines: number;
  confiscatedValue: number;
  shotsFired: number;
  shotsHit: number;
  damageTaken: number;
  hpMin: number;
  peakHeat: number;
  /** Ticks from the last crime until heat reached 0 (null if it never did, or no crime). */
  heatClearTicks:
    | number
    | null;
  /** Ticks from the last crime until the last officer was gone. */
  lawGoneTicks:
    | number
    | null;
  killsByWeapon: Partial<
    Record<
      WeaponId,
      number
    >
  >;
  shotsByWeapon: Partial<
    Record<
      WeaponId,
      number
    >
  >;
  stuckOfficers: number;
  /** What each stuck officer was doing, for the report and for debugging. */
  stuckNotes: string[];
  maxOfficers: number;
  /** Money earned by hustling. */
  hustleIncome: number;
  /** Highest customer wait-stuck counter seen (customers pathing). */
  npcStuckMax: number;
  customersSeen: number;
  customersServed: number;
  customersTimedOut: number;
}

function blankLog(
  policy: string,
  seed: number,
  w: World,
  id: string,
): RunLog {
  return {
    policy,
    seed,
    ticks: 0,
    moneyStart:
      w
        .players[
        id
      ]
        .money,
    moneyEnd: 0,
    firstCrime:
      null,
    heatAt:
      {
        20: null,
        40: null,
        60: null,
        80: null,
        100: null,
      },
    firstResponse:
      null,
    firstContact:
      null,
    spawned: 0,
    killed: 0,
    left: 0,
    arrests: 0,
    downs: 0,
    firstCapture:
      null,
    fines: 0,
    confiscatedValue: 0,
    shotsFired: 0,
    shotsHit: 0,
    damageTaken: 0,
    hpMin: 100,
    peakHeat: 0,
    heatClearTicks:
      null,
    lawGoneTicks:
      null,
    killsByWeapon:
      {},
    shotsByWeapon:
      {},
    stuckOfficers: 0,
    stuckNotes:
      [],
    maxOfficers: 0,
    hustleIncome: 0,
    npcStuckMax: 0,
    customersSeen: 0,
    customersServed: 0,
    customersTimedOut: 0,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// The player's view for a policy.

export interface Ctx {
  w: World;
  p: PlayerState;
  id: string;
  rand: () => number;
  walker: Walker;
  cmds: Command[];
  /** Ticks since the run began. */
  t: number;
  /** Events of the previous tick. */
  last: readonly WorldEvent[];
  log: RunLog;
}

export type Policy =
  (
    c: Ctx,
  ) => void;

export const hunting =
  (
    w: World,
    id: string,
  ): Officer[] =>
    w.officers.filter(
      (
        o,
      ) =>
        o.mode ===
          'hunt' &&
        o.target ===
          id,
    );

const dist =
  (
    ax: number,
    az: number,
    bx: number,
    bz: number,
  ) =>
    Math.hypot(
      ax -
        bx,
      az -
        bz,
    );

export function nearestOfficer(
  w: World,
  x: number,
  z: number,
  needSight = false,
): Officer | null {
  let best: Officer | null =
    null;
  let bd =
    Infinity;
  for (const o of w.officers) {
    const d =
      dist(
        x,
        z,
        o
          .mover
          .x,
        o
          .mover
          .z,
      );
    if (
      d <
        bd &&
      (!needSight ||
        sightLine(
          w,
          x,
          z,
          o
            .mover
            .x,
          o
            .mover
            .z,
        )
          .clear)
    ) {
      best =
        o;
      bd =
        d;
    }
  }
  return best;
}

/** Officers walk this fast, in tiles per second (police.ts PACE sub-steps of 1/20 tile every 20 Hz tick). */
const OFFICER_TILES_PER_S = 2;

/**
 * Run away from the law. Candidate goals are scored by how safe the route is: for every few steps along it, how much
 * further the nearest officer is from that tile than he can walk by the time the player gets there. The best margin
 * wins; ties go to the goal farthest from the law. A player on foot at 3 tiles/s against 2 is only caught by running
 * into a dead end or toward the law, and this is what keeps the harness from doing either.
 */
export function flee(
  c: Ctx,
  replanEvery = 12,
): void {
  const {
    w,
    p,
    walker,
  } =
    c;
  if (
    c.t %
      replanEvery !==
      0 &&
    walker.busy
  )
    return;
  const here =
    {
      x: Math.round(
        p.x,
      ),
      z: Math.round(
        p.z,
      ),
    };
  const subPerTick =
    walker.speed;
  /** How far ahead of the law the player stays along a route (tiles; negative = caught on the way). */
  const marginOf =
    (
      steps: readonly {
        x: number;
        z: number;
        kind:
          | 'walk'
          | 'jump'
          | 'fall';
      }[],
    ) => {
      let margin =
        Infinity;
      let cum = 0;
      let px =
        here.x;
      let pz =
        here.z;
      steps.forEach(
        (
          st,
          i,
        ) => {
          cum +=
            stepTicks(
              st.kind,
              st.x -
                px,
              st.z -
                pz,
            );
          px =
            st.x;
          pz =
            st.z;
          if (
            i %
              2 !==
              0 &&
            i !==
              steps.length -
                1
          )
            return;
          const tTicks =
            cum /
            subPerTick;
          for (const o of w.officers) {
            const reach =
              (OFFICER_TILES_PER_S *
                tTicks) /
              TICKS_PER_SECOND;
            margin =
              Math.min(
                margin,
                dist(
                  st.x,
                  st.z,
                  o
                    .mover
                    .x,
                  o
                    .mover
                    .z,
                ) -
                  reach,
              );
          }
        },
      );
      return margin;
    };
  // Keep going where we were going while it is still safe (a runner who changes his mind every second gets caught).
  if (
    walker.busy &&
    marginOf(
      walker
        .m
        .path,
    ) >=
      1.5
  )
    return;
  let best: {
    x: number;
    z: number;
    score: number;
  } | null =
    null;
  for (
    let k = 0;
    k <
    14;
    k++
  ) {
    const ang =
      c.rand() *
      Math.PI *
      2;
    const r =
      5 +
      c.rand() *
        Math.max(
          6,
          w.size *
            0.4,
        );
    const x =
      Math.round(
        here.x +
          Math.cos(
            ang,
          ) *
            r,
      );
    const z =
      Math.round(
        here.z +
          Math.sin(
            ang,
          ) *
            r,
      );
    if (
      x <
        1 ||
      z <
        1 ||
      x >=
        w.size -
          1 ||
      z >=
        w.size -
          1
    )
      continue;
    const route =
      findPath(
        w,
        here,
        {
          x,
          z,
        },
        {
          maxExpansions: 1500,
        },
      );
    if (
      !route
    )
      continue;
    const margin =
      marginOf(
        route.steps,
      );
    let end =
      Infinity;
    for (const o of w.officers)
      end =
        Math.min(
          end,
          dist(
            x,
            z,
            o
              .mover
              .x,
            o
              .mover
              .z,
          ),
        );
    const score =
      Math.min(
        margin,
        40,
      ) *
        10 +
      Math.min(
        end,
        40,
      ) +
      Math.min(
        route
          .steps
          .length,
        30,
      ) *
        0.5;
    if (
      !best ||
      score >
        best.score
    )
      best =
        {
          x,
          z,
          score,
        };
  }
  if (
    best
  )
    walker.goTo(
      w,
      best.x,
      best.z,
    );
}

// ---------------------------------------------------------------------------------------------------------------
// The runner.

export interface RunOptions {
  seed: number;
  ticks: number;
  /** Real island by seed (default), or a flat arena. */
  flat?: boolean;
  size?: number;
  setup?: (
    w: World,
    p: PlayerState,
  ) => void;
  walkSpeed?: number;
  /** Stop as soon as this returns true. */
  until?: (
    w: World,
    p: PlayerState,
    log: RunLog,
  ) => boolean;
}

export function newScene(
  seed: number,
  flat: boolean,
  size: number,
  id = 'p1',
) {
  const w =
    flat
      ? arena(
          size,
          seed,
        )
      : createWorld(
          seed,
          size,
        );
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
  return {
    w,
    p: w
      .players[
      id
    ],
    id,
  };
}

export function run(
  name: string,
  policy: Policy,
  opt: RunOptions,
): {
  log: RunLog;
  w: World;
} {
  const {
    w,
    p,
    id,
  } =
    newScene(
      opt.seed,
      !!opt.flat,
      opt.size ??
        48,
    );
  opt.setup?.(
    w,
    p,
  );
  const log =
    blankLog(
      name,
      opt.seed,
      w,
      id,
    );
  const rand =
    makeRng(
      opt.seed *
        7919 +
        13,
    );
  const walker =
    new Walker(
      p.x,
      p.z,
      opt.walkSpeed ??
        RUN_TILES_PER_S,
    );
  const watch =
    new Map<
      number,
      {
        x: number;
        z: number;
        since: number;
      }
    >();
  const flagged =
    new Set<number>();
  const npcBorn =
    new Map<
      number,
      number
    >();
  let last: WorldEvent[] =
    [];
  let spawnTick:
    | number
    | null =
    null;
  let wantedTick:
    | number
    | null =
    null;
  let lastCrime:
    | number
    | null =
    null;
  for (
    let t = 0;
    t <
    opt.ticks;
    t++
  ) {
    if (
      Math.abs(
        walker
          .m
          .x -
          p.x,
      ) >
        1.2 ||
      Math.abs(
        walker
          .m
          .z -
          p.z,
      ) >
        1.2
    )
      walker.sync(
        p.x,
        p.z,
      );
    const cmds: Command[] =
      [];
    policy(
      {
        w,
        p,
        id,
        rand,
        walker,
        cmds,
        t,
        last,
        log,
      },
    );
    const before =
      {
        x: p.x,
        z: p.z,
      };
    walker.step(
      w,
    );
    if (
      walker
        .m
        .x !==
        before.x ||
      walker
        .m
        .z !==
        before.z
    ) {
      cmds.push(
        {
          type: 'move',
          playerId:
            id,
          x: walker
            .m
            .x,
          z: walker
            .m
            .z,
        },
      );
    }
    const equipped =
      p
        .arms
        .equipped;
    const ev =
      stepWorld(
        w,
        TICK_MS,
        cmds,
      );
    last =
      ev;
    log.ticks =
      t +
      1;
    for (const e of ev) {
      switch (
        e.type
      ) {
        case 'hustled':
          log.firstCrime ??=
            t;
          lastCrime =
            t;
          log.hustleIncome +=
            e.earned;
          break;
        case 'officerSpawned':
          log.spawned++;
          spawnTick ??=
            t;
          break;
        case 'officerDown':
          log.killed++;
          if (
            equipped
          )
            log.killsByWeapon[
              equipped
            ] =
              (log
                .killsByWeapon[
                equipped
              ] ??
                0) +
              1;
          break;
        case 'officerLeft':
          log.left++;
          break;
        case 'arrested':
          log.arrests++;
          log.fines +=
            e.fine;
          log.confiscatedValue +=
            Object.entries(
              e.confiscated,
            ).reduce(
              (
                s,
                [
                  k,
                  n,
                ],
              ) =>
                s +
                ITEMS[
                  k as ItemId
                ]
                  .price *
                  (n ??
                    0),
              0,
            );
          if (
            log.firstCrime !==
            null
          )
            log.firstCapture ??=
              t -
              log.firstCrime;
          break;
        case 'respawned':
          log.fines +=
            e.fine;
          log.confiscatedValue +=
            Object.entries(
              e.confiscated,
            ).reduce(
              (
                s,
                [
                  k,
                  n,
                ],
              ) =>
                s +
                ITEMS[
                  k as ItemId
                ]
                  .price *
                  (n ??
                    0),
              0,
            );
          break;
        case 'downed':
          log.downs++;
          if (
            log.firstCrime !==
            null
          )
            log.firstCapture ??=
              t -
              log.firstCrime;
          break;
        case 'playerHit':
          log.damageTaken +=
            e.damage;
          break;
        case 'shot':
          if (
            e
              .by
              .kind ===
            'player'
          ) {
            log.shotsFired++;
            if (
              e.hit
            )
              log.shotsHit++;
            if (
              equipped
            )
              log.shotsByWeapon[
                equipped
              ] =
                (log
                  .shotsByWeapon[
                  equipped
                ] ??
                  0) +
                1;
          }
          break;
        case 'served':
          log.customersServed++;
          break;
        case 'customerArrived':
          log.customersSeen++;
          break;
        default:
      }
    }
    log.hpMin =
      Math.min(
        log.hpMin,
        p.hp,
      );
    log.peakHeat =
      Math.max(
        log.peakHeat,
        p.heat,
      );
    log.maxOfficers =
      Math.max(
        log.maxOfficers,
        w
          .officers
          .length,
      );
    if (
      log.firstCrime !==
      null
    ) {
      for (const lvl of [
        20,
        40,
        60,
        80,
        100,
      ]) {
        if (
          log
            .heatAt[
            lvl
          ] ===
            null &&
          p.heat >=
            lvl
        )
          log.heatAt[
            lvl
          ] =
            t -
            log.firstCrime;
      }
    }
    if (
      p.heat >=
      WANTED_HEAT
    )
      wantedTick ??=
        t;
    if (
      wantedTick !==
        null &&
      log.firstResponse ===
        null &&
      spawnTick !==
        null
    )
      log.firstResponse =
        spawnTick -
        wantedTick;
    if (
      spawnTick !==
        null &&
      log.firstContact ===
        null
    ) {
      // Contact: an officer who has formed up is within the reach of his own gun.
      for (const o of w.officers) {
        if (
          w.tick >=
            o.readyAt &&
          dist(
            p.x,
            p.z,
            o
              .mover
              .x,
            o
              .mover
              .z,
          ) <=
            WEAPONS[
              o
                .weapon
            ]
              .range *
              0.95
        ) {
          log.firstContact =
            t -
            spawnTick;
          break;
        }
      }
    }
    if (
      lastCrime !==
      null
    ) {
      if (
        log.heatClearTicks ===
          null &&
        p.heat ===
          0 &&
        t >
          lastCrime
      )
        log.heatClearTicks =
          t -
          lastCrime;
      if (
        log.lawGoneTicks ===
          null &&
        w
          .officers
          .length ===
          0 &&
        spawnTick !==
          null &&
        t >
          lastCrime
      )
        log.lawGoneTicks =
          t -
          lastCrime;
    }
    if (
      t %
        20 ===
      0
    )
      trackStuck(
        w,
        watch,
        flagged,
        t,
        log,
      );
    for (const n of w.npcs) {
      if (
        !npcBorn.has(
          n.id,
        )
      )
        npcBorn.set(
          n.id,
          t,
        );
      log.npcStuckMax =
        Math.max(
          log.npcStuckMax,
          n.stuck,
        );
    }
    if (
      opt.until?.(
        w,
        p,
        log,
      )
    )
      break;
  }
  log.stuckOfficers =
    flagged.size;
  log.moneyEnd =
    p.money;
  log.customersTimedOut =
    [
      ...npcBorn.keys(),
    ]
      .length -
    log.customersServed;
  return {
    log,
    w,
  };
}

/** An officer hunting that has stood still for 20 s with a target it can neither see nor reach is stuck. */
const STUCK_TICKS = 400;
function trackStuck(
  w: World,
  watch: Map<
    number,
    {
      x: number;
      z: number;
      since: number;
    }
  >,
  flagged: Set<number>,
  t: number,
  log: RunLog,
) {
  for (const o of w.officers) {
    const rec =
      watch.get(
        o.id,
      );
    const moved =
      !rec ||
      dist(
        rec.x,
        rec.z,
        o
          .mover
          .x,
        o
          .mover
          .z,
      ) >
        0.3;
    if (
      moved
    ) {
      watch.set(
        o.id,
        {
          x: o
            .mover
            .x,
          z: o
            .mover
            .z,
          since:
            t,
        },
      );
      continue;
    }
    if (
      t -
        rec.since <
      STUCK_TICKS
    )
      continue;
    const target =
      o.target
        ? w
            .players[
            o
              .target
          ]
        : undefined;
    if (
      o.mode ===
        'hunt' &&
      target
    ) {
      const d =
        dist(
          o
            .mover
            .x,
          o
            .mover
            .z,
          target.x,
          target.z,
        );
      const los =
        sightLine(
          w,
          o
            .mover
            .x,
          o
            .mover
            .z,
          target.x,
          target.z,
        ).clear;
      const engaged =
        d <=
          ARREST_REACH +
            0.5 ||
        (los &&
          d <=
            WEAPONS[
              o
                .weapon
            ]
              .range);
      if (
        !engaged &&
        !flagged.has(
          o.id,
        )
      ) {
        flagged.add(
          o.id,
        );
        log.stuckNotes.push(
          `t=${t} hunt ${o.kind} at ${Math.round(o.mover.x)},${Math.round(o.mover.z)} path=${o.mover.path.length} planFails=${o.planFails} d=${d.toFixed(1)} los=${los}`,
        );
      }
    } else if (
      o.mode ===
        'leave' &&
      !flagged.has(
        o.id,
      )
    ) {
      flagged.add(
        o.id,
      );
      log.stuckNotes.push(
        `t=${t} leave ${o.kind} at ${Math.round(o.mover.x)},${Math.round(o.mover.z)} gate=${o.gateX},${o.gateZ} path=${o.mover.path.length} since=${t - o.leaveSince}`,
      );
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Policies.

/** Best weapon a budget buys, leaving room for one spare magazine. */
export function bestAffordable(
  money: number,
): WeaponId | null {
  let best: WeaponId | null =
    null;
  for (const id of WEAPON_IDS) {
    const d =
      WEAPONS[
        id
      ];
    if (
      d.price +
        d.ammoPrice <=
        money &&
      (!best ||
        d.price >
          WEAPONS[
            best
          ]
            .price)
    )
      best =
        id;
  }
  return best;
}

/** Shoot the nearest officer in sight (the weapon decides the rest: fire rate, reload). */
export function fireAtLaw(
  c: Ctx,
  maxRange?: number,
): boolean {
  const {
    w,
    p,
  } =
    c;
  const g =
    p
      .arms
      .equipped;
  if (
    !g
  )
    return false;
  const def =
    WEAPONS[
      g
    ];
  const o =
    nearestOfficer(
      w,
      p.x,
      p.z,
      true,
    );
  if (
    !o
  )
    return false;
  const d =
    dist(
      p.x,
      p.z,
      o
        .mover
        .x,
      o
        .mover
        .z,
    );
  if (
    d >
    (maxRange ??
      def.range)
  )
    return false;
  c.cmds.push(
    {
      type: 'shoot',
      playerId:
        c.id,
      x: o
        .mover
        .x,
      z: o
        .mover
        .z,
    },
  );
  return true;
}

/** Where a sensible player wants to stand against a target: this fraction of the gun's reach. */
export const ENGAGE_RANGE = 0.6;

/** Walk toward the nearest officer until within `want` tiles of it (and stop there). */
export function closeIn(
  c: Ctx,
  want: number,
): void {
  const o =
    nearestOfficer(
      c.w,
      c
        .p
        .x,
      c
        .p
        .z,
    );
  if (
    !o
  )
    return;
  const d =
    dist(
      c
        .p
        .x,
      c
        .p
        .z,
      o
        .mover
        .x,
      o
        .mover
        .z,
    );
  if (
    d <=
    want
  ) {
    c.walker.halt();
    return;
  }
  if (
    c
      .walker
      .busy &&
    c.t %
      8 !==
      0
  )
    return;
  c.walker.goTo(
    c.w,
    o
      .mover
      .x,
    o
      .mover
      .z,
    Math.max(
      1,
      Math.floor(
        want,
      ),
    ),
  );
}

/** Buy a spare magazine whenever the reserve runs under one and there is cash (the armoury is a menu, not a shop). */
function restock(
  c: Ctx,
) {
  const g =
    c
      .p
      .arms
      .equipped;
  if (
    !g
  )
    return;
  const have =
    c
      .p
      .arms
      .guns[
      g
    ];
  const def =
    WEAPONS[
      g
    ];
  if (
    have &&
    have.reserve <
      def.magazine &&
    c
      .p
      .money >=
      def.ammoPrice
  )
    c.cmds.push(
      {
        type: 'buyWeapon',
        playerId:
          c.id,
        weapon:
          g,
      },
    );
}

export interface HustlerOptions {
  /** Sell this many units per deal. */
  batch: number;
  /** Only deal when heat is at or below this (Infinity = deal whenever there is stock). */
  dealBelow: number;
  /** Only deal when the deal would leave heat at or under this (a careful dealer's ceiling). */
  ceiling?: number;
  /** Run when this many officers are hunting. 0 = never run. */
  fleeWhen: number;
  item?: ItemId;
  /** Ticks between deals (a player clicks; default 2 s). */
  every?: number;
  /** Lie low (stop dealing, keep away) once wanted, until heat is under CALM_HEAT. */
  lieLow: boolean;
  /** Stop after this many deals (default: keep going while there is stock). */
  maxDeals?: number;
}

export const hustler =
  (
    o: HustlerOptions,
  ): Policy => {
    let deals = 0;
    let startAt =
      -1;
    return (
      c,
    ) => {
      // Begin at a random moment in the first sixteen seconds, so the police clock is not always in step with the player (checks come every 8 s).
      if (
        startAt <
        0
      )
        startAt =
          Math.floor(
            c.rand() *
              320,
          );
      const item =
        o.item ??
        'mystery-tonic';
      const stock =
        c
          .p
          .inventory[
          item
        ] ??
        0;
      const law =
        hunting(
          c.w,
          c.id,
        ).length;
      const wanted =
        c
          .p
          .heat >=
        WANTED_HEAT;
      if (
        law >=
          Math.max(
            1,
            o.fleeWhen,
          ) &&
        o.fleeWhen >
          0
      ) {
        flee(
          c,
        );
        return;
      }
      if (
        o.lieLow &&
        (wanted ||
          law >
            0)
      ) {
        if (
          law >
          0
        )
          flee(
            c,
          );
        return;
      }
      const batch =
        Math.min(
          stock,
          o.batch,
        );
      const afterDeal =
        c
          .p
          .heat +
        hustleHeat(
          item,
          batch,
        );
      if (
        stock >
          0 &&
        c
          .p
          .heat <=
          o.dealBelow &&
        afterDeal <=
          (o.ceiling ??
            Infinity) &&
        c.t >=
          startAt &&
        (c.t -
          startAt) %
          (o.every ??
            40) ===
          0 &&
        deals <
          (o.maxDeals ??
            Infinity)
      ) {
        deals++;
        c.cmds.push(
          {
            type: 'hustle',
            playerId:
              c.id,
            item,
            qty: batch,
          },
        );
      }
    };
  };

export interface GunmanOptions {
  /** Force this weapon (granted free) instead of buying the best affordable. */
  weapon?: WeaponId;
  /** Spare magazines to carry. */
  fullAmmo?: boolean;
  /** Run when health falls under this and the law is still about. */
  retreatHp?: number;
  /** Walk away from the law to keep this distance (kiting), 0 = stand. */
  kite?: number;
  /** Keep dealing contraband (4 every 4 s) to bring the police on. */
  deal?: boolean;
  /** Close in on the law to the gun's best range instead of standing. */
  engage?: boolean;
}

export const gunman =
  (
    o: GunmanOptions,
  ): Policy => {
    let armed = false;
    return (
      c,
    ) => {
      const {
        p,
      } =
        c;
      if (
        !armed
      ) {
        const stock =
          p
            .inventory[
            'mystery-tonic'
          ] ??
          0;
        const wanted =
          p.heat >=
            WANTED_HEAT ||
          hunting(
            c.w,
            c.id,
          )
            .length >
            0;
        // Deal a little at a time; when the law turns up (or the stock is gone), spend what you have on the best gun.
        if (
          !wanted &&
          stock >
            0 &&
          !o.weapon
        ) {
          if (
            c.t %
              40 ===
            0
          )
            c.cmds.push(
              {
                type: 'hustle',
                playerId:
                  c.id,
                item: 'mystery-tonic',
                qty: Math.min(
                  stock,
                  4,
                ),
              },
            );
          return;
        }
        const target =
          o.weapon ??
          bestAffordable(
            p.money,
          );
        if (
          !target
        )
          return;
        c.cmds.push(
          {
            type: 'buyWeapon',
            playerId:
              c.id,
            weapon:
              target,
          },
          {
            type: 'equip',
            playerId:
              c.id,
            weapon:
              target,
          },
        );
        armed = true;
        return;
      }
      if (
        !p
          .arms
          .equipped
      )
        return;
      if (
        o.fullAmmo
      ) {
        const gun =
          p
            .arms
            .guns[
            p
              .arms
              .equipped
          ];
        const def =
          WEAPONS[
            p
              .arms
              .equipped
          ];
        if (
          gun
        )
          gun.reserve =
            def.maxMags *
            def.magazine;
      }
      const law =
        c
          .w
          .officers
          .length;
      if (
        o.retreatHp &&
        p.hp <
          o.retreatHp &&
        law >
          0
      ) {
        flee(
          c,
        );
        return;
      }
      const near =
        nearestOfficer(
          c.w,
          p.x,
          p.z,
        );
      if (
        o.kite &&
        near &&
        dist(
          p.x,
          p.z,
          near
            .mover
            .x,
          near
            .mover
            .z,
        ) <
          o.kite
      )
        flee(
          c,
          6,
        );
      else if (
        o.engage
      )
        closeIn(
          c,
          WEAPONS[
            p
              .arms
              .equipped
          ]
            .range *
            ENGAGE_RANGE,
        );
      if (
        !fireAtLaw(
          c,
        )
      ) {
        const g =
          p
            .arms
            .guns[
            p
              .arms
              .equipped
          ];
        if (
          g &&
          g.mag <
            WEAPONS[
              p
                .arms
                .equipped
            ]
              .magazine &&
          law ===
            0
        )
          c.cmds.push(
            {
              type: 'reload',
              playerId:
                c.id,
            },
          );
      }
      restock(
        c,
      );
      // Keep the stock moving while the police are about to be a problem: sell whatever is left at a steady pace.
      const left =
        p
          .inventory[
          'mystery-tonic'
        ] ??
        0;
      if (
        o.deal &&
        left >
          0 &&
        c.t %
          80 ===
          0
      )
        c.cmds.push(
          {
            type: 'hustle',
            playerId:
              c.id,
            item: 'mystery-tonic',
            qty: Math.min(
              left,
              4,
            ),
          },
        );
    };
  };

/** Never breaks the law: plants, harvests and sells at a stall. */
export const farmer =
  (): Policy => {
    let stage = 0;
    let plots: {
      x: number;
      z: number;
    }[] =
      [];
    return (
      c,
    ) => {
      const {
        w,
        p,
      } =
        c;
      if (
        stage ===
        0
      ) {
        const mid =
          Math.floor(
            w.size /
              2,
          );
        const spots: {
          x: number;
          z: number;
        }[] =
          [];
        for (
          let dz =
            -2;
          dz <=
            2 &&
          spots.length <
            7;
          dz++
        )
          for (
            let dx = 1;
            dx <=
              6 &&
            spots.length <
              7;
            dx++
          )
            spots.push(
              {
                x:
                  mid +
                  dx,
                z:
                  mid +
                  dz +
                  3,
              },
            );
        const cmds: Command[] =
          [
            {
              type: 'place',
              playerId:
                c.id,
              kind: 'stall',
              x:
                mid -
                3,
              z: mid,
            },
          ];
        for (const s of spots)
          cmds.push(
            {
              type: 'place',
              playerId:
                c.id,
              kind: 'plot',
              x: s.x,
              z: s.z,
            },
          );
        c.cmds.push(
          ...cmds,
        );
        plots =
          spots;
        stage = 1;
        return;
      }
      if (
        c.t %
          10 !==
        0
      )
        return;
      for (const s of plots) {
        if (
          !w.buildings.some(
            (
              b,
            ) =>
              b.x ===
                s.x &&
              b.z ===
                s.z &&
              b.kind ===
                'plot',
          )
        )
          continue;
        const crop =
          w.crops.find(
            (
              q,
            ) =>
              q.x ===
                s.x &&
              q.z ===
                s.z,
          );
        if (
          !crop
        )
          c.cmds.push(
            {
              type: 'plant',
              playerId:
                c.id,
              crop: 'tomato',
              x: s.x,
              z: s.z,
            },
          );
        else
          c.cmds.push(
            {
              type: 'harvest',
              playerId:
                c.id,
              x: s.x,
              z: s.z,
            },
          );
      }
      const t =
        p
          .inventory
          .tomato ??
        0;
      if (
        t >
        0
      )
        c.cmds.push(
          {
            type: 'sell',
            playerId:
              c.id,
            item: 'tomato',
            qty: t,
          },
        );
    };
  };

// ---------------------------------------------------------------------------------------------------------------
// Fixed scenes: duels and squads.

export interface Duel {
  shots: number;
  ticks: number;
  hits: number;
  killed: boolean;
}

/**
 * A player with `weapon` and full magazines shoots a parked officer (it never fires or moves) `range` tiles away on
 * flat ground, until it dies: how many shots and ticks the kill takes, reloads included.
 */
export function duelKill(
  weapon: WeaponId,
  kind: OfficerKind,
  range: number,
  seed: number,
  maxTicks = 1200,
): Duel {
  const w =
    arena(
      40,
      seed,
    );
  stepWorld(
    w,
    0,
    [
      {
        type: 'join',
        playerId:
          'p1',
      },
    ],
  );
  const p =
    w
      .players
      .p1;
  p.x = 8;
  p.z = 20;
  p.money = 1e6;
  stepWorld(
    w,
    0,
    [
      {
        type: 'buyWeapon',
        playerId:
          'p1',
        weapon,
      },
      {
        type: 'equip',
        playerId:
          'p1',
        weapon,
      },
    ],
  );
  const o =
    placeOfficer(
      w,
      kind,
      8 +
        range,
      20,
      p,
      [],
    )!;
  o.readyAt = 1e9;
  o.nextPlanTick = 1e9;
  o.mover.path =
    [];
  o.mover.goalX =
    null;
  o.mover.goalZ =
    null;
  w.tick += 10;
  const out: Duel =
    {
      shots: 0,
      ticks: 0,
      hits: 0,
      killed: false,
    };
  for (
    let i = 0;
    i <
      maxTicks &&
    !out.killed;
    i++
  ) {
    p.heat = 39;
    const ev =
      stepWorld(
        w,
        TICK_MS,
        [
          {
            type: 'shoot',
            playerId:
              'p1',
            x:
              8 +
              range,
            z: 20,
          },
        ],
      );
    out.ticks++;
    for (const e of ev) {
      if (
        e.type ===
          'shot' &&
        e
          .by
          .kind ===
          'player'
      ) {
        out.shots++;
        if (
          e.hit
        )
          out.hits++;
      }
      if (
        e.type ===
        'officerDown'
      )
        out.killed = true;
    }
    // Keep the dummy planted, the heat on (cold heat sends it home) and the player stocked: this measures the gun.
    o.mover.x =
      8 +
      range;
    o.mover.z = 20;
    const g =
      p
        .arms
        .guns[
        weapon
      ];
    if (
      g &&
      g.reserve <
        2 *
          WEAPONS[
            weapon
          ]
            .magazine
    )
      g.reserve =
        2 *
        WEAPONS[
          weapon
        ]
          .magazine;
  }
  return out;
}

export interface Fight {
  won: boolean;
  /** Ticks until the last officer died, or the player fell. */
  ticks: number;
  hpLeft: number;
  killed: number;
  shots: number;
  hits: number;
  ammoLeft: number;
  downed: boolean;
}

export interface FightOptions {
  weapon: WeaponId;
  kind: OfficerKind;
  count: number;
  seed: number;
  /** Distance at which the squad starts. */
  start?: number;
  fullAmmo?: boolean;
  /** Back away from the nearest officer to keep this distance (0 = stand and shoot). */
  kite?: number;
  /** Stand still and shoot instead of closing to the gun's best range (the default closes in). */
  stand?: boolean;
  maxTicks?: number;
}

/**
 * A pitched fight on flat ground: `count` officers start `start` tiles away, hunting an armed player who stands (or
 * kites) and shoots the nearest. The player is not allowed to be arrested: armed, the police shoot.
 */
export function fight(
  o: FightOptions,
): Fight {
  const w =
    arena(
      48,
      o.seed,
    );
  stepWorld(
    w,
    0,
    [
      {
        type: 'join',
        playerId:
          'p1',
      },
    ],
  );
  const p =
    w
      .players
      .p1;
  p.x = 24;
  p.z = 24;
  p.money = 1e6;
  stepWorld(
    w,
    0,
    [
      {
        type: 'buyWeapon',
        playerId:
          'p1',
        weapon:
          o.weapon,
      },
      {
        type: 'equip',
        playerId:
          'p1',
        weapon:
          o.weapon,
      },
    ],
  );
  const def =
    WEAPONS[
      o
        .weapon
    ];
  if (
    o.fullAmmo
  )
    p.arms.guns[
      o.weapon
    ]!.reserve =
      def.maxMags *
      def.magazine;
  w.tick += 10;
  const start =
    o.start ??
    14;
  const rand =
    makeRng(
      o.seed +
        99,
    );
  for (
    let i = 0;
    i <
    o.count;
    i++
  ) {
    const ang =
      (i /
        o.count) *
        1.2 -
      0.6 +
      (rand() -
        0.5) *
        0.3;
    const gx =
      Math.round(
        24 +
          Math.cos(
            ang,
          ) *
            start,
      );
    const gz =
      Math.round(
        24 +
          Math.sin(
            ang,
          ) *
            start,
      );
    placeOfficer(
      w,
      o.kind,
      gx,
      gz,
      p,
      [],
    );
  }
  const walker =
    new Walker(
      24,
      24,
      RUN_TILES_PER_S,
    );
  const out: Fight =
    {
      won: false,
      ticks: 0,
      hpLeft: 0,
      killed: 0,
      shots: 0,
      hits: 0,
      ammoLeft: 0,
      downed: false,
    };
  const total =
    w
      .officers
      .length;
  const log =
    blankLog(
      'fight',
      o.seed,
      w,
      'p1',
    );
  const maxTicks =
    o.maxTicks ??
    1200;
  for (
    let t = 0;
    t <
    maxTicks;
    t++
  ) {
    p.heat = 39; // hunted but not re-supplied: the squad is what was placed, killing one does not call another
    const cmds: Command[] =
      [];
    const c: Ctx =
      {
        w,
        p,
        id: 'p1',
        rand,
        walker,
        cmds,
        t,
        last: [],
        log,
      };
    if (
      o.kite
    ) {
      const near =
        nearestOfficer(
          w,
          p.x,
          p.z,
        );
      if (
        near &&
        dist(
          p.x,
          p.z,
          near
            .mover
            .x,
          near
            .mover
            .z,
        ) <
          o.kite
      )
        flee(
          c,
          6,
        );
    }
    fireAtLaw(
      c,
    );
    if (
      !o.stand &&
      !o.kite
    )
      closeIn(
        c,
        def.range *
          ENGAGE_RANGE,
      );
    walker.step(
      w,
    );
    if (
      walker.busy
    )
      cmds.push(
        {
          type: 'move',
          playerId:
            'p1',
          x: walker
            .m
            .x,
          z: walker
            .m
            .z,
        },
      );
    const ev =
      stepWorld(
        w,
        TICK_MS,
        cmds,
      );
    out.ticks =
      t +
      1;
    for (const e of ev) {
      if (
        e.type ===
          'shot' &&
        e
          .by
          .kind ===
          'player'
      ) {
        out.shots++;
        if (
          e.hit
        )
          out.hits++;
      }
      if (
        e.type ===
        'officerDown'
      )
        out.killed++;
      if (
        e.type ===
        'downed'
      )
        out.downed = true;
    }
    if (
      out.downed
    )
      break;
    if (
      w
        .officers
        .length ===
      0
    ) {
      out.won =
        out.killed ===
        total;
      break;
    }
  }
  out.hpLeft =
    p.hp;
  const g =
    p
      .arms
      .guns[
      o
        .weapon
    ];
  out.ammoLeft =
    g
      ? g.mag +
        g.reserve
      : 0;
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Statistics.

export interface Summary {
  n: number;
  mean: number;
  min: number;
  p10: number;
  p50: number;
  p90: number;
  max: number;
}

export function summarize(
  xs: readonly number[],
): Summary {
  const a =
    [
      ...xs,
    ].sort(
      (
        x,
        y,
      ) =>
        x -
        y,
    );
  const n =
    a.length;
  if (
    n ===
    0
  )
    return {
      n: 0,
      mean: NaN,
      min: NaN,
      p10: NaN,
      p50: NaN,
      p90: NaN,
      max: NaN,
    };
  const q =
    (
      f: number,
    ) =>
      a[
        Math.min(
          n -
            1,
          Math.floor(
            f *
              n,
          ),
        )
      ];
  return {
    n,
    mean:
      a.reduce(
        (
          s,
          v,
        ) =>
          s +
          v,
        0,
      ) /
      n,
    min: a[0],
    p10: q(
      0.1,
    ),
    p50: q(
      0.5,
    ),
    p90: q(
      0.9,
    ),
    max: a[
      n -
        1
    ],
  };
}

export const rate =
  (
    xs: readonly boolean[],
  ): number =>
    xs.length
      ? xs.filter(
          Boolean,
        )
          .length /
        xs.length
      : NaN;

export {
  OFFICERS,
  WEAPONS,
};
