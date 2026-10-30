/**
 * Ragdolls (ragdoll.ts): the rotation fit, a body falling onto a floor and coming to rest in one piece
 * above it, joint limits pulling a joint bent too far back into range, the hitbox fallback for a model
 * without .phy data, the push of a killing blow, and the cap on ragdolls simulating at once.
 */
import {
  Bone,
  BoxGeometry,
  Float32BufferAttribute,
  Group,
  MeshStandardMaterial,
  Quaternion,
  Skeleton,
  SkinnedMesh,
  Uint16BufferAttribute,
  Vector3,
} from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { describe, expect, it } from 'vitest';
import { threeToSrc } from '../coords';
import { ModelAsset } from './model-asset';
import { ModelInstance } from './model-instance';
import {
  awakeRagdolls,
  extractRotation,
  MAX_AWAKE,
  Ragdoll,
  ragdollDescFor,
  type RagdollDesc,
  type RagdollTrace,
} from './ragdoll';

/** A chain pelvis → spine → head, 0.2 GLB units apart up +y, hitboxes on each. */
function body(ragdoll: RagdollDesc | null, bend = 0): ModelInstance {
  const scene = new Group();
  const names = ['pelvis', 'spine', 'head'];
  const bones = names.map((n) => {
    const b = new Bone();
    b.name = n;
    return b;
  });
  scene.add(bones[0]);
  bones[0].add(bones[1]);
  bones[1].add(bones[2]);
  bones[1].position.set(0, 0.2, 0);
  bones[2].position.set(0, 0.2, 0);
  if (bend) bones[2].quaternion.setFromAxisAngle(new Vector3(0, 0, 1), bend);
  const geo = new BoxGeometry(0.1, 0.6, 0.1);
  const count = geo.attributes.position.count;
  const joints: number[] = [];
  const weights: number[] = [];
  for (let i = 0; i < count; i++) {
    joints.push(i % 3, 0, 0, 0);
    weights.push(1, 0, 0, 0);
  }
  geo.setAttribute('skinIndex', new Uint16BufferAttribute(joints, 4));
  geo.setAttribute('skinWeight', new Float32BufferAttribute(weights, 4));
  const mesh = new SkinnedMesh(geo, new MeshStandardMaterial());
  mesh.bind(new Skeleton(bones));
  scene.add(mesh);
  const box = { min: [-0.05, 0, -0.05], max: [0.05, 0.2, 0.05] };
  scene.userData = {
    hitboxSets: [{ name: 'default', hitboxes: names.map((bone) => ({ bone, group: 0, ...box })) }],
    ...(ragdoll ? { ragdoll } : {}),
  };
  // The bind pose is straight: the bend is only in the posed instance.
  if (bend) bones[2].quaternion.identity();
  const gltf = {
    scene,
    scenes: [scene],
    animations: [],
    cameras: [],
    asset: {},
    userData: {},
    parser: { json: {}, associations: new Map() },
  } as unknown as GLTF;
  const inst = new ModelInstance(new ModelAsset('body.mdl', gltf, [], null), {});
  if (bend) inst.bones[2].quaternion.setFromAxisAngle(new Vector3(0, 0, 1), bend);
  inst.place({ x: 0, y: 0, z: 60 }, { x: 0, y: 0, z: 0 });
  inst.updateMatrices();
  return inst;
}

const DESC: RagdollDesc = {
  solids: [
    { bone: 'pelvis', mass: 15 },
    { bone: 'spine', mass: 15 },
    { bone: 'head', mass: 5 },
  ],
  constraints: [
    { parent: 0, child: 1, x: [-20, 20], y: [-20, 20], z: [-20, 20] },
    { parent: 1, child: 2, x: [-10, 10], y: [-10, 10], z: [-10, 10] },
  ],
};

/** The floor at z = 0 (Source space), as a box trace. */
const floor: RagdollTrace = (from, to, r) => {
  if (from.z - r < -1e-3)
    return { fraction: 0, endPos: from, normal: { x: 0, y: 0, z: 1 }, startSolid: true };
  if (to.z - r >= 0)
    return { fraction: 1, endPos: to, normal: { x: 0, y: 0, z: 1 }, startSolid: false };
  const f = (from.z - r) / (from.z - to.z);
  return {
    fraction: f,
    endPos: { x: from.x + (to.x - from.x) * f, y: from.y + (to.y - from.y) * f, z: r },
    normal: { x: 0, y: 0, z: 1 },
    startSolid: false,
  };
};

