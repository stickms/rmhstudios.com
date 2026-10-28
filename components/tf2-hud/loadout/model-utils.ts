/** Helpers shared by the item viewer and the player viewer. */

import {
  Color,
  type Material,
  type Mesh,
  type MeshStandardMaterial,
  type Object3D,
  type Texture,
} from 'three';
import type { WarPaint } from '@/lib/tf2-loadout/warpaint';
import type { Bodygroups } from '@/lib/tf2-loadout/catalog-types';
import { showsSubmodel } from '@/lib/tf2-loadout/bodygroups';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

/**
 * The loader caches one scene per URL; give each viewer its own copy, with its own
 * materials, so tinting never leaks into another viewer of the same model. A plain `clone` leaves a
 * skinned mesh bound to the original skeleton, so the class body goes through SkeletonUtils.
 */
export function cloneWithMaterials(scene: Object3D): Object3D {
  const copy = cloneSkinned(scene);
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

/**
 * Draw a weapon with a war paint's texture in place of its own base colour map (the game does the same:
 * the paint is the weapon's whole texture). `null` puts the original back. Only the first textured
 * material is replaced — a weapon is one texture in the game's data — and the original is remembered on
 * the material.
 */
export function applyPaintTexture(root: Object3D, texture: Texture | null): void {
  let done = false;
  root.traverse((o: Object3D) => {
    const mesh = o as Mesh;
    if (done || !mesh.isMesh) return;
    for (const m of materialsOf(mesh)) {
      if (m.userData.attachment) continue;
      const std = m as MeshStandardMaterial;
      if (!('map' in std) || (!std.map && !std.userData.originalMap)) continue;
      std.userData.originalMap ??= std.map;
      std.map = texture ?? (std.userData.originalMap as Texture);
      std.needsUpdate = true;
      done = true;
      return;
    }
  });
}

/**
 * Show the class body's submodels the worn items select. The converter tags each switchable mesh with
 * its group and submodel (primitive extras, which the loader keeps on the geometry); a mesh with no tag
 * is never switched. Visibility only: nothing is rebuilt, so changing a hat is free.
 */
export function applyBodygroups(root: Object3D, selection: Bodygroups): void {
  root.traverse((o: Object3D) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    const tag = (mesh.geometry?.userData ?? mesh.userData) as { bodygroup?: string; sub?: number };
    if (typeof tag.bodygroup !== 'string' || typeof tag.sub !== 'number') return;
    mesh.visible = showsSubmodel(selection, tag.bodygroup, tag.sub);
  });
}

/** Optional geometry is exported from the game's attached_models_festive block. */
export function applyFestive(root: Object3D, festive = false): void {
  root.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    for (const material of materialsOf(mesh)) {
      if (material.userData.festive) material.visible = festive;
    }
  });
}

export type { WarPaint };
