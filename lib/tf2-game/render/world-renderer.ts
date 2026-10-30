/**
 * The map renderer: world brushes and displacements (lightmapped, chunked per
 * material and space with PVS + frustum culling), brush entity models, the 2D sky,
 * the 3D skybox, static props and fog. Plain three.js; the game loop owns the one
 * requestAnimationFrame and calls `update()` + `render()` each frame.
 *
 * Other things the game draws (players, projectiles, particles) go into `scene`.
 *
 * Draw order per frame: 2D sky (depth off) → 3D skybox (its area's geometry and props,
 * scaled by sky_camera `scale` around its origin, with its own fog) → clear depth →
 * the world (opaque, then transparent).
 */
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DataTexture,
  Group,
  LinearFilter,
  Matrix4,
  Mesh,
  type Object3D,
  PerspectiveCamera,
  RGBAFormat,
  Scene,
  type ShaderMaterial,
  type Texture,
  UnsignedByteType,
  Vector3,
  type WebGLRenderer,
} from 'three';
import type { MapManifest, MapMaterial } from '@/lib/tf2-game/assets/map-manifest';
import { decompressVis, findLeaf, type BspFile } from '../formats/bsp';
import { buildDisplacements } from '../formats/displacement';
import type { SourceCamera } from './camera';
import { SOURCE_UNIT, sourceTransformToMatrix, srcToThree } from './coords';
import {
  createModelLightingUniforms,
  findSun,
  newAmbientCube,
  sampleAmbientCube,
  setModelLighting,
  type AmbientCube,
  type ModelLightingUniforms,
  type SunLight,
  type Vec3Like,
} from './lighting';
import { buildLightmapAtlas, HDR_TO_LDR_SCALE, measureHdrScale, type LightmapAtlas } from './lightmap';
import {
  createSharedWorldUniforms,
  createWorldMaterial,
  fallbackMaterial,
  gammaToLinear,
  type SharedWorldUniforms,
} from './materials';
import { StaticPropRenderer, type ModelProvider } from './props';
import { SkyBox, type SkyFace } from './sky';
import type { TextureCache } from './texture-cache';
import {
  buildOverlayChunks,
  buildWorldChunks,
  clustersVisible,
  leafClusters,
  leavesInBox,
  normalizeMaterialName,
  unpatchMaterialName,
  type ChunkData,
} from './world-geometry';

export type GameName = 'tf2' | 'hl2' | 'portal' | 'csgo';

export interface WorldRendererOptions {
  bsp: BspFile;
  /** The map package manifest; null draws texdata colours only (local dev). */
  manifest: MapManifest | null;
  game?: GameName;
  /** Texture loader (null: no textures, colours only). */
  textures?: TextureCache | null;
  /** Static prop models (null: no props). */
  models?: ModelProvider | null;
  /** Whether the sun reaches a Source point (static prop lighting); default always. */
  sunVisible?: (p: Vec3Like) => boolean;
  /** Lighting lump to use; default the manifest's, else LDR when present. */
  lighting?: 'hdr' | 'ldr';
  /** HDR → LDR brightness factor (default: measured when both lumps exist, else per game). */
  hdrScale?: number;
  maxChunkTris?: number;
  /** Debug views: lightmap only, or displacement blend alpha. */
  debugView?: 'lightmap' | 'blend' | null;
}

export interface WorldRenderStats {
  /** Draw calls and triangles of the last render() (all passes). */
  drawCalls: number;
  /** Draw calls of the 2D sky + 3D skybox passes (included in drawCalls). */
  skyDrawCalls: number;
  triangles: number;
  /** Chunks drawn after PVS (before frustum culling). */
  pvsChunks: number;
  chunks: number;
  skyChunks: number;
  materials: number;
  /** Build timings, ms. */
  buildMs: { total: number; lightmap: number; geometry: number; meshes: number };
  lightmap: { width: number; height: number; luxels: number };
  vertices: number;
  trisTotal: number;
  /** Camera leaf/cluster of the last update. */
  leaf: number;
  cluster: number;
  props: { instances: number; models: number; loaded: number; failed: number; meshes: number };
}

interface ChunkMesh {
  mesh: Mesh;
  data: Pick<ChunkData, 'clusters' | 'model' | 'sky3d'>;
}

interface FogParams {
  color: Vector3;
  start: number;
  end: number;
  maxDensity: number;
}

