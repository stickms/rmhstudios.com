/**
 * Static props (the BSP's sprp game lump): one InstancedMesh per (model, skin,
 * primitive, main world / 3D skybox), drawn from the model channel's GLBs with the
 * skin family remapped through `scene.extras.skins` (docs/tf2-game.md "Models").
 * A static prop GLB is unskinned and its positions are MDL model space in metres with
 * Source's axes (Z up), so instances use sourceTransformToMatrixSrcAxes.
 *
 * Lighting: the leaf ambient cube sampled at each prop's lighting origin plus the sun
 * when that origin can see it (lighting.ts) — a stand-in for vrad's per-vertex prop
 * lighting, which packages do not carry. Fade distances follow the lump
 * (fadeMinDist/fadeMaxDist, a screen-door dither between them).
 *
 * Visibility: instances outside the camera's PVS are compacted out when the camera
 * changes cluster; InstancedMesh frustum culling handles the rest.
 */
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  FrontSide,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  type Material,
  type Mesh,
  type Object3D,
  ShaderMaterial,
  type Texture,
  Vector3,
  AdditiveBlending,
  NormalBlending,
} from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { BspFile, StaticProp } from '../formats/bsp';
import { SOURCE_UNIT, sourceTransformToMatrixSrcAxes } from './coords';
import { AMBIENT_CUBE_GLSL, newAmbientCube, sampleAmbientCube, type SunLight } from './lighting';
import type { SharedWorldUniforms } from './materials';

/** A loaded model: the GLB and its materials in glTF order. */
export interface LoadedModel {
  gltf: GLTF;
  materials: Material[];
}

export interface ModelProvider {
  load(mdlPath: string): Promise<LoadedModel | null>;
}

/** STATIC_PROP_* flags. */
export const STATIC_PROP_USE_LIGHTING_ORIGIN = 0x2;
export const STATIC_PROP_NO_DRAW = 0x4;

const PROP_VERT = /* glsl */ `
attribute vec3 aCube0;
attribute vec3 aCube1;
attribute vec3 aCube2;
attribute vec3 aCube3;
attribute vec3 aCube4;
attribute vec3 aCube5;
attribute vec4 aParams; // fadeMin, fadeMax (metres), sun visibility, -
uniform vec3 uSunDir;
uniform vec3 uSunColor;
varying vec2 vUv;
varying vec3 vLight;
varying float vFade;
varying float vDepth;
${AMBIENT_CUBE_GLSL}
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vec3 n = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
  vLight = tf2AmbientCube(n, aCube0, aCube1, aCube2, aCube3, aCube4, aCube5)
    + uSunColor * aParams.z * max(dot(n, uSunDir), 0.0);
  float d = distance(wp.xyz, cameraPosition);
  vFade = 1.0;
  if (aParams.y > 0.0) {
    vFade = clamp((aParams.y - d) / max(aParams.y - aParams.x, 1e-3), 0.0, 1.0);
  }
  vec4 mv = viewMatrix * wp;
  vDepth = -mv.z;
  gl_Position = vFade <= 0.0 ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * mv;
}
`;

const PROP_FRAG = /* glsl */ `
uniform sampler2D uMap;
uniform float uHasMap;
uniform vec3 uColor;
uniform float uCutoff;
uniform vec4 uFogColor;
uniform vec2 uFogRange;
varying vec2 vUv;
varying vec3 vLight;
varying float vFade;
varying float vDepth;
float bayer4(vec2 p) {
  vec2 q = mod(floor(p), 4.0);
  int i = int(q.x + q.y * 4.0);
  float m[16] = float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);
  return (m[i] + 0.5) / 16.0;
}
void main() {
  if (vFade < 1.0 && vFade < bayer4(gl_FragCoord.xy)) discard;
  vec4 albedo = uHasMap > 0.5 ? texture2D(uMap, vUv) : vec4(uColor, 1.0);
#ifdef ALPHATEST
  if (albedo.a < uCutoff) discard;
  albedo.a = 1.0;
#endif
#ifdef UNLIT
  vec3 c = albedo.rgb;
#else
  vec3 c = albedo.rgb * vLight;
#ifdef SELFILLUM
  c = mix(c, albedo.rgb, albedo.a);
  albedo.a = 1.0;
#endif
#endif
#ifndef TRANSLUCENT
  albedo.a = 1.0;
#endif
  if (uFogRange.y > uFogRange.x) {
    float f = clamp((vDepth - uFogRange.x) / (uFogRange.y - uFogRange.x), 0.0, uFogColor.a);
    c = mix(c, uFogColor.rgb, f);
  }
  gl_FragColor = vec4(c, albedo.a);
  #include <colorspace_fragment>
}
`;

