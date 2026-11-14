// ============================================================
// Boxer's fists and living fingers for the Source skeletons.
//
// sourceClips.ts poses the trunk, arms and legs; every finger bone used to stay in its bind pose — a flat,
// open, rigid hand — in every clip. `applyFists` adds finger tracks to the clips it is given: a closed fist
// in the guard and through every punch (tightening at the strike's peak), a loose fist on the walk, a
// half-open trembling hand when hit or stunned, a limp one when knocked out.
//
// How the curl direction is found (and why there is no per-model table): the three published families
// (TF2 `bip_*`, HL2/Portal ValveBiped, CS:GO `custom_player`) orient their finger bones differently, so a
// "curl about local Y" rule is wrong for some of them. Instead each hand is read from its own bind pose:
//   f  = knuckle → fingertip of the middle finger        (where the hand points)
//   s  = pinky base → index base, made perpendicular to f (toward the thumb side)
//   n  = f × s  for a left hand, s × f for a right hand   (the palm normal — chirality: it holds for any
//        anatomically correct hand, in any pose; a palms-down T-pose left hand has f = +X, s = +Z, n = −Y ✓)
//   k  = f × n                                            (the hinge: rotating about k moves the fingertip
//                                                          along +n, into the palm)
// k is a world axis; each bone gets it in its own frame (inverse of its bind world rotation), so whatever a
// converter did to the bone axes does not matter. The thumb is not a hinge — it wraps OVER the curled fingers —
// so it is solved: with the fingers temporarily curled, a few passes of cyclic-coordinate descent swing its three
// joints (each limited to a human range) until the thumb tip rests on the outside of the curled index finger.
// The solved joint rotations are stored and scaled by the clip's tightness, like the fingers'.
//
// Pure three.js, no DOM: run it on a model in its bind pose (before any mixer touches it).
// ============================================================
import {
  AnimationClip,
  Quaternion,
  QuaternionKeyframeTrack,
  Vector3,
  type Object3D,
} from 'three';
import {
  CLIPS,
  type ClipKey,
} from './clips';
import { normalizeBoneName } from './boneMaps';
import type { BoneFamily } from './models';
import { clamp01 } from '@/lib/core/math';

type Side =
  | 'l'
  | 'r';
const FINGERS =
  [
    'index',
    'middle',
    'ring',
    'pinky',
  ] as const;
type Finger =
  (typeof FINGERS)[number];

/** One hand's finger bones, found by name. `segments` runs knuckle → tip. */
interface HandBones {
  side: Side;
  fingers: Record<
    Finger,
    Object3D[]
  >;
  /** Carpal bones before the knuckle (CS:GO), per finger. */
  metas: Partial<
    Record<
      Finger,
      Object3D
    >
  >;
  thumb: Object3D[];
}

const SEGMENTS =
  [
    0,
    1,
    2,
  ] as const;

/** Names of one finger's bones for a family, knuckle → tip (and the optional meta bone). */
function fingerNames(
  family: BoneFamily,
  side: Side,
  finger:
    | Finger
    | 'thumb',
): {
  chain: string[];
  meta?: string;
} {
  if (
    family ===
    'bip'
  )
    return {
      chain:
        SEGMENTS.map(
          (
            i,
          ) =>
            `bip_${finger}_${i}_${side}`,
        ),
    };
  if (
    family ===
    'csgo'
  ) {
    return {
      chain:
        SEGMENTS.map(
          (
            i,
          ) =>
            `finger_${finger}_${i}_${side}`,
        ),
      meta:
        finger ===
        'thumb'
          ? undefined
          : `finger_${finger}_meta_${side}`,
    };
  }
  // ValveBiped: finger0 = thumb, 1 = index, 2 = middle, 3 = ring, 4 = pinky; sub-bones finger01/02, finger11/12 …
  const n =
    [
      'thumb',
      'index',
      'middle',
      'ring',
      'pinky',
    ].indexOf(
      finger,
    );
  return {
    chain:
      [
        '',
        '1',
        '2',
      ].map(
        (
          seg,
        ) =>
          `valvebiped.bip01_${side}_finger${n}${seg}`,
      ),
  };
}

