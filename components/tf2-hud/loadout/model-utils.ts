/** Helpers shared by the item viewer and the player viewer. */

import {
  Color,
  ShaderChunk,
  SRGBColorSpace,
  type Material,
  type Mesh,
  type MeshStandardMaterial,
  type Object3D,
  type Texture,
} from 'three';
import type { WarPaint } from '@/lib/tf2-loadout/warpaint';
import { teamVariantOf, type Team } from '@/lib/tf2-loadout/team-skins';
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
 * The game's paint tint (vertexlit_and_unlit_generic_ps2x.fxc, BLENDTINTBYBASEALPHA), applied where the
 * texture's alpha says paint goes:
 *   tinted = mix(albedo * tint, tint, replace);  albedo = mix(albedo, tinted, alpha)
 * The converter keeps the texture alpha (the mask) and records the material's own default tint and replace
 * factor (`extras.tintDefault`, `extras.tintReplace`).
 */
export const PAINT_TINT_GLSL = `
  vec3 paintTinted = mix(sampledDiffuseColor.rgb * uPaint, uPaint, uPaintReplace);
  sampledDiffuseColor.rgb = mix(sampledDiffuseColor.rgb, paintTinted, mix(1.0, sampledDiffuseColor.a, uPaintMasked));
`;

interface PaintUniforms {
  uPaint: { value: Color };
  uPaintReplace: { value: number };
  /** 1 when the texture's alpha is the paint mask; 0 when the paint multiplies the whole material. */
  uPaintMasked: { value: number };
}

/** Patch a flagged material once to blend `uPaint` into its base colour map by the map's alpha. */
function paintUniforms(m: Material): PaintUniforms {
  const existing = m.userData.paintUniforms as PaintUniforms | undefined;
  if (existing) return existing;
  const uniforms: PaintUniforms = {
    uPaint: { value: new Color(1, 1, 1) },
    uPaintReplace: { value: 0 },
    uPaintMasked: { value: 1 },
  };
  m.userData.paintUniforms = uniforms;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uPaint = uniforms.uPaint;
    shader.uniforms.uPaintReplace = uniforms.uPaintReplace;
    shader.uniforms.uPaintMasked = uniforms.uPaintMasked;
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform vec3 uPaint;\nuniform float uPaintReplace;\nuniform float uPaintMasked;',
      )
      .replace(
        '#include <map_fragment>',
        ShaderChunk.map_fragment.replace(
          'diffuseColor *= sampledDiffuseColor;',
          PAINT_TINT_GLSL + 'diffuseColor *= sampledDiffuseColor;',
        ),
      );
  };
  m.customProgramCacheKey = () => 'rmh-paint-tint';
  m.needsUpdate = true;
  return uniforms;
}

/**
 * Paint: a material the converter flagged `extras.tint = true` is tinted by the paint colour where its texture's
 * alpha says so. With no paint it wears the material's own default tint (an unpainted item keeps its colour);
 * a file from before the converter kept the mask has none and is multiplied whole, as it always was.
 */
export function applyTint(root: Object3D, tint?: string): void {
  root.traverse((o: Object3D) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    for (const m of materialsOf(mesh)) {
      if (!m.userData?.tint || !('color' in m)) continue;
      const uniforms = paintUniforms(m);
      const fallback = m.userData.tintDefault as number[] | undefined;
      if (tint) uniforms.uPaint.value.set(tint);
      else if (fallback?.length === 3)
        uniforms.uPaint.value.setRGB(fallback[0], fallback[1], fallback[2], SRGBColorSpace);
      else uniforms.uPaint.value.setRGB(1, 1, 1);
      // A painted item replaces its own colour only by the material's factor; the paint colour itself is
      // always the tint.
      uniforms.uPaintReplace.value = (m.userData.tintReplace as number | undefined) ?? 0;
      uniforms.uPaintMasked.value = m.userData.tintWhole ? 0 : 1;
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

interface RedLook {
  map: Texture | null;
  emissiveMap: Texture | null;
  color: Color;
  tintDefault: unknown;
  tintReplace: unknown;
}
const redLooks = new WeakMap<Material, RedLook>();

/**
 * Show the team's skin: a material the sync recorded a BLU variant for (`extras.blu`, see
 * lib/tf2-loadout/team-skins.ts) takes BLU's texture, colour and default paint tint on `blu`, and its
 * own (RED's) back on `red`. `textures` are BLU's, by texture index (`loadTeamTextures`); a BLU texture
 * still loading keeps RED's for now. Call `applyTint` after, so the default tint takes effect. A war
 * paint shown on the material stays on top (its "original" becomes the team's texture).
 */
export function applyTeam(
  root: Object3D,
  team: Team,
  textures?: ReadonlyMap<number, Texture>,
): void {
  root.traverse((o: Object3D) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    for (const m of materialsOf(mesh)) {
      const v = teamVariantOf(m);
      if (!v || !('color' in m)) continue;
      const std = m as MeshStandardMaterial;
      let red = redLooks.get(m);
      if (!red) {
        red = {
          map: (std.userData.originalMap as Texture | undefined) ?? std.map,
          emissiveMap: std.emissiveMap,
          color: std.color.clone(),
          tintDefault: std.userData.tintDefault,
          tintReplace: std.userData.tintReplace,
        };
        redLooks.set(m, red);
      }
      const blu = team === 'blu';
      const map =
        blu && v.baseColorTexture !== undefined
          ? (textures?.get(v.baseColorTexture) ?? red.map)
          : red.map;
      const emissive =
        blu && v.emissiveTexture !== undefined
          ? (textures?.get(v.emissiveTexture) ?? red.emissiveMap)
          : red.emissiveMap;
      const painted =
        std.userData.originalMap !== undefined && std.map !== std.userData.originalMap;
      if (std.userData.originalMap !== undefined) std.userData.originalMap = map;
      if (!painted && std.map !== map) {
        std.map = map;
        std.needsUpdate = true;
      }
      if (std.emissiveMap !== emissive) {
        std.emissiveMap = emissive;
        std.needsUpdate = true;
      }
      if (blu && v.baseColor?.length === 3)
        std.color.setRGB(v.baseColor[0], v.baseColor[1], v.baseColor[2]);
      else std.color.copy(red.color);
      std.userData.tintDefault = blu && v.tintDefault ? v.tintDefault : red.tintDefault;
      std.userData.tintReplace =
        blu && v.tintReplace !== undefined ? v.tintReplace : red.tintReplace;
    }
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
