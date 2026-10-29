/**
 * Lighting for everything that is not lightmapped (static props, characters, view
 * models, projectiles): the per-leaf ambient cubes vrad bakes and the sun.
 *
 * - Ambient cube: SDK engine Mod_LeafAmbientColorAtPos — an inverse-squared-distance
 *   weighted average (1 / (d² + 1)) of the leaf's samples; a solid leaf with no samples
 *   borrows its neighbour's (firstAmbientSample is then a leaf index). The cube is
 *   decoded with ColorRGBExp32ToVector, which (unlike the lightmap path's
 *   TexLightToLinear) has a factor of 255 built in — that puts it in lightmap units.
 *   The six colours are linear light, ordered +X −X +Y −Y +Z −Z in Source axes.
 * - Sun: the emit_skylight world light (intensity already in lightmap units —
 *   vrad scales `_light` by 1/255, lightmap.cpp), falling back to parsing
 *   light_environment like vrad (LightForString + SetupLightNormalFromProps).
 *
 * Shading (SDK: common_vs_fxc.h AmbientLight + the VertexLitGeneric diffuse term):
 *   diffuse = Σ n² · cube[sign(n)] + sun · max(dot(n, L), 0)   (half-Lambert for
 *   $halflambert models, like the TF2 characters), times albedo, in linear space.
 */
import { Vector3 } from 'three';
import type { BspFile, BspLeafAmbient } from '../formats/bsp';
import { findLeaf } from '../formats/bsp';
import type { BspEntity } from '../formats/keyvalues';
import { srcDirToThree } from './coords';
import { decodeRgbe } from './lightmap';

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

/** 6 linear RGB colours (+X −X +Y −Y +Z −Z, Source axes): 18 floats. */
export type AmbientCube = Float32Array;

export const newAmbientCube = (): AmbientCube => new Float32Array(18);

const cubeScratch = new Float32Array(3);

/** SDK ColorRGBExp32ToVector's built-in factor over TexLightToLinear (mathlib/color_conversion.cpp). */
export const AMBIENT_CUBE_SCALE = 255;

/**
 * Samples a leaf's ambient lighting at a Source point into `out` (18 floats).
 * Returns false (and zeros) when no sample could be found.
 */
export function sampleAmbientCube(
  bsp: BspFile,
  pos: Vec3Like,
  out: AmbientCube,
  opts: { hdr?: boolean; scale?: number; leaf?: number } = {},
): boolean {
  out.fill(0);
  const amb: BspLeafAmbient | null = opts.hdr
    ? (bsp.leafAmbientHdr ?? bsp.leafAmbientLdr)
    : (bsp.leafAmbientLdr ?? bsp.leafAmbientHdr);
  const scale = opts.scale ?? 1;
  let leaf = opts.leaf ?? findLeaf(bsp, pos);
  const L = bsp.leafs;
  if (leaf < 0 || leaf >= L.count) return false;
  if (!amb) {
    // v0 leafs carry one cube inline.
    if (!L.ambientLighting) return false;
    for (let k = 0; k < 6; k++) decodeRgbe(L.ambientLighting, leaf * 24 + k * 4, out, k * 3);
    for (let k = 0; k < 18; k++) out[k] *= scale * AMBIENT_CUBE_SCALE;
    return true;
  }
  let count = amb.index[leaf * 2];
  let first = amb.index[leaf * 2 + 1];
  if (count === 0 && first !== 0 && first < L.count) {
    // A solid leaf borrows light from a neighbour (firstAmbientSample = that leaf).
    leaf = first;
    count = amb.index[leaf * 2];
    first = amb.index[leaf * 2 + 1];
  }
  if (count === 0) return false;
  const mnx = L.mins[leaf * 3];
  const mny = L.mins[leaf * 3 + 1];
  const mnz = L.mins[leaf * 3 + 2];
  const sx = (L.maxs[leaf * 3] - mnx) / 255;
  const sy = (L.maxs[leaf * 3 + 1] - mny) / 255;
  const sz = (L.maxs[leaf * 3 + 2] - mnz) / 255;
  let total = 0;
  for (let i = 0; i < count; i++) {
    const s = first + i;
    if (s >= amb.sampleCount) break;
    const px = mnx + amb.positions[s * 3] * sx;
    const py = mny + amb.positions[s * 3 + 1] * sy;
    const pz = mnz + amb.positions[s * 3 + 2] * sz;
    const dx = px - pos.x;
    const dy = py - pos.y;
    const dz = pz - pos.z;
    const factor = 1 / (dx * dx + dy * dy + dz * dz + 1);
    total += factor;
    for (let k = 0; k < 6; k++) {
      decodeRgbe(amb.cubes, s * 24 + k * 4, cubeScratch);
      out[k * 3] += cubeScratch[0] * factor;
      out[k * 3 + 1] += cubeScratch[1] * factor;
      out[k * 3 + 2] += cubeScratch[2] * factor;
    }
  }
  if (total <= 0) return false;
  const inv = (scale * AMBIENT_CUBE_SCALE) / total;
  for (let k = 0; k < 18; k++) out[k] *= inv;
  return true;
}