function findHand(
  byName: Map<
    string,
    Object3D
  >,
  family: BoneFamily,
  side: Side,
): HandBones | null {
  const get =
    (
      name: string,
    ) =>
      byName.get(
        normalizeBoneName(
          name,
        ),
      );
  const chain =
    (
      names: string[],
    ) =>
      names
        .map(
          get,
        )
        .filter(
          (
            b,
          ): b is Object3D =>
            !!b,
        );
  const fingers =
    {} as Record<
      Finger,
      Object3D[]
    >;
  const metas: HandBones['metas'] =
    {};
  for (const f of FINGERS) {
    const {
      chain:
        names,
      meta,
    } =
      fingerNames(
        family,
        side,
        f,
      );
    const bones =
      chain(
        names,
      );
    // a finger needs its whole chain: a partial one has no tip to curl toward
    fingers[
      f
    ] =
      bones.length ===
      names.length
        ? bones
        : [];
    const m =
      meta
        ? get(
            meta,
          )
        : undefined;
    if (
      m
    )
      metas[
        f
      ] =
        m;
  }
  const thumbNames =
    fingerNames(
      family,
      side,
      'thumb',
    ).chain;
  const thumbBones =
    chain(
      thumbNames,
    );
  const thumb =
    thumbBones.length ===
    thumbNames.length
      ? thumbBones
      : [];
  // the hand frame needs the middle finger (direction) plus index and pinky (the thumb side)
  if (
    !fingers
      .middle
      .length ||
    !fingers
      .index
      .length ||
    !fingers
      .pinky
      .length
  )
    return null;
  return {
    side,
    fingers,
    metas,
    thumb,
  };
}

// ── The hand's frame, from its bind pose ──────────────────────────────────────

interface HandFrame {
  /** World hinge axis: rotating about it curls the fingers into the palm. */
  k: Vector3;
  /** World palm normal. */
  n: Vector3;
  /** World direction toward the thumb side. */
  s: Vector3;
  /** World direction the hand points. */
  f: Vector3;
}

const worldPos =
  (
    o: Object3D,
  ) =>
    o.getWorldPosition(
      new Vector3(),
    );

/** The hand's frame, or null for a degenerate hand (fingers on top of each other). */
export function handFrame(
  hand: HandBones,
): HandFrame | null {
  const mid =
    hand
      .fingers
      .middle;
  const f =
    worldPos(
      mid[
        mid.length -
          1
      ],
    ).sub(
      worldPos(
        mid[0],
      ),
    );
  if (
    f.lengthSq() <
    1e-12
  )
    return null;
  f.normalize();
  const s =
    worldPos(
      hand
        .fingers
        .index[0],
    ).sub(
      worldPos(
        hand
          .fingers
          .pinky[0],
      ),
    );
  s.addScaledVector(
    f,
    -s.dot(
      f,
    ),
  ); // perpendicular to f
  if (
    s.lengthSq() <
    1e-12
  )
    return null;
  s.normalize();
  const n =
    hand.side ===
    'l'
      ? new Vector3().crossVectors(
          f,
          s,
        )
      : new Vector3().crossVectors(
          s,
          f,
        );
  const k =
    new Vector3()
      .crossVectors(
        f,
        n,
      )
      .normalize();
  return {
    k,
    n,
    s,
    f,
  };
}

// ── How closed the hand is, per clip ──────────────────────────────────────────

/** Full-fist bend of each segment (degrees): proximal, middle, distal — the knuckles close most, the tip least. */
const CURL_DEG =
  [
    80,
    100,
    62,
  ] as const;
/**
 * The thumb solver's limits (exported so the tuning test can search them): the most each joint may bend
 * (degrees), how far outside the curled finger's axis the thumb tip should rest (as a fraction of the finger's
 * middle-phalanx length), and the passes of coordinate descent. Fitted on the real TF2, HL2 and CS:GO hands by
 * minimising the thumb tip's distance to the curled index finger.
 */
export const THUMB_TUNING =
  {
    maxDeg:
      [
        70,
        85,
        65,
      ] as [
        number,
        number,
        number,
      ],
    clearance: 0.45,
    passes: 14,
  };

