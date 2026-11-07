/**
 * Loads the skinned character models named by the manifest and hands out per-person instances.
 *
 * A skin's model lives in the site's own Steam-sourced asset channel (R2), not in this repository. Loading one is:
 * resolve `game` + `mdl` through the channel's `mdl/index.json` (model-index.ts) → fetch the mesh GLB (skeleton, webp
 * textures, no animations) and the anim pack (every Source sequence of the model as a glTF animation) from the
 * same-origin asset route → pick the skin (material) family → keep only the sequences the manifest names, adapted
 * to the game (clip-tools.ts) → bake the standing pose. The result is a TEMPLATE. Each person is a
 * `SkeletonUtils.clone` of it: its own skeleton and bones, but the same geometry, materials and textures, so a street
 * of citizens costs one set of GPU buffers. Templates are reference counted and the unused ones are evicted
 * least-recently-used past a size cap, which is what keeps WebGL memory bounded when a player tries on many skins.
 *
 * Nothing in here throws to the caller: every failure resolves to `null`, which the figure turns into the procedural
 * stand-in. Client-only (it fetches and decodes); `prepareModel` and `instantiate` are pure enough to unit-test in node.
 */

import {
  Box3,
  Group,
  Quaternion,
  SRGBColorSpace,
  Vector3,
  type AnimationClip,
  type Bone,
  type Material,
  type Mesh,
  type MeshStandardMaterial,
  type Object3D,
  type SkinnedMesh,
  type Texture,
} from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { Tf2GLTFLoader } from '@/lib/tf2-loadout/gltf-loader';
import type { SkinId } from './catalog';
import {
  applyClipPose,
  capturePose,
  clipBytes,
  filterGlbAnimations,
  keepInPlace,
  nodeName,
  onlyNodes,
  poseDuration,
  rebaseDelta,
  restorePose,
  trimClip,
} from './clip-tools';
import { modelScale } from './figure-scale';
import { loadModelIndex, resolveModelFiles } from './model-index';
import {
  CLIP_SLOTS,
  clipNamesOf,
  type ClipNames,
  type ClipSlot,
  type ModelEntry,
} from './model-manifest';

/** What the loader keeps of a manifest entry once the model is loaded: the animator's clip names and the hand. */
export interface RuntimeEntry {
  game: ModelEntry['game'];
  mdl: string;
  skin: number;
  yaw: number;
  handBone: string | null;
  hold?: ModelEntry['hold'];
  /** Each kept clip is named after its slot, so this maps a slot to itself for the slots the model has. */
  clips: ClipNames;
}

