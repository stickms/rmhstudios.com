// ============================================================
// The menu duel — a scripted sparring loop for two fighters.
//
// Pure: `duelAt(t)` returns what each seat should look like at time `t` seconds,
// in exactly the fields the real fighter renderers read (state, punch,
// actionProgress, hitFlash, x, yaw, alive), so the menu can drive the same
// SkeletalFighter / SourceFighter the match uses. No sim, no randomness: the same
// t is always the same frame, the loop repeats every DUEL_PERIOD seconds.
// ============================================================
import type { PunchType } from '@/lib/kowloon-knockout/game/fighters/types';
import { clamp01 } from '@/lib/core/math';

export type DuelState =
  | 'idle'
  | 'walking'
  | 'punching'
  | 'blocking'
  | 'hit'
  | 'knockedOut';

export interface DuelFrame {
  x: number;
  /** Depth: the fighters circle each other a little, toward and away from the camera. */
  z: number;
  /** Sim yaw: 0 faces +X (the right), PI faces -X; it turns to face the opponent as they circle. */
  yaw: number;
  state: DuelState;
  punch: PunchType | null;
  actionProgress: number;
  hitFlash: number;
  alive: boolean;
}

type Reaction =
  | 'block'
  | 'hit'
  | 'ko';
interface Beat {
  attacker:
    | 0
    | 1;
  punch: PunchType;
  reaction: Reaction;
  length: number;
}

const BEAT = 1.5;
export const BEATS: readonly Beat[] =
  [
    {
      attacker: 0,
      punch:
        'jab',
      reaction:
        'block',
      length:
        BEAT,
    },
    {
      attacker: 0,
      punch:
        'cross',
      reaction:
        'hit',
      length:
        BEAT,
    },
    {
      attacker: 1,
      punch:
        'jab',
      reaction:
        'block',
      length:
        BEAT,
    },
    {
      attacker: 1,
      punch:
        'hook',
      reaction:
        'hit',
      length:
        BEAT,
    },
    {
      attacker: 0,
      punch:
        'uppercut',
      reaction:
        'hit',
      length:
        BEAT,
    },
    {
      attacker: 1,
      punch:
        'cross',
      reaction:
        'block',
      length:
        BEAT,
    },
    {
      attacker: 0,
      punch:
        'hook',
      reaction:
        'ko',
      length: 3.4,
    },
  ];
export const DUEL_PERIOD =
  BEATS.reduce(
    (
      s,
      b,
    ) =>
      s +
      b.length,
    0,
  );

/** Where each fighter stands at rest, and how far the attacker lunges in. */
export const HOME_X = 0.8;
const LUNGE = 0.28;
const WINDUP = 0.35;
const PUNCH_TIME = 0.55;
const HIT_AT =
  WINDUP +
  PUNCH_TIME *
    0.5;
const HIT_TIME = 0.5;
const KO_TIME = 1.0;
const FLASH_TIME = 0.25;

const smooth =
  (
    v: number,
  ) => {
    const c =
      clamp01(
        v,
      );
    return (
      c *
      c *
      (3 -
        2 *
          c)
    );
  };

function side(
  i:
    | 0
    | 1,
): {
  home: number;
  yaw: number;
  dir:
    | 1
    | -1;
} {
  return i ===
    0
    ? {
        home: -HOME_X,
        yaw: 0,
        dir: 1,
      }
    : {
        home: HOME_X,
        yaw: Math.PI,
        dir: -1,
      };
}

