// =============================================================================
// ALTAIR SOLO -- the replayable record of a single-player run
// =============================================================================
// A solo run is a pure function of
//   (server-issued seed, class + meta-upgrade loadout, the viewport size the tile window used,
//    movement input changes, level-up picks / rerolls / banishes)
// all indexed by the number of fixed 60 Hz sim steps taken so far. The browser records exactly
// those inputs while it plays; the server replays them through the SAME SoloRun and reads the
// numbers off the result. Nothing in a log is a result.
//
// Client-safe (no node: imports).
//
// Compact form: one flat integer array, ticks delta-encoded.
//   [dt, 0, mdx, mdy, keys]  movement input changed. mdx/mdy: mobile stick in hundredths (-100..100),
//                            keys: bit0 up, bit1 down, bit2 left, bit3 right (WASD / arrows)
//   [dt, 1, choice]          level-up pick (index into the offered choices)
//   [dt, 2]                  reroll
//   [dt, 3, index]           banish
//   [dt, 4, w, h]            the canvas size the terrain window follows changed
// `dt` is the number of sim steps since the previous event.
// =============================================================================

import {
  MAX_LOG_NUMBERS,
  MAX_RUN_STEPS,
} from '../verify/run-log';
import { HEAT_MAX } from '../data/heat';

export const SOLO_LOG_VERSION = 1;

export const SEV_INPUT = 0;
export const SEV_PICK = 1;
export const SEV_REROLL = 2;
export const SEV_BANISH = 3;
export const SEV_VIEWPORT = 4;

export const MIN_VIEWPORT = 200;
export const MAX_VIEWPORT = 6144;

/**
 * The stat keys a meta upgrade may feed the sim (computeEffectiveStats). `revival` is deliberately absent:
 * it is the loadout's own field. Anything else in `stats` is refused, so a log cannot smuggle in a bonus.
 */
export const META_STAT_KEYS =
  [
    'armor',
    'hpRegen',
    'maxHpPercent',
    'mightPercent',
    'moveSpeedPercent',
    'pickupRange',
    'growthPercent',
    'luckPercent',
    'pierce',
    'attackSpeedPercent',
  ] as const;

export interface SoloLoadout {
  rerolls: number;
  banishes: number;
  revival: number;
  extraChoice: boolean;
  catalystAffinity: number;
  greed: number;
  /**
   * Summed meta-upgrade stat bonuses (see META_STAT_KEYS). OPTIONAL and omitted when empty: a loadout
   * without it is the pre-fix shape, and replays exactly as it always did (no bonuses), so every
   * previously recorded log still verifies.
   */
  stats?: Record<
    string,
    number
  >;
  /**
   * Difficulty tier (features/altair/engine/data/heat.ts). OPTIONAL and omitted at Heat 0: a loadout without it is a
   * standard run, which replays exactly as it always did.
   */
  heat?: number;
}

export type SoloEnd =
  | 'dead'
  | 'victory'
  | 'quit';

export interface SoloLog {
  v: number;
  /** The sim version the run was played on (features/altair/engine/sim-version.ts). Absent on older logs = 1. */
  sim?: number;
  seed: number;
  classId: string;
  doubleTime: boolean;
  loadout: SoloLoadout;
  vw: number;
  vh: number;
  /** Total sim steps the run took. */
  steps: number;
  end: SoloEnd;
  ev: number[];
}

export const KEY_UP = 1;
export const KEY_DOWN = 2;
export const KEY_LEFT = 4;
export const KEY_RIGHT = 8;

/** Mobile stick component -> the integer the log stores (and the sim uses). */
export function quantiseStick(
  v: number,
): number {
  return Math.max(
    -100,
    Math.min(
      100,
      Math.round(
        v *
          100,
      ),
    ),
  );
}

export function clampViewport(
  n: number,
): number {
  return Math.max(
    MIN_VIEWPORT,
    Math.min(
      MAX_VIEWPORT,
      Math.round(
        n,
      ) ||
        MIN_VIEWPORT,
    ),
  );
}

export class SoloRecorder {
  readonly ev: number[] =
    [];
  overflow = false;
  private lastTick = 0;
  private lastInput =
    -1;
  private lastVw: number;
  private lastVh: number;

  constructor(
    vw: number,
    vh: number,
  ) {
    this.lastVw =
      vw;
    this.lastVh =
      vh;
  }

  private push(
    tick: number,
    ...rest: number[]
  ): void {
    if (
      this
        .overflow
    )
      return;
    if (
      this
        .ev
        .length +
        rest.length +
        1 >
      MAX_LOG_NUMBERS
    ) {
      this.overflow = true;
      return;
    }
    this.ev.push(
      tick -
        this
          .lastTick,
      ...rest,
    );
    this.lastTick =
      tick;
  }