/** Entity classes whose brush model is not drawn by default. */
const HIDDEN_BRUSH_CLASSES = new Set([
  'func_respawnroomvisualizer',
  'func_respawnroom',
  'func_regenerate',
  'func_nobuild',
  'func_areaportal',
  'func_areaportalwindow',
  'func_occluder',
  'func_clip_vphysics',
  'func_precipitation',
  'func_dustcloud',
  'func_dustmotes',
  'func_vehicleclip',
  'func_ladderendpoint',
  'func_capturezone',
  'func_flagdetectionzone',
  'func_upgradestation',
]);

/** Brush entity classes whose "angles" key is a move direction, not a rotation. */
const MOVEDIR_CLASSES = new Set(['func_door', 'func_movelinear', 'func_button', 'func_water_analog']);

const LEAF_FLAGS_SKY = 0x1;
const CONTENTS_WATER = 0x20;
const CONTENTS_SLIME = 0x10;

export class WorldRenderer {
  readonly bsp: BspFile;
  readonly manifest: MapManifest | null;
  /** The main scene. Add game objects here. */
  readonly scene = new Scene();
  /** The 3D skybox (scaled into place). */
  readonly skyScene = new Scene();
  readonly sky2d: SkyBox;
  readonly shared: SharedWorldUniforms;
  /** Sun direction / colour for lit models (shared by props; reuse for characters). */
  readonly sunUniforms: ModelLightingUniforms;
  readonly sun: SunLight | null;
  readonly hdr: boolean;
  readonly lightScale: number;
  readonly stats: WorldRenderStats;
  readonly props: StaticPropRenderer | null;

  private readonly worldGroup = new Group();
  private readonly skyRoot = new Group();
  private readonly brushModels = new Map<number, Group>();
  /** Per brush model: entity visibility, PVS clusters at its current placement, PVS result. */
  private readonly brushState = new Map<number, { shown: boolean; clusters: number[]; pvs: boolean }>();
  private readonly chunkMeshes: ChunkMesh[] = [];
  private readonly materials = new Map<string, { material: ShaderMaterial; transparent: boolean }>();
  private readonly resolved = new Map<string, MapMaterial>();
  private readonly geometries: BufferGeometry[] = [];
  private readonly lightmap: DataTexture;
  private readonly textures: TextureCache | null;
  private readonly acquired: string[] = [];
  private readonly skyCamera = new PerspectiveCamera();
  private readonly sky3d: { origin: Vector3; scale: number; fog: FogParams | null } | null;
  private readonly worldFog: FogParams | null;
  private readonly waterFog: FogParams | null;
  /** PVS culling on (debugging switch; frustum culling always applies). */
  pvsEnabled = true;
  private lastCluster = -2;
  private pvsRow: Uint8Array | null = null;
  private cameraLeaf = -1;
  private propsPromise: Promise<void> | null = null;
  private readonly debugView: 'lightmap' | 'blend' | null;

