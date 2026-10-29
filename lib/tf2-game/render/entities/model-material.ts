/**
 * The lit material of everything the entity renderer draws from the model channel
 * (characters, view models, weapons, buildings, projectiles, pickups, prop_dynamics):
 * VertexLitGeneric as TF2 shades it, in linear space like the world (lighting.ts).
 *
 *   diffuse  = ambient cube(n) + Σ (sun, ≤ 2 local lights) · lightwarp(½·n·L + ½)   (half-Lambert)
 *   specular = sun · (r·L)^exponent · boost · fresnel(ranges)      ($phong, masked by base alpha
 *              when $basemapalphaphongmask)
 *   rim      = ambient cube(v) · (1 − n·v)^rimexponent · rimboost   ($rimlight)
 *
 * $lightwarptexture is approximated by a fixed warm ramp (the TF2 ramps all darken and warm the
 * terminator); the ambient cube is not warped, as in the SDK. Self-illumination, alpha test,
 * translucency and additive blending follow the material's extras.
 *
 * Materials are templates per source glTF material; each model instance takes clones that
 * share one per-instance uniform set (lighting, tint, fade, cloak dissolve) and compile to the
 * same programs. A material whose texture is missing (a dedicated-server install has none)
 * draws its texdata colour, or its team colour when its name says RED/BLU, so teams stay
 * readable in local development.
 */
import {
  AdditiveBlending,
  Color,
  DoubleSide,
  FrontSide,
  type Material,
  NormalBlending,
  ShaderMaterial,
  type Texture,
  Vector2,
  Vector3,
  Vector4,
} from 'three';
import { AMBIENT_CUBE_GLSL } from '../lighting';

/** glTF material extras written by models.py (docs/tf2-game.md "Models"). */
export interface ModelMaterialExtras {
  material?: string;
  shader?: string;
  translucent?: boolean;
  alphatest?: boolean;
  cutoff?: number;
  additive?: boolean;
  nocull?: boolean;
  selfillum?: boolean;
  selfillumTint?: number[];
  vertexalpha?: boolean;
  color?: number[];
  color2?: number[];
  phong?: {
    exponent?: number;
    boost?: number;
    fresnelRanges?: number[];
    tint?: number[];
    baseAlphaMask?: boolean;
  };
  rimlight?: { exponent?: number; boost?: number; mask?: boolean };
  lightwarp?: string;
  eye?: boolean;
  missing?: string;
  unlit?: boolean;
}

/** Per-instance uniforms shared by all of an instance's materials. */
export interface InstanceUniforms {
  [k: string]: { value: unknown };
  uAmbientCube: { value: Vector3[] };
  uSunDir: { value: Vector3 };
  uSunColor: { value: Vector3 };
  /** Up to two local world lights (direction toward the light, three space; colour at the model). */
  uLocalDir: { value: Vector3[] };
  uLocalColor: { value: Vector3[] };
  /** Multiplies the lit colour (disguise-kit tint, burning darken). */
  uTint: { value: Vector3 };
  /** Added glow colour on the rim (crit boost, über flash). */
  uGlow: { value: Vector3 };
  /** Screen-door fade, 1 = opaque. */
  uAlpha: { value: number };
  /** Cloak dissolve 0 (visible) … 1 (gone). */
  uCloak: { value: number };
  uCloakColor: { value: Vector3 };
  uFogColor: { value: Vector4 };
  uFogRange: { value: Vector2 };
}

export function createInstanceUniforms(fog?: {
  uFogColor: { value: Vector4 };
  uFogRange: { value: Vector2 };
}): InstanceUniforms {
  return {
    uAmbientCube: { value: Array.from({ length: 6 }, () => new Vector3(0.3, 0.3, 0.3)) },
    uSunDir: { value: new Vector3(0, 1, 0) },
    uSunColor: { value: new Vector3() },
    uLocalDir: { value: [new Vector3(0, 1, 0), new Vector3(0, 1, 0)] },
    uLocalColor: { value: [new Vector3(), new Vector3()] },
    uTint: { value: new Vector3(1, 1, 1) },
    uGlow: { value: new Vector3() },
    uAlpha: { value: 1 },
    uCloak: { value: 0 },
    uCloakColor: { value: new Vector3(0.6, 0.65, 0.7) },
    // Shared with the world when given, so models fog with the map.
    uFogColor: fog?.uFogColor ?? { value: new Vector4(0, 0, 0, 0) },
    uFogRange: fog?.uFogRange ?? { value: new Vector2(1, 0) },
  };
}