function beatFrames(
  beat: Beat,
  u: number,
): [
  DuelFrame,
  DuelFrame,
] {
  const frames =
    [
      0,
      1,
    ].map(
      (
        i,
      ): DuelFrame => ({
        x: side(
          i as
            | 0
            | 1,
        )
          .home,
        z: 0,
        yaw: side(
          i as
            | 0
            | 1,
        )
          .yaw,
        state:
          'idle',
        punch:
          null,
        actionProgress: 0,
        hitFlash: 0,
        alive: true,
      }),
    ) as [
      DuelFrame,
      DuelFrame,
    ];

  const a =
    frames[
      beat
        .attacker
    ];
  const d =
    frames[
      (1 -
        beat.attacker) as
        | 0
        | 1
    ];
  const sa =
    side(
      beat.attacker,
    );
  const sd =
    side(
      (1 -
        beat.attacker) as
        | 0
        | 1,
    );

  // Attacker: step in, throw, step back out.
  const stepIn =
    smooth(
      u /
        WINDUP,
    ) -
    smooth(
      (u -
        (WINDUP +
          PUNCH_TIME +
          0.15)) /
        0.35,
    );
  a.x =
    sa.home +
    sa.dir *
      LUNGE *
      stepIn;
  if (
    u <
    WINDUP
  )
    a.state =
      'walking';
  else if (
    u <
    WINDUP +
      PUNCH_TIME
  ) {
    a.state =
      'punching';
    a.punch =
      beat.punch;
    a.actionProgress =
      (u -
        WINDUP) /
      PUNCH_TIME;
  } else if (
    u <
    WINDUP +
      PUNCH_TIME +
      0.5
  )
    a.state =
      'walking';

  // Defender: guards, takes it, or goes down.
  const sinceHit =
    u -
    HIT_AT;
  if (
    beat.reaction ===
    'block'
  ) {
    if (
      u >
        WINDUP *
          0.6 &&
      u <
        WINDUP +
          PUNCH_TIME +
          0.2
    )
      d.state =
        'blocking';
    if (
      sinceHit >
        0 &&
      sinceHit <
        0.2
    )
      d.x =
        sd.home +
        sd.dir *
          -0.04;
  } else if (
    beat.reaction ===
    'hit'
  ) {
    if (
      sinceHit >=
        0 &&
      sinceHit <
        HIT_TIME
    ) {
      d.state =
        'hit';
      d.actionProgress =
        sinceHit /
        HIT_TIME;
      d.hitFlash =
        8 *
        (1 -
          clamp01(
            sinceHit /
              FLASH_TIME,
          ));
      d.x =
        sd.home -
        sd.dir *
          0.12 *
          smooth(
            sinceHit /
              0.2,
          );
    } else if (
      sinceHit >=
      HIT_TIME
    )
      d.x =
        sd.home -
        sd.dir *
          0.12 *
          (1 -
            smooth(
              (sinceHit -
                HIT_TIME) /
                0.4,
            ));
  } else if (
    sinceHit >=
    0
  ) {
    d.state =
      'knockedOut';
    d.actionProgress =
      clamp01(
        sinceHit /
          KO_TIME,
      );
    d.hitFlash =
      8 *
      (1 -
        clamp01(
          sinceHit /
            FLASH_TIME,
        ));
    d.alive = false;
    d.x =
      sd.home -
      sd.dir *
        0.2 *
        smooth(
          sinceHit /
            0.6,
        );
  }
  return frames;
}

/**
 * Continuous footwork under the scripted blows, so nobody ever stands planted: each fighter works in toward the
 * other and back out on a slow tide and circles in depth, the two orbiting in opposite senses on incommensurate
 * periods (so the pattern doesn't visibly repeat inside a loop, yet closes exactly at the loop's end). Returns the offset from where the beat has them.
 */
function footwork(
  t: number,
  who:
    | 0
    | 1,
): {
  dx: number;
  dz: number;
} {
  const dir =
    who ===
    0
      ? 1
      : -1;
  // whole numbers of cycles per loop (DUEL_PERIOD), so the footwork meets itself at the loop point with no pop
  const w =
    TAU /
    DUEL_PERIOD;
  const tide =
    0.22 *
      Math.sin(
        w *
          5 *
          t +
          (who ===
          0
            ? 0
            : 1.9),
      ) +
    0.07 *
      Math.sin(
        w *
          11 *
          t +
          who,
      );
  const orbit =
    (who ===
    0
      ? 1
      : -1) *
    0.3 *
    Math.sin(
      w *
        3 *
        t +
        (who ===
        0
          ? 0
          : 0.8),
    );
  return {
    dx:
      dir *
      tide,
    dz: orbit,
  };
}
const TAU =
  Math.PI *
  2;
