/**
 * One drawn copy of a model (SDK C_BaseAnimating): a clone of the asset's scene with its own
 * skeleton, pose buffers and Animator, its skin family and body groups, per-instance material
 * clones sharing one uniform set (lighting, tint, fade, cloak), attachments as world
 * matrices, and bone-merged children (weapons, later cosmetics).
 *
 * Scene graph: `root` (the entity transform in three space, `place()`) → `frameGroup`
 * (asset.frame: GLB → three model space) → the cloned GLB scene. Bones, attachments and
 * merged children therefore live in three world space once `updateMatrices()` ran.
 */
import {
  type Bone,
  Group,
  Matrix4,
  type Mesh,
  type Object3D,
  type ShaderMaterial,
  type SkinnedMesh,
  Vector3,
} from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { boneMerge } from '@/lib/tf2-loadout/bone-merge';
import { sourceTransformToMatrix } from '../coords';
import { Animator } from './animator';
import type { ModelAsset, PrimitiveInfo } from './model-asset';
import {
  createInstanceUniforms,
  createModelMaterial,
  type InstanceUniforms,
} from './model-material';

interface MeshEntry {
  mesh: Mesh;
  prim: PrimitiveInfo;
}

const tmpM = new Matrix4();

export interface ModelInstanceOptions {
  /** Shared uniforms (fog) from the world, so models fog with the map. */
  fog?: Parameters<typeof createInstanceUniforms>[0];
  /** Share another instance's uniforms (a weapon lit like its owner). */
  uniforms?: InstanceUniforms;
  /** Skip the animator (bone-merged children follow their parent). */
  noAnim?: boolean;
}

export class ModelInstance {
  readonly root = new Group();
  readonly frameGroup = new Group();
  readonly scene: Object3D;
  readonly animator: Animator | null;
  readonly uniforms: InstanceUniforms;
  readonly pos: Float32Array;
  readonly quat: Float32Array;
  /** Bones in the asset's bone order (the animator's). */
  readonly bones: Bone[];
  private readonly boneByName = new Map<string, Bone>();
  private readonly meshes: MeshEntry[] = [];
  private readonly materials = new Map<number, ShaderMaterial>();
  private skinFamily = -1;
  private groups: Record<string, number> = {};
  private groupsKey = '';
  private readonly children: ModelInstance[] = [];
  private meshFilter: ((mesh: Mesh) => boolean) | null = null;
  /** Set when this instance is bone-merged onto a parent. */
  mergedInto: ModelInstance | null = null;
  disposed = false;

  constructor(
    readonly asset: ModelAsset,
    opts: ModelInstanceOptions = {},
  ) {
    this.uniforms = opts.uniforms ?? createInstanceUniforms(opts.fog);
    this.scene = cloneSkinned(asset.gltf.scene);
    this.scene.userData = {};
    this.root.name = asset.mdl;
    this.root.matrixAutoUpdate = false;
    this.frameGroup.matrixAutoUpdate = false;
    this.frameGroup.matrix.copy(asset.frame);
    this.frameGroup.add(this.scene);
    this.root.add(this.frameGroup);
    let skel: SkinnedMesh | null = null;
    this.scene.traverse((o) => {
      const mesh = o as Mesh;
      if (mesh.isMesh) {
        mesh.frustumCulled = false;
        this.meshes.push({ mesh, prim: (o.userData.prim ?? {}) as PrimitiveInfo });
        if (!skel && (o as SkinnedMesh).isSkinnedMesh) skel = o as SkinnedMesh;
      }
    });
    const sm = skel as SkinnedMesh | null;
    this.bones = sm ? [...sm.skeleton.bones] : [];
    for (const b of this.bones) this.boneByName.set(b.name.toLowerCase(), b);
    this.scene.traverse((o) => {
      if ((o as Bone).isBone && !this.boneByName.has(o.name.toLowerCase()))
        this.boneByName.set(o.name.toLowerCase(), o as Bone);
    });
    this.pos = new Float32Array(this.bones.length * 3);
    this.quat = new Float32Array(this.bones.length * 4);
    this.pos.set(asset.restPos.subarray(0, this.pos.length));
    this.quat.set(asset.restQuat.subarray(0, this.quat.length));
    this.animator = !opts.noAnim && asset.anim ? new Animator(asset.anim) : null;
    this.setSkin(0);
    this.applyBodygroups();
  }

