// ============================================================
// Source skeleton bone maps — logical humanoid joint -> bone name.
//
// The three families the converters publish:
//   bip         TF2 player bodies           bip_pelvis, bip_upperArm_L, bip_hip_R …
//   valvebiped  HL2 / Portal characters     ValveBiped.Bip01_L_UpperArm …
//   csgo        CS:GO custom_player models  pelvis, arm_upper_L, leg_upper_R …
// Names are compared case- and punctuation-insensitively: GLTFLoader sanitises
// node names (`ValveBiped.Bip01_Pelvis` -> `ValveBipedBip01_Pelvis`), and a
// converter may change case. A joint a skeleton lacks is simply absent.
// ============================================================
import type { Object3D } from 'three';
import type { BoneFamily } from './models';

export const JOINTS =
  [
    'hips',
    'spine',
    'chest',
    'neck',
    'head',
    'shoulderL',
    'shoulderR',
    'upperArmL',
    'foreArmL',
    'upperArmR',
    'foreArmR',
    'thighL',
    'shinL',
    'footL',
    'thighR',
    'shinR',
    'footR',
  ] as const;
export type JointName =
  (typeof JOINTS)[number];
export type RigJoints =
  Partial<
    Record<
      JointName,
      Object3D
    >
  >;

type Candidates =
  Record<
    JointName,
    string[]
  >;

const VB =
  'ValveBiped.Bip01_';

export const BONE_NAMES: Record<
  BoneFamily,
  Candidates
> =
  {
    bip: {
      hips: [
        'bip_pelvis',
        'bip_hip',
      ],
      spine:
        [
          'bip_spine_0',
          'bip_spine_1',
        ],
      chest:
        [
          'bip_spine_2',
          'bip_spine_3',
          'bip_spine_1',
        ],
      neck: [
        'bip_neck',
      ],
      head: [
        'bip_head',
      ],
      shoulderL:
        [
          'bip_collar_L',
        ],
      shoulderR:
        [
          'bip_collar_R',
        ],
      upperArmL:
        [
          'bip_upperArm_L',
        ],
      foreArmL:
        [
          'bip_lowerArm_L',
        ],
      upperArmR:
        [
          'bip_upperArm_R',
        ],
      foreArmR:
        [
          'bip_lowerArm_R',
        ],
      thighL:
        [
          'bip_hip_L',
        ],
      shinL:
        [
          'bip_knee_L',
        ],
      footL:
        [
          'bip_foot_L',
        ],
      thighR:
        [
          'bip_hip_R',
        ],
      shinR:
        [
          'bip_knee_R',
        ],
      footR:
        [
          'bip_foot_R',
        ],
    },
    valvebiped:
      {
        hips: [
          `${VB}Pelvis`,
        ],
        spine:
          [
            `${VB}Spine`,
            `${VB}Spine1`,
          ],
        chest:
          [
            `${VB}Spine2`,
            `${VB}Spine4`,
            `${VB}Spine1`,
          ],
        neck: [
          `${VB}Neck1`,
        ],
        head: [
          `${VB}Head1`,
        ],
        shoulderL:
          [
            `${VB}L_Clavicle`,
          ],
        shoulderR:
          [
            `${VB}R_Clavicle`,
          ],
        upperArmL:
          [
            `${VB}L_UpperArm`,
          ],
        foreArmL:
          [
            `${VB}L_Forearm`,
          ],
        upperArmR:
          [
            `${VB}R_UpperArm`,
          ],
        foreArmR:
          [
            `${VB}R_Forearm`,
          ],
        thighL:
          [
            `${VB}L_Thigh`,
          ],
        shinL:
          [
            `${VB}L_Calf`,
          ],
        footL:
          [
            `${VB}L_Foot`,
          ],
        thighR:
          [
            `${VB}R_Thigh`,
          ],
        shinR:
          [
            `${VB}R_Calf`,
          ],
        footR:
          [
            `${VB}R_Foot`,
          ],
      },
    csgo: {
      hips: [
        'pelvis',
      ],
      spine:
        [
          'spine_0',
          'spine_1',
        ],
      chest:
        [
          'spine_2',
          'spine_3',
          'spine_1',
        ],
      neck: [
        'neck_0',
      ],
      head: [
        'head_0',
      ],
      shoulderL:
        [
          'clavicle_L',
        ],
      shoulderR:
        [
          'clavicle_R',
        ],
      upperArmL:
        [
          'arm_upper_L',
        ],
      foreArmL:
        [
          'arm_lower_L',
        ],
      upperArmR:
        [
          'arm_upper_R',
        ],
      foreArmR:
        [
          'arm_lower_R',
        ],
      thighL:
        [
          'leg_upper_L',
        ],
      shinL:
        [
          'leg_lower_L',
        ],
      footL:
        [
          'ankle_L',
        ],
      thighR:
        [
          'leg_upper_R',
        ],
      shinR:
        [
          'leg_lower_R',
        ],
      footR:
        [
          'ankle_R',
        ],
    },
  };

/** Lower-case, alphanumerics only: `ValveBiped.Bip01_Pelvis` and `ValveBipedBip01_Pelvis` match. */
export const normalizeBoneName =
  (
    n: string,
  ): string =>
    n
      .toLowerCase()
      .replace(
        /[^a-z0-9]/g,
        '',
      );

/** Find each joint's bone under `root`. Missing joints are omitted; never throws. */
export function resolveRig(
  root: Object3D,
  family: BoneFamily,
): RigJoints {
  const byName =
    new Map<
      string,
      Object3D
    >();
  root.traverse(
    (
      o,
    ) => {
      const k =
        normalizeBoneName(
          o.name,
        );
      if (
        k &&
        !byName.has(
          k,
        )
      )
        byName.set(
          k,
          o,
        );
    },
  );
  const rig: RigJoints =
    {};
  for (const joint of JOINTS) {
    for (const cand of BONE_NAMES[
      family
    ][
      joint
    ]) {
      const hit =
        byName.get(
          normalizeBoneName(
            cand,
          ),
        );
      if (
        hit
      ) {
        rig[
          joint
        ] =
          hit;
        break;
      }
    }
  }
  return rig;
}
