/**
 * Model channel assets for the entity renderer: a GLB by MDL path (from `mdl/index.json`),
 * its anim pack when it has one (players and arms: `anims`), and everything derived from them
 * once per model — the bind frame (model-axes.ts), material templates, the skeleton's bind
 * pose, the bound clips/sequences/activities (animator.ts AnimSet) and the attachments.
 *
 * `ModelLibrary` also implements the world renderer's `ModelProvider`, so static props and
 * entities share one cache of GLBs.
 */
import {
  type Bone,
  Matrix4,
  type Material,
  type Mesh,
  type Object3D,
  Quaternion,
  type SkinnedMesh,
  Vector3,
} from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Tf2GLTFLoader } from '@/lib/tf2-loadout/gltf-loader';
import { animatedFrame, checkPosedFrame, frameMatrixFor, modelFrame } from '../model-axes';
import type { LoadedModel, ModelProvider } from '../props';
import { Animator, AnimSet, type PoseParamDesc, type RawClip, type SequenceDesc } from './animator';
import { materialTemplate, type MaterialTemplate } from './model-material';

/** One `mdl/index.json` entry (scripts/tf2-game/models.py). */
export interface ModelIndexEntry {
  glb?: string;
  anims?: string;
  kind?: string;
  skinned?: boolean;
  poseParameters?: string[];
}

/** The parts of `scene.extras` the entity renderer reads (docs/tf2-game.md "Models"). */
export interface BodyExtras {
  mdl?: string;
  scale?: number;
  source?: {
    eyePosition?: number[];
    illumPosition?: number[];
    hullMin?: number[];
    hullMax?: number[];
    /**
     * The space the clips pose the skeleton in (rows of GLB = M · Source model space), written for
     * models whose animations are CS:GO frame animations: the frame is then known, not guessed.
     */
    clipFrame?: number[];
  };
  skinned?: boolean;
  bodyparts?: Array<{ name: string; count: number }>;
  skins?: number[][];
  attachments?: Array<{ name: string; bone: string; flags?: number; local: number[] }>;
  hitboxSets?: Array<{
    name: string;
    hitboxes: Array<{ bone: string; group: number; min: number[]; max: number[] }>;
  }>;
  poseParameters?: PoseParamDesc[];
  boneControllers?: Array<{
    bone: string;
    axis: string;
    start: number;
    end: number;
    rest?: number;
    input?: number;
  }>;
  sequences?: SequenceDesc[];
  activities?: Record<string, Array<{ seq: string; weight: number }>>;
  weightlists?: Array<Record<string, number>>;
  animPack?: boolean;
}

/** A primitive's extras: skin-reference slot and body group membership. */
export interface PrimitiveInfo {
  slot?: number;
  bodygroup?: string;
  sub?: number;
}

export interface AttachmentDesc {
  name: string;
  bone: string;
  local: Matrix4;
  /** The attachment in the model's bind space (loadout items), used when no bone of that name is found. */
  bind?: Matrix4;
}

export interface GltfLoaderLike {
  loadAsync(url: string): Promise<GLTF>;
}

export class ModelAsset {
  readonly extras: BodyExtras;
  /** GLB space → three model space (Source model space with the (y, z, x) mapping, metres). */
  frame: Matrix4;
  readonly templates: MaterialTemplate[];
  readonly boneNames: string[];
  readonly restPos: Float32Array;
  readonly restQuat: Float32Array;
  readonly anim: AnimSet | null;
  readonly attachments = new Map<string, AttachmentDesc>();
  readonly skinned: boolean;

