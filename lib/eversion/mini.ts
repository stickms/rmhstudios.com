/**
 * The button-sized eversion (amended 2026-10-21). Pure, client-safe.
 *
 * The owner: instead of the full-screen globe on every navigation, "play a button-sized animation on nav menu …
 * that still plays as the page is changing, don't move it to the middle of the screen … just map the button text
 * onto a mini globe (or an oblong ellipsoid depending on button dimensions)". The liquid-globe hub keeps the
 * full-screen run; every other navigation goes through at once and the control that was pressed plays this, in
 * place, over its own rect (`components/radial/eversion/mini-globe.ts` draws it).
 *
 * It is the same eversion, not a look-alike: the surface is Thurston's (`thurston.ts#evert`) on the run's own
 * `(θ, φ)` mesh (`mesh.ts`), with the run's wrap wave (`morph.ts#wrapWeight`), scaled to an ellipsoid whose
 * semi-axes are the control's half-width and half-height (depth: the smaller of the two). In order:
 *
 * 1. WRAP: the control's face, a flat picture of exactly its pixels, curls onto the ellipsoid from its centre out.
 * 2. EVERSION: the ellipsoid turns inside out (`e: 0 → 1`) while it makes one full turn about its vertical axis
 *    and tips toward the viewer and back, so it reads as a globe rather than a flat card.
 * 3. UNWRAP: the antipode, which is now in front, uncurls back into the flat face.
 *
 * Both ends are pixel-exact (the flat face lies in `z = 0`, where the camera's scale is 1), so the picture lands
 * on the real control without a jump. The front hemisphere carries the face for the start (`uvBefore`); the back
 * hemisphere, which the eversion brings to the front, carries it for the end (`uvAfter`), read through the
 * antipodal map `F(·, 1) = −p` so it is upright and unmirrored.
 *
 * Positions are camera space in CSS px: origin at the CONTROL'S centre, x right, y down, z toward the viewer.
 * {@link miniPositions} writes into a caller buffer and never allocates (it runs every frame).
 */

import { TAU, wrapTheta } from './domain';
import { wrapWeight } from './morph';
import { evert } from './thurston';
import type { Mesh } from './types';

/**
 * The whole animation, wall clock. Nothing waits on it (the page changes underneath), so this is set by how fast
 * the surface may move, not by patience: the eversion's push/twist is its fastest phase, and at 900 ms it peaks
 * near 3 px/ms on a 180 px pill (the full run's EVERSION is 3.2 s for a screen-sized globe).
 */
export const MINI_MS = 900;

/** Stage windows as fractions of the run. They overlap, as the full run's do, so no boundary has a dead frame. */
export const MINI_WRAP = [0, 0.22] as const;
export const MINI_EVERT = [0.14, 0.86] as const;
export const MINI_UNWRAP = [0.78, 1] as const;

/** The tip toward the viewer at the middle of the eversion, radians. */
const MINI_TILT = 0.38;

/**
 * Margin around the control, as a fraction of each semi-axis, that the canvas must add so nothing is clipped:
 * the surface reaches `MAX_EVERSION_EXTENT` (1.35) of the radius, the perspective bulge adds up to ~28% more.
 */
export const MINI_PAD = 0.78;

/** The camera distance as a multiple of the larger semi-axis (`morph.ts`: `2 · GLOBE_PERSP`). */
export const MINI_CAMERA = 6.2;

const smoother = (t: number) => {
  const x = t <= 0 ? 0 : t >= 1 ? 1 : t;
  return x * x * x * (x * (6 * x - 15) + 10);
};
const windowed = (t: number, w: readonly [number, number]) => smoother((t - w[0]) / (w[1] - w[0]));

