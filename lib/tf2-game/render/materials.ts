/**
 * World surface materials: small ShaderMaterials standing in for Source's brush shaders
 * (LightmappedGeneric, WorldVertexTransition, UnlitGeneric, Water), linear-space:
 *
 *   colour = albedo × L,   L = (lightmap texel · 2)^2.2   (lightmap.ts)
 *
 * WorldVertexTransition blends $basetexture → $basetexture2 by the displacement's
 * vertex alpha, sharpened by $blendmodulatetexture like the SDK pixel shader
 * (lightmappedgeneric_ps2_3_x.h: smoothstep(g − r, g + r, blend)). A material whose
 * texture is missing or not loaded yet draws its manifest reflectivity colour instead,
 * so untextured packages still read correctly under their lightmaps.
 *
 * Fog (env_fog_controller / water) is linear in view depth, shared by every material
 * through one uniform set.
 */
import {
  AdditiveBlending,
  Color,
  DoubleSide,
  FrontSide,
  NormalBlending,
  ShaderMaterial,
  Texture,
  Vector2,
  Vector4,
} from 'three';
import type { MapMaterial } from '@/lib/tf2-game/assets/map-manifest';

/** Uniform objects shared by every world material (updated once per frame). */
export interface SharedWorldUniforms {
  uLightmap: { value: Texture | null };
  uTime: { value: number };
  /** rgb = fog colour (linear), a = max density. */
  uFogColor: { value: Vector4 };
  /** x = start, y = end (metres); start ≥ end disables fog. */
  uFogRange: { value: Vector2 };
}

export function createSharedWorldUniforms(): SharedWorldUniforms {
  return {
    uLightmap: { value: null },
    uTime: { value: 0 },
    uFogColor: { value: new Vector4(0, 0, 0, 0) },
    uFogRange: { value: new Vector2(1, 0) },
  };
}

