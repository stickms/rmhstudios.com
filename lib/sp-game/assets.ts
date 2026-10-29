/**
 * What the single-player simulation reads from the game besides the map:
 * models (sequences for prop_dynamic / actors, collision hulls and physics
 * parameters for props), materials (surface property, portalability), surface
 * properties, choreographed scenes and close captions.
 *
 * `SpAssets` is the seam. `createFsAssets` implements it over any
 * GameFileSystem (the Node tests open a Steam install; a host can mount the
 * same files however it likes). A browser host can implement it from the map
 * package manifest (`materials[*].surfaceprop / noportal`, `props[*].phys`)
 * and the model channel's index instead. Environment-agnostic.
 */

import type { Vec3 } from '../tf2-game/core/vec';
import type { BspFile } from '../tf2-game/formats/bsp';
import { openPakfile } from '../tf2-game/formats/bsp';
import { parseMdlHeader } from '../tf2-game/formats/mdl-header';
import { parsePhy, type PhyFile } from '../tf2-game/formats/phy';
import { parseVmt, materialPath, vmtFlag, vmtParam } from '../tf2-game/formats/vmt';
import type { GameFileSystem, SearchPath } from '../tf2-game/formats/vpk';
import type { SpGame } from './constants';
import { CaptionTable, parseCaptionFile } from './formats/captions';
import { parseMdlSequences, type MdlSequence } from './formats/mdl-sequences';
import { SceneImage, type VcdScene } from './formats/scene-image';
import { loadSurfaceProps, SurfacePropsTable } from './physics/surface-props';

/** A model's physics (its .phy): convex hulls in model space and the solid's parameters. */
export interface SpModelPhysics {
  /** Convex vertex sets (xyz, Source units, model space) of the first solid. */
  hulls: Float32Array[];
  /** kg ($mass; the .mdl mass when the .phy has none). */
  mass: number;
  /** Linear / angular damping (vphysics "damping" / "rotdamping"). */
  damping: number;
  rotDamping: number;
  /** Inertia multiplier ("inertia"). */
  inertia: number;
  surfaceProp: string;
  /** IVP mass centre (model space). */
  massCenter: Vec3;
}

export interface SpModelInfo {
  path: string;
  /** studiohdr hull_min / hull_max. */
  mins: Vec3;
  maxs: Vec3;
  surfaceProp: string;
  /** Own sequences, then those of included models (first name wins on lookup). */
  sequences: MdlSequence[];
  attachments: string[];
  physics: SpModelPhysics | null;
  /** The model's $keyvalues text (prop_data, physgun_interactions…). */
  keyValues: string;
}

export interface SpMaterialInfo {
  /** $surfaceprop ('' = default). */
  surfaceProp: string;
  /** `%noportal` — portals can't be placed on it. */
  noportal: boolean;
  /** Tool / never-drawn material. */
  nodraw: boolean;
  sky: boolean;
}

export interface SpAssets {
  readonly game: SpGame;
  readonly surfaceProps: SurfacePropsTable;
  model(path: string): SpModelInfo | null;
  material(name: string): SpMaterialInfo;
  scene(path: string): VcdScene | null;
  /** Raw close caption text for a token (null when unknown). */
  caption(token: string): string | null;
}

const NO_MATERIAL: SpMaterialInfo = Object.freeze({ surfaceProp: '', noportal: false, nodraw: false, sky: false });

/** Every model path normalized the way the asset channels key them. */
export const normalizeModelPath = (p: string): string => {
  let s = p.replace(/\\/g, '/').toLowerCase();
  if (!s.startsWith('models/')) s = `models/${s}`;
  return s;
};

function phySolidParams(phy: PhyFile): { mass: number; damping: number; rotDamping: number; inertia: number; surfaceProp: string } {
  let mass = 0;
  let damping = 0;
  let rotDamping = 0;
  let inertia = 1;
  let surfaceProp = '';
  let first = true;
  for (const node of phy.keyValues.children) {
    if (node.key.toLowerCase() !== 'solid' || !node.isBlock) continue;
    mass += node.getNumber('mass', 0);
    if (first) {
      damping = node.getNumber('damping', 0);
      rotDamping = node.getNumber('rotdamping', 0);
      inertia = node.getNumber('inertia', 1);
      surfaceProp = node.getString('surfaceprop', '');
      first = false;
    }
  }
  const edit = phy.keyValues.children.find((c) => c.key.toLowerCase() === 'editparams');
  const total = edit?.getNumber('totalmass', 0) ?? 0;
  if (total > 0) mass = total;
  return { mass, damping, rotDamping, inertia, surfaceProp };
}