const VERT = /* glsl */ `
#include <common>
#include <skinning_pars_vertex>
varying vec2 vUv;
varying vec3 vNormalW;
varying vec3 vWorldPos;
varying vec3 vObjPos;
varying float vDepth;
void main() {
  vUv = uv;
  vObjPos = position;
  #include <beginnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <begin_vertex>
  #include <skinning_vertex>
  vec4 wp = modelMatrix * vec4(transformed, 1.0);
  vWorldPos = wp.xyz;
  vNormalW = normalize(mat3(modelMatrix) * objectNormal);
  vec4 mv = viewMatrix * wp;
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

const FRAG = /* glsl */ `
uniform sampler2D uMap;
uniform float uHasMap;
uniform vec3 uColor;
uniform float uCutoff;
uniform vec3 uAmbientCube[6];
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uLocalDir[2];
uniform vec3 uLocalColor[2];
uniform vec4 uPhong;    // exponent, boost, base-alpha mask (0/1), enabled
uniform vec3 uFresnel;  // $phongfresnelranges
uniform vec3 uRim;      // exponent, boost, enabled
uniform vec3 uSelfIllumTint;
uniform vec3 uTint;
uniform vec3 uGlow;
uniform float uAlpha;
uniform float uCloak;
uniform vec3 uCloakColor;
uniform vec4 uFogColor;
uniform vec2 uFogRange;
varying vec2 vUv;
varying vec3 vNormalW;
varying vec3 vWorldPos;
varying vec3 vObjPos;
varying float vDepth;
${AMBIENT_CUBE_GLSL}
float bayer4(vec2 p) {
  vec2 q = mod(floor(p), 4.0);
  int i = int(q.x + q.y * 4.0);
  float m[16] = float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);
  return (m[i] + 0.5) / 16.0;
}
float hash3(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float noise3(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash3(i + vec3(0,0,0)), hash3(i + vec3(1,0,0)), f.x),
                 mix(hash3(i + vec3(0,1,0)), hash3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash3(i + vec3(0,0,1)), hash3(i + vec3(1,0,1)), f.x),
                 mix(hash3(i + vec3(0,1,1)), hash3(i + vec3(1,1,1)), f.x), f.y), f.z);
}
// $lightwarptexture stand-in: half-Lambert squared, mid-tones warmed.
vec3 lightwarp(float x) {
  float w = x * x;
  return vec3(w) * mix(vec3(1.06, 0.9, 0.84), vec3(1.0), x);
}
void main() {
  if (uAlpha < 1.0 && uAlpha < bayer4(gl_FragCoord.xy)) discard;
  float edge = 1.0;
  if (uCloak > 0.0) {
    float n = noise3(vObjPos * 22.0) * 0.7 + noise3(vObjPos * 61.0) * 0.3;
    float cut = uCloak * 1.08 - 0.04;
    if (n < cut) discard;
    edge = smoothstep(cut, cut + 0.07, n);
  }
  vec4 albedo = uHasMap > 0.5 ? texture2D(uMap, vUv) : vec4(1.0);
  albedo.rgb *= uColor;
#ifdef ALPHATEST
  if (albedo.a < uCutoff) discard;
#endif
  vec3 n = normalize(vNormalW);
  if (!gl_FrontFacing) n = -n;
  vec3 v = normalize(cameraPosition - vWorldPos);
#ifdef UNLIT
  vec3 c = albedo.rgb;
#else
  float ndl = dot(n, uSunDir);
  vec3 diffuse = tf2AmbientCube(n, uAmbientCube[0], uAmbientCube[1], uAmbientCube[2], uAmbientCube[3], uAmbientCube[4], uAmbientCube[5])
    + uSunColor * lightwarp(ndl * 0.5 + 0.5)
    + uLocalColor[0] * lightwarp(dot(n, uLocalDir[0]) * 0.5 + 0.5)
    + uLocalColor[1] * lightwarp(dot(n, uLocalDir[1]) * 0.5 + 0.5);
  vec3 c = albedo.rgb * diffuse;
  float ndv = clamp(dot(n, v), 0.0, 1.0);
  if (uPhong.w > 0.5) {
    float f = (1.0 - ndv) * (1.0 - ndv);
    float fres = f < 0.5 ? mix(uFresnel.x, uFresnel.y, f * 2.0) : mix(uFresnel.y, uFresnel.z, f * 2.0 - 1.0);
    float mask = uPhong.z > 0.5 ? albedo.a : 0.6;
    vec3 r = reflect(-uSunDir, n);
    float spec = pow(max(dot(r, v), 0.0), max(uPhong.x, 1.0)) * uPhong.y * fres * mask;
    c += uSunColor * spec * step(0.0, ndl);
  }
  if (uRim.z > 0.5) {
    vec3 amb = tf2AmbientCube(v, uAmbientCube[0], uAmbientCube[1], uAmbientCube[2], uAmbientCube[3], uAmbientCube[4], uAmbientCube[5]);
    float rim = pow(1.0 - ndv, max(uRim.x, 1.0)) * uRim.y * max(n.y, 0.0);
    c += amb * rim * 0.5;
  }
#ifdef SELFILLUM
  c = mix(c, albedo.rgb * uSelfIllumTint, albedo.a);
#endif
#endif
  c *= uTint;
  c += uGlow * pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 2.0);
  if (uCloak > 0.0) c = mix(uCloakColor, c, edge);