/** Carpal cup (CS:GO's meta bones): the ring and pinky metacarpals tuck a little in a fist. */
const META_DEG: Record<
  Finger,
  number
> =
  {
    index: 0,
    middle: 3,
    ring: 8,
    pinky: 13,
  };

/** Each finger closes a touch differently and a touch later: the index leads, the pinky trails. */
const FINGER_CURL: Record<
  Finger,
  number
> =
  {
    index: 1,
    middle: 1,
    ring: 0.96,
    pinky: 0.9,
  };
const FINGER_LAG: Record<
  Finger,
  number
> =
  {
    index: 0,
    middle: 0.012,
    ring: 0.024,
    pinky: 0.04,
  }; // fraction of the clip

/** The punches' peak (fraction of the clip) and which hand throws them. */
const STRIKE: Partial<
  Record<
    ClipKey,
    {
      peak: number;
      hand: Side;
    }
  >
> =
  {
    jab: {
      peak: 0.45,
      hand: 'l',
    },
    cross:
      {
        peak: 0.45,
        hand: 'r',
      },
    hook: {
      peak: 0.62,
      hand: 'l',
    },
    uppercut:
      {
        peak: 0.55,
        hand: 'r',
      },
  };

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

/**
 * How closed the hand is (0 open … 1 full fist) at `u` (0..1 through the clip). Pure and exported for tests.
 * Loops are periodic (the flutter has whole cycles per loop), so the seam does not pop.
 */
export function tightness(
  clip: ClipKey,
  side: Side,
  u: number,
): number {
  const flutter =
    (
      cycles: number,
      amp: number,
      phase = 0,
    ) =>
      Math.sin(
        (u *
          cycles +
          phase) *
          Math.PI *
          2,
      ) *
      amp;
  switch (
    clip
  ) {
    case 'idle':
      return (
        0.92 +
        flutter(
          2,
          0.03,
          side ===
            'l'
            ? 0
            : 0.25,
        )
      ); // a fist that breathes with the bounce
    case 'block':
      return (
        0.97 +
        flutter(
          1,
          0.015,
          side ===
            'l'
            ? 0
            : 0.5,
        )
      ); // clenched behind the gloves
    case 'walk':
    case 'strafe':
      return (
        0.72 +
        flutter(
          2,
          0.05,
          side ===
            'l'
            ? 0
            : 0.5,
        )
      ); // loosens on the move
    case 'jab':
    case 'cross':
    case 'hook':
    case 'uppercut': {
      const strike =
        STRIKE[
          clip
        ]!;
      if (
        strike.hand !==
        side
      )
        return (
          0.9 +
          flutter(
            1,
            0.015,
          )
        ); // the guard hand stays shut
      // the striking fist: relaxed-closed → squeezing on the way out → slammed shut at the peak → easing back
      const rise =
        smooth(
          (u -
            0.05) /
            Math.max(
              0.05,
              strike.peak -
                0.05,
            ),
        );
      const fall =
        smooth(
          (u -
            strike.peak -
            0.05) /
            0.4,
        );
      return (
        0.82 +
        0.18 *
          rise -
        0.1 *
          fall
      );
    }
    case 'hit':
      return (
        0.62 -
        0.4 *
          Math.sin(
            Math.min(
              1,
              u /
                0.45,
            ) *
              Math.PI,
          ) *
          (1 -
            u *
              0.3) +
        flutter(
          5,
          0.05 *
            (1 -
              u),
        )
      );
    case 'stunned':
      return (
        0.34 +
        flutter(
          3,
          0.09,
          side ===
            'l'
            ? 0
            : 0.37,
        )
      ); // slack, trembling
    case 'ko':
      return (
        0.62 -
        0.52 *
          smooth(
            u /
              0.7,
          )
      ); // goes limp and opens
    case 'dance':
      return (
        0.55 +
        flutter(
          2,
          0.1,
          side ===
            'l'
            ? 0
            : 0.5,
        )
      );
    default:
      return 0.8;
  }
}

// ── Building the tracks ───────────────────────────────────────────────────────

const DEG =
  Math.PI /
  180;
/** Keys per second of the finger tracks: the flutter is at most ~5 cycles a second, so 30 keeps it round. */
const KEY_RATE = 30;