const WORLD_VERT = /* glsl */ `
attribute vec2 aLmUv;
attribute vec4 aColor;
uniform float uTime;
uniform vec2 uScroll;
varying vec2 vUv;
varying vec2 vLm;
varying float vBlend;
varying float vDepth;
void main() {
  vUv = uv + uScroll * uTime;
  vLm = aLmUv;
  vBlend = aColor.a;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

const WORLD_FRAG = /* glsl */ `
uniform sampler2D uLightmap;
uniform sampler2D uBase;
uniform sampler2D uBase2;
uniform sampler2D uBlendMod;
uniform vec4 uHas; // base, base2, blendmod, -
uniform vec3 uColor;
uniform vec3 uColor2;
uniform float uAlpha;
uniform float uCutoff;
uniform vec4 uFogColor;
uniform vec2 uFogRange;
varying vec2 vUv;
varying vec2 vLm;
varying float vBlend;
varying float vDepth;
void main() {
  vec4 albedo = uHas.x > 0.5 ? texture2D(uBase, vUv) : vec4(uColor, 1.0);
#ifdef WVT
  vec4 albedo2 = uHas.y > 0.5 ? texture2D(uBase2, vUv) : vec4(uColor2, 1.0);
  float blend = vBlend;
#ifdef BLENDMOD
  if (uHas.z > 0.5) {
    vec2 m = texture2D(uBlendMod, vUv).rg;
    blend = smoothstep(clamp(m.g - m.r, 0.0, 1.0), clamp(m.g + m.r, 0.0, 1.0), blend);
  }
#endif
  albedo = mix(albedo, albedo2, blend);
#endif
#ifdef TWOTEX
  if (uHas.y > 0.5) albedo.rgb *= texture2D(uBase2, vUv).rgb;
#endif
#ifdef UNLIT
  vec3 c = albedo.rgb;
#else
  vec3 L = pow(texture2D(uLightmap, vLm).rgb * 2.0, vec3(2.2));
  vec3 c = albedo.rgb * L;
#ifdef SELFILLUM
  c = mix(c, albedo.rgb, albedo.a);
  albedo.a = 1.0;
#endif
#endif
  float a = albedo.a * uAlpha;
#ifdef ALPHATEST
  if (a < uCutoff) discard;
  a = 1.0;
#endif
#ifdef WATER
  c = uColor;
  a = uAlpha;
#endif
  if (uFogRange.y > uFogRange.x) {
    float f = clamp((vDepth - uFogRange.x) / (uFogRange.y - uFogRange.x), 0.0, uFogColor.a);
#ifdef ADDITIVE
    c *= 1.0 - f;
#else
    c = mix(c, uFogColor.rgb, f);
#endif
  }
#ifdef DEBUG_LIGHTMAP
  c = pow(texture2D(uLightmap, vLm).rgb * 2.0, vec3(2.2)) * 0.5;
  a = 1.0;
#endif
#ifdef DEBUG_BLEND
  c = vec3(vBlend, 0.2, 1.0 - vBlend);
  a = 1.0;
#endif
  gl_FragColor = vec4(c, a);
  #include <colorspace_fragment>
}
`;

/** Gamma-encoded 0..1 (manifest `color`) → linear. */
export const gammaToLinear = (c: number): number => Math.pow(Math.max(0, c), 2.2);

export type TextureLoader = (texId: string) => Promise<Texture | null>;

export interface WorldMaterialInfo {
  material: ShaderMaterial;
  /** Drawn in the transparent pass. */
  transparent: boolean;
}

/**
 * Builds the material for a manifest entry. Textures attach when they load (until
 * then, and if they never do, the reflectivity colour is drawn).
 */
export function createWorldMaterial(
  name: string,
  def: MapMaterial,
  shared: SharedWorldUniforms,
  loadTexture: TextureLoader,
  opts: { overlay?: boolean; debug?: 'lightmap' | 'blend' | null } = {},
): WorldMaterialInfo {
  const shader = def.shader;
  const isWater = !!def.water || shader === 'water';
  const unlit =
    !!def.unlit || shader === 'unlitgeneric' || shader === 'unlittwotexture' || shader === 'sprite';
  // $basetexture2 blends by vertex alpha (0 on brush faces, so they show $basetexture).
  const wvt = !!def.base2 && !unlit;
  const decal = !!def.decal || opts.overlay === true;
  const defines: Record<string, string> = {};
  if (wvt) defines.WVT = '';
  if (wvt && def.blendModulate) defines.BLENDMOD = '';
  if (unlit) defines.UNLIT = '';
  if (def.selfillum && !unlit) defines.SELFILLUM = '';
  if (def.alphatest !== undefined && !def.translucent && !def.additive) defines.ALPHATEST = '';
  if (isWater) defines.WATER = '';
  if (def.additive) defines.ADDITIVE = '';
  const twoTex = shader === 'unlittwotexture' && !!def.base2;
  if (twoTex) defines.TWOTEX = '';
  if (opts.debug === 'lightmap') defines.DEBUG_LIGHTMAP = '';
  if (opts.debug === 'blend') defines.DEBUG_BLEND = '';
  const col = def.color ?? [0.5, 0.5, 0.5];
  const color = new Color(gammaToLinear(col[0]), gammaToLinear(col[1]), gammaToLinear(col[2]));
  let alpha = def.alpha ?? 1;
  if (isWater) {
    const fc = def.water?.fogColor ?? col;
    color.setRGB(gammaToLinear(fc[0]), gammaToLinear(fc[1]), gammaToLinear(fc[2]));
    alpha = 0.85;
  }
  const uniforms = {
    uLightmap: shared.uLightmap,
    uTime: shared.uTime,
    uFogColor: shared.uFogColor,
    uFogRange: shared.uFogRange,
    uBase: { value: null as Texture | null },
    uBase2: { value: null as Texture | null },
    uBlendMod: { value: null as Texture | null },
    uHas: { value: new Vector4(0, 0, 0, 0) },
    uColor: { value: color },
    uColor2: { value: color.clone() },
    uAlpha: { value: alpha },
    uCutoff: { value: def.alphatest ?? 0.5 },
    uScroll: { value: new Vector2(def.scroll?.[0] ?? 0, def.scroll?.[1] ?? 0) },
  };
  const transparent = !!(def.translucent || def.additive || isWater || alpha < 1 || (decal && !def.alphatest));
  const material = new ShaderMaterial({
    name,
    vertexShader: WORLD_VERT,
    fragmentShader: WORLD_FRAG,
    uniforms,
    defines,
    transparent,
    depthWrite: !transparent,
    blending: def.additive ? AdditiveBlending : NormalBlending,
    side: def.nocull || isWater ? DoubleSide : FrontSide,
  });
  if (decal) {
    material.polygonOffset = true;
    material.polygonOffsetFactor = -1;
    material.polygonOffsetUnits = -4;
  }
  const attach = (id: string | undefined, key: 'uBase' | 'uBase2' | 'uBlendMod', slot: 'x' | 'y' | 'z') => {
    if (!id || isWater) return;
    void loadTexture(id).then((tex) => {
      if (!tex) return;
      uniforms[key].value = tex;
      uniforms.uHas.value[slot] = 1;
    });
  };
  attach(def.base, 'uBase', 'x');
  if (wvt || twoTex) attach(def.base2, 'uBase2', 'y');
  if (wvt) attach(def.blendModulate, 'uBlendMod', 'z');
  return { material, transparent };
}

/** The material drawn for a texdata name the manifest does not know (colour only). */
export function fallbackMaterial(name: string, reflectivity: { x: number; y: number; z: number }): MapMaterial {
  const g = (c: number) => Math.pow(Math.max(0, Math.min(1, c)), 1 / 2.2);
  const m: MapMaterial = {
    shader: 'missing',
    color: [g(reflectivity.x), g(reflectivity.y), g(reflectivity.z)],
  };
  if (name.startsWith('tools/')) {
    if (name === 'tools/toolsblack' || name === 'tools/toolsblack_noportal') {
      m.unlit = true;
      m.color = [0, 0, 0];
    } else {
      m.nodraw = true;
    }
  }
  if (name.includes('water') && !name.includes('waterfall')) {
    m.shader = 'water';
    m.water = { fogColor: m.color, fogStart: 0, fogEnd: 200 };
  }
  if (name.startsWith('skybox/')) m.sky = true;
  return m;
}
