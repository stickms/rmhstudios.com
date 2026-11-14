// ============================================================
// Authored boxing animation for Source skeletons.
//
// Poses are written in CHARACTER space, not bone space, so the same data drives
// any skeleton (TF2, HL2, Portal, CS:GO) whatever its bind pose or bone axes:
//   +X = the character's left, +Y = up, +Z = forward.
//   Limbs are DIRECTIONS (where the upper arm / forearm / thigh / shin point);
//   trunk joints are ROTATIONS in degrees about those axes. +X tips up toward
//   forward (a forward lean), +Y turns the character left, +Z leans left.
// Arm directions are relative to the chest's rotation, leg directions to the
// hips', so a torso twist carries the arms with it (sourceClips.ts).
// Hips `pos` is a displacement as a fraction of the character's height. `shoulderL/R` aim the collar bone
// (its direction relative to the chest): protract it forward on a punch, shrug it up to block.
// ============================================================
import type { ClipKey } from './clips';

export type Vec3 =
  readonly [
    number,
    number,
    number,
  ];

/** A limb's segments, each a direction. `foot` (legs only) aims the foot toward its toes: pitch it down to stand on the ball of the foot. */
/** A limb's segments, each a direction. `foot` (legs only) aims the foot toward its toes: pitch it down to stand on the ball of the foot. */
export interface Limb2 {
  upper: Vec3;
  lower: Vec3;
  foot?: Vec3;
}
export interface Pose {
  hips?: {
    rot?: Vec3;
    pos?: Vec3;
  };
  spine?: Vec3;
  chest?: Vec3;
  neck?: Vec3;
  head?: Vec3;
  shoulderL?: Vec3;
  shoulderR?: Vec3;
  armL?: Limb2;
  armR?: Limb2;
  legL?: Limb2;
  legR?: Limb2;
}
export interface PoseClip {
  /** Seconds. One-shots are driven by sim progress, so only their length matters for scrubbing. */
  duration: number;
  /** Each keyframe is merged over `base`; `t` runs 0..1. */
  base: Pose;
  frames: {
    t: number;
    pose: Pose;
  }[];
}

const TAU =
  Math.PI *
  2;
const v =
  (
    x: number,
    y: number,
    z: number,
  ): Vec3 => [
    x,
    y,
    z,
  ];
const mix =
  (
    a: Vec3,
    b: Vec3,
    t: number,
  ): Vec3 => [
    a[0] +
      (b[0] -
        a[0]) *
        t,
    a[1] +
      (b[1] -
        a[1]) *
        t,
    a[2] +
      (b[2] -
        a[2]) *
        t,
  ];

/** Feet: flat on the floor, and up on the ball of the foot (heel lifted) — left and right mirror in x. */
const flatL =
    v(
      0.04,
      -0.24,
      0.97,
    ),
  flatR =
    v(
      -0.04,
      -0.24,
      0.97,
    );
const toeL =
  (
    pitch: number,
  ): Vec3 =>
    v(
      0.04,
      -Math.sin(
        pitch,
      ),
      Math.cos(
        pitch,
      ),
    );
const toeR =
  (
    pitch: number,
  ): Vec3 =>
    v(
      -0.04,
      -Math.sin(
        pitch,
      ),
      Math.cos(
        pitch,
      ),
    );
const deg =
  (
    d: number,
  ) =>
    (d *
      Math.PI) /
    180;

/** Collar bones: neutral, pushed forward (a punch's reach), lifted (a shrug / guard), pulled back (a wind-up). */
const SH =
  {
    L: {
      rest: v(
        0.95,
        0.1,
        0.18,
      ),
      reach:
        v(
          0.8,
          0.08,
          0.58,
        ),
      shrug:
        v(
          0.92,
          0.34,
          0.14,
        ),
      back: v(
        0.97,
        0.05,
        -0.06,
      ),
      drop: v(
        0.96,
        -0.08,
        0.1,
      ),
    },
    R: {
      rest: v(
        -0.95,
        0.1,
        0.18,
      ),
      reach:
        v(
          -0.8,
          0.08,
          0.58,
        ),
      shrug:
        v(
          -0.92,
          0.34,
          0.14,
        ),
      back: v(
        -0.97,
        0.05,
        -0.06,
      ),
      drop: v(
        -0.96,
        -0.08,
        0.1,
      ),
    },
  };

/** Orthodox boxing guard: left lead, fists by the chin, knees soft, weight forward, shoulders up. */
export const GUARD: Pose =
  {
    hips: {
      rot: [
        0,
        12,
        0,
      ],
    },
    chest:
      [
        8,
        8,
        0,
      ],
    head: [
      -6,
      -20,
      0,
    ],
    shoulderL:
      SH
        .L
        .rest,
    shoulderR:
      SH
        .R
        .rest,
    armL: {
      upper:
        [
          0.3,
          -0.8,
          0.5,
        ],
      lower:
        [
          0.1,
          0.6,
          0.8,
        ],
    },
    armR: {
      upper:
        [
          -0.3,
          -0.8,
          0.45,
        ],
      lower:
        [
          -0.05,
          0.65,
          0.75,
        ],
    },
    legL: {
      upper:
        [
          0.14,
          -0.94,
          0.3,
        ],
      lower:
        [
          0.1,
          -1.0,
          -0.1,
        ],
      foot: flatL,
    },
    legR: {
      upper:
        [
          -0.14,
          -0.97,
          -0.2,
        ],
      lower:
        [
          -0.1,
          -1.0,
          -0.05,
        ],
      foot: flatR,
    },
  };

const g =
  (
    over: Pose,
  ): Pose =>
    over;

