/**
 * The frame a model is placed by when its animations come from an anim pack.
 *
 * The numbers are the published CS:GO default knife view model (`models/weapons/v_knife_default_ct.mdl`)
 * reduced to its root bone and its blade bone: the model GLB has no clips, no `source.clipFrame` and a hull of
 * no size; the pack carries the sequences, in the converter's (y, z, x) basis.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  Bone,
  BoxGeometry,
  Float32BufferAttribute,
  Group,
  Matrix4,
  MeshBasicMaterial,
  Skeleton,
  type Object3D,
  SkinnedMesh,
  Uint16BufferAttribute,
  Vector3,
} from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { SOURCE_UNIT } from '../coords';
import { ModelAsset } from './model-asset';
import { ModelInstance } from './model-instance';

/** Three's GLTFLoader names nodes with PropertyBinding.sanitizeNodeName: the dots are gone. */
const ROOT = 'v_weapon';
const BLADE = 'v_weaponknife';

/** Bind pose (local) and the first key of `idle1`, as published. */
const BIND_ROOT_QUAT = [0.7071065902709961, 0, 0, 0.70710688829422];
const IDLE_ROOT_QUAT = [0, -0.7071138620376587, 0, 0.7071138620376587];
const IDLE_BLADE_QUAT = [-0.4385814964771271, 0.32123783230781555, -0.3264564871788025, 0.773247480392456];
const IDLE_BLADE_POS = [0.3732609450817108, -0.08751093596220016, 0.0948779284954071];

function fakeGltf(scene: Group, animations: unknown[] = []): GLTF {
  return {
    scene,
    scenes: [scene],
    animations,
    cameras: [],
    asset: {},
    userData: {},
    parser: { json: {}, associations: new Map() },
  } as unknown as GLTF;
}

/** The knife model: a skinned mesh on the two bones, no clips of its own. */
function knifeModel(source: Record<string, unknown>): GLTF {
  const scene = new Group();
  const root = new Bone();
  root.name = ROOT;
  root.quaternion.fromArray(BIND_ROOT_QUAT);
  const blade = new Bone();
  blade.name = BLADE;
  root.add(blade);
  scene.add(root);
  const geometry = new BoxGeometry(0.02, 0.2, 0.02);
  const n = geometry.getAttribute('position').count;
  geometry.setAttribute('skinIndex', new Uint16BufferAttribute(new Array(n * 4).fill(0).map((_, i) => (i % 4 ? 0 : 1)), 4));
  geometry.setAttribute('skinWeight', new Float32BufferAttribute(new Array(n * 4).fill(0).map((_, i) => (i % 4 ? 0 : 1)), 4));
  const mesh = new SkinnedMesh(geometry, new MeshBasicMaterial());
  scene.add(mesh);
  scene.updateMatrixWorld(true);
  mesh.bind(new Skeleton([root, blade]));
  scene.userData = { mdl: 'models/weapons/v_knife_default_ct.mdl', skinned: true, source };
  return fakeGltf(scene);
}

/** The anim pack: the same skeleton with no mesh, the sequences and their clips. */
function knifePack(source?: Record<string, unknown>): GLTF {
  const scene = new Group();
  scene.userData = {
    animPack: true,
    ...(source ? { source } : {}),
    sequences: [
      { name: 'idle1', looping: false, delta: false, post: false, fps: 30, frames: 61, clips: ['idle1'], activity: 'ACT_VM_IDLE' },
    ],
    activities: { ACT_VM_IDLE: [{ seq: 'idle1', weight: 1 }] },
  };
  const clip = {
    name: 'idle1',
    userData: { fps: 30, frames: 61, delta: false },
    tracks: [
      { name: `${ROOT}.quaternion`, times: [0], values: IDLE_ROOT_QUAT },
      { name: `${BLADE}.quaternion`, times: [0], values: IDLE_BLADE_QUAT },
      { name: `${BLADE}.position`, times: [0], values: IDLE_BLADE_POS },
    ],
  };
  return fakeGltf(scene, [clip]);
}