  constructor(opts: WorldRendererOptions) {
    const t0 = performance.now();
    const { bsp, manifest } = opts;
    this.bsp = bsp;
    this.manifest = manifest;
    this.textures = opts.textures ?? null;
    this.debugView = opts.debugView ?? null;
    const game = opts.game ?? manifest?.game ?? 'tf2';

    // Lighting lump and calibration.
    const lighting =
      opts.lighting ?? manifest?.lighting ?? (bsp.lighting.length > 0 ? 'ldr' : 'hdr');
    this.hdr = lighting === 'hdr' && bsp.lightingHdr.length > 0;
    this.lightScale = this.hdr ? (opts.hdrScale ?? measureHdrScale(bsp) ?? HDR_TO_LDR_SCALE[game]) : 1;
    this.shared = createSharedWorldUniforms();
    this.sunUniforms = createModelLightingUniforms();
    this.sun = findSun(bsp, { hdr: this.hdr, scale: this.lightScale });
    setModelLighting(this.sunUniforms, newAmbientCube(), this.sun, 1);

    const t1 = performance.now();
    const atlas = buildLightmapAtlas(bsp, { hdr: this.hdr, scale: this.lightScale });
    this.lightmap = makeLightmapTexture(atlas);
    this.shared.uLightmap.value = this.lightmap;
    const t2 = performance.now();

    // 3D skybox and fog parameters from the entity lump (manifest sky wins).
    const skyCamEnt = bsp.entities.find((e) => e.classname === 'sky_camera');
    const camOrigin = manifest?.sky?.camera?.origin ?? (skyCamEnt ? vecOf(skyCamEnt.get('origin')) : null);
    const camScale = manifest?.sky?.camera?.scale ?? (skyCamEnt ? Number(skyCamEnt.get('scale') ?? 16) : 16);
    let skyArea = -1;
    if (camOrigin) {
      const leaf = findLeaf(bsp, { x: camOrigin[0], y: camOrigin[1], z: camOrigin[2] });
      if (leaf >= 0 && bsp.leafs.cluster[leaf] >= 0) skyArea = bsp.leafs.area[leaf];
    }
    this.sky3d =
      camOrigin && skyArea >= 0
        ? {
            origin: srcToThree(camOrigin[0], camOrigin[1], camOrigin[2], new Vector3()),
            scale: camScale > 0 ? camScale : 16,
            fog: skyCamEnt ? parseFog(skyCamEnt.get.bind(skyCamEnt), camScale > 0 ? camScale : 16) : null,
          }
        : null;
    const fogEnt = bsp.entities.find((e) => e.classname === 'env_fog_controller');
    this.worldFog = fogEnt ? parseFog(fogEnt.get.bind(fogEnt), 1) : null;
    this.waterFog = this.findWaterFog();

    // World chunks.
    const displacements = buildDisplacements(bsp);
    const chunks = buildWorldChunks(bsp, {
      atlas,
      lightFaces: this.hdr && bsp.facesHdr.length === bsp.faces.length ? bsp.facesHdr : bsp.faces,
      displacements,
      drawMaterial: (name) => {
        const m = this.resolveMaterial(name);
        return !(m.nodraw || m.sky);
      },
      skyArea: this.sky3d ? skyArea : -1,
      maxChunkTris: opts.maxChunkTris,
    });
    // Overlays need their real (translucent) materials: skipped without a manifest.
    const overlayStart = chunks.length;
    if (manifest) {
      chunks.push(
        ...buildOverlayChunks(bsp, {
          atlas,
          lightFaces: this.hdr && bsp.facesHdr.length === bsp.faces.length ? bsp.facesHdr : bsp.faces,
          drawMaterial: (name) => {
            const m = this.resolveMaterial(name);
            return !(m.nodraw || m.sky);
          },
        }),
      );
    }
    const t3 = performance.now();

    this.scene.name = 'world';
    this.worldGroup.name = 'world-brushes';
    this.scene.add(this.worldGroup);
    this.skyRoot.name = 'sky3d';
    this.skyRoot.matrixAutoUpdate = false;
    this.skyScene.add(this.skyRoot);
    if (this.sky3d) {
      const s = this.sky3d.scale;
      const o = this.sky3d.origin;
      this.skyRoot.matrix.makeScale(s, s, s).multiply(new Matrix4().makeTranslation(-o.x, -o.y, -o.z));
      this.skyRoot.matrixWorldNeedsUpdate = true;
    }
    let vertices = 0;
    let tris = 0;
    let skyChunks = 0;
    for (let ci = 0; ci < chunks.length; ci++) {
      const c = chunks[ci];
      const mat = this.materialFor(c.material, ci >= overlayStart);
      const g = new BufferGeometry();
      g.setAttribute('position', new BufferAttribute(c.positions, 3));
      g.setAttribute('normal', new BufferAttribute(c.normals, 3));
      g.setAttribute('uv', new BufferAttribute(c.uvs, 2));
      g.setAttribute('aLmUv', new BufferAttribute(c.uv2s, 2));
      g.setAttribute('aColor', new BufferAttribute(c.colors, 4, true));
      g.setIndex(new BufferAttribute(c.indices, 1));
      g.boundingSphere = null;
      g.computeBoundingSphere();
      this.geometries.push(g);
      const mesh = new Mesh(g, mat.material);
      mesh.name = c.material;
      mesh.matrixAutoUpdate = false;
      if (mat.transparent) mesh.renderOrder = 1;
      vertices += c.positions.length / 3;
      tris += c.indices.length / 3;
      if (c.model !== 0) {
        this.brushModelGroup(c.model).add(mesh);
      } else if (c.sky3d) {
        this.skyRoot.add(mesh);
        skyChunks++;
      } else {
        this.worldGroup.add(mesh);
      }
      this.chunkMeshes.push({ mesh, data: { clusters: c.clusters, model: c.model, sky3d: c.sky3d } });
    }
    this.placeBrushEntities();

    // 2D sky.
    this.sky2d = new SkyBox();
    this.loadSky();

    // Static props.
    this.props =
      bsp.staticProps && opts.models
        ? new StaticPropRenderer(bsp, {
            provider: opts.models,
            sun: this.sun,
            shared: this.shared,
            sunUniforms: this.sunUniforms,
            sunVisible: opts.sunVisible,
            hdr: this.hdr,
            lightScale: this.lightScale,
            skyArea: this.sky3d ? skyArea : -1,
          })
        : null;
    if (this.props) {
      this.scene.add(this.props.group);
      this.skyRoot.add(this.props.skyGroup);
      this.propsPromise = this.props.load();
    }
    const t4 = performance.now();

    this.stats = {
      drawCalls: 0,
      skyDrawCalls: 0,
      triangles: 0,
      pvsChunks: 0,
      chunks: chunks.length,
      skyChunks,
      materials: this.materials.size,
      buildMs: { total: t4 - t0, lightmap: t2 - t1, geometry: t3 - t2, meshes: t4 - t3 },
      lightmap: { width: atlas.width, height: atlas.height, luxels: atlas.luxels },
      vertices,
      trisTotal: tris,
      leaf: -1,
      cluster: -1,
      props: { instances: 0, models: 0, loaded: 0, failed: 0, meshes: 0 },
    };
  }