  constructor(
    readonly mdl: string,
    readonly gltf: GLTF,
    readonly materials: Material[],
    animPack: GLTF | null,
  ) {
    const scene = gltf.scene;
    this.extras = (scene.userData ?? {}) as BodyExtras;
    const clipFrame = this.extras.source?.clipFrame;
    const knownFrame = clipFrame?.length === 9 && clipFrame.every(Number.isFinite) ? frameMatrixFor(clipFrame) : null;
    this.frame = knownFrame ?? modelFrame(scene).matrix;
    this.templates = materials.map((m) => materialTemplate(m));
    annotatePrimitives(gltf);
    let skel: SkinnedMesh | null = null;
    scene.traverse((o) => {
      if (!skel && (o as SkinnedMesh).isSkinnedMesh) skel = o as SkinnedMesh;
      const mesh = o as Mesh;
      if (mesh.isMesh) mesh.frustumCulled = false;
    });
    const sm = skel as SkinnedMesh | null;
    this.skinned = !!sm;
    const bones = sm ? sm.skeleton.bones : [];
    this.boneNames = bones.map((b) => b.name);
    this.restPos = new Float32Array(bones.length * 3);
    this.restQuat = new Float32Array(bones.length * 4);
    bones.forEach((b, i) => {
      b.position.toArray(this.restPos, i * 3);
      b.quaternion.toArray(this.restQuat, i * 4);
    });
    for (const a of this.extras.attachments ?? []) {
      this.attachments.set(a.name.toLowerCase(), {
        name: a.name,
        bone: a.bone,
        local: new Matrix4().fromArray(a.local),
      });
    }
    const src = animPack ?? gltf;
    const ax = (animPack ? animPack.scene.userData : this.extras) as BodyExtras;
    const hasAnims = (ax.sequences?.length ?? 0) > 0 && bones.length > 0;
    this.anim = hasAnims
      ? new AnimSet(this.boneNames, this.restPos, this.restQuat, {
          sequences: ax.sequences,
          activities: ax.activities,
          poseParameters: ax.poseParameters ?? this.extras.poseParameters,
          weightlists: ax.weightlists,
          clips: src.animations as unknown as RawClip[],
        })
      : null;
    // Otherwise the frame is recovered from the bind pose's bounds and then the idle pose's root.
    if (this.anim && sm && !knownFrame) {
      const root = bones.findIndex((b) => !(b.parent as { isBone?: boolean } | null)?.isBone);
      const seq = idleSequence(this.anim);
      const clip = seq
        ? this.anim.clips.get(seq.clips[Math.floor(seq.clips.length / 2)] ?? seq.clips[0])
        : undefined;
      const track = root >= 0 ? clip?.rot[root] : null;
      if (seq && track && !clip?.delta) {
        const guess = animatedFrame(
          this.frame,
          this.restQuat.subarray(root * 4, root * 4 + 4),
          track.values.subarray(0, 4),
        );
        const src = this.extras.source;
        this.frame =
          guess !== this.frame && src?.hullMin?.length === 3 && src.hullMax?.length === 3
            ? checkPosedFrame(
                this.frame,
                guess,
                posedBonePositions(scene, bones, this.anim, seq),
                src.hullMin,
                src.hullMax,
              )
            : guess;
      }
    }
  }

  /** Source body index → the submodel shown per body group (SDK body part math). */
  bodygroupsFromBody(body: number): Record<string, number> {
    const out: Record<string, number> = {};
    let base = 1;
    for (const bp of this.extras.bodyparts ?? []) {
      const count = Math.max(1, bp.count);
      out[bp.name] = Math.floor(body / base) % count;
      base *= count;
    }
    return out;
  }

  /** The body index for named submodels (the inverse of bodygroupsFromBody). */
  bodyFromGroups(groups: Record<string, number>): number {
    let body = 0;
    let base = 1;
    for (const bp of this.extras.bodyparts ?? []) {
      const count = Math.max(1, bp.count);
      body += Math.min(count - 1, Math.max(0, groups[bp.name] ?? 0)) * base;
      base *= count;
    }
    return body;
  }

  get skinCount(): number {
    return this.extras.skins?.length ?? 1;
  }

  /** Hull in Source units (model space), for culling and placement. */
  get hull(): { min: number[]; max: number[] } {
    return {
      min: this.extras.source?.hullMin ?? [-24, -24, 0],
      max: this.extras.source?.hullMax ?? [24, 24, 82],
    };
  }
}

/** An idle-like absolute sequence (the frame probe of animatedFrame). */
function idleSequence(set: AnimSet): SequenceDesc | undefined {
  let first: SequenceDesc | undefined;
  for (const s of set.sequences.values()) {
    if (s.delta || s.hidden) continue;
    first ??= s;
    const act = s.activity ?? '';
    if (
      act === 'ACT_IDLE' ||
      /^ACT_MP_STAND_/.test(act) ||
      /_VM_IDLE$/.test(act) ||
      /^(idle|ref)/i.test(s.name)
    )
      return s;
  }
  return first;
}

/** The bones' positions (GLB space, xyz triples) at the start of a sequence. */
function posedBonePositions(
  scene: Object3D,
  bones: Bone[],
  set: AnimSet,
  seq: SequenceDesc,
): Float32Array {
  const n = bones.length;
  const pos = new Float32Array(n * 3);
  const quat = new Float32Array(n * 4);
  const animator = new Animator(set);
  animator.setSequence(seq, { fade: false });
  animator.evaluate(pos, quat);
  scene.updateMatrixWorld(true);
  const sceneInv = scene.matrixWorld.clone().invert();
  const index = new Map<Object3D, number>(bones.map((b, i) => [b, i]));
  const world: Array<Matrix4 | undefined> = new Array(n);
  const one = new Vector3(1, 1, 1);
  const t = new Vector3();
  const q = new Quaternion();
  const boneWorld = (i: number): Matrix4 => {
    const done = world[i];
    if (done) return done;
    const parent = bones[i].parent;
    const pi = parent ? index.get(parent) : undefined;
    const base =
      pi !== undefined
        ? boneWorld(pi).clone()
        : parent
          ? new Matrix4().multiplyMatrices(sceneInv, parent.matrixWorld)
          : new Matrix4();
    const m = base.multiply(
      new Matrix4().compose(t.fromArray(pos, i * 3), q.fromArray(quat, i * 4), one),
    );
    world[i] = m;
    return m;
  };
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) t.setFromMatrixPosition(boneWorld(i)).toArray(out, i * 3);
  return out;
}