interface Instance {
  prop: StaticProp;
  matrix: Matrix4;
  cube: Float32Array;
  params: [number, number, number, number];
  clusters: number[];
}

interface PropGroup {
  model: string;
  skin: number;
  sky3d: boolean;
  instances: Instance[];
  meshes: InstancedMesh[];
  /** Per-mesh local (node) matrix. */
  locals: Matrix4[];
  visibleCount: number;
  /** Bounding sphere of the visible instances' origins (three space) and their largest fade distance (0: never fades). */
  cx: number;
  cy: number;
  cz: number;
  r: number;
  maxFade: number;
}

export interface StaticPropOptions {
  provider: ModelProvider;
  sun: SunLight | null;
  shared: SharedWorldUniforms;
  /** Sun direction/colour uniforms shared with other lit models. */
  sunUniforms: { uSunDir: { value: Vector3 }; uSunColor: { value: Vector3 } };
  /** Whether the sun reaches a Source point (default: always). */
  sunVisible?: (p: { x: number; y: number; z: number }) => boolean;
  hdr: boolean;
  lightScale: number;
  skyArea: number;
}

export interface StaticPropStats {
  instances: number;
  models: number;
  loaded: number;
  failed: number;
}

export class StaticPropRenderer {
  readonly group = new Group();
  readonly skyGroup = new Group();
  readonly stats: StaticPropStats = { instances: 0, models: 0, loaded: 0, failed: 0 };
  private readonly groups: PropGroup[] = [];
  private readonly materialCache = new Map<string, ShaderMaterial>();
  private readonly ownedGeometries: BufferGeometry[] = [];
  private lastRow: Uint8Array | null = null;
  private disposed = false;

  constructor(
    private readonly bsp: BspFile,
    private readonly opts: StaticPropOptions,
  ) {
    this.group.name = 'static-props';
    this.skyGroup.name = 'static-props-sky';
    this.collect();
  }

  private collect(): void {
    const sp = this.bsp.staticProps;
    if (!sp) return;
    const byKey = new Map<string, PropGroup>();
    const L = this.bsp.leafs;
    const pos = { x: 0, y: 0, z: 0 };
    for (const prop of sp.props) {
      if (prop.flags & STATIC_PROP_NO_DRAW) continue;
      const model = prop.model.toLowerCase().replace(/\\/g, '/');
      const leaves = sp.leafs.subarray(prop.firstLeaf, prop.firstLeaf + prop.leafCount);
      let sky3d = false;
      const clusters = new Set<number>();
      for (const l of leaves) {
        if (l >= L.count) continue;
        if (L.cluster[l] >= 0) clusters.add(L.cluster[l]);
        if (this.opts.skyArea >= 0 && L.area[l] === this.opts.skyArea) sky3d = true;
      }
      const key = `${model}|${prop.skin}|${sky3d ? 1 : 0}`;
      let g = byKey.get(key);
      if (!g) {
        g = { model, skin: prop.skin, sky3d, instances: [], meshes: [], locals: [], visibleCount: 0, cx: 0, cy: 0, cz: 0, r: 0, maxFade: 0 };
        byKey.set(key, g);
        this.groups.push(g);
      }
      const useLo = (prop.flags & STATIC_PROP_USE_LIGHTING_ORIGIN) !== 0;
      const lo = useLo ? prop.lightingOrigin : prop.origin;
      pos.x = lo.x;
      pos.y = lo.y;
      pos.z = lo.z + (useLo ? 0 : 8);
      const cube = newAmbientCube();
      sampleAmbientCube(this.bsp, pos, cube, { hdr: this.opts.hdr, scale: this.opts.lightScale });
      const sunVis = this.opts.sun && (!this.opts.sunVisible || this.opts.sunVisible(pos)) ? 1 : 0;
      const fadeScale = prop.forcedFadeScale > 0 ? prop.forcedFadeScale : 1;
      const fadeMax = prop.fadeMaxDist > 0 ? (prop.fadeMaxDist / fadeScale) * SOURCE_UNIT : 0;
      const fadeMin = prop.fadeMaxDist > 0 ? (Math.max(0, prop.fadeMinDist) / fadeScale) * SOURCE_UNIT : 0;
      g.instances.push({
        prop,
        matrix: sourceTransformToMatrixSrcAxes(prop.origin, prop.angles, prop.uniformScale || 1, new Matrix4()),
        cube,
        params: [fadeMin, fadeMax, sunVis, 0],
        clusters: [...clusters],
      });
      this.stats.instances++;
    }
    this.stats.models = new Set(this.groups.map((g) => g.model)).size;
  }