  /** A movement input; repeats are not logged. The implicit initial input is (0, 0, none). */
  input(
    tick: number,
    mdx: number,
    mdy: number,
    keys: number,
  ): void {
    const packed =
      ((mdx +
        100) *
        201 +
        (mdy +
          100)) *
        16 +
      keys;
    const prev =
      this
        .lastInput <
      0
        ? (100 *
            201 +
            100) *
          16
        : this
            .lastInput;
    if (
      packed ===
      prev
    )
      return;
    this.lastInput =
      packed;
    this.push(
      tick,
      SEV_INPUT,
      mdx,
      mdy,
      keys,
    );
  }
  pick(
    tick: number,
    choice: number,
  ): void {
    this.push(
      tick,
      SEV_PICK,
      choice,
    );
  }
  reroll(
    tick: number,
  ): void {
    this.push(
      tick,
      SEV_REROLL,
    );
  }
  banish(
    tick: number,
    index: number,
  ): void {
    this.push(
      tick,
      SEV_BANISH,
      index,
    );
  }
  viewport(
    tick: number,
    w: number,
    h: number,
  ): void {
    if (
      w ===
        this
          .lastVw &&
      h ===
        this
          .lastVh
    )
      return;
    this.lastVw =
      w;
    this.lastVh =
      h;
    this.push(
      tick,
      SEV_VIEWPORT,
      w,
      h,
    );
  }
}

// ---- Decoding / validation (server side, and tests) ----------------------------

export type SoloEvent =
  | {
      tick: number;
      type: typeof SEV_INPUT;
      mdx: number;
      mdy: number;
      keys: number;
    }
  | {
      tick: number;
      type: typeof SEV_PICK;
      choice: number;
    }
  | {
      tick: number;
      type: typeof SEV_REROLL;
    }
  | {
      tick: number;
      type: typeof SEV_BANISH;
      index: number;
    }
  | {
      tick: number;
      type: typeof SEV_VIEWPORT;
      w: number;
      h: number;
    };

export type SoloLogCheck =
  | {
      ok: true;
      events: SoloEvent[];
    }
  | {
      ok: false;
      reason: string;
    };

const isInt =
  (
    v: unknown,
  ): v is number =>
    typeof v ===
      'number' &&
    Number.isInteger(
      v,
    );

function checkStats(
  s: unknown,
): boolean {
  if (
    !s ||
    typeof s !==
      'object' ||
    Array.isArray(
      s,
    )
  )
    return false;
  const allowed =
    new Set<string>(
      META_STAT_KEYS,
    );
  return Object.entries(
    s as Record<
      string,
      unknown
    >,
  ).every(
    ([
      k,
      v,
    ]) =>
      allowed.has(
        k,
      ) &&
      typeof v ===
        'number' &&
      Number.isFinite(
        v,
      ) &&
      v >=
        0 &&
      v <=
        1000,
  );
}

export function checkLoadout(
  l: unknown,
): l is SoloLoadout {
  if (
    !l ||
    typeof l !==
      'object'
  )
    return false;
  const o =
    l as Record<
      string,
      unknown
    >;
  const lvl =
    (
      v: unknown,
      max: number,
    ) =>
      isInt(
        v,
      ) &&
      v >=
        0 &&
      v <=
        max;
  return (
    lvl(
      o.rerolls,
      20,
    ) &&
    lvl(
      o.banishes,
      20,
    ) &&
    lvl(
      o.revival,
      10,
    ) &&
    typeof o.extraChoice ===
      'boolean' &&
    lvl(
      o.catalystAffinity,
      20,
    ) &&
    lvl(
      o.greed,
      20,
    ) &&
    (o.stats ===
      undefined ||
      checkStats(
        o.stats,
      )) &&
    (o.heat ===
      undefined ||
      lvl(
        o.heat,
        HEAT_MAX,
      ))
  );
}