export interface LoadedModel {
  skin: SkinId;
  entry: RuntimeEntry;
  /** Never added to a scene: only cloned. Its bones hold the standing pose. */
  template: Object3D;
  /** The kept animations, by slot name. */
  clips: Map<string, AnimationClip>;
  /** Metres: the manifest's value, or measured from the standing pose. */
  height: number;
  /** Metres to lower the feet to y = 0 (the standing pose's lowest point). */
  groundOffset: number;
  /**
   * The hand bone's rotation (relative to the template's root) in the pose a held weapon is aligned to: the middle of
   * the shoot clip when there is one, else the standing pose. A prop rotated by its inverse points where the
   * weapon points when the model aims, and follows the hand the rest of the time.
   */
  handRef: Quaternion | null;
  triangles: number;
  /** Approximate resident cost: the mesh GLB plus the kept keyframes. */
  bytes: number;
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
/**
 * Concurrent model loads (each is two downloads, mesh + anim pack): models are loaded in the background and must not
 * fight the page for bandwidth, and each decoded anim pack is held in memory until it has been cut down.
 */
const MAX_CONCURRENT = 2;
/** Largest decoded mesh GLB (observed 0.1-0.4 MB on the wire) and anim pack (observed 6-14 MB decoded) we will take. */
export const MAX_MESH_BYTES = 8 * 1024 * 1024;
export const MAX_ANIMS_BYTES = 24 * 1024 * 1024;
/** A download that has not finished in this long is abandoned (the skin keeps its procedural figure). */
const FETCH_TIMEOUT_MS = 60_000;

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
 * Show a skin (material) family of the model. The mesh GLB carries family 0 on its primitives; `scene.userData.skins`
 * lists, per family, the material index of each skin-reference slot (`geometry.userData.slot`), `-1` meaning the
 * slot has no material in that family (hidden). TF2 classes: family 0 is RED, 1 is BLU. Throws on a family the model
 * does not have, which the loader turns into "no model".
 */
export async function applySkinFamily(gltf: GLTF, skin: number): Promise<void> {
  if (skin === 0) return;
  const families = (gltf.scene.userData as { skins?: unknown }).skins;
  const family = Array.isArray(families) ? (families[skin] as unknown) : undefined;
  if (!Array.isArray(family)) throw new Error(`model has no skin family ${skin}`);
  const meshes: Mesh[] = [];
  gltf.scene.traverse((o) => {
    if ((o as Mesh).isMesh) meshes.push(o as Mesh);
  });
  const replaced = new Set<Material>();
  for (const mesh of meshes) {
    const slot = (mesh.geometry.userData as { slot?: unknown }).slot;
    if (typeof slot !== 'number') continue;
    const index = family[slot];
    if (typeof index !== 'number') continue;
    if (index < 0) {
      mesh.visible = false;
      continue;
    }
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) replaced.add(m);
    mesh.material = (await gltf.parser.getDependency('material', index)) as Material;
  }
  // The family-0 materials nothing shows any more.
  const still = new Set<Material>();
  eachMaterial(gltf.scene, (m) => still.add(m));
  for (const m of replaced) if (!still.has(m)) disposeMaterial(m);
}

function disposeMaterial(m: Material): void {
  for (const v of Object.values(m)) if (v && (v as Texture).isTexture) (v as Texture).dispose();
  m.dispose();
}

/**
 * Turn the two parsed files into a model the game can use. `mesh` is the body (skeleton, geometry, materials);
 * `pack` is the model's anim pack (any number of Source sequences, each a glTF animation named as the manifest names
 * it, its `userData` the animation's extras). Only the clips the entry names are kept, each renamed to its slot:
 *
 *   - a `trim` window is cut out with its end poses intact;
 *   - tracks for bones the mesh does not have are dropped;
 *   - a delta layer (additive sequence) is rebased onto the standing pose, so it is a full-body clip like the rest;
 *   - the root bone is kept in place (no clip walks the pelvis away from the figure);
 *   - a static pose (single keys) gets the sequence's length as its duration.
 *
 * Refused (null) when idle or walk are missing, when nothing is skinned, or when the pack has no clip with a name the
 * manifest asks for. Clones start in the standing pose (idle at t=0), which also decides the model's height and where
 * its feet are, and the pose a held prop is aligned to.
 */