  // ─── appearance ────────────────────────────────────────────────────────────

  private material(index: number): ShaderMaterial | null {
    let m = this.materials.get(index);
    if (m) return m;
    const t = this.asset.templates[index];
    if (!t) return null;
    m = createModelMaterial(t, this.uniforms);
    this.materials.set(index, m);
    return m;
  }

  /** Skin family (clamped to the model's), SDK m_nSkin. */
  setSkin(skin: number): void {
    const families = this.asset.extras.skins;
    const fam =
      families && families.length ? Math.max(0, Math.min(families.length - 1, skin | 0)) : 0;
    if (fam === this.skinFamily) return;
    this.skinFamily = fam;
    const family = families?.[fam];
    for (const e of this.meshes) {
      const slot = e.prim.slot;
      let mi: number | undefined;
      if (family && slot !== undefined && slot < family.length) mi = family[slot];
      else {
        const src = Array.isArray(e.mesh.material) ? e.mesh.material[0] : e.mesh.material;
        mi = this.asset.materials.indexOf(src);
      }
      const m = mi !== undefined && mi >= 0 ? this.material(mi) : null;
      e.mesh.userData.skinHidden = !m;
      if (m) e.mesh.material = m;
    }
    this.applyBodygroups();
  }

  get skin(): number {
    return this.skinFamily;
  }

  /** Body groups by name (unlisted: submodel 0). */
  setBodygroups(groups: Record<string, number>): void {
    const key = Object.keys(groups)
      .sort()
      .map((k) => `${k}=${groups[k]}`)
      .join(',');
    if (key === this.groupsKey) return;
    this.groupsKey = key;
    this.groups = { ...groups };
    this.applyBodygroups();
  }

  /** SDK m_nBody. */
  setBody(body: number): void {
    this.setBodygroups(this.asset.bodygroupsFromBody(body));
  }

  private applyBodygroups(): void {
    for (const e of this.meshes) {
      const g = e.prim.bodygroup;
      const shown = !g || (this.groups[g] ?? 0) === (e.prim.sub ?? 0);
      e.mesh.visible =
        shown && !e.mesh.userData.skinHidden && (!this.meshFilter || this.meshFilter(e.mesh));
    }
  }

  /** An extra per-mesh visibility rule on top of skins and body groups (festivizer parts). */
  setMeshFilter(filter: ((mesh: Mesh) => boolean) | null): void {
    this.meshFilter = filter;
    this.applyBodygroups();
  }

  /** The instance's materials that exist so far, by template index. */
  forEachMaterial(fn: (m: ShaderMaterial, index: number) => void): void {
    for (const [i, m] of this.materials) fn(m, i);
  }

  // ─── placement and pose ───────────────────────────────────────────────────

  /** Places the model at a Source origin / angles (degrees), uniform scale. */
  place(
    origin: { x: number; y: number; z: number },
    angles: { x: number; y: number; z: number },
    scale = 1,
  ): void {
    sourceTransformToMatrix(origin, angles, scale, this.root.matrix);
    this.root.matrixWorldNeedsUpdate = true;
  }

  /** Runs the animator: advance by dt and evaluate into the pose buffers. */
  animate(dt: number): void {
    if (!this.animator) return;
    this.animator.advance(dt);
    this.animator.evaluate(this.pos, this.quat);
  }

  /** Writes the pose buffers to the bones (call after animate / procedural edits). */
  applyPose(): void {
    const n = this.bones.length;
    for (let i = 0; i < n; i++) {
      const b = this.bones[i];
      b.position.fromArray(this.pos, i * 3);
      b.quaternion.fromArray(this.quat, i * 4);
    }
  }

  /** Updates world matrices of the whole hierarchy (bones, merged children). */
  updateMatrices(): void {
    this.root.updateMatrixWorld(true);
    for (const c of this.children) c.root.updateMatrixWorld(true);
  }