  // --- materials -----------------------------------------------------------------

  /** The manifest entry for a texdata material (falls back to its colour). */
  resolveMaterial(name: string): MapMaterial {
    let m = this.resolved.get(name);
    if (m) return m;
    const mats = this.manifest?.materials;
    m = mats ? (mats[name] ?? mats[unpatchMaterialName(name) ?? '']) : undefined;
    if (!m) {
      const td = this.bsp.texData.find((t) => normalizeMaterialName(t.name) === name);
      m = fallbackMaterial(unpatchMaterialName(name) ?? name, td?.reflectivity ?? { x: 0.5, y: 0.5, z: 0.5 });
    }
    this.resolved.set(name, m);
    return m;
  }

  private materialFor(name: string, overlay: boolean) {
    const key = overlay ? `${name}|overlay` : name;
    let m = this.materials.get(key);
    if (!m) {
      m = createWorldMaterial(name, this.resolveMaterial(name), this.shared, (id) => this.loadTexture(id), {
        overlay,
        debug: this.debugView,
      });
      this.materials.set(key, m);
    }
    return m;
  }

  private loadTexture(texId: string): Promise<Texture | null> {
    const t = this.manifest?.textures[texId];
    if (!t || !this.textures) return Promise.resolve(null);
    this.acquired.push(t.file);
    return this.textures.acquire(t.file);
  }

  private findWaterFog(): FogParams | null {
    for (const td of this.bsp.texData) {
      const m = this.resolveMaterial(normalizeMaterialName(td.name));
      if (m.water) {
        const c = m.water.fogColor;
        return {
          color: new Vector3(gammaToLinear(c[0]), gammaToLinear(c[1]), gammaToLinear(c[2])),
          start: m.water.fogStart * SOURCE_UNIT,
          end: Math.max(m.water.fogEnd, m.water.fogStart + 1) * SOURCE_UNIT,
          maxDensity: 1,
        };
      }
    }
    return null;
  }

  private loadSky(): void {
    const sky = this.manifest?.sky;
    if (!sky || !this.textures) return;
    for (const face of ['rt', 'lf', 'bk', 'ft', 'up', 'dn'] as SkyFace[]) {
      const id = sky.faces[face];
      if (!id) continue;
      const info = this.manifest?.textures[id];
      if (!info) continue;
      void this.loadTexture(id).then((tex) => {
        if (tex) this.sky2d.setFace(face, tex, info.w, info.h);
      });
    }
  }

  // --- brush entities ------------------------------------------------------------

  private brushModelGroup(model: number): Group {
    let g = this.brushModels.get(model);
    if (!g) {
      g = new Group();
      g.name = `*${model}`;
      g.matrixAutoUpdate = false;
      this.brushModels.set(model, g);
      this.brushState.set(model, { shown: true, clusters: [], pvs: true });
      this.scene.add(g);
    }
    return g;
  }

  private applyBrushVisibility(model: number): void {
    const g = this.brushModels.get(model);
    const st = this.brushState.get(model);
    if (!g || !st) return;
    st.pvs = this.pvsRow ? clustersVisible(this.pvsRow, st.clusters) : true;
    g.visible = st.shown && st.pvs;
  }

