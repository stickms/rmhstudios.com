/**
 * Which way a model channel GLB is turned. models.py writes each mesh in its MDL's compiled
 * bind space (metres): the space of the bones' default pose, which is also the space it
 * re-expresses every animation clip in (`root_fix`), so a posed model stays in it. How that
 * space sits relative to Source model space (X forward, Y left, Z up) depends on how the
 * model was compiled, and the GLB does not record it:
 *
 *   - TF2 players, arms, c_model weapons and most animated models: Y up, Source (x, y, z) →
 *     glTF (y, z, x) — the renderer's own three-space mapping (coords.ts).
 *   - Most static props, pickups and the flag: Source axes (Z up), metres.
 *   - A few rigid single-bone models (w_rocket): another axis rotation (Source X → glTF Y).
 *
 * The rotation is recovered here, once per GLB, by matching the bind-pose bounds of the
 * meshes against the MDL's hull (`scene.extras.source.hullMin/hullMax`, Source model space)
 * over the 24 axis-aligned rotations; ties prefer the (y, z, x) mapping, then Source axes.
 * `modelFrame()` returns the matrix taking GLB space into three model space (= the (y, z, x)
 * mapping of Source model space), so every model is placed with `sourceTransformToMatrix(…)
 * · modelFrame(gltf)` — static props, characters, view models and projectiles alike.
 */
import { Box3, Matrix4, type Mesh, type Object3D } from 'three';

/** Source inches → metres (the converter's scale). */
const SCALE = 0.01905;

/** A 3×3 signed permutation, row-major: GLB = R · Source. */
export type AxisRotation = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

/** Source (x, y, z) → three/glTF (y, z, x): the default bind frame of characters. */
export const PERM_SOURCE_TO_GL: AxisRotation = [0, 1, 0, 0, 0, 1, 1, 0, 0];
export const IDENTITY_ROTATION: AxisRotation = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/** The 24 proper axis rotations (signed permutation matrices with determinant +1). */
export const AXIS_ROTATIONS: readonly AxisRotation[] = (() => {
  const perms = [
    [0, 1, 2],
    [0, 2, 1],
    [1, 0, 2],
    [1, 2, 0],
    [2, 0, 1],
    [2, 1, 0],
  ];
  const out: AxisRotation[] = [];
  for (const p of perms) {
    for (let s = 0; s < 8; s++) {
      const m = [0, 0, 0, 0, 0, 0, 0, 0, 0];
      for (let r = 0; r < 3; r++) m[r * 3 + p[r]] = s & (1 << r) ? -1 : 1;
      const det =
        m[0] * (m[4] * m[8] - m[5] * m[7]) -
        m[1] * (m[3] * m[8] - m[5] * m[6]) +
        m[2] * (m[3] * m[7] - m[4] * m[6]);
      if (det > 0) out.push(m as unknown as AxisRotation);
    }
  }
  return out;
})();

export interface Bounds3 {
  min: [number, number, number];
  max: [number, number, number];
}

const sameRot = (a: AxisRotation, b: AxisRotation) => a.every((v, i) => v === b[i]);

/**
 * Picks the rotation R (GLB = R · Source) whose image of the hull (metres) best matches the
 * GLB's bind bounds. Error: the summed min/max mismatch per axis, relative to the box size.
 */
export function detectAxisRotation(hull: Bounds3, glb: Bounds3): AxisRotation {
  const size = Math.hypot(
    hull.max[0] - hull.min[0],
    hull.max[1] - hull.min[1],
    hull.max[2] - hull.min[2],
  );
  const gsize = Math.hypot(
    glb.max[0] - glb.min[0],
    glb.max[1] - glb.min[1],
    glb.max[2] - glb.min[2],
  );
  if (!(size > 1e-6) || !(gsize > 1e-6)) return PERM_SOURCE_TO_GL;
  let best: AxisRotation = PERM_SOURCE_TO_GL;
  let bestErr = Infinity;
  const norm = Math.max(size, gsize);
  for (const r of AXIS_ROTATIONS) {
    let err = 0;
    for (let row = 0; row < 3; row++) {
      // Image of the hull along GLB axis `row`.
      let lo = 0;
      let hi = 0;
      for (let col = 0; col < 3; col++) {
        const k = r[row * 3 + col];
        if (k === 0) continue;
        lo += k > 0 ? hull.min[col] : -hull.max[col];
        hi += k > 0 ? hull.max[col] : -hull.min[col];
      }
      err += Math.abs(lo - glb.min[row]) + Math.abs(hi - glb.max[row]);
    }
    err /= norm;
    // Preference order on near-ties (symmetric models): the character mapping, then Source axes.
    if (sameRot(r, PERM_SOURCE_TO_GL)) err -= 0.02;
    else if (sameRot(r, IDENTITY_ROTATION)) err -= 0.01;
    if (err < bestErr) {
      bestErr = err;
      best = r;
    }
  }
  return best;
}

