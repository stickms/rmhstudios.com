/**
 * `SpAssets` (lib/sp-game/assets.ts) for the browser, from what the asset
 * channels publish instead of a game install:
 *
 *   - **models**: `mdl/index.json` → each GLB's `scene.extras` (read from the
 *     GLB's JSON chunk, no geometry decoded): hull bounds, sequences with their
 *     activity, rate, frame count, looping and events, attachments, mass,
 *     surface property and `$keyvalues`; an anim pack's sequences for models
 *     with `$includemodel`s. Collision hulls come from the map's
 *     `hulls.bin` (the map package's prop table). Every model the map's
 *     entities name is read before the world is built (the simulation asks
 *     synchronously); the browser's HTTP cache serves the same GLBs to the
 *     renderer afterwards.
 *   - **materials**: the map manifest (nodraw, sky). The manifest carries no
 *     `$surfaceprop` or `%noportal` yet, so surfaces use the default property
 *     and Portal refuses portals on metal, glass, grates and tool textures by
 *     name — TODO(map-pipeline): publish `surfaceprop` / `noportal` per material.
 *   - **scenes / captions**: `snd/scenes.json` (speak events) and
 *     `snd/captions.json`.
 *
 * Browser and workers (fetch only).
 */

import type { Vec3 } from '../core/vec';
import type { BspFile } from '../formats/bsp';
import type { HullTable, MapManifest } from '../assets/map-manifest';
import { gameAssetUrl } from '../assets/urls';
import { createEmptyAssets, normalizeModelPath, type SpAssets, type SpMaterialInfo, type SpModelInfo } from '@/lib/sp-game/assets';
import { VCD_EVENT_NAMES, type VcdEvent, type VcdScene } from '@/lib/sp-game/formats/scene-image';
import type { MdlSequence } from '@/lib/sp-game/formats/mdl-sequences';

interface IndexEntry {
  glb?: string;
  anims?: string;
}

interface GlbSequenceExtras {
  name: string;
  activity?: string;
  flags?: number;
  looping?: boolean;
  fps?: number;
  frames?: number;
  events?: Array<{ cycle?: number; frame?: number; event?: number; name?: string; options?: string }>;
}

interface GlbSceneExtras {
  source?: { hullMin?: number[]; hullMax?: number[] };
  surfaceprop?: string;
  mass?: number;
  keyvalues?: string;
  attachments?: Array<{ name: string }>;
  sequences?: GlbSequenceExtras[];
  includes?: string[];
}

const SPEAK = VCD_EVENT_NAMES.indexOf('speak');

/** The JSON chunk of a GLB (header 12 bytes, then chunk length, type 'JSON', data). */
export function glbJson(bytes: Uint8Array): Record<string, unknown> | null {
  if (bytes.length < 20) return null;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (dv.getUint32(0, true) !== 0x46546c67) return null; // 'glTF'
  const len = dv.getUint32(12, true);
  const type = dv.getUint32(16, true);
  if (type !== 0x4e4f534a || 20 + len > bytes.length) return null; // 'JSON'
  try {
    return JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + len))) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function sceneExtras(json: Record<string, unknown> | null): GlbSceneExtras | null {
  if (!json) return null;
  const scenes = json.scenes as Array<{ extras?: GlbSceneExtras }> | undefined;
  const idx = typeof json.scene === 'number' ? json.scene : 0;
  return scenes?.[idx]?.extras ?? null;
}

const v3 = (a: number[] | undefined, d: number): Vec3 => ({ x: a?.[0] ?? d, y: a?.[1] ?? d, z: a?.[2] ?? d });

/** GLB sequence extras → the simulation's MdlSequence. */
export function toMdlSequence(s: GlbSequenceExtras): MdlSequence {
  const fps = s.fps && s.fps > 0 ? s.fps : 30;
  const frames = s.frames && s.frames > 0 ? s.frames : 1;
  const duration = Math.max(0.015, (frames - 1) / fps);
  return {
    name: s.name,
    activity: s.activity ?? '',
    flags: s.flags ?? (s.looping ? 1 : 0),
    looping: !!s.looping,
    fps,
    frames,
    duration,
    events: (s.events ?? []).map((e) => ({
      cycle: typeof e.cycle === 'number' ? e.cycle : frames > 1 && typeof e.frame === 'number' ? e.frame / (frames - 1) : 0,
      event: e.event ?? 0,
      name: e.name ?? '',
      options: e.options ?? '',
    })),
    groundSpeed: 0,
  };
}