// ── Idle: a boxer's bounce on the balls of the feet, with a shuffle and a weight shift ──────────────────
// Two bounces (~2.2 a second) per 1.8 s loop. The hips offsets are solved so the balls of the feet stay
// planted while the heels lift (sourceClips.test.ts checks it); over the loop the feet also shuffle fore and
// aft, the weight rocks side to side, the shoulders roll alternately, the head counter-turns and the guard
// hands weave a beat behind the body — so the stance is never a held pose.
const IDLE_SECONDS = 1.8;
const IDLE_KEYS = 18;

function idleFrame(
  phase: number,
): Pose {
  const b =
    0.5 -
    0.5 *
      Math.cos(
        TAU *
          2 *
          phase,
      ); // 0 at the bottom of a bounce, 1 at the top
  const s =
    Math.sin(
      TAU *
        phase,
    ); // the slow shuffle / weight shift
  const c =
    Math.cos(
      TAU *
        phase,
    );
  const lUp =
    mix(
      v(
        0.14,
        -0.94,
        0.3,
      ),
      v(
        0.13,
        -0.97,
        0.22,
      ),
      b,
    );
  const rUp =
    mix(
      v(
        -0.14,
        -0.97,
        -0.2,
      ),
      v(
        -0.13,
        -0.985,
        -0.15,
      ),
      b,
    );
  const pitch =
    deg(
      14 +
        18 *
          b,
    );
  return g(
    {
      hips: {
        rot: [
          0,
          12 +
            4 *
              s,
          0,
        ],
        pos: [
          0.01 *
            s,
          -0.01 +
            0.039 *
              b,
          0,
        ],
      },
      chest:
        [
          10 -
            4 *
              b,
          8 +
            3 *
              c,
          3 *
            s,
        ],
      head: [
        -7 +
          2 *
            b,
        -20 -
          4 *
            s,
        -2 *
          s,
      ],
      shoulderL:
        v(
          0.95,
          0.1 +
            0.12 *
              Math.max(
                0,
                s,
              ) +
            0.05 *
              b,
          0.18,
        ),
      shoulderR:
        v(
          -0.95,
          0.1 +
            0.12 *
              Math.max(
                0,
                -s,
              ) +
            0.05 *
              b,
          0.18,
        ),
      legL: {
        upper:
          [
            lUp[0],
            lUp[1],
            lUp[2] +
              0.1 *
                s,
          ],
        lower:
          mix(
            v(
              0.1,
              -1,
              -0.1,
            ),
            v(
              0.1,
              -1,
              -0.06,
            ),
            b,
          ),
        foot: toeL(
          pitch,
        ),
      },
      legR: {
        upper:
          [
            rUp[0],
            rUp[1],
            rUp[2] -
              0.1 *
                s,
          ],
        lower:
          mix(
            v(
              -0.1,
              -1,
              -0.05,
            ),
            v(
              -0.1,
              -1,
              -0.03,
            ),
            b,
          ),
        foot: toeR(
          pitch,
        ),
      },
      armL: {
        upper:
          [
            0.3,
            -0.8 +
              0.06 *
                b,
            0.5 +
              0.08 *
                b,
          ],
        lower:
          [
            0.1 +
              0.04 *
                c,
            0.54 +
              0.14 *
                b,
            0.84 -
              0.11 *
                b,
          ],
      },
      armR: {
        upper:
          [
            -0.3,
            -0.8 +
              0.04 *
                b,
            0.45 +
              0.07 *
                b,
          ],
        lower:
          [
            -0.05 -
              0.04 *
                c,
            0.6 +
              0.11 *
                b,
            0.8 -
              0.1 *
                b,
          ],
      },
    },
  );
}