  /** Loads every model (progressively; groups appear as their GLBs arrive). */
  async load(): Promise<void> {
    const models = [...new Set(this.groups.map((g) => g.model))];
    await Promise.all(
      models.map(async (m) => {
        const lm = await this.opts.provider.load(m).catch(() => null);
        if (this.disposed) return;
        if (!lm) {
          this.stats.failed++;
          return;
        }
        this.stats.loaded++;
        for (const g of this.groups) if (g.model === m) this.build(g, lm);
      }),
    );
  }

  private build(g: PropGroup, lm: LoadedModel): void {
    const { gltf } = lm;
    const extras = (gltf.scene.userData ?? {}) as { skins?: number[][] };
    const json = gltf.parser.json as { meshes?: Array<{ primitives: Array<{ extras?: { slot?: number } }> }> };
    gltf.scene.updateMatrixWorld(true);
    const skins = extras.skins ?? [];
    const family = skins[g.skin] ?? skins[0];
    const n = g.instances.length;
    // Instance attributes shared by every primitive of the group.
    const cubes = Array.from({ length: 6 }, () => new InstancedBufferAttribute(new Float32Array(n * 3), 3));
    const params = new InstancedBufferAttribute(new Float32Array(n * 4), 4);
    const meshes: Mesh[] = [];
    gltf.scene.traverse((o: Object3D) => {
      if ((o as Mesh).isMesh) meshes.push(o as Mesh);
    });
    for (const mesh of meshes) {
      const assoc = gltf.parser.associations.get(mesh) as { meshes?: number; primitives?: number } | undefined;
      const prim =
        assoc && assoc.meshes !== undefined && assoc.primitives !== undefined
          ? json.meshes?.[assoc.meshes]?.primitives[assoc.primitives]
          : undefined;
      const slot = prim?.extras?.slot;
      let src: Material | undefined = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      if (family && slot !== undefined && slot < family.length) {
        const mi = family[slot];
        if (mi < 0) continue; // this skin draws nothing in the slot
        src = lm.materials[mi] ?? src;
      }
      if (!src) continue;
      const geo = new BufferGeometry();
      const sg = mesh.geometry;
      for (const name of ['position', 'normal', 'uv'] as const) {
        const a = sg.getAttribute(name);
        if (a) geo.setAttribute(name, a);
      }
      if (!geo.getAttribute('normal')) continue;
      if (!geo.getAttribute('uv')) {
        geo.setAttribute('uv', new BufferAttribute(new Float32Array(sg.getAttribute('position').count * 2), 2));
      }
      geo.setIndex(sg.getIndex());
      if (!sg.boundingSphere) sg.computeBoundingSphere();
      geo.boundingSphere = sg.boundingSphere?.clone() ?? null;
      geo.boundingBox = sg.boundingBox?.clone() ?? null;
      for (let k = 0; k < 6; k++) geo.setAttribute(`aCube${k}`, cubes[k]);
      geo.setAttribute('aParams', params);
      this.ownedGeometries.push(geo);
      const im = new InstancedMesh(geo, this.propMaterial(src), n);
      im.name = `${g.model}#${g.skin}`;
      im.matrixAutoUpdate = false;
      g.meshes.push(im);
      g.locals.push(mesh.matrixWorld.clone());
      (g.sky3d ? this.skyGroup : this.group).add(im);
    }
    this.fill(g, this.lastRow);
  }