/** Bounds of a hull set (model space). */
function hullBounds(hulls: Float32Array[]): { mins: Vec3; maxs: Vec3 } | null {
  const mins = { x: Infinity, y: Infinity, z: Infinity };
  const maxs = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const c of hulls) {
    for (let i = 0; i + 2 < c.length; i += 3) {
      mins.x = Math.min(mins.x, c[i]);
      mins.y = Math.min(mins.y, c[i + 1]);
      mins.z = Math.min(mins.z, c[i + 2]);
      maxs.x = Math.max(maxs.x, c[i]);
      maxs.y = Math.max(maxs.y, c[i + 1]);
      maxs.z = Math.max(maxs.z, c[i + 2]);
    }
  }
  return Number.isFinite(mins.x) ? { mins, maxs } : null;
}

/** Portal: surfaces portals cannot be placed on (the manifest has no %noportal yet). */
const NOPORTAL_RE = /metal|glass|grate|grating|tools\/|black_|elevator|fizzler|observation/;

/** Every `.mdl` the map's entities name (prop_*, npc_*, cycler…), normalized. */
export function entityModels(bsp: BspFile): string[] {
  const out = new Set<string>();
  for (const e of bsp.entities) {
    const m = e.get('model');
    if (m && /\.mdl$/i.test(m)) out.add(normalizeModelPath(m));
  }
  return [...out];
}