  private placeBrushEntities(): void {
    for (const e of this.bsp.entities) {
      const model = e.get('model');
      if (!model || model[0] !== '*') continue;
      const index = parseInt(model.slice(1), 10);
      const g = this.brushModels.get(index);
      if (!g) continue;
      const origin = vecOf(e.get('origin')) ?? [0, 0, 0];
      const cls = e.classname;
      const ang = MOVEDIR_CLASSES.has(cls) ? [0, 0, 0] : (vecOf(e.get('angles')) ?? [0, 0, 0]);
      this.setEntityTransform(
        index,
        { x: origin[0], y: origin[1], z: origin[2] },
        { x: ang[0], y: ang[1], z: ang[2] },
      );
      const renderMode = Number(e.get('rendermode') ?? 0);
      const disabled = e.get('StartDisabled') === '1' && cls === 'func_brush';
      if (HIDDEN_BRUSH_CLASSES.has(cls) || cls.startsWith('trigger_') || renderMode === 10 || disabled) {
        this.setVisible(index, false);
      }
    }
  }

  /** Moves a brush entity model (Source origin / angles). */
  setEntityTransform(modelIndex: number, origin: Vec3Like, angles: Vec3Like): void {
    const g = this.brushModels.get(modelIndex);
    if (!g) return;
    sourceTransformToMatrix(origin, angles, 1, g.matrix);
    g.matrixWorldNeedsUpdate = true;
    // PVS clusters of the model's bounds where it now is (rotation: bounding sphere).
    const st = this.brushState.get(modelIndex);
    const md = this.bsp.models[modelIndex];
    if (st && md) {
      const r = Math.hypot(md.maxs.x - md.mins.x, md.maxs.y - md.mins.y, md.maxs.z - md.mins.z) / 2;
      const cx = origin.x + (md.mins.x + md.maxs.x) / 2;
      const cy = origin.y + (md.mins.y + md.maxs.y) / 2;
      const cz = origin.z + (md.mins.z + md.maxs.z) / 2;
      const leaves = leavesInBox(this.bsp, [cx - r, cy - r, cz - r], [cx + r, cy + r, cz + r]);
      st.clusters = leafClusters(this.bsp, leaves);
      this.applyBrushVisibility(modelIndex);
    }
  }

  setVisible(modelIndex: number, visible: boolean): void {
    const st = this.brushState.get(modelIndex);
    if (!st) return;
    st.shown = visible;
    this.applyBrushVisibility(modelIndex);
  }

  /** The Object3D of a brush model (null when it has no drawn faces). */
  brushModel(modelIndex: number): Object3D | null {
    return this.brushModels.get(modelIndex) ?? null;
  }

  // --- lighting for models -------------------------------------------------------

  /** Samples the ambient cube at a Source point (characters, projectiles, pickups). */
  sampleAmbient(pos: Vec3Like, out: AmbientCube = newAmbientCube()): AmbientCube {
    sampleAmbientCube(this.bsp, pos, out, { hdr: this.hdr, scale: this.lightScale });
    return out;
  }

  // --- per frame -----------------------------------------------------------------

  /** Updates PVS visibility, fog and time for a camera. Call before render(). */
  update(cam: SourceCamera, timeSeconds: number): void {
    this.shared.uTime.value = timeSeconds;
    const leaf = findLeaf(this.bsp, cam.origin);
    this.cameraLeaf = leaf;
    const cluster = leaf >= 0 && this.pvsEnabled ? this.bsp.leafs.cluster[leaf] : -1;
    if (cluster !== this.lastCluster) {
      this.lastCluster = cluster;
      const vis = this.bsp.visibility;
      this.pvsRow = vis && cluster >= 0 ? decompressVis(vis, cluster, 0, this.pvsRow ?? undefined) : null;
      let n = 0;
      for (const c of this.chunkMeshes) {
        if (c.data.model !== 0 || c.data.sky3d) continue;
        const v = this.pvsRow ? clustersVisible(this.pvsRow, c.data.clusters) : true;
        c.mesh.visible = v;
        if (v) n++;
      }
      this.stats.pvsChunks = n;
      for (const m of this.brushModels.keys()) this.applyBrushVisibility(m);
      this.props?.setPvs(this.pvsRow);
    }
    const cp = cam.camera.position;
    this.props?.cullByDistance(cp.x, cp.y, cp.z);
    this.stats.leaf = leaf;
    this.stats.cluster = cluster;
  }