  bone(name: string): Bone | null {
    return this.boneByName.get(name.toLowerCase()) ?? this.mergedInto?.bone(name) ?? null;
  }

  /**
   * An attachment's world matrix (three space; its axes are the Source attachment's: column 0
   * forward). Looks in merged children too. False when the model has no such attachment.
   */
  attachmentMatrix(name: string, out: Matrix4): boolean {
    const a = this.asset.attachments.get(name.toLowerCase());
    if (a) {
      const bone = this.bone(a.bone);
      if (bone) out.multiplyMatrices(bone.matrixWorld, a.local);
      else
        out.multiplyMatrices(
          tmpM.multiplyMatrices(this.root.matrixWorld, this.asset.frame),
          a.local,
        );
      return true;
    }
    for (const c of this.children) if (c.attachmentMatrix(name, out)) return true;
    return false;
  }

  /** World position of an attachment (falls back to the model origin). */
  attachmentPosition(name: string, out: Vector3): Vector3 {
    if (this.attachmentMatrix(name, tmpM)) return out.setFromMatrixPosition(tmpM);
    return out.setFromMatrixPosition(this.root.matrixWorld);
  }

  // ─── merged children ──────────────────────────────────────────────────────

  /**
   * Bone-merges another instance onto this one (SDK EF_BONEMERGE): its skinned meshes deform
   * with this skeleton; bones this model lacks hang from the matching parent bone.
   */
  attach(child: ModelInstance): void {
    if (child.mergedInto === this) return;
    child.detach();
    const merged = boneMerge(child.scene, this.scene);
    child.mergedInto = this;
    child.root.matrix.identity();
    // Skinned meshes draw where their bones are; keep the child under our root so it shows and
    // hides with us. A rigid child (no skinning) follows its own root, placed at our origin.
    this.frameGroup.add(child.root);
    if (merged) {
      child.boneByName.clear();
      child.scene.traverse((o) => {
        const sm = o as SkinnedMesh;
        if (sm.isSkinnedMesh)
          for (const b of sm.skeleton.bones) child.boneByName.set(b.name.toLowerCase(), b);
      });
      for (const b of merged.moved) {
        b.traverse((o) => {
          if ((o as Bone).isBone) child.boneByName.set(o.name.toLowerCase(), o as Bone);
        });
      }
    } else {
      // Rigid child: hang it on the weapon bone like Source's follow-bone.
      const wb = this.bone('weapon_bone') ?? this.bone('prp_weapon_bone');
      if (wb) {
        child.frameGroup.matrix.copy(child.asset.frame);
        wb.add(child.root);
        child.root.matrix.copy(this.asset.frame).invert();
      }
    }
    this.children.push(child);
  }

  /**
   * Hangs a rigid child (a loadout-channel weapon or cosmetic: plain meshes in the item's own
   * compiled bind space) on the first of `bones` this model has, at `pose` (the item's
   * pose-to-bone matrix) — where the game's bone-merge puts it. False when no bone matches.
   */
  attachRigid(child: ModelInstance, bones: readonly string[], pose: Matrix4): boolean {
    let bone: Bone | null = null;
    for (const name of bones) if ((bone = this.bone(name))) break;
    if (!bone) return false;
    child.detach();
    child.mergedInto = this;
    child.frameGroup.matrix.identity();
    child.root.matrix.copy(pose);
    child.root.matrixWorldNeedsUpdate = true;
    bone.add(child.root);
    this.children.push(child);
    return true;
  }

  detach(): void {
    const p = this.mergedInto;
    if (!p) return;
    const i = p.children.indexOf(this);
    if (i >= 0) p.children.splice(i, 1);
    this.root.removeFromParent();
    this.mergedInto = null;
  }

  get attached(): readonly ModelInstance[] {
    return this.children;
  }

  // ─── lifetime ─────────────────────────────────────────────────────────────

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const c of [...this.children]) c.dispose();
    this.detach();
    this.root.removeFromParent();
    for (const m of this.materials.values()) m.dispose();
    this.materials.clear();
    // Geometry and textures belong to the asset (shared by every instance).
  }
}