/** three model space = P · Source; GLB = R · Source → three model = P · Rᵀ · GLB. */
export function frameMatrixFor(r: AxisRotation, out = new Matrix4()): Matrix4 {
  const p = PERM_SOURCE_TO_GL;
  const m = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      let s = 0;
      for (let k = 0; k < 3; k++) s += p[i * 3 + k] * r[j * 3 + k]; // P · Rᵀ
      m[i * 3 + j] = s;
    }
  }
  return out.set(m[0], m[1], m[2], 0, m[3], m[4], m[5], 0, m[6], m[7], m[8], 0, 0, 0, 0, 1);
}

interface SourceExtras {
  source?: { hullMin?: number[]; hullMax?: number[] };
  skinned?: boolean;
}

const frames = new WeakMap<object, { rotation: AxisRotation; matrix: Matrix4 }>();

/** Bind-pose bounds of every mesh under `root` (its node transforms applied), in GLB space. */
export function bindBounds(root: Object3D): Bounds3 | null {
  root.updateMatrixWorld(true);
  const box = new Box3();
  const tmp = new Box3();
  root.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    if (!mesh.geometry.boundingBox) return;
    tmp.copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld);
    box.union(tmp);
  });
  if (box.isEmpty()) return null;
  return { min: [box.min.x, box.min.y, box.min.z], max: [box.max.x, box.max.y, box.max.z] };
}

/**
 * The GLB → three model space matrix for a loaded model (cached per scene). `scene.userData`
 * is the GLB's scene extras.
 */
export function modelFrame(scene: Object3D): { rotation: AxisRotation; matrix: Matrix4 } {
  const cached = frames.get(scene);
  if (cached) return cached;
  const ex = (scene.userData ?? {}) as SourceExtras;
  const hmin = ex.source?.hullMin;
  const hmax = ex.source?.hullMax;
  let rotation: AxisRotation = ex.skinned === false ? IDENTITY_ROTATION : PERM_SOURCE_TO_GL;
  const bounds = bindBounds(scene);
  if (hmin?.length === 3 && hmax?.length === 3 && bounds) {
    rotation = detectAxisRotation(
      {
        min: [hmin[0] * SCALE, hmin[1] * SCALE, hmin[2] * SCALE],
        max: [hmax[0] * SCALE, hmax[1] * SCALE, hmax[2] * SCALE],
      },
      bounds,
    );
  }
  const entry = { rotation, matrix: frameMatrixFor(rotation) };
  frames.set(scene, entry);
  return entry;
}

/**
 * The axis rotation nearest a 3×3 rotation (row-major), or null when none is within ~40°
 * on every axis.
 */
export function nearestAxisRotation(m: ArrayLike<number>): AxisRotation | null {
  const out = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  const used = new Set<number>();
  for (let r = 0; r < 3; r++) {
    let best = -1;
    let bestAbs = 0;
    for (let c = 0; c < 3; c++) {
      const a = Math.abs(m[r * 3 + c]);
      if (a > bestAbs && !used.has(c)) {
        bestAbs = a;
        best = c;
      }
    }
    if (best < 0 || bestAbs < 0.75) return null;
    used.add(best);
    out[r * 3 + best] = Math.sign(m[r * 3 + best]);
  }
  return AXIS_ROTATIONS.find((a) => sameRot(a, out as unknown as AxisRotation)) ?? null;
}

/**
 * Animated models: the converter re-expresses clips with the MDL's `ref` sequence's root fix,
 * or with the (y, z, x) mapping when the MDL has no `ref` (HL2 humans, most props) even when
 * its bind pose is Source axes — so the posed model can sit in a different frame from its
 * bind pose. Comparing the root bone's rotation at the start of an idle-like clip with its bind
 * rotation (they differ only by that frame change, up to the idle's own small lean) recovers
 * the rotation R2 with posed = R2 · bind. Returns the three model matrix for posed geometry.
 */
export function animatedFrame(
  bindFrame: Matrix4,
  rootBind: ArrayLike<number>,
  rootPosed: ArrayLike<number>,
): Matrix4 {
  const qa = quatMatrix(rootPosed);
  const qb = quatMatrix(rootBind);
  // M = Ra · Rbᵀ
  const m = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++) {
      let s = 0;
      for (let k = 0; k < 3; k++) s += qa[i * 3 + k] * qb[j * 3 + k];
      m[i * 3 + j] = s;
    }
  const r2 = nearestAxisRotation(m);
  if (!r2 || sameRot(r2, IDENTITY_ROTATION)) return bindFrame;
  // three = Cbind · bind = Cbind · R2ᵀ · posed
  const r2t = new Matrix4().set(
    r2[0],
    r2[3],
    r2[6],
    0,
    r2[1],
    r2[4],
    r2[7],
    0,
    r2[2],
    r2[5],
    r2[8],
    0,
    0,
    0,
    0,
    1,
  );
  return bindFrame.clone().multiply(r2t);
}

function quatMatrix(q: ArrayLike<number>): number[] {
  const [x, y, z, w] = [q[0], q[1], q[2], q[3]];
  return [
    1 - 2 * (y * y + z * z),
    2 * (x * y - w * z),
    2 * (x * z + w * y),
    2 * (x * y + w * z),
    1 - 2 * (x * x + z * z),
    2 * (y * z - w * x),
    2 * (x * z - w * y),
    2 * (y * z + w * x),
    1 - 2 * (x * x + y * y),
  ];
}