/** The face's texture coordinate for the sphere point at `(θ, φ)` seen from the front; the back clamps to the edge. */
function faceUv(theta: number, phi: number, out: Float32Array, o: number): void {
  const u = 0.5 + theta / Math.PI;
  const v = 0.5 - phi / Math.PI;
  out[o] = u < 0 ? 0 : u > 1 ? 1 : u;
  out[o + 1] = v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Per-vertex data that does not change during a run. */
export interface MiniGeometry {
  readonly vertexCount: number;
  /** `(θ, φ)` per vertex (the mesh's own). */
  readonly domain: Float32Array;
  /** Face UV at the start (front hemisphere) and at the end (back hemisphere, through the antipodal map). */
  readonly uvBefore: Float32Array;
  readonly uvAfter: Float32Array;
  /** Angular distance from each end's front point, over π: the wrap wave's `d`. */
  readonly dBefore: Float32Array;
  readonly dAfter: Float32Array;
}

export function buildMiniGeometry(mesh: Mesh): MiniGeometry {
  const n = mesh.vertexCount;
  const uvBefore = new Float32Array(n * 2);
  const uvAfter = new Float32Array(n * 2);
  const dBefore = new Float32Array(n);
  const dAfter = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const theta = mesh.domain[i * 2]!;
    const phi = mesh.domain[i * 2 + 1]!;
    faceUv(theta, phi, uvBefore, i * 2);
    // At e = 1 the point (θ, φ) sits where (θ + π, −φ) sat: that is where it shows on the face.
    faceUv(wrapTheta(theta + Math.PI), -phi, uvAfter, i * 2);
    const c = Math.cos(phi) * Math.cos(theta);
    dBefore[i] = Math.acos(Math.max(-1, Math.min(1, c))) / Math.PI;
    dAfter[i] = Math.acos(Math.max(-1, Math.min(1, -c))) / Math.PI;
  }
  return { vertexCount: n, domain: mesh.domain, uvBefore, uvAfter, dBefore, dAfter };
}

/** The run's state at progress `t ∈ [0, 1]`, for the renderer's uniforms. */
export interface MiniStage {
  /** Eversion progress. */
  e: number;
  /** How far the picture has crossed from the start's face to the end's (the two are the same label). */
  afterMix: number;
  /** How much 3D shading to apply: 0 on the flat face at both ends (its colours exact), 1 while it is a globe. */
  shade: number;
}

export function miniStage(t: number, out: MiniStage = { e: 0, afterMix: 0, shade: 0 }): MiniStage {
  out.e = windowed(t, MINI_EVERT);
  out.afterMix = smoother((out.e - 0.35) / 0.3);
  out.shade = windowed(t, MINI_WRAP) * (1 - windowed(t, MINI_UNWRAP));
  return out;
}

const P = new Float64Array(3);

/**
 * Every vertex's camera-space position at progress `t` for a control of `width × height` CSS px, into `out`
 * (3 floats per vertex). The ellipsoid's semi-axes are `(width/2, height/2, min of the two)`.
 */
export function miniPositions(
  t: number,
  geom: MiniGeometry,
  width: number,
  height: number,
  out: Float32Array,
): void {
  const a = width / 2;
  const b = height / 2;
  const c = Math.min(a, b);
  const sWrap = windowed(t, MINI_WRAP);
  const sUnwrap = windowed(t, MINI_UNWRAP);
  const e = windowed(t, MINI_EVERT);
  // One full turn (the end must be upright again) and a tip that is zero at both ends.
  const spin = TAU * e;
  const tilt = MINI_TILT * Math.sin(Math.PI * e);
  const cs = Math.cos(spin);
  const ss = Math.sin(spin);
  const ct = Math.cos(tilt);
  const st = Math.sin(tilt);
  const { domain, uvBefore, uvAfter, dBefore, dAfter } = geom;
  for (let i = 0, n = geom.vertexCount; i < n; i++) {
    const o = i * 3;
    evert(domain[i * 2]!, domain[i * 2 + 1]!, e, P, 0);
    // Rotate the unit surface (spin about y, then tip about x), then scale it to the ellipsoid: the silhouette
    // stays the control's shape while the picture turns on it.
    const x1 = P[0]! * cs + P[2]! * ss;
    const z1 = -P[0]! * ss + P[2]! * cs;
    const y2 = P[1]! * ct - z1 * st;
    const z2 = P[1]! * st + z1 * ct;
    const sx = x1 * a;
    const sy = y2 * b;
    const sz = z2 * c;
    // WRAP from the start's face, then UNWRAP onto the end's (the full run's morph, both ways).
    const wB = wrapWeight(sWrap, dBefore[i]!);
    const fbx = (uvBefore[i * 2]! - 0.5) * width;
    const fby = (uvBefore[i * 2 + 1]! - 0.5) * height;
    const px = fbx + (sx - fbx) * wB;
    const py = fby + (sy - fby) * wB;
    const pz = sz * wB;
    const wA = wrapWeight(1 - sUnwrap, dAfter[i]!);
    const fax = (uvAfter[i * 2]! - 0.5) * width;
    const fay = (uvAfter[i * 2 + 1]! - 0.5) * height;
    out[o] = fax + (px - fax) * wA;
    out[o + 1] = fay + (py - fay) * wA;
    out[o + 2] = pz * wA;
  }
}

/** Project a camera-space point to the control's rect (CSS px from its centre), as the shader does. */
export function miniProject(x: number, y: number, z: number, width: number, height: number): [number, number] {
  const d = MINI_CAMERA * Math.max(width, height) / 2;
  const k = d / (d - z);
  return [x * k, y * k];
}