// ── Strafe: the boxer's shuffle step sideways (toward the character's left; played backwards for right) ──
const strafeFrames =
  [
    {
      t: 0,
      pose: g(
        {
          hips: {
            rot: [
              0,
              12,
              0,
            ],
            pos: [
              0,
              -0.014,
              0,
            ],
          },
          chest:
            [
              10,
              8,
              -4,
            ],
          shoulderL:
            SH
              .L
              .rest,
          shoulderR:
            SH
              .R
              .rest,
          legL: {
            upper:
              [
                0.16,
                -0.94,
                0.16,
              ],
            lower:
              [
                0.1,
                -1,
                -0.06,
              ],
            foot: flatL,
          },
          legR: {
            upper:
              [
                -0.16,
                -0.95,
                -0.1,
              ],
            lower:
              [
                -0.1,
                -1,
                -0.05,
              ],
            foot: flatR,
          },
        },
      ),
    },
    {
      t: 0.25,
      pose: g(
        {
          hips: {
            rot: [
              0,
              12,
              0,
            ],
            pos: [
              0.012,
              0.004,
              0,
            ],
          },
          chest:
            [
              8,
              8,
              -5,
            ],
          legL: {
            upper:
              [
                0.3,
                -0.91,
                0.1,
              ],
            lower:
              [
                0.2,
                -1,
                -0.04,
              ],
            foot: toeL(
              deg(
                24,
              ),
            ),
          },
          legR: {
            upper:
              [
                -0.1,
                -0.98,
                -0.05,
              ],
            lower:
              [
                -0.08,
                -1,
                -0.03,
              ],
            foot: toeR(
              deg(
                30,
              ),
            ),
          },
        },
      ),
    },
    {
      t: 0.5,
      pose: g(
        {
          hips: {
            rot: [
              0,
              12,
              0,
            ],
            pos: [
              0.02,
              -0.016,
              0,
            ],
          },
          chest:
            [
              10,
              8,
              -4,
            ],
          legL: {
            upper:
              [
                0.36,
                -0.92,
                0.1,
              ],
            lower:
              [
                0.22,
                -1,
                -0.04,
              ],
            foot: flatL,
          },
          legR: {
            upper:
              [
                -0.1,
                -0.96,
                -0.06,
              ],
            lower:
              [
                -0.08,
                -1,
                -0.04,
              ],
            foot: toeR(
              deg(
                22,
              ),
            ),
          },
        },
      ),
    },
    {
      t: 0.75,
      pose: g(
        {
          hips: {
            rot: [
              0,
              12,
              0,
            ],
            pos: [
              0.008,
              0.006,
              0,
            ],
          },
          chest:
            [
              8,
              8,
              -5,
            ],
          legL: {
            upper:
              [
                0.22,
                -0.96,
                0.12,
              ],
            lower:
              [
                0.14,
                -1,
                -0.04,
              ],
            foot: toeL(
              deg(
                28,
              ),
            ),
          },
          legR: {
            upper:
              [
                -0.04,
                -0.97,
                0.04,
              ],
            lower:
              [
                -0.04,
                -1,
                -0.02,
              ],
            foot: toeR(
              deg(
                20,
              ),
            ),
          },
        },
      ),
    },
    {
      t: 1,
      pose: g(
        {
          hips: {
            rot: [
              0,
              12,
              0,
            ],
            pos: [
              0,
              -0.014,
              0,
            ],
          },
          chest:
            [
              10,
              8,
              -4,
            ],
          legL: {
            upper:
              [
                0.16,
                -0.94,
                0.16,
              ],
            lower:
              [
                0.1,
                -1,
                -0.06,
              ],
            foot: flatL,
          },
          legR: {
            upper:
              [
                -0.16,
                -0.95,
                -0.1,
              ],
            lower:
              [
                -0.1,
                -1,
                -0.05,
              ],
            foot: flatR,
          },
        },
      ),
    },
  ];

export const POSE_CLIPS: Record<
  ClipKey,
  PoseClip
