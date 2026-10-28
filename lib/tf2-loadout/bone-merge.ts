/**
 * Bone-merge, the way the game wears boots, gloves and capes: the cosmetic's skinned mesh deforms with the
 * player's own skeleton rather than hanging off one bone, so both mantreads follow their own foot.
 * The sync flags such a cosmetic (`userData.boneMerge`) and exports it skinned on a copy of the class's bone
 * names; here each of its bones is swapped for the player's bone of the same name.
 */

import { Skeleton, type Bone, type Object3D, type SkinnedMesh } from 'three';

const isBone = (o: Object3D): o is Bone => (o as Bone).isBone === true;
const isSkinned = (o: Object3D): o is SkinnedMesh => (o as SkinnedMesh).isSkinnedMesh === true;

/**
 * Bind every skinned mesh under `root` to the matching bones of `body`. A bone the player lacks (a prop bone
 * private to the cosmetic) follows its nearest ancestor that exists. The cosmetic's own copy of the skeleton is
 * dropped from `root`. Returns false, changing nothing, when nothing could be bound.
 */
export function boneMerge(root: Object3D, body: Object3D): boolean {
  const player = new Map<string, Bone>();
  body.traverse((o) => {
    if (isBone(o)) player.set(o.name, o);
  });
  const meshes: SkinnedMesh[] = [];
  root.traverse((o) => {
    if (isSkinned(o)) meshes.push(o);
  });
  if (!meshes.length || !player.size) return false;

  const nameOf = (b: Object3D): string => (b.userData.boneName as string | undefined) ?? b.name;
  const fallback =
    [...player.values()].find((b) => !(b.parent && isBone(b.parent))) ?? [...player.values()][0];
  const resolve = (b: Bone): Bone => {
    for (let o: Object3D | null = b; o && isBone(o); o = o.parent) {
      const found = player.get(nameOf(o));
      if (found) return found;
    }
    return fallback;
  };
  for (const mesh of meshes) {
    const bones = mesh.skeleton.bones.map(resolve);
    mesh.bind(new Skeleton(bones, mesh.skeleton.boneInverses), mesh.bindMatrix);
  }
  // The copy of the skeleton the file carried is no longer used by anything.
  for (const child of [...root.children]) if (isBone(child)) root.remove(child);
  return true;
}