interface Joint {
  bone: Object3D;
  /** The bone's rest local rotation. */
  rest: Quaternion;
  /** A hinge joint: the curl axis in the bone's own frame and the full-fist angle (radians). */
  axis?: Vector3;
  full?: number;
  /** A solved joint (the thumb): the full-fist rotation, in the bone's own frame, applied after `rest`. */
  delta?: Quaternion;
  finger:
    | Finger
    | 'thumb';
}

function jointFor(
  bone: Object3D,
  worldAxis: Vector3,
  fullDeg: number,
  finger:
    | Finger
    | 'thumb',
): Joint {
  const worldQuat =
    bone.getWorldQuaternion(
      new Quaternion(),
    );
  // the world hinge, expressed in the bone's frame
  const axis =
    worldAxis
      .clone()
      .applyQuaternion(
        worldQuat
          .clone()
          .invert(),
      )
      .normalize();
  return {
    bone,
    rest: bone.quaternion.clone(),
    axis,
    full:
      fullDeg *
      DEG,
    finger,
  };
}

const clampAngle =
  (
    q: Quaternion,
    maxRad: number,
  ): Quaternion => {
    // keep the short way round, then limit the total angle
    if (
      q.w <
      0
    )
      q.set(
        -q.x,
        -q.y,
        -q.z,
        -q.w,
      );
    const angle =
      2 *
      Math.acos(
        Math.min(
          1,
          q.w,
        ),
      );
    if (
      angle <=
        maxRad ||
      angle <
        1e-9
    )
      return q;
    const s =
      Math.sin(
        maxRad /
          2,
      ) /
      Math.sin(
        angle /
          2,
      );
    return q.set(
      q.x *
        s,
      q.y *
        s,
      q.z *
        s,
      Math.cos(
        maxRad /
          2,
      ),
    );
  };

/**
 * Solve the thumb: with the four fingers curled to a full fist (temporarily — every bone is restored), swing the
 * thumb's three joints by cyclic-coordinate descent until its tip rests just outside the curled index finger's
 * middle phalanx. Returns each thumb bone's rotation (in its own frame, applied after its rest rotation), limited to
 * a human range per joint; null if the thumb is missing or degenerate.
 */