  /** Whether all textures and props requested so far have loaded (or failed). */
  async whenLoaded(): Promise<void> {
    await this.propsPromise;
    await this.textures?.whenIdle();
  }

  /** Renders sky, 3D skybox and world into the current render target. */
  render(renderer: WebGLRenderer, cam: SourceCamera): void {
    const info = renderer.info;
    info.autoReset = false;
    info.reset();
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.clear(true, true, true);

    const camera = cam.camera;
    this.sky2d.sync(camera);
    renderer.render(this.sky2d.scene, this.sky2d.camera);

    const leafFlags = this.cameraLeaf >= 0 ? this.bsp.leafs.flags[this.cameraLeaf] : LEAF_FLAGS_SKY;
    if (this.sky3d && this.skyRoot.children.length && leafFlags & LEAF_FLAGS_SKY) {
      const sc = this.skyCamera;
      sc.copy(camera, false);
      sc.near = camera.near * this.sky3d.scale;
      sc.far = camera.far * this.sky3d.scale;
      sc.updateProjectionMatrix();
      sc.updateMatrixWorld(true);
      this.applyFog(this.sky3d.fog);
      renderer.render(this.skyScene, sc);
      renderer.clearDepth();
    }

    this.stats.skyDrawCalls = info.render.calls;
    const contents = this.cameraLeaf >= 0 ? this.bsp.leafs.contents[this.cameraLeaf] : 0;
    this.applyFog(contents & (CONTENTS_WATER | CONTENTS_SLIME) && this.waterFog ? this.waterFog : this.worldFog);
    renderer.render(this.scene, camera);

    renderer.autoClear = autoClear;
    this.stats.drawCalls = info.render.calls;
    this.stats.triangles = info.render.triangles;
    if (this.props) {
      const p = this.props.stats;
      this.stats.props = { ...p, meshes: this.props.groupCount };
    }
  }

  private applyFog(f: FogParams | null): void {
    const u = this.shared;
    if (!f) {
      u.uFogRange.value.set(1, 0);
      return;
    }
    u.uFogColor.value.set(f.color.x, f.color.y, f.color.z, f.maxDensity);
    u.uFogRange.value.set(f.start, f.end);
  }

  dispose(): void {
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials.values()) m.material.dispose();
    this.lightmap.dispose();
    this.sky2d.dispose();
    this.props?.dispose();
    if (this.textures) for (const f of this.acquired) this.textures.release(f);
    this.acquired.length = 0;
    this.scene.clear();
    this.skyScene.clear();
  }
}

function makeLightmapTexture(atlas: LightmapAtlas): DataTexture {
  const tex = new DataTexture(atlas.data, atlas.width, atlas.height, RGBAFormat, UnsignedByteType);
  tex.magFilter = LinearFilter;
  tex.minFilter = LinearFilter;
  tex.generateMipmaps = false;
  tex.flipY = false;
  tex.needsUpdate = true;
  tex.name = 'lightmap-atlas';
  return tex;
}

function vecOf(s: string | undefined): [number, number, number] | null {
  if (!s) return null;
  const p = s.trim().split(/\s+/).map(Number);
  if (p.length < 3 || p.some((x) => !Number.isFinite(x))) return null;
  return [p[0], p[1], p[2]];
}

/** env_fog_controller / sky_camera fog keys (distances scaled by `scale`, metres out). */
function parseFog(get: (k: string) => string | undefined, scale: number): FogParams | null {
  if ((get('fogenable') ?? '0') === '0') return null;
  const col = vecOf(get('fogcolor')) ?? [128, 128, 128];
  const start = Number(get('fogstart') ?? 0);
  const end = Number(get('fogend') ?? 0);
  if (!(end > start)) return null;
  const maxDensity = Number(get('fogmaxdensity') ?? 1);
  const c = new Color(gammaToLinear(col[0] / 255), gammaToLinear(col[1] / 255), gammaToLinear(col[2] / 255));
  return {
    color: new Vector3(c.r, c.g, c.b),
    start: start * scale * SOURCE_UNIT,
    end: end * scale * SOURCE_UNIT,
    maxDensity: Number.isFinite(maxDensity) && maxDensity > 0 ? Math.min(1, maxDensity) : 1,
  };
}
