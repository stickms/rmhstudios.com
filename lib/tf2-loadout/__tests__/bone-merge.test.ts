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
    expect(boneMerge(root, body)).toBe(true);
    expect(mesh.skeleton.bones).toEqual([left, right]);
    // The file's own copy of the skeleton is gone.
    expect(root.children.filter((c) => (c as Bone).isBone)).toEqual([]);
  });

  it('lets a bone the player lacks follow its nearest ancestor that exists', () => {
    const { body, left } = player();
    const { root, mesh } = boots(['bip_foot_l'], ['prop_strap', 'bip_foot_l']);
    boneMerge(root, body);
    expect(mesh.skeleton.bones).toEqual([left, left]);
  });

  it('changes nothing when there is nothing to bind', () => {
    const { body } = player();
    expect(boneMerge(new Group(), body)).toBe(false);
  });
});
