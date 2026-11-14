// ============================================================
// Build AnimationClips for a Source skeleton from the authored pose library.
//
// The skeleton must be in its bind pose, attached under its final transforms
// (frame rotation + uniform scale) with `updateMatrixWorld(true)` already run:
// every pose is solved from the bones' REST world orientation, which is what
// makes the same data work on a T-posed Combine and an A-posed Heavy.
//
//  - Limb segments aim at a character-space direction: the segment's rest
//    direction (bone -> its child) is rotated onto the target, twist untouched.
//  - Trunk joints take a character-space Euler offset on top of rest.
//  - A joint a keyframe doesn't mention keeps its rest local rotation, so it
//    follows its parent (hands follow forearms, the head follows the spine).
// Only joints that some keyframe of the clip mentions get tracks.
// ============================================================
import {
  AnimationClip,
  Euler,
  MathUtils,
  Quaternion,
  QuaternionKeyframeTrack,
  Vector3,
  VectorKeyframeTrack,
  type KeyframeTrack,
  type Object3D,
} from 'three';
import {
  CLIPS,
  CLIP_KEYS,
  type ClipKey,
} from './clips';
import {
  JOINTS,
  type JointName,
  type RigJoints,
} from './boneMaps';
import {
  POSE_CLIPS,
  type Limb2,
  type Pose,
  type Vec3,
} from './sourcePoses';
import {
  fixHemisphere,
  smoothQuaternions,
  smoothVectors,
} from './smooth';

export interface ClipBuildOptions {
  /** Character height in metres after scaling (hips displacement is a fraction of it). */
  height: number;
  /** The uniform scale between the GLB's bone units and metres (scaleGroup.scale.x). */
  worldScale: number;
}

interface LimbSpec {
  upper: JointName;
  lower: JointName;
  foot?: JointName;
  pose:
    | 'armL'
    | 'armR'
    | 'legL'
    | 'legR';
  ref:
    | 'chest'
    | 'hips';
}
const LIMBS: LimbSpec[] =
  [
    {
      upper:
        'upperArmL',
      lower:
        'foreArmL',
      pose: 'armL',
      ref: 'chest',
    },
    {
      upper:
        'upperArmR',
      lower:
        'foreArmR',
      pose: 'armR',
      ref: 'chest',
    },
    {
      upper:
        'thighL',
      lower:
        'shinL',
      foot: 'footL',
      pose: 'legL',
      ref: 'hips',
    },
    {
      upper:
        'thighR',
      lower:
        'shinR',
      foot: 'footR',
      pose: 'legR',
      ref: 'hips',
    },
  ];
const TRUNK: {
  joint:
    | 'spine'
    | 'chest'
    | 'neck'
    | 'head';
  pose:
    | 'spine'
    | 'chest'
    | 'neck'
    | 'head';
}[] =
  [
    {
      joint:
        'spine',
      pose: 'spine',
    },
    {
      joint:
        'chest',
      pose: 'chest',
    },
    {
      joint:
        'neck',
      pose: 'neck',
    },
    {
      joint:
        'head',
      pose: 'head',
    },
  ];
/** Collar bones: aimed by direction relative to the chest, solved before the arms that hang off them. */
const SHOULDERS: {
  joint:
    | 'shoulderL'
    | 'shoulderR';
  pose:
    | 'shoulderL'
    | 'shoulderR';
}[] =
  [
    {
      joint:
        'shoulderL',
      pose: 'shoulderL',
    },
    {
      joint:
        'shoulderR',
      pose: 'shoulderR',
    },
  ];

const worldQuat =
  (
    o: Object3D,
  ): Quaternion =>
    o.getWorldQuaternion(
      new Quaternion(),
    );
const worldPos =
  (
    o: Object3D,
  ): Vector3 =>
    o.getWorldPosition(
      new Vector3(),
    );
const eulerQuat =
  (
    v: Vec3,
  ): Quaternion =>
    new Quaternion().setFromEuler(
      new Euler(
        MathUtils.degToRad(
          v[0],
        ),
        MathUtils.degToRad(
          v[1],
        ),
        MathUtils.degToRad(
          v[2],
        ),
        'XYZ',
      ),
    );