/** CPU twin of the shader: the ambient cube's light along a Source-space unit normal. */
export function evalAmbientCube(cube: AmbientCube, nx: number, ny: number, nz: number, out: number[]): number[] {
  const xx = nx * nx;
  const yy = ny * ny;
  const zz = nz * nz;
  const ix = nx < 0 ? 1 : 0;
  const iy = ny < 0 ? 3 : 2;
  const iz = nz < 0 ? 5 : 4;
  for (let c = 0; c < 3; c++) {
    out[c] = xx * cube[ix * 3 + c] + yy * cube[iy * 3 + c] + zz * cube[iz * 3 + c];
  }
  return out;
}

// --- the sun -----------------------------------------------------------------------

export interface SunLight {
  /** Unit direction TOWARD the sun, Source axes. */
  dir: [number, number, number];
  /** Linear colour in lightmap units (1 = a luxel of 1.0 when facing it). */
  color: [number, number, number];
  /** light_environment `_ambient` (linear, lightmap units). */
  ambient: [number, number, number];
}

/** SDK vrad LightForString: "r g b [scale]" (0–255 gamma) → linear, then / 255 as world lights store it. */
export function parseLightString(s: string | undefined): [number, number, number] | null {
  if (!s) return null;
  const p = s.trim().split(/\s+/).map(Number);
  if (p.length === 0 || p.some((x) => !Number.isFinite(x))) return null;
  const [r, g = r, b = r] = p;
  if (r < 0 || g < 0 || b < 0) return null;
  const lin = (c: number) => Math.pow(c / 255, 2.2) * 255;
  let out: [number, number, number] = [lin(r), lin(g), lin(b)];
  if (p.length >= 4) {
    const k = p[3] / 255;
    out = [out[0] * k, out[1] * k, out[2] * k];
  }
  return [out[0] / 255, out[1] / 255, out[2] / 255];
}

/** SDK SetupLightNormalFromProps: the direction light travels (Source axes). */
export function lightNormalFromProps(
  angles: [number, number, number],
  angle: number,
  pitch: number,
): [number, number, number] {
  const out: [number, number, number] = [0, 0, 0];
  if (angle === -1) {
    out[2] = 1;
  } else if (angle === -2) {
    out[2] = -1;
  } else {
    const a = angle || angles[1];
    out[0] = Math.cos((a / 180) * Math.PI);
    out[1] = Math.sin((a / 180) * Math.PI);
  }
  const p = pitch || angles[0];
  out[2] = Math.sin((p / 180) * Math.PI);
  out[0] *= Math.cos((p / 180) * Math.PI);
  out[1] *= Math.cos((p / 180) * Math.PI);
  return out;
}

const num = (s: string | undefined, d = 0): number => {
  const v = s === undefined ? NaN : parseFloat(s);
  return Number.isFinite(v) ? v : d;
};

/** Parses the map's light_environment (null when it has none). */
export function parseLightEnvironment(entities: BspEntity[]): SunLight | null {
  const e = entities.find((x) => x.classname === 'light_environment');
  if (!e) return null;
  const color = parseLightString(e.get('_light')) ?? [0, 0, 0];
  const ambient = parseLightString(e.get('_ambient')) ?? [color[0] * 0.5, color[1] * 0.5, color[2] * 0.5];
  const ang = (e.get('angles') ?? '0 0 0').split(/\s+/).map(Number);
  const n = lightNormalFromProps([ang[0] || 0, ang[1] || 0, ang[2] || 0], num(e.get('angle')), num(e.get('pitch')));
  const l = Math.hypot(n[0], n[1], n[2]) || 1;
  return { dir: [-n[0] / l, -n[1] / l, -n[2] / l], color, ambient };
}