/** Copies each primitive's extras (slot, body group) onto its mesh's userData.prim. */
function annotatePrimitives(gltf: GLTF): void {
  const json = gltf.parser.json as {
    meshes?: Array<{ primitives: Array<{ extras?: PrimitiveInfo }> }>;
  };
  gltf.scene.traverse((o: Object3D) => {
    if (!(o as Mesh).isMesh) return;
    const assoc = gltf.parser.associations.get(o as Mesh) as
      { meshes?: number; primitives?: number } | undefined;
    const prim =
      assoc && assoc.meshes !== undefined && assoc.primitives !== undefined
        ? json.meshes?.[assoc.meshes]?.primitives[assoc.primitives]
        : undefined;
    const info: PrimitiveInfo = { ...(prim?.extras ?? {}) };
    o.userData.prim = info;
  });
}

/**
 * Loads model channel GLBs by MDL path. `url` resolves a channel path (`mdl/<sha>.glb`,
 * `mdl/index.json`) — `gameAssetUrl(p, game)` in the app, `/pkg/<game>/<p>` in the harness.
 */
export class ModelLibrary implements ModelProvider {
  private index: Promise<Record<string, ModelIndexEntry> | null> | null = null;
  private readonly assets = new Map<string, Promise<ModelAsset | null>>();
  private readonly ready = new Map<string, ModelAsset | null>();
  private readonly packs = new Map<string, Promise<GLTF | null>>();
  private readonly loader: GltfLoaderLike;

  constructor(
    private readonly opts: {
      url: (path: string) => string;
      loader?: GltfLoaderLike;
      index?: Record<string, ModelIndexEntry>;
    },
  ) {
    this.loader = opts.loader ?? new Tf2GLTFLoader();
    if (opts.index) this.index = Promise.resolve(opts.index);
  }

  loadIndex(): Promise<Record<string, ModelIndexEntry> | null> {
    this.index ??= fetch(this.opts.url('mdl/index.json'))
      .then((r) => (r.ok ? (r.json() as Promise<Record<string, ModelIndexEntry>>) : null))
      .catch(() => null);
    return this.index;
  }

  private channelPath(file: string): string {
    return file.startsWith('mdl/') ? file : `mdl/${file}`;
  }

  private loadPack(file: string): Promise<GLTF | null> {
    let p = this.packs.get(file);
    if (!p) {
      p = this.loader.loadAsync(this.opts.url(this.channelPath(file))).catch(() => null);
      this.packs.set(file, p);
    }
    return p;
  }

  /** Starts (or joins) loading a model. Resolves null when it is not in the channel. */
  asset(mdlPath: string): Promise<ModelAsset | null> {
    const key = normalizeModelPath(mdlPath);
    let p = this.assets.get(key);
    if (!p) {
      p = (async () => {
        const index = await this.loadIndex();
        const entry = index?.[key];
        if (!entry?.glb) return null;
        const [gltf, pack] = await Promise.all([
          this.loader.loadAsync(this.opts.url(this.channelPath(entry.glb))),
          entry.anims ? this.loadPack(entry.anims) : Promise.resolve(null),
        ]);
        const materials = (await gltf.parser.getDependencies('material')) as Material[];
        return new ModelAsset(key, gltf, materials, pack);
      })().catch((e: unknown) => {
        console.warn(`[tf2 models] ${key}:`, e);
        return null;
      });
      void p.then((a) => this.ready.set(key, a));
      this.assets.set(key, p);
    }
    return p;
  }

  /** The asset if loaded (null: failed or absent; undefined: not loaded yet — starts loading). */
  peek(mdlPath: string): ModelAsset | null | undefined {
    const key = normalizeModelPath(mdlPath);
    if (this.ready.has(key)) return this.ready.get(key);
    void this.asset(key);
    return undefined;
  }

  /** ModelProvider (static props). */
  async load(mdlPath: string): Promise<LoadedModel | null> {
    const a = await this.asset(mdlPath);
    return a ? { gltf: a.gltf, materials: a.materials } : null;
  }

  /** Resolves when every request so far has settled. */
  async whenIdle(): Promise<void> {
    let n = -1;
    while (n !== this.assets.size) {
      n = this.assets.size;
      await Promise.all(this.assets.values());
    }
  }
}

export const normalizeModelPath = (p: string): string =>
  p.toLowerCase().replace(/\\/g, '/').replace(/^\/+/, '');
