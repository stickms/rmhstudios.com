/**
 * Loads the skinned character models named by the manifest and hands out per-person instances.
 *
 * One GLB per skin is fetched, decoded (GLTFLoader + EXT_meshopt_compression; no Draco) and kept as a TEMPLATE. Each
 * person is a `SkeletonUtils.clone` of it: its own skeleton and bones, but the same geometry, materials and textures,
 * so a street of citizens costs one set of GPU buffers. Templates are reference counted and the unused ones are evicted
 * least-recently-used past a size cap, which is what keeps WebGL memory bounded when a player tries on many skins.
 *
 * Nothing in here throws to the caller: every failure resolves to `null`, which the figure turns into the procedural
 * stand-in. Client-only (it fetches and decodes); `prepareGltf` and `instantiate` are pure enough to unit-test in node.
 */

import {
  Box3,
  Group,
  Quaternion,
  SRGBColorSpace,
  Vector3,
  type AnimationClip,
  type Material,
  type Mesh,
  type MeshStandardMaterial,
  type Object3D,
  type SkinnedMesh,
  type Texture,
} from 'three';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { SkinId } from './catalog';
import { modelScale } from './figure-scale';
import { modelUrl, missingRequiredClips, type ModelEntry } from './model-manifest';

export interface LoadedModel {
  skin: SkinId;
  entry: ModelEntry;
  /** Never added to a scene: only cloned. */
  template: Object3D;
  clips: Map<string, AnimationClip>;
  /** Metres. The manifest's value unless the file measures wildly differently. */
  height: number;
  triangles: number;
  /** Live instances (plus pins from `acquireModel`). Only unreferenced models are evicted. */
  refs: number;
  lastUsed: number;
}

export interface ModelInstance {
  /** Add this to the scene: carries the fit scale and yaw. */
  root: Group;
  /** What the mixer animates (the clone itself, under `root`). */
  skeletonRoot: Object3D;
  handBone: Object3D | null;
  /** Uniform scale from model metres to world units. */
  scale: number;
  /** How to place a prop so it rides the hand: rotation undoing the bone's own, and the scale undoing the model's. */
  hand: { quaternion: Quaternion; scale: number } | null;
  dispose(): void;
}

// --- policy -------------------------------------------------------------------------------------------------------

/** Keep this many templates resident at most (a skin is a few hundred KB to a few MB on the GPU). */
export const MAX_RESIDENT_MODELS = 10;
export const MAX_RESIDENT_BYTES = 48 * 1024 * 1024;
/** Concurrent downloads: models are loaded in the background and must not fight the page for bandwidth. */
const MAX_CONCURRENT = 2;
/** Largest GLB we will decode, whatever the manifest says. */
const MAX_FILE_BYTES = 24 * 1024 * 1024;

/**
 * May skinned models be used at all on this device right now? Not under the site's low-performance tier, not on
 * devices that report little memory, and not when switched off in storage (`hw-models` = `off`, for debugging).
 */
export function modelsEnabled(): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;
  try {
    if (document.documentElement.classList.contains('perf-lite')) return false;
    const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
    if (typeof mem === 'number' && mem <= 2) return false;
    if (window.localStorage?.getItem('hw-models') === 'off') return false;
  } catch {
    /* storage blocked: carry on */
  }
  return true;
}

// --- preparing a parsed glTF ----------------------------------------------------------------------------------------

export interface ParsedGltf {
  scene: Object3D;
  animations: AnimationClip[];
}

const isLightOrCamera = (o: Object3D) => (o as { isLight?: boolean }).isLight === true || (o as { isCamera?: boolean }).isCamera === true;

function eachMaterial(root: Object3D, fn: (m: Material) => void): void {
  root.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) fn(m);
  });
}

/**
 * Validate a parsed GLB against its manifest entry and tidy it for the game: refuse it when `idle`/`walk` are missing,
 * drop embedded lights and cameras, make colour textures sRGB and the surfaces matte like the rest of the diorama.
 * Returns null when the model cannot be used.
 */