/** The sun from the world lights lump (emit_skylight 3 / emit_skyambient 5), else light_environment. */
export function findSun(bsp: BspFile, opts: { hdr?: boolean; scale?: number } = {}): SunLight | null {
  const lights = opts.hdr && bsp.worldLightsHdr.length ? bsp.worldLightsHdr : bsp.worldLights;
  const scale = opts.hdr && bsp.worldLightsHdr.length ? (opts.scale ?? 1) : 1;
  const sky = lights.find((l) => l.type === 3);
  const env = parseLightEnvironment(bsp.entities);
  if (!sky) return env;
  const amb = lights.find((l) => l.type === 5);
  const n = sky.normal;
  const len = Math.hypot(n.x, n.y, n.z) || 1;
  return {
    dir: [-n.x / len, -n.y / len, -n.z / len],
    color: [sky.intensity.x * scale, sky.intensity.y * scale, sky.intensity.z * scale],
    ambient: amb
      ? [amb.intensity.x * scale, amb.intensity.y * scale, amb.intensity.z * scale]
      : (env?.ambient ?? [0, 0, 0]),
  };
}

// --- shader helpers ------------------------------------------------------------------

/**
 * GLSL: the ambient cube along a three-space normal. Colours are passed in Source
 * order (+X −X +Y −Y +Z −Z); three (x, y, z) = Source (y, z, x).
 */
export const AMBIENT_CUBE_GLSL = /* glsl */ `
vec3 tf2AmbientCube(vec3 n, vec3 c0, vec3 c1, vec3 c2, vec3 c3, vec3 c4, vec3 c5) {
  vec3 s = vec3(n.z, n.x, n.y); // Source axes
  vec3 sq = s * s;
  return sq.x * (s.x < 0.0 ? c1 : c0) + sq.y * (s.y < 0.0 ? c3 : c2) + sq.z * (s.z < 0.0 ? c5 : c4);
}
`;

/** Uniforms a lit model shader declares (`uAmbientCube[6]`, sun direction/colour in three space). */
export const MODEL_LIGHTING_PARS_GLSL = /* glsl */ `
uniform vec3 uAmbientCube[6];
uniform vec3 uSunDir;
uniform vec3 uSunColor;
${AMBIENT_CUBE_GLSL}
vec3 tf2ModelDiffuse(vec3 n, bool halfLambert) {
  vec3 amb = tf2AmbientCube(n, uAmbientCube[0], uAmbientCube[1], uAmbientCube[2], uAmbientCube[3], uAmbientCube[4], uAmbientCube[5]);
  float d = dot(n, uSunDir);
  float w = halfLambert ? pow(d * 0.5 + 0.5, 2.0) : max(d, 0.0);
  return amb + uSunColor * w;
}
`;

export interface ModelLightingUniforms {
  [k: string]: { value: unknown };
  uAmbientCube: { value: Vector3[] };
  uSunDir: { value: Vector3 };
  uSunColor: { value: Vector3 };
}

export function createModelLightingUniforms(): ModelLightingUniforms {
  return {
    uAmbientCube: { value: Array.from({ length: 6 }, () => new Vector3()) },
    uSunDir: { value: new Vector3(0, 1, 0) },
    uSunColor: { value: new Vector3() },
  };
}

/**
 * Writes a sampled cube and the sun into model uniforms. `sunVisible` scales the sun
 * (0 when the model's lighting origin is in shadow).
 */
export function setModelLighting(
  u: ModelLightingUniforms,
  cube: AmbientCube,
  sun: SunLight | null,
  sunVisible = 1,
): void {
  for (let k = 0; k < 6; k++) u.uAmbientCube.value[k].set(cube[k * 3], cube[k * 3 + 1], cube[k * 3 + 2]);
  if (sun) {
    srcDirToThree(sun.dir[0], sun.dir[1], sun.dir[2], u.uSunDir.value);
    u.uSunColor.value.set(sun.color[0], sun.color[1], sun.color[2]).multiplyScalar(sunVisible);
  } else {
    u.uSunColor.value.set(0, 0, 0);
  }
}
