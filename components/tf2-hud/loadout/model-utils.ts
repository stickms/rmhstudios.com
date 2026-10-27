/** Helpers shared by the item viewer and the player viewer. */

import { Color, type Material, type Mesh, type MeshStandardMaterial, type Object3D } from 'three';

/**
 * The loader caches one scene per URL; give each viewer its own copy, with its own
 * materials, so tinting never leaks into another viewer of the same model.
 */
export function cloneWithMaterials(scene: Object3D): Object3D {
  const copy = scene.clone(true);
  copy.traverse((o: Object3D) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    mesh.material = Array.isArray(mesh.material)
      ? mesh.material.map((m) => m.clone())
      : mesh.material.clone();
  });
  return copy;
}

const materialsOf = (mesh: Mesh): Material[] =>
  Array.isArray(mesh.material) ? mesh.material : [mesh.material];

/**
 * Paint: a material the converter flagged `extras.tint = true` has its base colour multiplied
 * by the paint colour; passing no colour restores the original.
 */
export function applyTint(root: Object3D, tint?: string): void {
  const colour = tint ? new Color(tint) : null;
  root.traverse((o: Object3D) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    for (const m of materialsOf(mesh)) {
      if (!m.userData?.tint || !('color' in m)) continue;
      const std = m as MeshStandardMaterial;
      std.userData.baseColor ??= std.color.clone();
      std.color.copy(std.userData.baseColor as Color);
      if (colour) std.color.multiply(colour);
      std.needsUpdate = true;
    }
  });
}
