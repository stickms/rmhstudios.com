import * as THREE from 'three';

/** Uniformly scale `obj` so its world-space bounding-box height becomes
 *  `targetHeight`. Robust to whatever units the Mixamo FBX export uses
 *  (~100×). Returns the scale applied (1 if the box has no height). */
export function autoScaleToHeight(
  obj: THREE.Object3D,
  targetHeight: number,
): number {
  const box =
    new THREE.Box3().setFromObject(
      obj,
    );
  const height =
    box
      .max
      .y -
    box
      .min
      .y;
  if (
    !Number.isFinite(
      height,
    ) ||
    height <=
      0
  )
    return 1;
  const s =
    targetHeight /
    height;
  obj.scale.multiplyScalar(
    s,
  );
  return s;
}

/** First descendant of `root` whose name equals any of `names` (handles the
 *  `mixamorigHips` vs `mixamorig:Hips` conversion variants). */
export function findBone(
  root: THREE.Object3D,
  names: string[],
):
  | THREE.Object3D
  | undefined {
  for (const n of names) {
    const found =
      root.getObjectByName(
        n,
      );
    if (
      found
    )
      return found;
  }
  return undefined;
}

/**
 * The yaw (radians, about +Y) that turns a model so its left side lies on +X — which, with Y up,
 * makes it face +Z, the way every fighter renderer expects. `left` and `right` are world positions
 * of the character's left and right shoulders (or hips). The model-axes hull detection can leave a
 * character turned a quarter (HL2's humans come out facing sideways), so the skeleton, not the
 * detection, has the last word. Returns 0 when the two points are (nearly) on the vertical axis.
 */
export function lateralYaw(
  left: THREE.Vector3,
  right: THREE.Vector3,
): number {
  const vx =
    left.x -
    right.x;
  const vz =
    left.z -
    right.z;
  if (
    Math.hypot(
      vx,
      vz,
    ) <
    1e-6
  )
    return 0;
  return Math.atan2(
    vz,
    vx,
  );
}