/** SpAssets over a game file system; pass the map so its pakfile (cubemap-patched materials) is searched first. */
export function createFsAssets(game: SpGame, gfs: GameFileSystem, bsp?: BspFile | null): SpAssets {
  let pak: SearchPath | null = null;
  if (bsp && bsp.pakfile.length > 0) {
    try {
      const zip = openPakfile(bsp);
      pak = { kind: 'loose', name: 'pakfile', read: (p) => zip.read(p), exists: (p) => zip.has(p) };
    } catch {
      pak = null;
    }
  }
  const read = (p: string): Uint8Array | null => (pak && pak.kind === 'loose' ? pak.read(p.toLowerCase()) : null) ?? gfs.read(p);
  const readText = (p: string): string | null => {
    const b = read(p);
    return b ? new TextDecoder('latin1').decode(b) : null;
  };

  const surfaceProps = loadSurfaceProps(gfs);
  const models = new Map<string, SpModelInfo | null>();
  const materials = new Map<string, SpMaterialInfo>();
  let scenes: SceneImage | null | undefined;
  let captions: CaptionTable | null | undefined;

  const loadSequences = (path: string, depth: number, out: MdlSequence[], attachments: string[] | null): void => {
    const bytes = read(path);
    if (!bytes) return;
    try {
      const info = parseMdlSequences(bytes);
      out.push(...info.sequences);
      if (attachments) attachments.push(...info.attachments);
      if (depth < 4) for (const inc of info.includes) loadSequences(normalizeModelPath(inc), depth + 1, out, null);
    } catch {
      // unreadable include: skip
    }
  };

  const model = (path: string): SpModelInfo | null => {
    const key = normalizeModelPath(path);
    if (models.has(key)) return models.get(key)!;
    let out: SpModelInfo | null = null;
    const bytes = read(key);
    if (bytes) {
      try {
        const h = parseMdlHeader(bytes);
        const sequences: MdlSequence[] = [];
        const attachments: string[] = [];
        loadSequences(key, 0, sequences, attachments);
        let physics: SpModelPhysics | null = null;
        const phyBytes = read(key.replace(/\.mdl$/, '.phy'));
        if (phyBytes) {
          try {
            const phy = parsePhy(phyBytes);
            const solid = phy.solids[0];
            if (solid && solid.convexes.length > 0) {
              const p = phySolidParams(phy);
              physics = {
                hulls: solid.convexes.map((c) => c.vertices),
                mass: p.mass > 0 ? p.mass : h.mass > 0 ? h.mass : 10,
                damping: p.damping,
                rotDamping: p.rotDamping,
                inertia: p.inertia > 0 ? p.inertia : 1,
                surfaceProp: p.surfaceProp || h.surfaceProp,
                massCenter: { x: solid.massCenter[0], y: solid.massCenter[1], z: solid.massCenter[2] },
              };
            }
          } catch {
            physics = null;
          }
        }
        out = {
          path: key,
          mins: h.hullMin,
          maxs: h.hullMax,
          surfaceProp: h.surfaceProp,
          sequences,
          attachments,
          physics,
          keyValues: h.keyValues,
        };
      } catch {
        out = null;
      }
    }
    models.set(key, out);
    return out;
  };

  const material = (name: string): SpMaterialInfo => {
    const key = name.toLowerCase().replace(/\\/g, '/');
    const hit = materials.get(key);
    if (hit) return hit;
    let out: SpMaterialInfo = NO_MATERIAL;
    const text = readText(materialPath(key));
    if (key.startsWith('tools/')) {
      out = { surfaceProp: '', noportal: true, nodraw: true, sky: key.includes('toolsskybox') };
      if (text) {
        const v = parseVmt(text, readText);
        out = { ...out, surfaceProp: vmtParam(v, '$surfaceprop') ?? '' };
      }
    } else if (text) {
      const v = parseVmt(text, readText);
      const sky = vmtFlag(v, '%compilesky') || vmtFlag(v, '%compile2dsky');
      const nodraw = vmtFlag(v, '%compilenodraw');
      out = {
        surfaceProp: vmtParam(v, '$surfaceprop') ?? '',
        noportal: vmtFlag(v, '%noportal') || sky || nodraw,
        nodraw,
        sky,
      };
    }
    materials.set(key, out);
    return out;
  };

  return {
    game,
    surfaceProps,
    model,
    material,
    scene(path: string): VcdScene | null {
      if (scenes === undefined) {
        const b = gfs.read('scenes/scenes.image');
        try {
          scenes = b ? new SceneImage(b) : null;
        } catch {
          scenes = null;
        }
      }
      return scenes ? scenes.scene(path) : null;
    },
    caption(token: string): string | null {
      if (captions === undefined) {
        const b = gfs.read('resource/closecaption_english.txt');
        try {
          captions = b ? parseCaptionFile(b) : null;
        } catch {
          captions = null;
        }
      }
      return captions ? captions.get(token) : null;
    },
  };
}

/** Minimal assets for synthetic worlds (tests without a game install). */
export function createEmptyAssets(game: SpGame): SpAssets {
  const sp = new SurfacePropsTable();
  return {
    game,
    surfaceProps: sp,
    model: () => null,
    material: () => NO_MATERIAL,
    scene: () => null,
    caption: () => null,
  };
}