/** Fighters faster than this (m/s) while the beat has them standing are shown walking (shuffling). */
const WALKING_SPEED = 0.28;
const VEL_EPS = 0.05;

function loopTime(
  t: number,
): number {
  return (
    ((t %
      DUEL_PERIOD) +
      DUEL_PERIOD) %
    DUEL_PERIOD
  );
}

/** Where each fighter is at `t`: the beat's position plus the footwork. */
function positions(
  t: number,
): [
  {
    x: number;
    z: number;
  },
  {
    x: number;
    z: number;
  },
] {
  let u =
    loopTime(
      t,
    );
  let frames: [
    DuelFrame,
    DuelFrame,
  ] =
    beatFrames(
      BEATS[0],
      0,
    );
  for (const beat of BEATS) {
    if (
      u <
      beat.length
    ) {
      frames =
        beatFrames(
          beat,
          u,
        );
      break;
    }
    u -=
      beat.length;
  }
  const fw =
    [
      footwork(
        t,
        0,
      ),
      footwork(
        t,
        1,
      ),
    ];
  return [
    {
      x:
        frames[0]
          .x +
        fw[0]
          .dx,
      z: fw[0]
        .dz,
    },
    {
      x:
        frames[1]
          .x +
        fw[1]
          .dx,
      z: fw[1]
        .dz,
    },
  ];
}

/** The two fighters (seat 0 on the left, seat 1 on the right) at time `t`. */
export function duelAt(
  t: number,
): [
  DuelFrame,
  DuelFrame,
] {
  let u =
    loopTime(
      t,
    );
  let frames: [
    DuelFrame,
    DuelFrame,
  ] =
    beatFrames(
      BEATS[0],
      0,
    );
  for (const beat of BEATS) {
    if (
      u <
      beat.length
    ) {
      frames =
        beatFrames(
          beat,
          u,
        );
      break;
    }
    u -=
      beat.length;
  }
  const now =
    positions(
      t,
    );
  const before =
    positions(
      t -
        VEL_EPS,
    );
  const after =
    positions(
      t +
        VEL_EPS,
    );
  for (const i of [
    0,
    1,
  ] as const) {
    const f =
      frames[
        i
      ];
    f.x =
      now[
        i
      ].x;
    f.z =
      now[
        i
      ].z;
    const speed =
      Math.hypot(
        after[
          i
        ]
          .x -
          before[
            i
          ]
            .x,
        after[
          i
        ]
          .z -
          before[
            i
          ]
            .z,
      ) /
      (2 *
        VEL_EPS);
    // standing in the beat but moving on the footwork: shuffling about
    if (
      f.state ===
        'idle' &&
      speed >
        WALKING_SPEED
    )
      f.state =
        'walking';
  }
  // face each other as they circle: yaw 0 looks along +X, so a fighter faces atan2(dz, dx) to the other
  frames[0].yaw =
    Math.atan2(
      now[1]
        .z -
        now[0]
          .z,
      now[1]
        .x -
        now[0]
          .x,
    );
  frames[1].yaw =
    Math.atan2(
      now[0]
        .z -
        now[1]
          .z,
      now[0]
        .x -
        now[1]
          .x,
    );
  return frames;
}

/** Times (seconds into the loop) at which a hit lands — for flash-rate accounting and tests. */
export function hitTimes(): number[] {
  const out: number[] =
    [];
  let start = 0;
  for (const beat of BEATS) {
    if (
      beat.reaction !==
      'block'
    )
      out.push(
        start +
          HIT_AT,
      );
    start +=
      beat.length;
  }
  return out;
}