export interface HttpSpAssetsOptions {
  game: 'hl2' | 'portal';
  manifest: MapManifest;
  bsp: BspFile;
  hulls: HullTable | null;
  /** Progress over the models read (done, total). */
  onModel?: (done: number, total: number) => void;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

/** Reads what the map needs and returns a synchronous SpAssets over it. */
export async function createHttpSpAssets(o: HttpSpAssetsOptions): Promise<SpAssets> {
  const fetcher = o.fetchImpl ?? fetch;
  const url = (p: string) => gameAssetUrl(p, o.game);
  const getJson = async <T>(p: string): Promise<T | null> => {
    try {
      const r = await fetcher(url(p), { signal: o.signal });
      return r.ok ? ((await r.json()) as T) : null;
    } catch {
      return null;
    }
  };
  const [index, scenesDoc, captionsDoc] = await Promise.all([
    getJson<Record<string, IndexEntry>>('mdl/index.json'),
    getJson<{ scenes: Record<string, { duration: number; speak: Array<{ actor: string; sound: string; start: number; end: number; cc?: string; ccType?: number }> }> }>('snd/scenes.json'),
    getJson<{ captions: Record<string, { text: string }> }>('snd/captions.json'),
  ]);

  const extrasCache = new Map<string, Promise<GlbSceneExtras | null>>();
  const readExtras = (file: string): Promise<GlbSceneExtras | null> => {
    let p = extrasCache.get(file);
    if (!p) {
      p = fetcher(url(file.startsWith('mdl/') ? file : `mdl/${file}`), { signal: o.signal })
        .then(async (r) => (r.ok ? sceneExtras(glbJson(new Uint8Array(await r.arrayBuffer()))) : null))
        .catch(() => null);
      extrasCache.set(file, p);
    }
    return p;
  };

  // Hulls by model from the map's prop table.
  const hullsByModel = new Map<string, Float32Array[]>();
  for (const [model, prop] of Object.entries(o.manifest.props)) {
    if (prop.hull !== undefined && o.hulls?.[prop.hull]?.length) hullsByModel.set(normalizeModelPath(model), o.hulls[prop.hull]);
  }

  const models = new Map<string, SpModelInfo>();
  const wanted = entityModels(o.bsp);
  let done = 0;
  o.onModel?.(0, wanted.length);
  await Promise.all(
    wanted.map(async (path) => {
      const entry = index?.[path];
      const ex = entry?.glb ? await readExtras(entry.glb) : null;
      const pack = entry?.anims ? await readExtras(entry.anims) : null;
      const hulls = hullsByModel.get(path) ?? [];
      const hb = hullBounds(hulls);
      const seqs = [...(ex?.sequences ?? []), ...(pack?.sequences ?? [])].map(toMdlSequence);
      const mins = ex?.source?.hullMin ? v3(ex.source.hullMin, 0) : (hb?.mins ?? { x: -8, y: -8, z: 0 });
      const maxs = ex?.source?.hullMax ? v3(ex.source.hullMax, 0) : (hb?.maxs ?? { x: 8, y: 8, z: 16 });
      const surfaceProp = ex?.surfaceprop ?? '';
      models.set(path, {
        path,
        mins,
        maxs,
        surfaceProp,
        sequences: seqs,
        attachments: (ex?.attachments ?? []).map((a) => a.name),
        physics: hulls.length
          ? {
              hulls,
              mass: ex?.mass && ex.mass > 0 ? ex.mass : 20,
              damping: 0,
              rotDamping: 0,
              inertia: 1,
              surfaceProp,
              massCenter: hb ? { x: (hb.mins.x + hb.maxs.x) / 2, y: (hb.mins.y + hb.maxs.y) / 2, z: (hb.mins.z + hb.maxs.z) / 2 } : { x: 0, y: 0, z: 0 },
            }
          : null,
        keyValues: ex?.keyvalues ?? '',
      });
      o.onModel?.(++done, wanted.length);
    }),
  );
  // Static props and anything else with only a hull.
  for (const [path, hulls] of hullsByModel) {
    if (models.has(path)) continue;
    const hb = hullBounds(hulls);
    if (!hb) continue;
    models.set(path, {
      path,
      mins: hb.mins,
      maxs: hb.maxs,
      surfaceProp: '',
      sequences: [],
      attachments: [],
      physics: { hulls, mass: 20, damping: 0, rotDamping: 0, inertia: 1, surfaceProp: '', massCenter: { x: 0, y: 0, z: 0 } },
      keyValues: '',
    });
  }

  const materials = new Map<string, SpMaterialInfo>();
  const material = (name: string): SpMaterialInfo => {
    const key = name.toLowerCase().replace(/\\/g, '/').replace(/^materials\//, '').replace(/\.vmt$/, '');
    let m = materials.get(key);
    if (!m) {
      const mm = o.manifest.materials[key];
      m = {
        surfaceProp: '',
        noportal: o.game === 'portal' && (NOPORTAL_RE.test(key) || !!mm?.nodraw),
        nodraw: !!mm?.nodraw,
        sky: !!mm?.sky,
      };
      materials.set(key, m);
    }
    return m;
  };

  const scenes = new Map<string, VcdScene | null>();
  const scene = (path: string): VcdScene | null => {
    const key = path.toLowerCase().replace(/\\/g, '/');
    if (scenes.has(key)) return scenes.get(key)!;
    const s = scenesDoc?.scenes[key];
    const out: VcdScene | null = s
      ? {
          duration: s.duration,
          actors: [...new Set(s.speak.map((e) => e.actor))],
          events: s.speak.map(
            (e): VcdEvent => ({
              type: SPEAK,
              name: e.sound,
              start: e.start,
              end: e.end,
              param1: e.sound,
              param2: '',
              param3: '',
              actor: e.actor,
              channel: 'audio',
              ccToken: e.cc ?? '',
              ccType: e.ccType ?? 0,
              loopCount: 0,
              active: true,
              resumeCondition: false,
            }),
          ),
        }
      : null;
    scenes.set(key, out);
    return out;
  };

  const empty = createEmptyAssets(o.game);
  return {
    game: o.game,
    surfaceProps: empty.surfaceProps,
    model: (path) => models.get(normalizeModelPath(path)) ?? null,
    material,
    scene,
    caption: (token) => captionsDoc?.captions[token.toLowerCase()]?.text ?? captionsDoc?.captions[token]?.text ?? null,
  };
}