/** Source's "left" bones sit on +X in character space; some models are mirrored — swap sides then. */
export function normalizeSides(
  rig: RigJoints,
): RigJoints {
  const l =
    rig.upperArmL ??
    rig.thighL;
  const r =
    rig.upperArmR ??
    rig.thighR;
  if (
    !l ||
    !r
  )
    return rig;
  if (
    worldPos(
      l,
    )
      .x >=
    worldPos(
      r,
    )
      .x
  )
    return rig;
  const swap =
    (
      a: JointName,
      b: JointName,
    ) => {
      const t =
        rig[
          a
        ];
      rig[
        a
      ] =
        rig[
          b
        ];
      rig[
        b
      ] =
        t;
    };
  swap(
    'upperArmL',
    'upperArmR',
  );
  swap(
    'foreArmL',
    'foreArmR',
  );
  swap(
    'thighL',
    'thighR',
  );
  swap(
    'shinL',
    'shinR',
  );
  swap(
    'footL',
    'footR',
  );
  return {
    ...rig,
  };
}

function mergePose(
  base: Pose,
  over: Pose,
): Pose {
  // Limbs merge per segment (an override of just `lower` keeps the base's `upper`); everything else replaces.
  const limb =
    (
      a:
        | Limb2
        | undefined,
      b:
        | Limb2
        | undefined,
    ):
      | Limb2
      | undefined =>
      a &&
      b
        ? {
            ...a,
            ...b,
          }
        : (b ??
          a);
  return {
    ...base,
    ...over,
    hips: {
      ...base.hips,
      ...over.hips,
    },
    armL: limb(
      base.armL,
      over.armL,
    ),
    armR: limb(
      base.armR,
      over.armR,
    ),
    legL: limb(
      base.legL,
      over.legL,
    ),
    legR: limb(
      base.legR,
      over.legR,
    ),
  };
}

/** The bone a segment points at: the mapped lower joint, else its first bone child. */
function childOf(
  rig: RigJoints,
  joint: JointName,
  lower: JointName | null,
):
  | Object3D
  | undefined {
  if (
    lower &&
    rig[
      lower
    ]
  )
    return rig[
      lower
    ];
  return (
    rig[
      joint
    ]?.children.find(
      (
        c,
      ) =>
        (
          c as {
            isBone?: boolean;
          }
        )
          .isBone,
    ) ??
    rig[
      joint
    ]
      ?.children[0]
  );
}

export function buildSourceClips(
  rigIn: RigJoints,
  opts: ClipBuildOptions,
): Partial<
  Record<
    ClipKey,
    AnimationClip
  >
