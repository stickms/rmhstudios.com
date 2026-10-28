/**
 * Bone-merge, the way the game wears boots, gloves, sleeves and capes: the cosmetic's skinned mesh deforms
 * with the player's own skeleton rather than hanging off one bone, so both mantreads follow their own foot.
 * The sync flags such a cosmetic (`userData.boneMerge`) and exports it skinned on a copy of the class's bone
 * names; here each of its bones is swapped for the player's bone of the same name.
 */

import { Skeleton, type Bone, type Object3D, type SkinnedMesh } from 'three';

const isBone = (o: Object3D): o is Bone => (o as Bone).isBone === true;
const isSkinned = (o: Object3D): o is SkinnedMesh => (o as SkinnedMesh).isSkinnedMesh === true;

export interface Merged {
  /**
   * The cosmetic's own bones that the player lacks (springs, cloth, props), now parented under the player
   * bone they hung from. They keep their own bind matrices and local pose, so the vertices they weight stay
   * where the model put them, and they move with the animation. Take them off when the cosmetic goes.
   */
  moved: Bone[];
}

/**
 * Bind every skinned mesh under `root` to the matching bones of `body`. A bone the player lacks is kept, not
 * replaced: it moves under the player bone its parent was swapped for (swapping it for that bone instead
 * would leave its vertices on the wrong bind matrix, flung away from where the model put them). The
 * cosmetic's own copy of the shared skeleton is dropped from `root`. Returns null, changing nothing, when
 * there is nothing to bind.
 */
export function boneMerge(root: Object3D, body: Object3D): Merged | null {
  const player = new Map<string, Bone>();
  body.traverse((o) => {
    if (isBone(o)) player.set(o.name, o);
  });
  const meshes: SkinnedMesh[] = [];
  const own = new Set<Bone>();
  root.traverse((o) => {
    if (isSkinned(o)) {
      meshes.push(o);
      o.skeleton.bones.forEach((b) => own.add(b));
    }
    if (isBone(o)) own.add(o);
  });
  if (!meshes.length || !player.size) return null;

  const nameOf = (b: Object3D): string => (b.userData.boneName as string | undefined) ?? b.name;
  const fallback =
    [...player.values()].find((b) => !(b.parent && isBone(b.parent))) ?? [...player.values()][0];
  const shared = new Map<Bone, Bone>();
  for (const b of own) {
    const match = player.get(nameOf(b));
    if (match) shared.set(b, match);
  }

  // A private bone whose parent is shared (or that has none) goes under the player's bone for that parent;
  // one under another private bone travels with it.
  const moved: Bone[] = [];
  for (const b of own) {
    if (shared.has(b)) continue;
    const parent = b.parent && isBone(b.parent) ? b.parent : null;
    if (parent && !shared.has(parent)) continue;
    (parent ? shared.get(parent)! : fallback).add(b);
    moved.push(b);
  }
  for (const mesh of meshes) {
    const bones = mesh.skeleton.bones.map((b) => shared.get(b) ?? b);
    mesh.bind(new Skeleton(bones, mesh.skeleton.boneInverses), mesh.bindMatrix);
  }
  // The copy of the shared skeleton the file carried is no longer used by anything.
  for (const child of [...root.children]) if (isBone(child)) root.remove(child);
  return { moved };
}