function solveThumb(
  hand: HandBones,
  frame: HandFrame,
  fingerJoints: Joint[],
):
  | Quaternion[]
  | null {
  const thumb =
    hand.thumb;
  if (
    thumb.length <
    3
  )
    return null;
  const rests =
    [
      ...fingerJoints,
      ...thumb.map(
        (
          bone,
        ) => ({
          bone,
          rest: bone.quaternion.clone(),
        }),
      ),
    ];
  const restoreAll =
    () => {
      for (const r of rests)
        r.bone.quaternion.copy(
          r.rest,
        );
      (
        hand
          .fingers
          .index[0]
          .parent ??
        hand
          .fingers
          .index[0]
      ).updateMatrixWorld(
        true,
      );
    };
  // 1. the curled fingers
  for (const j of fingerJoints) {
    if (
      j.axis &&
      j.full !==
        undefined
    )
      j.bone.quaternion
        .copy(
          j.rest,
        )
        .multiply(
          new Quaternion().setFromAxisAngle(
            j.axis,
            j.full,
          ),
        );
  }
  const root =
    hand
      .fingers
      .index[0]
      .parent ??
    hand
      .fingers
      .index[0];
  root.updateMatrixWorld(
    true,
  );

  // 2. the point to reach: the curled index finger's middle phalanx, pushed outward
  const idx =
    hand
      .fingers
      .index;
  const a =
    worldPos(
      idx[1],
    );
  const b =
    worldPos(
      idx[2],
    );
  const phalanx =
    a.distanceTo(
      b,
    );
  const mid =
    a
      .clone()
      .add(
        b,
      )
      .multiplyScalar(
        0.5,
      );
  const palmCentre =
    worldPos(
      hand
        .fingers
        .middle[0],
    )
      .addScaledVector(
        frame.f,
        -phalanx *
          1.2,
      )
      .addScaledVector(
        frame.n,
        phalanx *
          0.4,
      );
  const out =
    mid
      .clone()
      .sub(
        palmCentre,
      );
  out.normalize();
  const goal =
    mid
      .clone()
      .addScaledVector(
        out,
        phalanx *
          THUMB_TUNING.clearance,
      );

  // 3. coordinate descent over the thumb joints, tip → base
  const tipOf =
    () => {
      const p2 =
        worldPos(
          thumb[2],
        );
      return p2
        .clone()
        .add(
          p2
            .clone()
            .sub(
              worldPos(
                thumb[1],
              ),
            ),
        );
    };
  const deltas =
    thumb.map(
      () =>
        new Quaternion(),
    );
  const rest =
    thumb.map(
      (
        t,
      ) =>
        t.quaternion.clone(),
    );
  const maxRad =
    THUMB_TUNING.maxDeg.map(
      (
        d,
      ) =>
        d *
        DEG,
    );
  for (
    let pass = 0;
    pass <
    THUMB_TUNING.passes;
    pass++
  ) {
    for (
      let j = 2;
      j >=
      0;
      j--
    ) {
      const bone =
        thumb[
          j
        ];
      const pivot =
        worldPos(
          bone,
        );
      const toTip =
        tipOf().sub(
          pivot,
        );
      const toGoal =
        goal
          .clone()
          .sub(
            pivot,
          );
      if (
        toTip.lengthSq() <
          1e-14 ||
        toGoal.lengthSq() <
          1e-14
      )
        continue;
      const world =
        new Quaternion().setFromUnitVectors(
          toTip.normalize(),
          toGoal.normalize(),
        );
      // world rotation → this bone's local frame: q_new = parentW⁻¹ · Δw · parentW · q_old
      const parentW =
        bone.parent
          ? bone.parent.getWorldQuaternion(
              new Quaternion(),
            )
          : new Quaternion();
      const local =
        parentW
          .clone()
          .invert()
          .multiply(
            world,
          )
          .multiply(
            parentW,
          );
      const qNew =
        local.multiply(
          bone.quaternion,
        );
      // relative to the rest pose, limited to this joint's range (half of each step, so the three share the work)
      const delta =
        rest[
          j
        ]
          .clone()
          .invert()
          .multiply(
            qNew,
          );
      clampAngle(
        delta,
        maxRad[
          j
        ],
      );
      deltas[
        j
      ].copy(
        delta,
      );
      bone.quaternion
        .copy(
          rest[
            j
          ],
        )
        .multiply(
          delta,
        );
      bone.updateMatrixWorld(
        true,
      );
    }
  }
  const result =
    deltas.map(
      (
        d,
      ) =>
        d.clone(),
    );
  restoreAll();
  return result;
}

function handJoints(
  hand: HandBones,
): Joint[] {
  const frame =
    handFrame(
      hand,
    );
  if (
    !frame
  )
    return [];
  const out: Joint[] =
    [];
  for (const f of FINGERS) {
    const chain =
      hand
        .fingers[
        f
      ];
    chain.forEach(
      (
        bone,
        i,
      ) =>
        out.push(
          jointFor(
            bone,
            frame.k,
            CURL_DEG[
              i
            ] *
              FINGER_CURL[
                f
              ],
            f,
          ),
        ),
    );
    const meta =
      hand
        .metas[
        f
      ];
    if (
      meta &&
      META_DEG[
        f
      ] >
        0
    )
      out.push(
        jointFor(
          meta,
          frame.k,
          META_DEG[
            f
          ],
          f,
        ),
      );
  }
  const deltas =
    solveThumb(
      hand,
      frame,
      out,
    );
  if (
    deltas
  )
    hand.thumb.forEach(
      (
        bone,
        i,
      ) =>
        out.push(
          {
            bone,
            rest: bone.quaternion.clone(),
            delta:
              deltas[
                i
              ],
            finger:
              'thumb',
          },
        ),
    );
  return out;
}

/** Index every named node of the model once. */
function indexBones(
  model: Object3D,
): Map<
  string,
  Object3D
> {
  const map =
    new Map<
      string,
      Object3D
    >();
  model.traverse(
    (
      o,
    ) => {
      const k =
        normalizeBoneName(
          o.name,
        );
      if (
        k &&
        !map.has(
          k,
        )
      )
        map.set(
          k,
          o,
        );
    },
  );
  return map;
}