export function prepareGltf(skin: SkinId, entry: ModelEntry, gltf: ParsedGltf): LoadedModel | null {
  const clips = new Map<string, AnimationClip>();
  for (const c of gltf.animations ?? []) if (c.name && !clips.has(c.name)) clips.set(c.name, c);
  if (missingRequiredClips(entry, new Set(clips.keys())).length > 0) return null;

  const root = gltf.scene;
  const strip: Object3D[] = [];
  let skinned = 0;
  let triangles = 0;
  root.traverse((o) => {
    if (isLightOrCamera(o)) strip.push(o);
    const mesh = o as Mesh;
    if (mesh.isMesh) {
      if ((o as SkinnedMesh).isSkinnedMesh) skinned++;
      const g = mesh.geometry;
      triangles += (g.index ? g.index.count : (g.attributes.position?.count ?? 0)) / 3;
    }
  });
  if (skinned === 0) return null; // an animation needs something to deform
  for (const o of strip) o.removeFromParent();

  eachMaterial(root, (m) => {
    const std = m as MeshStandardMaterial;
    for (const key of ['map', 'emissiveMap'] as const) {
      const tex: Texture | null | undefined = std[key];
      if (tex) {
        tex.colorSpace = SRGBColorSpace;
        tex.anisotropy = 4;
      }
    }
    if (std.isMeshStandardMaterial) {
      std.metalness = Math.min(std.metalness, 0.1);
      std.roughness = Math.max(std.roughness, 0.7);
    }
  });

  root.updateMatrixWorld(true);
  const box = new Box3().setFromObject(root);
  const measured = box.max.y - Math.min(box.min.y, 0);
  // The manifest says how tall it is; believe the file instead only when they disagree by a lot (a wrong unit).
  const height =
    Number.isFinite(measured) && measured > 0.05 && Math.abs(measured - entry.height) / entry.height > 0.35
      ? measured
      : entry.height;
  return { skin, entry, template: root, clips, height, triangles, refs: 0, lastUsed: Date.now() };
}

// --- instances ------------------------------------------------------------------------------------------------------

const tmpQ = new Quaternion();
const tmpS = new Vector3();
const tmpP = new Vector3();

/** A person made from a loaded model, fitted to the figure size contract. Call `dispose()` when it leaves the scene. */
export function instantiate(model: LoadedModel, lookHeight: number): ModelInstance {
  const skeletonRoot = cloneSkinned(model.template);
  const root = new Group();
  root.name = `hw-${model.skin}`;
  const scale = modelScale(model.height, lookHeight);
  root.scale.setScalar(scale);
  root.rotation.y = model.entry.yaw;
  root.add(skeletonRoot);
  skeletonRoot.traverse((o) => {
    const m = o as SkinnedMesh;
    if (!m.isSkinnedMesh) return;
    o.castShadow = false;
    // The bounding sphere is taken from the bind pose; an arm swinging out of it must not make the mesh blink out.
    m.computeBoundingSphere();
    if (m.boundingSphere) m.boundingSphere.radius *= 1.5;
  });

  let handBone: Object3D | null = null;
  let hand: ModelInstance['hand'] = null;
  const boneName = model.entry.handBone;
  if (boneName) {
    handBone = skeletonRoot.getObjectByName(boneName) ?? null;
    if (handBone) {
      root.updateMatrixWorld(true);
      const bone = handBone;
      bone.matrixWorld.decompose(tmpP, tmpQ, tmpS);
      // In the bind pose the person faces +z with `root`'s yaw undone: a prop rotated by the inverse of the bone's
      // world rotation (relative to the wrapper's parent) sits upright and points forward whatever the bone's axes are.
      const inv = tmpQ.clone().invert();
      const boneScale = Math.max(Math.abs(tmpS.x), 1e-6);
      hand = { quaternion: inv, scale: 1 / boneScale };
    }
  }

  let disposed = false;
  return {
    root,
    skeletonRoot,
    handBone,
    scale,
    hand,
    dispose() {
      if (disposed) return;
      disposed = true;
      skeletonRoot.traverse((o) => {
        const m = o as SkinnedMesh;
        // The skeleton's bone texture is per clone; the geometry and materials are the template's and stay.
        if (m.isSkinnedMesh) m.skeleton?.dispose();
      });
      root.removeFromParent();
    },
  };
}

// --- the cache --------------------------------------------------------------------------------------------------------

interface Slot {
  promise: Promise<LoadedModel | null>;
  model: LoadedModel | null;
  failedAt: number;
}

const slots = new Map<SkinId, Slot>();
const bad = new Set<SkinId>();
const RETRY_FAILED_MS = 60_000;
let active = 0;
const waiting: Array<() => void> = [];
let clock = 0;

function acquireSlot(): Promise<void> {
  if (active < MAX_CONCURRENT) {
    active++;
    return Promise.resolve();
  }
  return new Promise((resolve) => waiting.push(() => { active++; resolve(); }));
}
function releaseSlot() {
  active--;
  waiting.shift()?.();
}

/** The model already loaded for a skin (no fetch), or null. */
export function loadedModel(skin: SkinId): LoadedModel | null {
  return slots.get(skin)?.model ?? null;
}