/** How far back the menu camera sits so both fighters (± halfWidth metres) fit at this aspect. */
export function cameraDistance(
  aspect: number,
  fovDeg: number,
  halfWidth = 2.3,
  minDistance = 3.6,
): number {
  const tanHalf =
    Math.tan(
      (fovDeg *
        Math.PI) /
        360,
    );
  return Math.max(
    minDistance,
    halfWidth /
      (tanHalf *
        Math.max(
          0.2,
          aspect,
        )),
  );
}

// ── Impacts: when and how hard each blow lands, for the effects ─────────────────

/** An impact in the format the ImpactBus takes, minus the clock (the caller stamps `now`). */
export interface DuelImpact {
  kind:
    | 'hit'
    | 'block'
    | 'ko';
  victim:
    | 0
    | 1;
  attacker:
    | 0
    | 1;
  power: number;
  x: number;
  y: number;
  z: number;
  dirX: number;
  dirZ: number;
}

/** Damage each punch is shown as: a jab is a tap, an uppercut a haymaker, the knockdown the biggest. */
export const DUEL_POWER: Record<
  PunchType,
  number
> =
  {
    jab: 6,
    cross: 10,
    hook: 14,
    uppercut: 20,
  };
export const DUEL_KO_POWER = 34;
const BLOCK_POWER_SHOWN = 9;
const CONTACT_Y = 1.15;

/** Seconds into the loop at which each beat starts. */
const BEAT_STARTS: {
  beat: Beat;
  start: number;
}[] =
  (() => {
    let start = 0;
    return BEATS.map(
      (
        beat,
      ) => {
        const out =
          {
            beat,
            start,
          };
        start +=
          beat.length;
        return out;
      },
    );
  })();

/** The impact of one beat, positioned from where the fighters actually are (footwork included) at contact. */
function impactOf(
  beat: Beat,
  start: number,
): DuelImpact {
  const [
    l,
    r,
  ] =
    duelAt(
      start +
        HIT_AT,
    );
  const victim =
    (1 -
      beat.attacker) as
      | 0
      | 1;
  const vf =
    victim ===
    0
      ? l
      : r;
  const af =
    beat.attacker ===
    0
      ? l
      : r;
  const dx =
    vf.x -
    af.x;
  const dz =
    vf.z -
    af.z;
  const len =
    Math.hypot(
      dx,
      dz,
    ) ||
    1;
  return {
    kind:
      beat.reaction ===
      'block'
        ? 'block'
        : beat.reaction ===
            'ko'
          ? 'ko'
          : 'hit',
    victim,
    attacker:
      beat.attacker,
    power:
      beat.reaction ===
      'ko'
        ? DUEL_KO_POWER
        : beat.reaction ===
            'block'
          ? BLOCK_POWER_SHOWN
          : DUEL_POWER[
              beat
                .punch
            ],
    x: vf.x,
    y: CONTACT_Y,
    z: vf.z,
    dirX:
      dx /
      len,
    dirZ:
      dz /
      len,
  };
}

/**
 * The impacts that land in the time window (prevT, t], times in seconds since the loop began. A window may
 * span the loop's end (the duel repeats every DUEL_PERIOD); one longer than the loop returns each impact
 * once per pass. Empty when `t <= prevT`.
 */
export function duelImpacts(
  prevT: number,
  t: number,
): DuelImpact[] {
  if (
    !(
      t >
      prevT
    )
  )
    return [];
  const out: DuelImpact[] =
    [];
  const firstLoop =
    Math.floor(
      prevT /
        DUEL_PERIOD,
    );
  const lastLoop =
    Math.floor(
      t /
        DUEL_PERIOD,
    );
  for (
    let loop =
      firstLoop;
    loop <=
    lastLoop;
    loop++
  ) {
    for (const {
      beat,
      start,
    } of BEAT_STARTS) {
      const at =
        loop *
          DUEL_PERIOD +
        start +
        HIT_AT;
      if (
        at >
          prevT &&
        at <=
          t
      )
        out.push(
          impactOf(
            beat,
            start,
          ),
        );
    }
  }
  return out;
}
