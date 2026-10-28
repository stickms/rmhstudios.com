import {
  Bone,
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  Matrix4,
  Skeleton,
  SkinnedMesh,
} from 'three';
import { describe, expect, it } from 'vitest';
import { boneMerge } from '../bone-merge';

const bone = (name: string, parent?: Bone) => {
  const b = new Bone();
  b.name = name;
  parent?.add(b);
  return b;
};

function player() {
  const body = new Group();
  const pelvis = bone('bip_pelvis');
  const left = bone('bip_foot_l', pelvis);
  const right = bone('bip_foot_r', pelvis);
  body.add(pelvis);
  return { body, pelvis, left, right };
}

/** A cosmetic file's scene: a skinned mesh plus its own copy of the skeleton, as the sync writes it. */
function boots(...names: [string, string?][]) {
  const root = new Group();
  const bones = names.map(([n, parent]) => bone(n, parent ? undefined : undefined));
  bones.forEach((b, i) => {
    const parentName = names[i][1];
    const parent = parentName ? bones.find((x) => x.name === parentName) : undefined;
    if (parent) parent.add(b);
    else root.add(b);
  });
  const mesh = new SkinnedMesh(new BufferGeometry());
  mesh.geometry.setAttribute('position', new Float32BufferAttribute([0, 0, 0], 3));
  mesh.bind(
    new Skeleton(
      bones,
      bones.map(() => new Matrix4()),
    ),
  );
  root.add(mesh);
  return { root, mesh };
}

describe('boneMerge', () => {
  it("binds the cosmetic's bones to the player's bones of the same name", () => {
    const { body, left, right } = player();
    const { root, mesh } = boots(['bip_foot_l'], ['bip_foot_r']);
    expect(boneMerge(root, body)?.moved).toEqual([]);
    expect(mesh.skeleton.bones).toEqual([left, right]);
    // The file's own copy of the skeleton is gone.
    expect(root.children.filter((c) => (c as Bone).isBone)).toEqual([]);
  });

  it('keeps a bone the player lacks, under the player bone its parent became, with its own bind', () => {
    const { body, left } = player();
    const { root, mesh } = boots(['bip_foot_l'], ['prop_strap', 'bip_foot_l']);
    const strap = mesh.skeleton.bones[1];
    const inverse = mesh.skeleton.boneInverses[1].clone();
    const merged = boneMerge(root, body);
    // Not collapsed onto the foot (that would leave its vertices on the wrong bind matrix): it stays a bone
    // of its own, mounted on the foot, and its inverse bind matrix is untouched.
    expect(mesh.skeleton.bones).toEqual([left, strap]);
    expect(strap.parent).toBe(left);
    expect(mesh.skeleton.boneInverses[1].equals(inverse)).toBe(true);
    expect(merged?.moved).toEqual([strap]);
  });

  it('carries a chain of private bones along with the first one', () => {
    const { body, right } = player();
    const { root, mesh } = boots(
      ['bip_foot_r'],
      ['spring_1', 'bip_foot_r'],
      ['spring_2', 'spring_1'],
    );
    const [, one, two] = mesh.skeleton.bones;
    expect(boneMerge(root, body)?.moved).toEqual([one]);
    expect(one.parent).toBe(right);
    expect(two.parent).toBe(one);
  });

  it('changes nothing when there is nothing to bind', () => {
    const { body } = player();
    expect(boneMerge(new Group(), body)).toBeNull();
  });
});
