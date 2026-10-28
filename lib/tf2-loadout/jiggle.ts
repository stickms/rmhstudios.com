/**
 * Source jiggle bones, simulated on a cosmetic's skeleton (the sync writes each flexible one into the
 * GLB's `userData.jiggle`). Each bone has a tip `length` out along its own X axis; the tip is a mass on
 * springs that pull it back to where the animation puts it, so it lags and swings when the body moves —
 * the game's own model, minus its base spring and yaw/pitch limits.
 */

import { Matrix4, Quaternion, Vector3, type Object3D } from 'three';

export interface JiggleSpec {
  bone: string;
  /** Tip distance from the bone, in model units. */
  length: number;
  yawStiffness: number;
  yawDamping: number;
  pitchStiffness: number;
  pitchDamping: number;
  alongStiffness: number;
  alongDamping: number;
  /** Largest swing away from the animated direction, in radians; 0 when the model sets none. */
  angleLimit: number;
}

/** One bone's spring state: the tip, in world space. */
export interface JiggleBone {
  spec: JiggleSpec;
  node: Object3D;
  rest: Quaternion;
  tip: Vector3;
  vel: Vector3;
  started: boolean;
}

const STEP = 1 / 120;
const MAX_STEPS = 8;

const a = new Vector3();
const forward = new Vector3();
const left = new Vector3();
const up = new Vector3();
const base = new Vector3();
const goal = new Vector3();
const delta = new Vector3();
const dir = new Vector3();
const swing = new Quaternion();
const parentQ = new Quaternion();
const worldQ = new Quaternion();
const m = new Matrix4();

const PREFIX = 'cosmetic:';

/**
 * A cosmetic's skeleton repeats the class's bone names. Once it is mounted on the player, a lookup by
 * name from the player's root (for the next cosmetic, or an animation track) could land on the copy, so
 * the copies are renamed; their file names stay in `userData.boneName`.
 */
export function renameSkeleton(root: Object3D): void {
  root.traverse((o) => {
    if (!(o as { isBone?: boolean }).isBone) return;
    o.userData.boneName ??= o.name;
    o.name = PREFIX + (o.userData.boneName as string);
  });
}

function findBone(root: Object3D, name: string): Object3D | undefined {
  let found: Object3D | undefined;
  root.traverse((o) => {
    if (!found && (o.userData.boneName ?? o.name) === name && (o as { isBone?: boolean }).isBone) {
      found = o;
    }
  });
  return found;
}

/** The jiggle bones of `root` (a cosmetic's scene), parents before children. */
export function setupJiggle(
  root: Object3D,
  specs: readonly JiggleSpec[] | undefined,
  /** Bones that were taken out of `root` and mounted elsewhere (see `boneMerge`). */
  moved: readonly Object3D[] = [],
): JiggleBone[] {
  const out: JiggleBone[] = [];
  for (const spec of specs ?? []) {
    const node = [root, ...moved].reduce<Object3D | undefined>(
      (found, where) => found ?? findBone(where, spec.bone),
      undefined,
    );
    if (!node || !(spec.length > 0)) continue;
    out.push({
      spec,
      node,
      rest: node.quaternion.clone(),
      tip: new Vector3(),
      vel: new Vector3(),
      started: false,
    });
  }
  const depth = (o: Object3D): number => {
    let n = 0;
    for (let p = o.parent; p; p = p.parent) n++;
    return n;
  };
  return out.sort((x, y) => depth(x.node) - depth(y.node));
}

/** Put every bone back where the animation has it, and forget the swing. */
export function resetJiggle(bones: readonly JiggleBone[]): void {
  for (const b of bones) {
    b.node.quaternion.copy(b.rest);
    b.started = false;
  }
}

/**
 * Advance the springs by `dt` seconds. Call after the body's animation has been applied for the frame.
 * Moves each bone's rotation; the skinned mesh follows when it next renders.
 */
export function stepJiggle(bones: readonly JiggleBone[], dt: number): void {
  if (!bones.length) return;
  const steps = Math.min(MAX_STEPS, Math.max(1, Math.ceil(dt / STEP)));
  const h = Math.min(dt, STEP * MAX_STEPS) / steps;
  for (const b of bones) {
    const { node, spec } = b;
    // Where the animation (and everything above this bone) puts it, with no swing of its own.
    node.quaternion.copy(b.rest);
    node.updateWorldMatrix(true, false);
    m.copy(node.matrixWorld);
    base.setFromMatrixPosition(m);
    forward.setFromMatrixColumn(m, 0).normalize();
    left.setFromMatrixColumn(m, 1).normalize();
    up.setFromMatrixColumn(m, 2).normalize();
    // World scale of the tip distance, so a scaled parent keeps the same proportions.
    const length = spec.length * (m.getMaxScaleOnAxis() || 1);
    goal.copy(base).addScaledVector(forward, length);
    if (!b.started) {
      b.tip.copy(goal);
      b.vel.set(0, 0, 0);
      b.started = true;
      continue;
    }
    for (let i = 0; i < steps; i++) {
      delta.copy(b.tip).sub(goal);
      const dAlong = delta.dot(forward);
      const dYaw = delta.dot(left);
      const dPitch = delta.dot(up);
      const vAlong = b.vel.dot(forward);
      const vYaw = b.vel.dot(left);
      const vPitch = b.vel.dot(up);
      // Spring toward the animated tip on each axis, damped by that axis' own damping.
      a.set(0, 0, 0)
        .addScaledVector(forward, -spec.alongStiffness * dAlong - spec.alongDamping * vAlong)
        .addScaledVector(left, -spec.yawStiffness * dYaw - spec.yawDamping * vYaw)
        .addScaledVector(up, -spec.pitchStiffness * dPitch - spec.pitchDamping * vPitch);
      b.vel.addScaledVector(a, h);
      b.tip.addScaledVector(b.vel, h);
    }
    // The tip stays `length` from the base, so the bone swings rather than stretches.
    dir.copy(b.tip).sub(base);
    if (dir.lengthSq() < 1e-12) dir.copy(forward);
    dir.normalize();
    if (spec.angleLimit > 0) {
      const angle = forward.angleTo(dir);
      if (angle > spec.angleLimit) {
        dir.lerp(forward, 1 - spec.angleLimit / angle).normalize();
      }
    }
    b.tip.copy(base).addScaledVector(dir, length);
    // Turn the bone by the swing, in world space, then back into its parent's frame.
    swing.setFromUnitVectors(forward, dir);
    node.matrixWorld.decompose(a, worldQ, goal);
    worldQ.premultiply(swing);
    if (node.parent) node.parent.matrixWorld.decompose(a, parentQ, goal);
    else parentQ.identity();
    node.quaternion.copy(parentQ.invert().multiply(worldQ));
  }
}