#ifdef TRANSLUCENT
  float a = albedo.a;
#else
  float a = 1.0;
#endif
  if (uFogRange.y > uFogRange.x) {
    float fo = clamp((vDepth - uFogRange.x) / (uFogRange.y - uFogRange.x), 0.0, uFogColor.a);
    c = mix(c, uFogColor.rgb, fo);
  }
  gl_FragColor = vec4(c, a);
  #include <colorspace_fragment>
}
`;

/** TF2 team colours for untextured team materials (linear). */
export const TEAM_FALLBACK_COLOR = {
  red: new Color().setRGB(0.72, 0.23, 0.2, 'srgb'),
  blue: new Color().setRGB(0.36, 0.5, 0.62, 'srgb'),
} as const;

function fallbackColor(src: Material & { color?: Color }, ud: ModelMaterialExtras): Color {
  const name = (ud.material ?? src.name ?? '').toLowerCase();
  if (/(^|[_/])(blue|blu)([_/.]|$)|_blue|_blu\b/.test(name))
    return TEAM_FALLBACK_COLOR.blue.clone();
  if (/(^|[_/])red([_/.]|$)|_red/.test(name)) return TEAM_FALLBACK_COLOR.red.clone();
  if (ud.eye || ud.shader === 'eyerefract' || ud.shader === 'eyes')
    return new Color(0.85, 0.85, 0.85);
  return src.color?.clone() ?? new Color(0.6, 0.6, 0.6);
}

/** Template data for one glTF material (shared by all instances of a model). */
export interface MaterialTemplate {
  name: string;
  defines: Record<string, string>;
  uniforms: Record<string, { value: unknown }>;
  transparent: boolean;
  additive: boolean;
  doubleSided: boolean;
}

export function materialTemplate(src: Material): MaterialTemplate {
  const ud = (src.userData ?? {}) as ModelMaterialExtras;
  const s = src as Material & { map?: Texture | null; color?: Color; alphaTest?: number };
  const defines: Record<string, string> = {};
  const translucent = !!(ud.translucent || ud.additive);
  if (ud.alphatest || (!translucent && (s.alphaTest ?? 0) > 0)) defines.ALPHATEST = '';
  if (translucent) defines.TRANSLUCENT = '';
  if (ud.selfillum) defines.SELFILLUM = '';
  if (ud.unlit || ud.shader === 'unlitgeneric') defines.UNLIT = '';
  const hasMap = !!s.map;
  const phong = ud.phong;
  const rim = ud.rimlight;
  const fr = phong?.fresnelRanges ?? [0, 0.5, 1];
  const tint = ud.selfillumTint ?? [1, 1, 1];
  return {
    name: src.name,
    defines,
    uniforms: {
      uMap: { value: s.map ?? null },
      uHasMap: { value: hasMap ? 1 : 0 },
      uColor: { value: hasMap ? new Color(1, 1, 1) : fallbackColor(s, ud) },
      uCutoff: { value: ud.cutoff ?? (s.alphaTest || 0.5) },
      uPhong: {
        value: new Vector4(
          phong?.exponent ?? 5,
          phong?.boost ?? 1,
          phong?.baseAlphaMask ? 1 : 0,
          phong ? 1 : 0,
        ),
      },
      uFresnel: { value: new Vector3(fr[0] ?? 0, fr[1] ?? 0.5, fr[2] ?? 1) },
      uRim: { value: new Vector3(rim?.exponent ?? 4, rim?.boost ?? 1, rim ? 1 : 0) },
      uSelfIllumTint: { value: new Vector3(tint[0] ?? 1, tint[1] ?? 1, tint[2] ?? 1) },
    },
    transparent: translucent,
    additive: !!ud.additive,
    doubleSided: !!ud.nocull || src.side === DoubleSide,
  };
}

/** A material for one instance: the template's own uniforms plus the instance's shared set. */
export function createModelMaterial(t: MaterialTemplate, inst: InstanceUniforms): ShaderMaterial {
  const m = new ShaderMaterial({
    name: t.name,
    vertexShader: VERT,
    fragmentShader: FRAG,
    defines: t.defines,
    uniforms: { ...t.uniforms, ...inst },
    transparent: t.transparent,
    depthWrite: !t.transparent,
    blending: t.additive ? AdditiveBlending : NormalBlending,
    side: t.doubleSided ? DoubleSide : FrontSide,
  });
  return m;
}

/** Copies a sampled ambient cube (18 floats, lighting.ts order) and the sun into an instance. */
export function setInstanceLighting(
  u: InstanceUniforms,
  cube: ArrayLike<number>,
  sunDir: Vector3,
  sunColor: Vector3,
  sunScale: number,
): void {
  for (let k = 0; k < 6; k++)
    u.uAmbientCube.value[k].set(cube[k * 3], cube[k * 3 + 1], cube[k * 3 + 2]);
  u.uSunDir.value.copy(sunDir);
  u.uSunColor.value.copy(sunColor).multiplyScalar(sunScale);
}