> =
  {
    idle: {
      duration:
        IDLE_SECONDS,
      base: GUARD,
      frames:
        Array.from(
          {
            length:
              IDLE_KEYS +
              1,
          },
          (
            _,
            i,
          ) => ({
            t:
              i /
              IDLE_KEYS,
            pose: idleFrame(
              i /
                IDLE_KEYS,
            ),
          }),
        ),
    },
    strafe:
      {
        duration: 0.7,
        base: GUARD,
        frames:
          strafeFrames,
      },
    walk: {
      duration: 0.8,
      base: GUARD,
      frames:
        [
          0,
          0.25,
          0.5,
          0.75,
          1,
        ].map(
          (
            t,
          ) => {
            // legs alternate; the shoulders counter-rotate against the hips, the shoulders and guard hands bob with each step
            const a =
              t ===
                0 ||
              t ===
                1
                ? 1
                : t ===
                    0.5
                  ? -1
                  : 0; // +1: left leg forward, -1: right leg forward
            const down =
              t ===
                0.25 ||
              t ===
                0.75; // passing position: the body is at its highest
            const legsA =
              {
                legL: {
                  upper:
                    [
                      0.12,
                      -0.8,
                      0.58,
                    ],
                  lower:
                    [
                      0.1,
                      -1,
                      -0.1,
                    ],
                  foot: toeL(
                    deg(
                      14,
                    ),
                  ),
                } as Limb2,
                legR: {
                  upper:
                    [
                      -0.12,
                      -0.9,
                      -0.42,
                    ],
                  lower:
                    [
                      -0.1,
                      -0.7,
                      -0.7,
                    ],
                  foot: toeR(
                    deg(
                      34,
                    ),
                  ),
                } as Limb2,
              };
            const legsB =
              {
                legL: {
                  upper:
                    [
                      0.12,
                      -0.9,
                      -0.42,
                    ],
                  lower:
                    [
                      0.1,
                      -0.7,
                      -0.7,
                    ],
                  foot: toeL(
                    deg(
                      34,
                    ),
                  ),
                } as Limb2,
                legR: {
                  upper:
                    [
                      -0.12,
                      -0.8,
                      0.58,
                    ],
                  lower:
                    [
                      -0.1,
                      -1,
                      -0.1,
                    ],
                  foot: toeR(
                    deg(
                      14,
                    ),
                  ),
                } as Limb2,
              };
            const pass =
              {
                legL: {
                  upper:
                    t ===
                    0.25
                      ? [
                          0.12,
                          -1,
                          0.05,
                        ]
                      : [
                          0.12,
                          -0.95,
                          0.2,
                        ],
                  lower:
                    t ===
                    0.25
                      ? [
                          0.1,
                          -1,
                          -0.25,
                        ]
                      : [
                          0.1,
                          -0.85,
                          -0.35,
                        ],
                  foot: toeL(
                    deg(
                      20,
                    ),
                  ),
                } as Limb2,
                legR: {
                  upper:
                    t ===
                    0.25
                      ? [
                          -0.12,
                          -0.95,
                          0.2,
                        ]
                      : [
                          -0.12,
                          -1,
                          0.05,
                        ],
                  lower:
                    t ===
                    0.25
                      ? [
                          -0.1,
                          -0.85,
                          -0.35,
                        ]
                      : [
                          -0.1,
                          -1,
                          -0.25,
                        ],
                  foot: toeR(
                    deg(
                      20,
                    ),
                  ),
                } as Limb2,
              };
            const legs =
              down
                ? pass
                : a ===
                    1
                  ? legsA
                  : legsB;
            return {
              t,
              pose: g(
                {
                  hips: {
                    rot: [
                      0,
                      12 +
                        7 *
                          a,
                      0,
                    ],
                    pos: [
                      0.008 *
                        a,
                      down
                        ? -0.012
                        : 0.004,
                      0,
                    ],
                  },
                  chest:
                    [
                      10,
                      8 -
                        7 *
                          a,
                      2 *
                        a,
                    ],
                  head: [
                    -6,
                    -20 +
                      4 *
                        a,
                    0,
                  ],
                  shoulderL:
                    v(
                      0.95,
                      0.1 +
                        0.1 *
                          (a ===
                          -1
                            ? 1
                            : 0),
                      0.18 +
                        0.12 *
                          (a ===
                          1
                            ? 1
                            : 0),
                    ),
                  shoulderR:
                    v(
                      -0.95,
                      0.1 +
                        0.1 *
                          (a ===
                          1
                            ? 1
                            : 0),
                      0.18 +
                        0.12 *
                          (a ===
                          -1
                            ? 1
                            : 0),
                    ),
                  armL: {
                    upper:
                      [
                        0.3,
                        -0.8,
                        0.5,
                      ],
                    lower:
                      [
                        0.1,
                        0.6 +
                          0.07 *
                            a,
                        0.8,
                      ],
                  },
                  armR: {
                    upper:
                      [
                        -0.3,
                        -0.8,
                        0.45,
                      ],
                    lower:
                      [
                        -0.05,
                        0.65 -
                          0.07 *
                            a,
                        0.75,
                      ],
                  },
                  ...legs,
                },
              ),
            };
          },
        ),
    },
    jab: {
      duration: 1,
      base: GUARD,
      frames:
        [
          {
            t: 0,
            pose: {},
          },
          // wind-up: weight rocks back, the lead shoulder pulls in, the fist cocks
          {
            t: 0.2,
            pose: g(
              {
                hips: {
                  rot: [
                    0,
                    16,
                    0,
                  ],
                  pos: [
                    0,
                    -0.01,
                    -0.014,
                  ],
                },
                chest:
                  [
                    10,
                    14,
                    0,
                  ],
                head: [
                  -3,
                  -18,
                  0,
                ],
                shoulderL:
                  SH
                    .L
                    .back,
                armL: {
                  upper:
                    [
                      0.25,
                      -0.5,
                      0.7,
                    ],
                  lower:
                    [
                      0.1,
                      0.1,
                      1,
                    ],
                },
                legL: {
                  upper:
                    [
                      0.14,
                      -0.97,
                      0.14,
                    ],
                  lower:
                    [
                      0.1,
                      -1,
                      -0.04,
                    ],
                  foot: flatL,
                },
                legR: {
                  upper:
                    [
                      -0.14,
                      -0.92,
                      -0.3,
                    ],
                  lower:
                    [
                      -0.1,
                      -0.96,
                      -0.2,
                    ],
                  foot: flatR,
                },
              },
            ),
          },
          // strike: the lead foot steps in, the body drives behind it, the shoulder reaches, the chin tucks
          {
            t: 0.4,
            pose: g(
              {
                hips: {
                  rot: [
                    0,
                    4,
                    0,
                  ],
                  pos: [
                    0,
                    -0.02,
                    0.052,
                  ],
                },
                chest:
                  [
                    8,
                    -8,
                    0,
                  ],
                head: [
                  3,
                  -14,
                  0,
                ],
                shoulderL:
                  SH
                    .L
                    .reach,
                armL: {
                  upper:
                    [
                      0.08,
                      0.02,
                      1,
                    ],
                  lower:
                    [
                      0.05,
                      0.02,
                      1,
                    ],
                },
                legL: {
                  upper:
                    [
                      0.16,
                      -0.86,
                      0.5,
                    ],
                  lower:
                    [
                      0.1,
                      -1,
                      -0.28,
                    ],
                  foot: flatL,
                },
                legR: {
                  upper:
                    [
                      -0.14,
                      -0.93,
                      -0.36,
                    ],
                  lower:
                    [
                      -0.1,
                      -0.95,
                      -0.28,
                    ],
                  foot: toeR(
                    deg(
                      24,
                    ),
                  ),
                },
              },
            ),
          },
          {
            t: 0.65,
            pose: g(
              {
                hips: {
                  rot: [
                    0,
                    6,
                    0,
                  ],
                  pos: [
                    0,
                    -0.014,
                    0.036,
                  ],
                },
                chest:
                  [
                    8,
                    -6,
                    0,
                  ],
                head: [
                  2,
                  -15,
                  0,
                ],
                shoulderL:
                  SH
                    .L
                    .reach,
                armL: {
                  upper:
                    [
                      0.1,
                      0.0,
                      1,
                    ],
                  lower:
                    [
                      0.05,
                      0.0,
                      1,
                    ],
                },
                legL: {
                  upper:
                    [
                      0.16,
                      -0.88,
                      0.46,
                    ],
                  lower:
                    [
                      0.1,
                      -1,
                      -0.24,
                    ],
                  foot: flatL,
                },
                legR: {
                  upper:
                    [
                      -0.14,
                      -0.94,
                      -0.32,
                    ],
                  lower:
                    [
                      -0.1,
                      -0.96,
                      -0.24,
                    ],
                  foot: toeR(
                    deg(
                      18,
                    ),
                  ),
                },
              },
            ),
          },
          {
            t: 1,
            pose: {},
          },
        ],
    },
    cross:
      {
        duration: 1,
        base: GUARD,
        frames:
          [
            {
              t: 0,
              pose: {},
            },
            {
              t: 0.25,
              pose: g(
                {
                  hips: {
                    rot: [
                      0,
                      -4,
                      0,
                    ],
                    pos: [
                      0,
                      -0.012,
                      -0.012,
                    ],
                  },
                  chest:
                    [
                      8,
                      -6,
                      0,
                    ],
                  head: [
                    -3,
                    -16,
                    0,
                  ],
                  shoulderR:
                    SH
                      .R
                      .back,
                  armR: {
                    upper:
                      [
                        -0.3,
                        -0.6,
                        0.45,
                      ],
                    lower:
                      [
                        -0.05,
                        0.1,
                        0.9,
                      ],
                  },
                  legR: {
                    upper:
                      [
                        -0.14,
                        -0.95,
                        -0.14,
                      ],
                    lower:
                      [
                        -0.1,
                        -1,
                        -0.04,
                      ],
                    foot: flatR,
                  },
                },
              ),
            },
            // strike: the rear foot pivots up onto its toes, the hips and torso whip round, the weight lands on the front leg
            {
              t: 0.45,
              pose: g(
                {
                  hips: {
                    rot: [
                      0,
                      28,
                      0,
                    ],
                    pos: [
                      0,
                      -0.024,
                      0.044,
                    ],
                  },
                  chest:
                    [
                      10,
                      34,
                      0,
                    ],
                  head: [
                    3,
                    -8,
                    0,
                  ],
                  shoulderR:
                    SH
                      .R
                      .reach,
                  armR: {
                    upper:
                      [
                        -0.1,
                        0.03,
                        1,
                      ],
                    lower:
                      [
                        -0.05,
                        0.03,
                        1,
                      ],
                  },
                  legL: {
                    upper:
                      [
                        0.15,
                        -0.9,
                        0.42,
                      ],
                    lower:
                      [
                        0.1,
                        -1,
                        -0.2,
                      ],
                    foot: flatL,
                  },
                  legR: {
                    upper:
                      [
                        -0.1,
                        -0.92,
                        -0.24,
                      ],
                    lower:
                      [
                        -0.08,
                        -1,
                        -0.1,
                      ],
                    foot: toeR(
                      deg(
                        42,
                      ),
                    ),
                  },
                },
              ),
            },
            {
              t: 0.7,
              pose: g(
                {
                  hips: {
                    rot: [
                      0,
                      26,
                      0,
                    ],
                    pos: [
                      0,
                      -0.018,
                      0.034,
                    ],
                  },
                  chest:
                    [
                      10,
                      30,
                      0,
                    ],
                  head: [
                    2,
                    -10,
                    0,
                  ],
                  shoulderR:
                    SH
                      .R
                      .reach,
                  armR: {
                    upper:
                      [
                        -0.12,
                        0.0,
                        1,
                      ],
                    lower:
                      [
                        -0.06,
                        0.0,
                        1,
                      ],
                  },
                  legL: {
                    upper:
                      [
                        0.15,
                        -0.91,
                        0.4,
                      ],
                    lower:
                      [
                        0.1,
                        -1,
                        -0.18,
                      ],
                    foot: flatL,
                  },
                  legR: {
                    upper:
                      [
                        -0.1,
                        -0.93,
                        -0.22,
                      ],
                    lower:
                      [
                        -0.08,
                        -1,
                        -0.08,
                      ],
                    foot: toeR(
                      deg(
                        36,
                      ),
                    ),
                  },
                },
              ),
            },
            {
              t: 1,
              pose: {},
            },
          ],
      },
    hook: {
      duration: 1,
      base: GUARD,
      frames:
        [
          {
            t: 0,
            pose: {},
          },
          {
            t: 0.25,
            pose: g(
              {
                hips: {
                  rot: [
                    0,
                    24,
                    0,
                  ],
                  pos: [
                    0,
                    -0.03,
                    -0.008,
                  ],
                },
                chest:
                  [
                    8,
                    26,
                    0,
                  ],
                head: [
                  -2,
                  -24,
                  0,
                ],
                shoulderL:
                  SH
                    .L
                    .shrug,
                armL: {
                  upper:
                    [
                      0.95,
                      0.05,
                      -0.1,
                    ],
                  lower:
                    [
                      0.3,
                      0.2,
                      0.9,
                    ],
                },
                legL: {
                  upper:
                    [
                      0.2,
                      -0.9,
                      0.22,
                    ],
                  lower:
                    [
                      0.12,
                      -1,
                      -0.1,
                    ],
                  foot: flatL,
                },
                legR: {
                  upper:
                    [
                      -0.16,
                      -0.95,
                      -0.22,
                    ],
                  lower:
                    [
                      -0.1,
                      -1,
                      -0.08,
                    ],
                  foot: flatR,
                },
              },
            ),
          },
          {
            t: 0.45,
            pose: g(
              {
                hips: {
                  rot: [
                    0,
                    4,
                    0,
                  ],
                  pos: [
                    0,
                    -0.026,
                    0.02,
                  ],
                },
                chest:
                  [
                    8,
                    4,
                    0,
                  ],
                head: [
                  2,
                  -14,
                  0,
                ],
                shoulderL:
                  SH
                    .L
                    .reach,
                armL: {
                  upper:
                    [
                      0.9,
                      0.1,
                      0.35,
                    ],
                  lower:
                    [
                      -0.1,
                      0.05,
                      1,
                    ],
                },
                legL: {
                  upper:
                    [
                      0.18,
                      -0.9,
                      0.3,
                    ],
                  lower:
                    [
                      0.1,
                      -1,
                      -0.16,
                    ],
                  foot: toeL(
                    deg(
                      38,
                    ),
                  ),
                },
                legR: {
                  upper:
                    [
                      -0.16,
                      -0.94,
                      -0.26,
                    ],
                  lower:
                    [
                      -0.1,
                      -1,
                      -0.1,
                    ],
                  foot: flatR,
                },
              },
            ),
          },
          {
            t: 0.65,
            pose: g(
              {
                hips: {
                  rot: [
                    0,
                    -12,
                    0,
                  ],
                  pos: [
                    0,
                    -0.018,
                    0.026,
                  ],
                },
                chest:
                  [
                    8,
                    -26,
                    0,
                  ],
                head: [
                  3,
                  -6,
                  0,
                ],
                shoulderL:
                  SH
                    .L
                    .reach,
                armL: {
                  upper:
                    [
                      0.7,
                      0.1,
                      0.65,
                    ],
                  lower:
                    [
                      -0.75,
                      0.05,
                      0.65,
                    ],
                },
                legL: {
                  upper:
                    [
                      0.17,
                      -0.9,
                      0.34,
                    ],
                  lower:
                    [
                      0.1,
                      -1,
                      -0.18,
                    ],
                  foot: toeL(
                    deg(
                      44,
                    ),
                  ),
                },
                legR: {
                  upper:
                    [
                      -0.16,
                      -0.94,
                      -0.26,
                    ],
                  lower:
                    [
                      -0.1,
                      -1,
                      -0.1,
                    ],
                  foot: flatR,
                },
              },
            ),
          },
          {
            t: 1,
            pose: {},
          },
        ],
    },
    uppercut:
      {
        duration: 1,
        base: GUARD,
        frames:
          [
            {
              t: 0,
              pose: {},
            },
            // the dip: knees bend, the body drops under the target
            {
              t: 0.3,
              pose: g(
                {
                  hips: {
                    rot: [
                      0,
                      -8,
                      0,
                    ],
                    pos: [
                      0,
                      -0.075,
                      0.004,
                    ],
                  },
                  chest:
                    [
                      14,
                      -8,
                      0,
                    ],
                  head: [
                    2,
                    -18,
                    0,
                  ],
                  shoulderR:
                    SH
                      .R
                      .drop,
                  armR: {
                    upper:
                      [
                        -0.25,
                        -0.95,
                        0.15,
                      ],
                    lower:
                      [
                        -0.1,
                        -0.7,
                        0.7,
                      ],
                  },
                  legL: {
                    upper:
                      [
                        0.22,
                        -0.84,
                        0.3,
                      ],
                    lower:
                      [
                        0.12,
                        -1,
                        -0.34,
                      ],
                    foot: flatL,
                  },
                  legR: {
                    upper:
                      [
                        -0.2,
                        -0.85,
                        -0.22,
                      ],
                    lower:
                      [
                        -0.1,
                        -1,
                        -0.3,
                      ],
                    foot: flatR,
                  },
                },
              ),
            },
            // the drive: legs punch the floor away, heels leave it, the torso uncoils up and through
            {
              t: 0.55,
              pose: g(
                {
                  hips: {
                    rot: [
                      0,
                      22,
                      0,
                    ],
                    pos: [
                      0,
                      0.012,
                      0.034,
                    ],
                  },
                  chest:
                    [
                      -6,
                      24,
                      0,
                    ],
                  head: [
                    -6,
                    -10,
                    0,
                  ],
                  shoulderR:
                    SH
                      .R
                      .reach,
                  armR: {
                    upper:
                      [
                        -0.22,
                        -0.3,
                        0.9,
                      ],
                    lower:
                      [
                        -0.1,
                        0.95,
                        0.3,
                      ],
                  },
                  legL: {
                    upper:
                      [
                        0.15,
                        -0.97,
                        0.24,
                      ],
                    lower:
                      [
                        0.1,
                        -1,
                        -0.04,
                      ],
                    foot: toeL(
                      deg(
                        40,
                      ),
                    ),
                  },
                  legR: {
                    upper:
                      [
                        -0.12,
                        -0.98,
                        -0.14,
                      ],
                    lower:
                      [
                        -0.08,
                        -1,
                        -0.02,
                      ],
                    foot: toeR(
                      deg(
                        46,
                      ),
                    ),
                  },
                },
              ),
            },
            {
              t: 0.75,
              pose: g(
                {
                  hips: {
                    rot: [
                      0,
                      20,
                      0,
                    ],
                    pos: [
                      0,
                      0.006,
                      0.026,
                    ],
                  },
                  chest:
                    [
                      -4,
                      20,
                      0,
                    ],
                  head: [
                    -5,
                    -12,
                    0,
                  ],
                  shoulderR:
                    SH
                      .R
                      .reach,
                  armR: {
                    upper:
                      [
                        -0.22,
                        -0.25,
                        0.9,
                      ],
                    lower:
                      [
                        -0.1,
                        0.95,
                        0.25,
                      ],
                  },
                  legL: {
                    upper:
                      [
                        0.15,
                        -0.96,
                        0.26,
                      ],
                    lower:
                      [
                        0.1,
                        -1,
                        -0.06,
                      ],
                    foot: toeL(
                      deg(
                        34,
                      ),
                    ),
                  },
                  legR: {
                    upper:
                      [
                        -0.12,
                        -0.97,
                        -0.16,
                      ],
                    lower:
                      [
                        -0.08,
                        -1,
                        -0.04,
                      ],
                    foot: toeR(
                      deg(
                        38,
                      ),
                    ),
                  },
                },
              ),
            },
            {
              t: 1,
              pose: {},
            },
          ],
      },
    block:
      {
        duration: 1,
        base: GUARD,
        frames:
          [
            0,
            0.5,
            1,
          ].map(
            (
              t,
            ) => ({
              t,
              // tucked in behind both forearms: knees bent, shoulders up round the chin, chin down
              pose: g(
                {
                  hips: {
                    rot: [
                      0,
                      10,
                      0,
                    ],
                    pos: [
                      0,
                      t ===
                      0.5
                        ? -0.04
                        : -0.032,
                      0,
                    ],
                  },
                  chest:
                    [
                      t ===
                      0.5
                        ? 18
                        : 16,
                      0,
                      0,
                    ],
                  head: [
                    t ===
                    0.5
                      ? 18
                      : 15,
                    -6,
                    0,
                  ],
                  shoulderL:
                    SH
                      .L
                      .shrug,
                  shoulderR:
                    SH
                      .R
                      .shrug,
                  armL: {
                    upper:
                      [
                        0.2,
                        -0.45,
                        0.85,
                      ],
                    lower:
                      [
                        0.05,
                        0.9,
                        0.45,
                      ],
                  },
                  armR: {
                    upper:
                      [
                        -0.2,
                        -0.45,
                        0.85,
                      ],
                    lower:
                      [
                        -0.05,
                        0.9,
                        0.45,
                      ],
                  },
                  legL: {
                    upper:
                      [
                        0.18,
                        -0.9,
                        0.24,
                      ],
                    lower:
                      [
                        0.12,
                        -1,
                        -0.22,
                      ],
                    foot: flatL,
                  },
                  legR: {
                    upper:
                      [
                        -0.18,
                        -0.92,
                        -0.14,
                      ],
                    lower:
                      [
                        -0.12,
                        -1,
                        -0.16,
                      ],
                    foot: flatR,
                  },
                },
              ),
            }),
          ),
      },
    hit: {
      duration: 1,
      base: GUARD,
      frames:
        [
          {
            t: 0,
            pose: {},
          },
          // snapped back: the rear foot steps to catch the weight, the shoulders flinch up, the arms fly open
          {
            t: 0.25,
            pose: g(
              {
                hips: {
                  rot: [
                    0,
                    18,
                    0,
                  ],
                  pos: [
                    0,
                    -0.024,
                    -0.064,
                  ],
                },
                chest:
                  [
                    -26,
                    -10,
                    6,
                  ],
                head: [
                  -24,
                  10,
                  0,
                ],
                shoulderL:
                  SH
                    .L
                    .shrug,
                shoulderR:
                  SH
                    .R
                    .shrug,
                armL: {
                  upper:
                    [
                      0.6,
                      -0.6,
                      0.1,
                    ],
                  lower:
                    [
                      0.5,
                      -0.4,
                      0.6,
                    ],
                },
                armR: {
                  upper:
                    [
                      -0.6,
                      -0.6,
                      0.1,
                    ],
                  lower:
                    [
                      -0.5,
                      -0.4,
                      0.6,
                    ],
                },
                legL: {
                  upper:
                    [
                      0.14,
                      -0.96,
                      0.05,
                    ],
                  lower:
                    [
                      0.1,
                      -1,
                      -0.2,
                    ],
                  foot: toeL(
                    deg(
                      30,
                    ),
                  ),
                },
                legR: {
                  upper:
                    [
                      -0.12,
                      -0.9,
                      -0.4,
                    ],
                  lower:
                    [
                      -0.1,
                      -0.92,
                      -0.4,
                    ],
                  foot: flatR,
                },
              },
            ),
          },
          {
            t: 0.6,
            pose: g(
              {
                hips: {
                  rot: [
                    0,
                    14,
                    0,
                  ],
                  pos: [
                    0,
                    -0.016,
                    -0.026,
                  ],
                },
                chest:
                  [
                    -10,
                    -4,
                    2,
                  ],
                head: [
                  -10,
                  4,
                  0,
                ],
                legR: {
                  upper:
                    [
                      -0.13,
                      -0.94,
                      -0.3,
                    ],
                  lower:
                    [
                      -0.1,
                      -0.97,
                      -0.26,
                    ],
                  foot: flatR,
                },
              },
            ),
          },
          {
            t: 1,
            pose: {},
          },
        ],
    },
    stunned:
      {
        duration: 1.4,
        base: GUARD,
        frames:
          [
            0,
            0.5,
            1,
          ].map(
            (
              t,
            ) => {
              const side =
                t ===
                0.5
                  ? -1
                  : 1;
              return {
                t,
                pose: g(
                  {
                    hips: {
                      rot: [
                        0,
                        12,
                        0,
                      ],
                      pos: [
                        0.02 *
                          side,
                        -0.03,
                        0,
                      ],
                    },
                    chest:
                      [
                        10,
                        0,
                        9 *
                          side,
                      ],
                    head: [
                      26,
                      0,
                      -10 *
                        side,
                    ],
                    shoulderL:
                      SH
                        .L
                        .drop,
                    shoulderR:
                      SH
                        .R
                        .drop,
                    armL: {
                      upper:
                        [
                          0.15,
                          -1,
                          0.1,
                        ],
                      lower:
                        [
                          0.1,
                          -1,
                          0.15,
                        ],
                    },
                    armR: {
                      upper:
                        [
                          -0.15,
                          -1,
                          0.1,
                        ],
                      lower:
                        [
                          -0.1,
                          -1,
                          0.15,
                        ],
                    },
                    legL: {
                      upper:
                        [
                          0.18 +
                            0.06 *
                              side,
                          -0.94,
                          0.12,
                        ],
                      lower:
                        [
                          0.1,
                          -1,
                          -0.2,
                        ],
                      foot: flatL,
                    },
                    legR: {
                      upper:
                        [
                          -0.18 +
                            0.06 *
                              side,
                          -0.94,
                          -0.1,
                        ],
                      lower:
                        [
                          -0.1,
                          -1,
                          -0.16,
                        ],
                      foot: flatR,
                    },
                  },
                ),
              };
            },
          ),
      },
    ko: {
      duration: 1,
      base: {},
      frames:
        [
          {
            t: 0,
            pose: g(
              {
                hips: {
                  rot: [
                    0,
                    0,
                    0,
                  ],
                  pos: [
                    0,
                    0,
                    0,
                  ],
                },
              },
            ),
          },
          {
            t: 0.3,
            pose: g(
              {
                hips: {
                  rot: [
                    -20,
                    0,
                    0,
                  ],
                  pos: [
                    0,
                    -0.06,
                    -0.06,
                  ],
                },
                chest:
                  [
                    -15,
                    0,
                    0,
                  ],
                head: [
                  -30,
                  0,
                  0,
                ],
              },
            ),
          },
          {
            t: 0.75,
            pose: g(
              {
                hips: {
                  rot: [
                    -88,
                    0,
                    0,
                  ],
                  pos: [
                    0,
                    -0.44,
                    -0.12,
                  ],
                },
                head: [
                  -10,
                  0,
                  0,
                ],
                armL: {
                  upper:
                    [
                      0.7,
                      -0.3,
                      0.1,
                    ],
                  lower:
                    [
                      0.7,
                      -0.3,
                      0.2,
                    ],
                },
                armR: {
                  upper:
                    [
                      -0.7,
                      -0.3,
                      0.1,
                    ],
                  lower:
                    [
                      -0.7,
                      -0.3,
                      0.2,
                    ],
                },
              },
            ),
          },
          {
            t: 1,
            pose: g(
              {
                hips: {
                  rot: [
                    -90,
                    0,
                    0,
                  ],
                  pos: [
                    0,
                    -0.455,
                    -0.12,
                  ],
                },
                head: [
                  -8,
                  0,
                  0,
                ],
                armL: {
                  upper:
                    [
                      0.75,
                      -0.2,
                      0.1,
                    ],
                  lower:
                    [
                      0.75,
                      -0.2,
                      0.2,
                    ],
                },
                armR: {
                  upper:
                    [
                      -0.75,
                      -0.2,
                      0.1,
                    ],
                  lower:
                    [
                      -0.75,
                      -0.2,
                      0.2,
                    ],
                },
              },
            ),
          },
        ],
    },
    dance:
      {
        duration: 1.2,
        base: GUARD,
        frames:
          [
            0,
            0.25,
            0.5,
            0.75,
            1,
          ].map(
            (
              t,
            ) => {
              const side =
                t ===
                  0 ||
                t ===
                  1
                  ? 1
                  : t ===
                      0.5
                    ? -1
                    : 0;
              const up =
                t ===
                  0.25 ||
                t ===
                  0.75;
              return {
                t,
                pose: g(
                  {
                    hips: {
                      rot: [
                        0,
                        25 *
                          side,
                        0,
                      ],
                      pos: [
                        0.012 *
                          side,
                        up
                          ? 0.012
                          : -0.026,
                        0,
                      ],
                    },
                    chest:
                      [
                        0,
                        -20 *
                          side,
                        8 *
                          side,
                      ],
                    head: [
                      0,
                      20 *
                        side,
                      -6 *
                        side,
                    ],
                    shoulderL:
                      side ===
                      1
                        ? SH
                            .L
                            .shrug
                        : SH
                            .L
                            .rest,
                    shoulderR:
                      side ===
                      -1
                        ? SH
                            .R
                            .shrug
                        : SH
                            .R
                            .rest,
                    armL:
                      side ===
                      1
                        ? {
                            upper:
                              [
                                0.9,
                                0.4,
                                0.1,
                              ],
                            lower:
                              [
                                0.7,
                                0.7,
                                0.2,
                              ],
                          }
                        : {
                            upper:
                              [
                                0.4,
                                -0.9,
                                0.1,
                              ],
                            lower:
                              [
                                0.3,
                                -0.9,
                                0.3,
                              ],
                          },
                    armR:
                      side ===
                      -1
                        ? {
                            upper:
                              [
                                -0.9,
                                0.4,
                                0.1,
                              ],
                            lower:
                              [
                                -0.7,
                                0.7,
                                0.2,
                              ],
                          }
                        : {
                            upper:
                              [
                                -0.4,
                                -0.9,
                                0.1,
                              ],
                            lower:
                              [
                                -0.3,
                                -0.9,
                                0.3,
                              ],
                          },
                    legL: {
                      upper:
                        [
                          0.2 +
                            0.1 *
                              side,
                          -0.94,
                          0.15,
                        ],
                      lower:
                        [
                          0.1,
                          -1,
                          -0.15,
                        ],
                      foot: up
                        ? toeL(
                            deg(
                              36,
                            ),
                          )
                        : flatL,
                    },
                    legR: {
                      upper:
                        [
                          -0.2 +
                            0.1 *
                              side,
                          -0.94,
                          -0.05,
                        ],
                      lower:
                        [
                          -0.1,
                          -1,
                          -0.1,
                        ],
                      foot: up
                        ? toeR(
                            deg(
                              36,
                            ),
                          )
                        : flatR,
                    },
                  },
                ),
              };
            },
          ),
      },
  };