/** Structural validation of an UNTRUSTED log: shape, bounds, monotonic ticks. Never throws. */
export function checkSoloLog(
  raw: unknown,
): SoloLogCheck {
  if (
    !raw ||
    typeof raw !==
      'object'
  )
    return {
      ok: false,
      reason:
        'log is not an object',
    };
  const log =
    raw as Record<
      string,
      unknown
    >;
  if (
    log.v !==
    SOLO_LOG_VERSION
  )
    return {
      ok: false,
      reason:
        'unsupported log version',
    };
  if (
    log.sim !==
      undefined &&
    (!isInt(
      log.sim,
    ) ||
      log.sim <
        1 ||
      log.sim >
        1_000_000)
  )
    return {
      ok: false,
      reason:
        'bad sim version',
    };
  if (
    !isInt(
      log.seed,
    ) ||
    log.seed <
      0 ||
    log.seed >=
      2 **
        32
  )
    return {
      ok: false,
      reason:
        'bad seed',
    };
  if (
    typeof log.classId !==
      'string' ||
    log
      .classId
      .length ===
      0 ||
    log
      .classId
      .length >
      64
  ) {
    return {
      ok: false,
      reason:
        'bad class',
    };
  }
  if (
    typeof log.doubleTime !==
    'boolean'
  )
    return {
      ok: false,
      reason:
        'bad doubleTime',
    };
  if (
    !checkLoadout(
      log.loadout,
    )
  )
    return {
      ok: false,
      reason:
        'bad loadout',
    };
  if (
    !isInt(
      log.vw,
    ) ||
    !isInt(
      log.vh,
    ) ||
    log.vw <
      MIN_VIEWPORT ||
    log.vw >
      MAX_VIEWPORT ||
    log.vh <
      MIN_VIEWPORT ||
    log.vh >
      MAX_VIEWPORT
  ) {
    return {
      ok: false,
      reason:
        'bad viewport',
    };
  }
  if (
    !isInt(
      log.steps,
    ) ||
    log.steps <
      1 ||
    log.steps >
      MAX_RUN_STEPS
  ) {
    return {
      ok: false,
      reason:
        'run length out of bounds',
    };
  }
  if (
    log.end !==
      'dead' &&
    log.end !==
      'victory' &&
    log.end !==
      'quit'
  )
    return {
      ok: false,
      reason:
        'bad end',
    };
  const ev =
    log.ev;
  if (
    !Array.isArray(
      ev,
    ) ||
    ev.length >
      MAX_LOG_NUMBERS
  )
    return {
      ok: false,
      reason:
        'event log too long',
    };

  const events: SoloEvent[] =
    [];
  let tick = 0;
  let i = 0;
  while (
    i <
    ev.length
  ) {
    const dt =
      ev[
        i
      ];
    const type =
      ev[
        i +
          1
      ];
    if (
      !isInt(
        dt,
      ) ||
      dt <
        0 ||
      !isInt(
        type,
      )
    )
      return {
        ok: false,
        reason:
          'malformed event',
      };
    tick +=
      dt;
    if (
      tick >
      (log.steps as number)
    )
      return {
        ok: false,
        reason:
          'event after the end of the run',
      };
    switch (
      type
    ) {
      case SEV_INPUT: {
        const [
          mdx,
          mdy,
          keys,
        ] =
          [
            ev[
              i +
                2
            ],
            ev[
              i +
                3
            ],
            ev[
              i +
                4
            ],
          ];
        if (
          !isInt(
            mdx,
          ) ||
          !isInt(
            mdy,
          ) ||
          !isInt(
            keys,
          ) ||
          keys <
            0 ||
          keys >
            15
        )
          return {
            ok: false,
            reason:
              'bad input event',
          };
        if (
          Math.abs(
            mdx,
          ) >
            100 ||
          Math.abs(
            mdy,
          ) >
            100 ||
          mdx *
            mdx +
            mdy *
              mdy >
            10_200
        ) {
          return {
            ok: false,
            reason:
              'input outside the unit circle',
          };
        }
        events.push(
          {
            tick,
            type,
            mdx,
            mdy,
            keys,
          },
        );
        i += 5;
        break;
      }
      case SEV_PICK: {
        const choice =
          ev[
            i +
              2
          ];
        if (
          !isInt(
            choice,
          ) ||
          choice <
            0 ||
          choice >
            7
        )
          return {
            ok: false,
            reason:
              'bad pick event',
          };
        events.push(
          {
            tick,
            type,
            choice,
          },
        );
        i += 3;
        break;
      }
      case SEV_REROLL:
        events.push(
          {
            tick,
            type,
          },
        );
        i += 2;
        break;
      case SEV_BANISH: {
        const index =
          ev[
            i +
              2
          ];
        if (
          !isInt(
            index,
          ) ||
          index <
            0 ||
          index >
            7
        )
          return {
            ok: false,
            reason:
              'bad banish event',
          };
        events.push(
          {
            tick,
            type,
            index,
          },
        );
        i += 3;
        break;
      }
      case SEV_VIEWPORT: {
        const [
          w,
          h,
        ] =
          [
            ev[
              i +
                2
            ],
            ev[
              i +
                3
            ],
          ];
        if (
          !isInt(
            w,
          ) ||
          !isInt(
            h,
          ) ||
          w <
            MIN_VIEWPORT ||
          w >
            MAX_VIEWPORT ||
          h <
            MIN_VIEWPORT ||
          h >
            MAX_VIEWPORT
        ) {
          return {
            ok: false,
            reason:
              'bad viewport event',
          };
        }
        events.push(
          {
            tick,
            type,
            w,
            h,
          },
        );
        i += 4;
        break;
      }
      default:
        return {
          ok: false,
          reason:
            'unknown event type',
        };
    }
  }
  if (
    i !==
    ev.length
  )
    return {
      ok: false,
      reason:
        'truncated event',
    };
  return {
    ok: true,
    events,
  };
}