  private propMaterial(src: Material): ShaderMaterial {
    const cached = this.materialCache.get(src.uuid);
    if (cached) return cached;
    const ud = (src.userData ?? {}) as {
      translucent?: boolean;
      alphatest?: boolean;
      cutoff?: number;
      additive?: boolean;
      nocull?: boolean;
      selfillum?: boolean;
      unlit?: boolean;
      shader?: string;
    };
    const s = src as Material & { map?: Texture | null; color?: Color; alphaTest?: number };
    const defines: Record<string, string> = {};
    const translucent = !!(ud.translucent || ud.additive);
    if (ud.alphatest || (!translucent && (s.alphaTest ?? 0) > 0)) defines.ALPHATEST = '';
    if (translucent) defines.TRANSLUCENT = '';
    if (ud.selfillum) defines.SELFILLUM = '';
    if (ud.unlit || ud.shader === 'unlitgeneric') defines.UNLIT = '';
    const m = new ShaderMaterial({
      name: src.name,
      vertexShader: PROP_VERT,
      fragmentShader: PROP_FRAG,
      defines,
      uniforms: {
        uMap: { value: s.map ?? null },
        uHasMap: { value: s.map ? 1 : 0 },
        uColor: { value: s.map ? new Color(1, 1, 1) : (s.color?.clone() ?? new Color(0.6, 0.6, 0.6)) },
        uCutoff: { value: ud.cutoff ?? (s.alphaTest || 0.5) },
        uSunDir: this.opts.sunUniforms.uSunDir,
        uSunColor: this.opts.sunUniforms.uSunColor,
        uFogColor: this.opts.shared.uFogColor,
        uFogRange: this.opts.shared.uFogRange,
      },
      transparent: translucent,
      depthWrite: !translucent,
      blending: ud.additive ? AdditiveBlending : NormalBlending,
      side: ud.nocull || src.side === DoubleSide ? DoubleSide : FrontSide,
    });
    this.materialCache.set(src.uuid, m);
    return m;
  }

  /** Writes the instances visible in `row` (null: all) into a group's buffers. */
  private fill(g: PropGroup, row: Uint8Array | null): void {
    if (!g.meshes.length) return;
    const first = g.meshes[0].geometry;
    const cubes = Array.from({ length: 6 }, (_, k) => first.getAttribute(`aCube${k}`) as InstancedBufferAttribute);
    const params = first.getAttribute('aParams') as InstancedBufferAttribute;
    const tmp = new Matrix4();
    let n = 0;
    let minX = Infinity;
    let minY = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let maxZ = -Infinity;
    let maxFade = 0;
    let fadesAll = true;
    for (const inst of g.instances) {
      if (row && !g.sky3d && inst.clusters.length) {
        let vis = false;
        for (const c of inst.clusters) {
          if (row[c >> 3] & (1 << (c & 7))) {
            vis = true;
            break;
          }
        }
        if (!vis) continue;
      }
      for (let k = 0; k < 6; k++) {
        cubes[k].setXYZ(n, inst.cube[k * 3], inst.cube[k * 3 + 1], inst.cube[k * 3 + 2]);
      }
      params.setXYZW(n, inst.params[0], inst.params[1], inst.params[2], inst.params[3]);
      const e = inst.matrix.elements;
      minX = Math.min(minX, e[12]);
      minY = Math.min(minY, e[13]);
      minZ = Math.min(minZ, e[14]);
      maxX = Math.max(maxX, e[12]);
      maxY = Math.max(maxY, e[13]);
      maxZ = Math.max(maxZ, e[14]);
      if (inst.params[1] > 0) maxFade = Math.max(maxFade, inst.params[1]);
      else fadesAll = false;
      for (let mi = 0; mi < g.meshes.length; mi++) {
        tmp.multiplyMatrices(inst.matrix, g.locals[mi]);
        g.meshes[mi].setMatrixAt(n, tmp);
      }
      n++;
    }
    for (const a of cubes) a.needsUpdate = true;
    params.needsUpdate = true;
    for (const im of g.meshes) {
      im.count = n;
      im.visible = n > 0;
      im.instanceMatrix.needsUpdate = true;
      if (n > 0) im.computeBoundingSphere();
    }
    g.visibleCount = n;
    g.cx = (minX + maxX) / 2;
    g.cy = (minY + maxY) / 2;
    g.cz = (minZ + maxZ) / 2;
    g.r = Math.hypot(maxX - minX, maxY - minY, maxZ - minZ) / 2;
    g.maxFade = fadesAll ? maxFade : 0;
  }

