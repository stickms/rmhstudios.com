/**
 * Team skins of loadout models. The sync converts each model in its RED skin family and, where the
 * BLU family looks different, records how on the material (`extras.blu`, scripts/tf2-assets/convert.py
 * `team_variant`): BLU's own texture (an extra image in the same GLB, only when its texture really
 * differs), its default paint tint, its colour factor, and its material name. A model without team
 * colours carries nothing extra, and a RED viewer never decodes BLU's images: they load on first ask.
 *
 * Shared by the builder's viewers (model-utils.ts `applyTeam`) and the game's item renderer
 * (lib/tf2-game/render/entities/loadout-models.ts).
 */
import { SRGBColorSpace, type Material, type Mesh, type Object3D, type Texture } from 'three';

export type Team = 'red' | 'blu';

/** What BLU changes on one material (glTF material extras `blu`; texture fields are texture indexes). */
export interface TeamVariant {
  baseColorTexture?: number;
  emissiveTexture?: number;
  /** sRGB 0–1. */
  tintDefault?: number[];
  tintReplace?: number;
  /** Linear 0–1 (the glTF base colour factor). */
  baseColor?: number[];
  name?: string;
}

/** The parts of a loaded glTF this needs (GLTFLoader's result). */
export interface TeamSkinSource {
  scene: Object3D;
  parser: { getDependency(type: 'texture', index: number): Promise<unknown> };
}

export function teamVariantOf(m: Material | null | undefined): TeamVariant | undefined {
  const v = m?.userData?.blu as TeamVariant | undefined;
  return v && typeof v === 'object' ? v : undefined;
}

const materialsOf = (o: Object3D): Material[] => {
  const mesh = o as Mesh;
  if (!mesh.isMesh) return [];
  return Array.isArray(mesh.material) ? mesh.material : [mesh.material];
};

/** Whether anything under `root` looks different on BLU. */
export function hasTeamVariants(root: Object3D): boolean {
  let found = false;
  root.traverse((o) => {
    if (!found) found = materialsOf(o).some((m) => teamVariantOf(m) !== undefined);
  });
  return found;
}

/** The texture indexes BLU's materials name, in order of first use. */
export function teamTextureIndexes(root: Object3D): number[] {
  const out = new Set<number>();
  root.traverse((o) => {
    for (const m of materialsOf(o)) {
      const v = teamVariantOf(m);
      for (const i of [v?.baseColorTexture, v?.emissiveTexture])
        if (typeof i === 'number' && Number.isInteger(i) && i >= 0) out.add(i);
    }
  });
  return [...out];
}

const loaded = new WeakMap<object, Promise<Map<number, Texture>>>();
const settled = new WeakMap<object, Map<number, Texture>>();

/** BLU's textures of a GLB if they have finished loading (no request is started). */
export const peekTeamTextures = (gltf: TeamSkinSource): Map<number, Texture> | undefined =>
  settled.get(gltf);

/**
 * BLU's textures of a loaded GLB by texture index — decoded on the first ask, once per file (every
 * viewer and player wearing the model shares them). Colour data, so sRGB like a base colour map.
 */
export function loadTeamTextures(gltf: TeamSkinSource): Promise<Map<number, Texture>> {
  let p = loaded.get(gltf);
  if (!p) {
    const indexes = teamTextureIndexes(gltf.scene);
    p = Promise.all(
      indexes.map(async (i) => {
        try {
          const tex = (await gltf.parser.getDependency('texture', i)) as Texture | null;
          if (tex) tex.colorSpace = SRGBColorSpace;
          return [i, tex] as const;
        } catch {
          return [i, null] as const;
        }
      }),
    ).then((pairs) => {
      const map = new Map<number, Texture>();
      for (const [i, t] of pairs) if (t) map.set(i, t);
      settled.set(gltf, map);
      return map;
    });
    loaded.set(gltf, p);
  }
  return p;
}

/** The team a TF2 team number wears (2 RED, 3 BLU; spectators and unassigned wear RED). */
export const teamOf = (team: number): Team => (team === 3 ? 'blu' : 'red');