> {
  const rig =
    normalizeSides(
      {
        ...rigIn,
      },
    );
  const hips =
    rig.hips;
  if (
    !hips
  )
    return {}; // not a skeleton we can pose
  const top =
    hips.parent;

  // Rest data, captured once.
  const restWorld =
    new Map<
      Object3D,
      Quaternion
    >();
  const restLocal =
    new Map<
      Object3D,
      Quaternion
    >();
  const capture =
    (
      o: Object3D,
    ) => {
      restWorld.set(
        o,
        worldQuat(
          o,
        ),
      );
      restLocal.set(
        o,
        o.quaternion.clone(),
      );
    };
  for (const j of JOINTS)
    if (
      rig[
        j
      ]
    )
      capture(
        rig[
          j
        ]!,
      );
  hips.traverse(
    capture,
  );
  for (
    let p =
      top;
    p;
    p =
      p.parent
  )
    restWorld.set(
      p,
      worldQuat(
        p,
      ),
    );

  const restDir =
    new Map<
      JointName,
      Vector3
    >();
  for (const l of LIMBS) {
    const segments: [
      JointName,
      JointName | null,
    ][] =
      [
        [
          l.upper,
          l.lower,
        ],
        [
          l.lower,
          l.foot ??
            null,
        ],
      ];
    if (
      l.foot
    )
      segments.push(
        [
          l.foot,
          null,
        ],
      );
    for (const [
      j,
      lower,
    ] of segments) {
      const b =
        rig[
          j
        ];
      const c =
        childOf(
          rig,
          j,
          lower,
        );
      if (
        !b ||
        !c
      )
        continue;
      const d =
        worldPos(
          c,
        ).sub(
          worldPos(
            b,
          ),
        );
      if (
        d.lengthSq() >
        1e-10
      )
        restDir.set(
          j,
          d.normalize(),
        );
    }
  }
  for (const sh of SHOULDERS) {
    const b =
      rig[
        sh
          .joint
      ];
    const c =
      childOf(
        rig,
        sh.joint,
        sh.joint ===
          'shoulderL'
          ? 'upperArmL'
          : 'upperArmR',
      );
    if (
      !b ||
      !c
    )
      continue;
    const d =
      worldPos(
        c,
      ).sub(
        worldPos(
          b,
        ),
      );
    if (
      d.lengthSq() >
      1e-10
    )
      restDir.set(
        sh.joint,
        d.normalize(),
      );
  }
  const hipsRestLocalPos =
    hips.position.clone();

  const out: Partial<
    Record<
      ClipKey,
      AnimationClip
    >
  > =
    {};
  for (const key of CLIP_KEYS) {
    const def =
      POSE_CLIPS[
        key
      ];
    const frames =
      def.frames.map(
        (
          f,
        ) => ({
          t: f.t,
          pose: mergePose(
            def.base,
            f.pose,
          ),
        }),
      );

    // Per-keyframe solved world orientations -> local quaternions per mapped joint.
    const joints =
      new Set<JointName>();
    const addJoint =
      (
        j: JointName,
      ) => {
        if (
          rig[
            j
          ]
        )
          joints.add(
            j,
          );
      }; // a bone the skeleton lacks is never animated
    for (const {
      pose,
    } of frames) {
      if (
        pose
          .hips
          ?.rot ||
        pose
          .hips
          ?.pos
      )
        addJoint(
          'hips',
        );
      for (const t of TRUNK)
        if (
          pose[
            t
              .pose
          ]
        )
          addJoint(
            t.joint,
          );
      for (const sh of SHOULDERS)
        if (
          pose[
            sh
              .pose
          ]
        )
          addJoint(
            sh.joint,
          );
      for (const l of LIMBS) {
        const limb =
          pose[
            l
              .pose
          ];
        if (
          limb
        ) {
          addJoint(
            l.upper,
          );
          addJoint(
            l.lower,
          );
          if (
            l.foot &&
            limb.foot
          )
            addJoint(
              l.foot,
            );
        }
      }
    }
    const times =
      frames.map(
        (
          f,
        ) =>
          f.t *
          def.duration,
      );
    const qValues =
      new Map<
        JointName,
        number[]
      >();
    const hipsPos: number[] =
      [];

    for (const {
      pose,
    } of frames) {
      const current =
        new Map<
          Object3D,
          Quaternion
        >();
      const solved =
        new Map<
          JointName,
          Quaternion
        >();

      const Wp =
        (
          o: Object3D,
        ): Quaternion => {
          const hit =
            current.get(
              o,
            );
          if (
            hit
          )
            return hit;
          let q: Quaternion;
          if (
            o ===
              top ||
            !o.parent ||
            !hips.parent ||
            !isUnder(
              o,
              hips,
            )
          ) {
            q =
              restWorld.get(
                o,
              ) ??
              worldQuat(
                o,
              );
          } else {
            q =
              Wp(
                o.parent!,
              )
                .clone()
                .multiply(
                  restLocal.get(
                    o,
                  ) ??
                    o.quaternion,
                );
          }
          current.set(
            o,
            q,
          );
          return q;
        };
      const place =
        (
          j: JointName,
          d: Quaternion,
        ) => {
          const b =
            rig[
              j
            ]!;
          const w =
            d
              .clone()
              .multiply(
                restWorld.get(
                  b,
                )!,
              );
          current.set(
            b,
            w,
          );
          solved.set(
            j,
            Wp(
              b.parent!,
            )
              .clone()
              .invert()
              .multiply(
                w,
              ),
          );
        };

      if (
        hips &&
        (pose
          .hips
          ?.rot ||
          pose
            .hips
            ?.pos)
      ) {
        place(
          'hips',
          pose
            .hips
            .rot
            ? eulerQuat(
                pose
                  .hips
                  .rot,
              )
            : new Quaternion(),
        );
        const p =
          pose
            .hips
            .pos ?? [
            0,
            0,
            0,
          ];
        const v =
          new Vector3(
            p[0],
            p[1],
            p[2],
          ).multiplyScalar(
            opts.height,
          );
        const local =
          v
            .applyQuaternion(
              Wp(
                hips.parent!,
              )
                .clone()
                .invert(),
            )
            .multiplyScalar(
              1 /
                opts.worldScale,
            );
        hipsPos.push(
          hipsRestLocalPos.x +
            local.x,
          hipsRestLocalPos.y +
            local.y,
          hipsRestLocalPos.z +
            local.z,
        );
      } else if (
        joints.has(
          'hips',
        )
      ) {
        hipsPos.push(
          hipsRestLocalPos.x,
          hipsRestLocalPos.y,
          hipsRestLocalPos.z,
        );
        solved.set(
          'hips',
          restLocal
            .get(
              hips,
            )!
            .clone(),
        );
      }
      for (const t of TRUNK) {
        const b =
          rig[
            t
              .joint
          ];
        if (
          !b ||
          !joints.has(
            t.joint,
          )
        )
          continue;
        const v =
          pose[
            t
              .pose
          ];
        if (
          v
        )
          place(
            t.joint,
            eulerQuat(
              v,
            ),
          );
        else
          solved.set(
            t.joint,
            restLocal
              .get(
                b,
              )!
              .clone(),
          );
      }
      for (const sh of SHOULDERS) {
        const b =
          rig[
            sh
              .joint
          ];
        if (
          !b ||
          !joints.has(
            sh.joint,
          )
        )
          continue;
        const vec =
          pose[
            sh
              .pose
          ];
        const rd =
          restDir.get(
            sh.joint,
          );
        if (
          !vec ||
          !rd
        ) {
          solved.set(
            sh.joint,
            restLocal
              .get(
                b,
              )!
              .clone(),
          );
          continue;
        }
        const chestBone =
          rig.chest ??
          rig.spine ??
          rig.hips;
        const chestDelta =
          chestBone
            ? Wp(
                chestBone,
              )
                .clone()
                .multiply(
                  restWorld
                    .get(
                      chestBone,
                    )!
                    .clone()
                    .invert(),
                )
            : new Quaternion();
        const target =
          new Vector3(
            vec[0],
            vec[1],
            vec[2],
          )
            .normalize()
            .applyQuaternion(
              chestDelta,
            );
        place(
          sh.joint,
          new Quaternion().setFromUnitVectors(
            rd,
            target,
          ),
        );
      }
      for (const l of LIMBS) {
        const limb:
          | Limb2
          | undefined =
          pose[
            l
              .pose
          ];
        const refBone =
          rig[
            l
              .ref
          ] ??
          rig.spine ??
          rig.hips;
        // How far the torso (or pelvis, for legs) has turned from rest, including what it
        // inherits: arms and legs are authored relative to it.
        const refDelta =
          refBone
            ? Wp(
                refBone,
              )
                .clone()
                .multiply(
                  restWorld
                    .get(
                      refBone,
                    )!
                    .clone()
                    .invert(),
                )
            : new Quaternion();
        const segs: [
          JointName,
          (
            | Vec3
            | undefined
          ),
        ][] =
          [
            [
              l.upper,
              limb?.upper,
            ],
            [
              l.lower,
              limb?.lower,
            ],
          ];
        if (
          l.foot
        )
          segs.push(
            [
              l.foot,
              limb?.foot,
            ],
          );
        for (const [
          j,
          vec,
        ] of segs) {
          const b =
            rig[
              j
            ];
          if (
            !b ||
            !joints.has(
              j,
            )
          )
            continue;
          const rd =
            restDir.get(
              j,
            );
          if (
            !vec ||
            !rd
          ) {
            solved.set(
              j,
              restLocal
                .get(
                  b,
                )!
                .clone(),
            );
            continue;
          }
          const target =
            new Vector3(
              vec[0],
              vec[1],
              vec[2],
            )
              .normalize()
              .applyQuaternion(
                refDelta,
              );
          place(
            j,
            new Quaternion().setFromUnitVectors(
              rd,
              target,
            ),
          );
        }
      }
      for (const j of joints) {
        const q =
          solved.get(
            j,
          ) ??
          restLocal.get(
            rig[
              j
            ]!,
          )!;
        let arr =
          qValues.get(
            j,
          );
        if (
          !arr
        ) {
          arr =
            [];
          qValues.set(
            j,
            arr,
          );
        }
        arr.push(
          q.x,
          q.y,
          q.z,
          q.w,
        );
      }
    }

    // The solved poses are the keys; bake a smooth curve through them (smooth.ts) so limbs ease through each
    // pose instead of changing speed at it — that is what read as animations that "cut and stop".
    const loop =
      CLIPS[
        key
      ]
        .loop;
    const tracks: KeyframeTrack[] =
      [];
    for (const [
      j,
      values,
    ] of qValues) {
      const b =
        rig[
          j
        ]!;
      const baked =
        smoothQuaternions(
          times,
          fixHemisphere(
            values,
          ),
          loop,
        );
      tracks.push(
        new QuaternionKeyframeTrack(
          `${b.name}.quaternion`,
          baked.times,
          baked.values,
        ),
      );
    }
    if (
      hipsPos.length ===
      times.length *
        3
    ) {
      const baked =
        smoothVectors(
          times,
          hipsPos,
          loop,
        );
      tracks.push(
        new VectorKeyframeTrack(
          `${hips.name}.position`,
          baked.times,
          baked.values,
        ),
      );
    }
    if (
      tracks.length
    )
      out[
        key
      ] =
        new AnimationClip(
          `kk_${key}`,
          def.duration,
          tracks,
        );
  }
  return out;
}

function isUnder(
  o: Object3D,
  ancestor: Object3D,
): boolean {
  for (
    let p: Object3D | null =
      o;
    p;
    p =
      p.parent
  )
    if (
      p ===
      ancestor
    )
      return true;
  return false;
}