/** A skin whose model failed to render once is not tried again this visit. */
export function markModelBad(skin: SkinId): void {
  bad.add(skin);
  evict(skin);
}

export function isModelBad(skin: SkinId): boolean {
  return bad.has(skin);
}

async function fetchAndParse(skin: SkinId, entry: ModelEntry): Promise<LoadedModel | null> {
  const res = await fetch(modelUrl(entry));
  if (!res.ok) return null;
  const len = Number(res.headers.get('content-length') ?? 0);
  if (len > MAX_FILE_BYTES) return null;
  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX_FILE_BYTES || buf.byteLength < 20) return null;
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.parseAsync(buf, `${modelUrl(entry).replace(/[^/]*$/, '')}`);
  return prepareGltf(skin, entry, gltf);
}

/**
 * Load (once) the model for a skin. Resolves with null on any failure, including a device that should not use models.
 * `eager` jumps the download queue (the player's own skin).
 */
export function loadSkinModel(skin: SkinId, entry: ModelEntry, opts: { eager?: boolean } = {}): Promise<LoadedModel | null> {
  if (!modelsEnabled() || bad.has(skin)) return Promise.resolve(null);
  const existing = slots.get(skin);
  if (existing) {
    if (existing.model || !existing.failedAt || Date.now() - existing.failedAt < RETRY_FAILED_MS) return existing.promise;
  }
  const slot: Slot = { promise: null as unknown as Promise<LoadedModel | null>, model: null, failedAt: 0 };
  slot.promise = (async () => {
    if (!opts.eager) await acquireSlot();
    else active++;
    try {
      const model = await fetchAndParse(skin, entry);
      if (!model) {
        slot.failedAt = Date.now();
        return null;
      }
      model.lastUsed = ++clock;
      slot.model = model;
      trim(skin);
      return model;
    } catch {
      slot.failedAt = Date.now();
      return null;
    } finally {
      releaseSlot();
    }
  })();
  slots.set(skin, slot);
  return slot.promise;
}

/** Start loading a skin in the background (its first appearance should not wait for the download). */
export function preloadSkinModel(skin: SkinId, entry: ModelEntry | undefined, eager = false): void {
  if (entry) void loadSkinModel(skin, entry, { eager });
}

/** Pin a loaded model while something uses it so eviction leaves it alone. */
export function acquireModel(model: LoadedModel): () => void {
  model.refs++;
  model.lastUsed = ++clock;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    model.refs = Math.max(0, model.refs - 1);
    model.lastUsed = ++clock;
  };
}

function disposeTemplate(model: LoadedModel): void {
  const seen = new Set<unknown>();
  model.template.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.dispose();
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      if (seen.has(m)) continue;
      seen.add(m);
      for (const v of Object.values(m)) if (v && (v as Texture).isTexture) (v as Texture).dispose();
      m.dispose();
    }
  });
}

function evict(skin: SkinId): void {
  const slot = slots.get(skin);
  if (slot?.model && slot.model.refs === 0) disposeTemplate(slot.model);
  if (slot?.model && slot.model.refs > 0) return;
  slots.delete(skin);
}

/** Drop least-recently-used unreferenced templates until under both caps. `keep` is never dropped. */
function trim(keep?: SkinId): void {
  const resident = () => [...slots.entries()].filter(([, s]) => s.model).map(([id, s]) => [id, s.model!] as const);
  for (;;) {
    const list = resident();
    const bytes = list.reduce((n, [, m]) => n + m.entry.bytes, 0);
    if (list.length <= MAX_RESIDENT_MODELS && bytes <= MAX_RESIDENT_BYTES) return;
    const victim = list
      .filter(([id, m]) => id !== keep && m.refs === 0)
      .sort((a, b) => a[1].lastUsed - b[1].lastUsed)[0];
    if (!victim) return;
    evict(victim[0]);
  }
}

/** Free every unreferenced template (a lost context, a memory warning). Instances in use keep theirs. */
export function releaseUnusedModels(): void {
  for (const [id, s] of [...slots]) if (s.model && s.model.refs === 0) evict(id);
}

/** Test seam. */
export function resetModelCacheForTests(): void {
  for (const [, s] of slots) if (s.model) disposeTemplate(s.model);
  slots.clear();
  bad.clear();
  waiting.length = 0;
  active = 0;
}

/** Test seam: put a prepared model in the cache as if it had loaded. */
export function seedModelForTests(model: LoadedModel): void {
  slots.set(model.skin, { promise: Promise.resolve(model), model, failedAt: 0 });
}