  /**
   * Hides groups whose every visible instance is past its fade distance from the
   * camera (three-space position) — the shader already discards them; this saves
   * the draw call.
   */
  cullByDistance(camX: number, camY: number, camZ: number): void {
    for (const g of this.groups) {
      if (g.sky3d || !g.meshes.length || g.visibleCount === 0 || g.maxFade <= 0) continue;
      const d = Math.hypot(camX - g.cx, camY - g.cy, camZ - g.cz) - g.r;
      const show = d < g.maxFade;
      for (const im of g.meshes) im.visible = show;
    }
  }

  /** Applies a PVS row (null = everything) to every group. */
  setPvs(row: Uint8Array | null): void {
    this.lastRow = row;
    for (const g of this.groups) if (!g.sky3d) this.fill(g, row);
  }

  get groupCount(): number {
    return this.groups.reduce((a, g) => a + g.meshes.length, 0);
  }

  dispose(): void {
    this.disposed = true;
    for (const g of this.ownedGeometries) g.dispose();
    for (const m of this.materialCache.values()) m.dispose();
    for (const g of this.groups) for (const im of g.meshes) im.dispose();
    this.group.clear();
    this.skyGroup.clear();
  }
}

/**
 * Loads static-prop GLBs from the model channel's `mdl/index.json`
 * (`{ <mdl path>: { glb, … } }`). `url` resolves a channel path (`mdl/<sha>.glb`).
 */
export class GlbModelProvider implements ModelProvider {
  private index: Promise<Record<string, { glb?: string }> | null> | null = null;
  private readonly cache = new Map<string, Promise<LoadedModel | null>>();

  constructor(
    private readonly opts: {
      url: (path: string) => string;
      loader: { loadAsync(url: string): Promise<GLTF> };
      index?: Record<string, { glb?: string }>;
    },
  ) {
    if (opts.index) this.index = Promise.resolve(opts.index);
  }

  private loadIndex(): Promise<Record<string, { glb?: string }> | null> {
    this.index ??= fetch(this.opts.url('mdl/index.json'))
      .then((r) => (r.ok ? (r.json() as Promise<Record<string, { glb?: string }>>) : null))
      .catch(() => null);
    return this.index;
  }

  load(mdlPath: string): Promise<LoadedModel | null> {
    const key = mdlPath.toLowerCase();
    let p = this.cache.get(key);
    if (!p) {
      p = (async () => {
        const index = await this.loadIndex();
        const entry = index?.[key];
        if (!entry?.glb) return null;
        const path = entry.glb.startsWith('mdl/') ? entry.glb : `mdl/${entry.glb}`;
        const gltf = await this.opts.loader.loadAsync(this.opts.url(path));
        const materials = (await gltf.parser.getDependencies('material')) as Material[];
        return { gltf, materials };
      })().catch(() => null);
      this.cache.set(key, p);
    }
    return p;
  }
}