/**
 * Add finger tracks to every clip in `clips` (mutating each clip's `tracks`). `model` must be in its bind pose
 * and placed (its world matrices current); the hands are read from it, once. A skeleton with no fingers, or a
 * hand missing a finger, is skipped without error — those bones simply stay in the bind pose.
 */
export function applyFists(
  clips: Partial<
    Record<
      ClipKey,
      AnimationClip
    >
  >,
  model: Object3D,
  family: BoneFamily,
): void {
  model.updateMatrixWorld(
    true,
  );
  const bones =
    indexBones(
      model,
    );
  const joints: {
    side: Side;
    joint: Joint;
  }[] =
    [];
  for (const side of [
    'l',
    'r',
  ] as const) {
    const hand =
      findHand(
        bones,
        family,
        side,
      );
    if (
      !hand
    )
      continue;
    for (const joint of handJoints(
      hand,
    ))
      joints.push(
        {
          side,
          joint,
        },
      );
  }
  if (
    !joints.length
  )
    return;

  const q =
    new Quaternion();
  for (const key of Object.keys(
    clips,
  ) as ClipKey[]) {
    const clip =
      clips[
        key
      ];
    if (
      !clip
    )
      continue;
    const duration =
      clip.duration;
    if (
      !(
        duration >
        0
      )
    )
      continue;
    const loop =
      CLIPS[
        key
      ]
        .loop;
    const n =
      Math.max(
        3,
        Math.ceil(
          duration *
            KEY_RATE,
        ) +
          1,
      );
    const times =
      Array.from(
        {
          length:
            n,
        },
        (
          _,
          i,
        ) =>
          (i /
            (n -
              1)) *
          duration,
      );
    for (const {
      side,
      joint,
    } of joints) {
      const lag =
        joint.finger ===
        'thumb'
          ? 0.02
          : FINGER_LAG[
              joint
                .finger
            ];
      const values: number[] =
        [];
      for (
        let i = 0;
        i <
        n;
        i++
      ) {
        const u =
          i /
          (n -
            1);
        // a lagging finger samples the hand's closure a little earlier (wrapping for loops, clamped for one-shots)
        const lagged =
          loop
            ? (((u -
                lag) %
                1) +
                1) %
              1
            : Math.max(
                0,
                u -
                  lag,
              );
        // a loop's last key is its first: sample the lagged position of u=1 as u=0
        const t =
          clamp01(
            loop &&
              i ===
                n -
                  1
              ? tightness(
                  key,
                  side,
                  (((0 -
                    lag) %
                    1) +
                    1) %
                    1,
                )
              : tightness(
                  key,
                  side,
                  lagged,
                ),
          );
        if (
          joint.delta
        )
          q.identity().slerp(
            joint.delta,
            t,
          );
        else
          q.setFromAxisAngle(
            joint.axis!,
            joint.full! *
              t,
          );
        const out =
          joint.rest
            .clone()
            .multiply(
              q,
            );
        values.push(
          out.x,
          out.y,
          out.z,
          out.w,
        );
      }
      // hemisphere-consistent keys so three's slerp takes the short way
      for (
        let i = 4;
        i <
        values.length;
        i += 4
      ) {
        const dot =
          values[
            i
          ] *
            values[
              i -
                4
            ] +
          values[
            i +
              1
          ] *
            values[
              i -
                3
            ] +
          values[
            i +
              2
          ] *
            values[
              i -
                2
            ] +
          values[
            i +
              3
          ] *
            values[
              i -
                1
            ];
        if (
          dot <
          0
        )
          for (
            let c = 0;
            c <
            4;
            c++
          )
            values[
              i +
                c
            ] =
              -values[
                i +
                  c
              ];
      }
      const name = `${joint.bone.name}.quaternion`;
      if (
        clip.tracks.some(
          (
            t,
          ) =>
            t.name ===
            name,
        )
      )
        continue; // never fight an authored track
      clip.tracks.push(
        new QuaternionKeyframeTrack(
          name,
          times,
          values,
        ),
      );
    }
  }
}