export function prepareModel(
  skin: SkinId,
  entry: ModelEntry,
  mesh: ParsedGltf,
  pack: readonly AnimationClip[],
  meshBytes = 0,
): LoadedModel | null {
  const root = mesh.scene;
  const strip: Object3D[] = [];
  const skinnedMeshes: SkinnedMesh[] = [];
  let triangles = 0;
  const bones = new Map<string, Bone>();
  root.traverse((o) => {
    if (isLightOrCamera(o)) strip.push(o);
    if ((o as Bone).isBone) bones.set(o.name, o as Bone);
    const m = o as Mesh;
    if (m.isMesh) {
      // The channel exports every submodel of a body group as its own primitive (`bodygroup`, `sub`). The model is
      // shown with body 0: submodel 0 of each group. The others (a Soldier's rocket and medals) are not worn.
      const u = m.geometry.userData as { bodygroup?: unknown; sub?: unknown };
      if (typeof u.bodygroup === 'string' && typeof u.sub === 'number' && u.sub !== 0) {
        strip.push(o);
        return;
      }
      if ((o as SkinnedMesh).isSkinnedMesh) skinnedMeshes.push(o as SkinnedMesh);
      const g = m.geometry;
      triangles += (g.index ? g.index.count : (g.attributes.position?.count ?? 0)) / 3;
    }
  });
  if (skinnedMeshes.length === 0 || bones.size === 0) return null; // an animation needs something to deform
  for (const o of strip) {
    o.removeFromParent();
    (o as Mesh).geometry?.dispose();
  }

  // --- the clips the entry names
  const source = new Map<string, AnimationClip>();
  for (const c of pack) if (c.name && !source.has(c.name)) source.set(c.name, c);
  const names = clipNamesOf(entry);
  const have = new Set<string>(Object.keys(names).filter((slot) => source.has(names[slot])));
  if (!have.has('idle') || !have.has('walk')) return null;

  const boneNames = new Set(bones.keys());
  const rootBones = new Set([...bones.values()].filter((b) => !(b.parent as Bone | null)?.isBone).map((b) => b.name));
  const fit = (slot: ClipSlot): AnimationClip | null => {
    const spec = entry.clips[slot];
    const src = spec ? source.get(spec.clip) : undefined;
    if (!spec || !src) return null;
    const extras = (src.userData ?? {}) as Record<string, unknown>;
    let c = src;
    if (spec.trim) {
      const fps = typeof extras.fps === 'number' && extras.fps > 0 ? extras.fps : 30;
      c = trimClip(src, slot, spec.trim[0] / fps, spec.trim[1] / fps);
    }
    c = onlyNodes(c, boneNames, slot);
    c.userData = { ...extras, source: spec.clip };
    if (!(c.duration > 0)) c.duration = poseDuration(extras);
    // The figure's position moves, never the pelvis: a gait or a knock-down that travels is kept where it stands.
    keepInPlace(c, rootBones);
    return c;
  };

  const clips = new Map<string, AnimationClip>();
  // Idle first: it is the standing pose every delta layer is rebased on.
  const idle = fit('idle');
  if (!idle || idle.tracks.length === 0) return null;
  clips.set('idle', idle);
  applyClipPose(bones, idle, 0);
  root.updateMatrixWorld(true);
  const standing = capturePose(bones.values());

  for (const slot of CLIP_SLOTS) {
    if (slot === 'idle' || !have.has(slot)) continue;
    let c = fit(slot);
    if (!c || c.tracks.length === 0) continue;
    if ((c.userData as { delta?: unknown }).delta === true) {
      const rebased = rebaseDelta(c, slot, standing, rootBones);
      rebased.userData = c.userData;
      c = rebased;
    }
    clips.set(slot, c);
  }
  if (!clips.has('walk')) return null;
  const clipNames = Object.fromEntries([...clips.keys()].map((slot) => [slot, slot])) as unknown as ClipNames;

  // --- where a held prop is aligned: the aiming pose
  let handRef: Quaternion | null = null;
  const handBone = entry.handBone ? bones.get(nodeName(entry.handBone)) : undefined;
  if (handBone) {
    const aim = clips.get('shoot');
    // (the middle of the shot: some sequences raise the arm first, so their first frame is still at the side)
    if (aim) applyClipPose(bones, aim, aim.duration * 0.5);
    root.updateMatrixWorld(true);
    handRef = handBone.getWorldQuaternion(new Quaternion());
    if (aim) {
      restorePose(bones, standing);
      root.updateMatrixWorld(true);
    }
  }

  // --- the standing model
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
  const box = new Box3();
  for (const m of skinnedMeshes) {
    if (!m.visible) continue;
    m.skeleton.update();
    m.computeBoundingBox();
    if (m.boundingBox) box.union(m.boundingBox);
  }
  const measured = box.isEmpty() ? NaN : box.max.y - box.min.y;
  const sane = Number.isFinite(measured) && measured > 0.05 && measured < 100;
  // The manifest says how tall it is; believe the file instead only when they disagree by a lot (a wrong unit).
  const height =
    entry.height !== undefined && (!sane || Math.abs(measured - entry.height) / entry.height <= 0.35)
      ? entry.height
      : sane
        ? measured
        : 1.8;
  const groundOffset = sane && Math.abs(box.min.y) < height ? box.min.y : 0;

  let bytes = meshBytes;
  for (const c of clips.values()) bytes += clipBytes(c);
  const runtime: RuntimeEntry = {
    game: entry.game,
    mdl: entry.mdl,
    skin: entry.skin,
    yaw: entry.yaw,
    handBone: entry.handBone,
    hold: entry.hold,
    clips: clipNames,
  };
  return { skin, entry: runtime, template: root, clips, height, groundOffset, handRef, triangles, bytes, refs: 0, lastUsed: Date.now() };
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
  skeletonRoot.position.y = -model.groundOffset;
  skeletonRoot.traverse((o) => {
    const m = o as SkinnedMesh;
    if (!m.isSkinnedMesh) return;
    o.castShadow = false;
    // The bounding sphere is taken from the standing pose; an arm swinging out of it must not make the mesh blink out.
    m.computeBoundingSphere();
    if (m.boundingSphere) m.boundingSphere.radius *= 1.5;
  });

  let handBone: Object3D | null = null;
  let hand: ModelInstance['hand'] = null;
  const boneName = model.entry.handBone;
  if (boneName) {
    handBone = skeletonRoot.getObjectByName(nodeName(boneName)) ?? null;
    if (handBone) {
      root.updateMatrixWorld(true);
      const bone = handBone;
      bone.matrixWorld.decompose(tmpP, tmpQ, tmpS);
      // A prop rotated by the inverse of the bone's rotation in the aiming pose (the template's own frame) points
      // along the model's +z there, whatever the bone's own axes are (Source bones are oriented along their length, so
      // they are never aligned with the model). Without an aiming pose: the standing one.
      const inv = (model.handRef ?? tmpQ).clone().invert();
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

/** Download a file with a size cap and a deadline. Null when it is missing, too big, or the request fails. */
async function fetchBytes(url: string, cap: number): Promise<ArrayBuffer | null> {
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS) : null;
  try {
    const res = await fetch(url, { signal: ctl?.signal });
    if (!res.ok) return null;
    // (content-length is the wire size; the cap below is on the decoded bytes)
    const len = Number(res.headers.get('content-length') ?? 0);
    if (len > cap) return null;
    const buf = await res.arrayBuffer();
    return buf.byteLength > cap || buf.byteLength < 20 ? null : buf;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function disposeScene(root: Object3D): void {
  const seen = new Set<unknown>();
  root.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.dispose();
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      if (seen.has(m)) continue;
      seen.add(m);
      disposeMaterial(m);
    }
  });
}

async function fetchAndParse(skin: SkinId, entry: ModelEntry): Promise<LoadedModel | null> {
  const index = await loadModelIndex(entry.game);
  const files = resolveModelFiles(index, entry);
  if (!files || !files.animsUrl || entry.skin >= files.skins) return null;
  const [meshBuf, packBuf] = await Promise.all([
    fetchBytes(files.meshUrl, MAX_MESH_BYTES),
    fetchBytes(files.animsUrl, MAX_ANIMS_BYTES),
  ]);
  if (!meshBuf || !packBuf) return null;

  // Cut the pack down to the sequences we play BEFORE parsing it, so the other ~1000 are never decoded.
  const cut = filterGlbAnimations(packBuf, new Set(Object.values(clipNamesOf(entry))));
  if (!cut || cut.kept.length === 0) return null;

  // The mesh references its textures as `../tex/<sha>.webp`, relative to the GLB's own directory in the channel.
  const mesh = await new Tf2GLTFLoader().parseAsync(meshBuf, files.meshUrl.slice(0, files.meshUrl.lastIndexOf('/') + 1));
  let model: LoadedModel | null = null;
  try {
    await applySkinFamily(mesh, entry.skin);
    const pack = await new GLTFLoader().parseAsync(cut.buffer, '');
    model = prepareModel(skin, entry, mesh, pack.animations, meshBuf.byteLength);
  } finally {
    if (!model) disposeScene(mesh.scene);
  }
  return model;
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
  disposeScene(model.template);
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
    const bytes = list.reduce((n, [, m]) => n + m.bytes, 0);
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