/** Where the blade bone is in the idle pose with the model at the eye, looking along Source +x (units). */
function idleBlade(asset: ModelAsset): { forward: number; left: number; up: number } {
  const inst = new ModelInstance(asset, {});
  inst.animator!.setSequence(asset.anim!.selectWeightedSequence('ACT_VM_IDLE'), { fade: false });
  inst.place({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, 1);
  inst.animate(0);
  inst.applyPose();
  inst.updateMatrices();
  // three model space is Source (y, z, x).
  const p = new Vector3().setFromMatrixPosition(inst.bone(BLADE)!.matrixWorld).divideScalar(SOURCE_UNIT);
  return { forward: p.z, left: p.x, up: p.y };
}

const NO_HULL = { hullMin: [0, 0, 0], hullMax: [0, 0, 0] };

describe('a model animated by an anim pack', () => {
  it('takes its sequences from the pack', () => {
    const asset = new ModelAsset('knife', knifeModel(NO_HULL), [], knifePack());
    expect(asset.anim?.sequences.size).toBe(1);
    const clip = asset.anim!.clips.get('idle1')!;
    expect(clip.rot.filter(Boolean)).toHaveLength(2);
    expect(clip.pos.filter(Boolean)).toHaveLength(1);
  });

  it('a hull of no size leaves the frame at the (y, z, x) default: the knife is in front of the eye', () => {
    // The idle turns the root a quarter turn against its bind rotation. With a hull that is read as the
    // converter's frame change and then checked against the posed bones; with none it was taken as given,
    // which put the knife 5 units behind the camera and 20 to the left, so nothing was drawn.
    const asset = new ModelAsset('knife', knifeModel(NO_HULL), [], knifePack());
    expect(asset.frame.equals(new Matrix4())).toBe(true);
    const blade = idleBlade(asset);
    expect(blade.forward).toBeCloseTo(19.59, 1);
    expect(blade.left).toBeCloseTo(-4.98, 1);
    expect(blade.up).toBeCloseTo(-4.59, 1);
  });

  it("the pack's recorded clip frame places the model when the model records none", () => {
    // GLB = M · Source for some rotation M other than the default: the frame undoes exactly it.
    const rows = [0, 1, 0, 1, 0, 0, 0, 0, -1];
    const withPack = new ModelAsset('knife', knifeModel(NO_HULL), [], knifePack({ clipFrame: rows }));
    const own = new ModelAsset('knife', knifeModel({ ...NO_HULL, clipFrame: rows }), [], knifePack());
    expect(withPack.frame.equals(new Matrix4())).toBe(false);
    expect(withPack.frame.equals(own.frame)).toBe(true);
    // The model's own record wins over the pack's.
    const both = new ModelAsset(
      'knife',
      knifeModel({ ...NO_HULL, clipFrame: [0, 1, 0, 0, 0, 1, 1, 0, 0] }),
      [],
      knifePack({ clipFrame: rows }),
    );
    expect(both.frame.equals(new Matrix4())).toBe(true);
  });

  it("disposing an instance frees its skeleton's bone texture, and leaves the asset's alone", () => {
    const asset = new ModelAsset('knife', knifeModel(NO_HULL), [], knifePack());
    const skeletonOf = (root: Object3D): Skeleton => {
      let found: Skeleton | null = null;
      root.traverse((o) => {
        if ((o as SkinnedMesh).isSkinnedMesh) found = (o as SkinnedMesh).skeleton;
      });
      return found!;
    };
    const inst = new ModelInstance(asset, {});
    const own = skeletonOf(inst.root);
    const shared = skeletonOf(asset.gltf.scene);
    expect(own).not.toBe(shared);
    // three.js makes these on the first draw.
    own.computeBoneTexture();
    shared.computeBoneTexture();
    const freed = vi.fn();
    own.boneTexture!.addEventListener('dispose', freed);
    inst.dispose();
    expect(freed).toHaveBeenCalledTimes(1);
    expect(own.boneTexture).toBeNull();
    expect(shared.boneTexture).not.toBeNull();
  });
});