function sourcePos(b: Bone) {
  const out = { x: 0, y: 0, z: 0 };
  threeToSrc(new Vector3().setFromMatrixPosition(b.matrixWorld), out);
  return out;
}

const dist = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

describe('ragdolls', () => {
  it('extracts the rotation part of a rotated, stretched matrix', () => {
    const want = new Quaternion().setFromAxisAngle(new Vector3(1, 2, 3).normalize(), 1.1);
    const m = new Vector3();
    // A = R · diag(2, 3, 4): columns are R's columns scaled.
    const cols = [new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)].map((c, i) =>
      m
        .copy(c)
        .applyQuaternion(want)
        .multiplyScalar(i + 2)
        .clone(),
    );
    const q = extractRotation(
      new Quaternion(),
      cols[0].x,
      cols[1].x,
      cols[2].x,
      cols[0].y,
      cols[1].y,
      cols[2].y,
      cols[0].z,
      cols[1].z,
      cols[2].z,
      40,
    );
    expect(Math.abs(q.dot(want))).toBeCloseTo(1, 4);
  });

  it('falls onto the floor, rests above it in one piece, and sleeps', () => {
    const inst = body(DESC);
    const before = inst.bones.map(sourcePos);
    const r = Ragdoll.create(inst, { trace: floor, gravity: 800 })!;
    expect(r).not.toBeNull();
    for (let i = 0; i < 600 && !r.asleep; i++) r.update(1 / 60);
    expect(r.asleep).toBe(true);
    const after = inst.bones.map(sourcePos);
    for (const p of after) {
      expect(p.z).toBeGreaterThan(0.5);
      expect(p.z).toBeLessThan(20);
    }
    // Bones keep their lengths.
    expect(dist(after[0], after[1])).toBeCloseTo(dist(before[0], before[1]), 0);
    expect(dist(after[1], after[2])).toBeCloseTo(dist(before[1], before[2]), 0);
    r.dispose();
  });

  it('pulls a joint bent past its limits back into range', () => {
    const inst = body(DESC, 1.2);
    const r = Ragdoll.create(inst, { trace: null, gravity: 0 })!;
    const bend = () => {
      const a = new Quaternion();
      const b = new Quaternion();
      inst.bones[1].getWorldQuaternion(a);
      inst.bones[2].getWorldQuaternion(b);
      return 2 * Math.acos(Math.min(1, Math.abs(a.invert().multiply(b).w)));
    };
    const start = bend();
    for (let i = 0; i < 30; i++) r.update(1 / 60);
    expect(start).toBeGreaterThan(1.1);
    // 10° on each axis: at most √3 · 10° about any axis, with a little slack for the soft correction.
    expect(bend()).toBeLessThan((Math.sqrt(3) * 10 * Math.PI) / 180 + 0.05);
    r.dispose();
  });

  it('joins the hitbox bones loosely when the model has no .phy data', () => {
    const desc = ragdollDescFor(body(null))!;
    expect(desc.solids.map((s) => s.bone)).toEqual(['pelvis', 'spine', 'head']);
    expect(desc.constraints.map((c) => [c.parent, c.child])).toEqual([
      [0, 1],
      [1, 2],
    ]);
  });

  it('a killing blow pushes the body the way it was hit', () => {
    const inst = body(DESC);
    const r = Ragdoll.create(inst, { trace: null, gravity: 0 })!;
    const head = sourcePos(inst.bones[2]);
    r.push({ x: 600, y: 0, z: 0 }, head);
    for (let i = 0; i < 6; i++) r.update(1 / 60);
    expect(sourcePos(inst.bones[2]).x - head.x).toBeGreaterThan(20);
    r.dispose();
  });

  it(`simulates at most ${MAX_AWAKE} ragdolls at once`, () => {
    const list = Array.from({ length: MAX_AWAKE + 3 }, () =>
      Ragdoll.create(body(DESC), { trace: floor, gravity: 800 })!,
    );
    expect(awakeRagdolls()).toBe(MAX_AWAKE);
    expect(list[0].asleep).toBe(true);
    expect(list[list.length - 1].asleep).toBe(false);
    for (const r of list) r.dispose();
  });
});
