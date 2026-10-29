/**
 * The browser games' map channel: Source BSP → map package (lib/tf2-game/assets/map-manifest.ts).
 *
 *   pnpm exec tsx scripts/tf2-game/build-maps.ts --root <install> --game tf2|hl2|portal --out <dir>
 *       [--maps a,b | --maps-file <file>] [--state state.json] [--prev-index maps/index.json]
 *       [--props-list-out <file>] [--sizes] [--force] [--nav]
 *   pnpm exec tsx scripts/tf2-game/build-maps.ts --root <install> --game … --props-only --props-list-out <file>
 *       Only appends the maps' prop models to the list (the model channel runs this every time).
 *
 * Without --maps / --maps-file it builds the game's published list (lib/tf2-game/assets/game-maps.ts:
 * TF2's hub allowlist, the HL2 demo's six maps, Portal: First Slice's seven).
 *
 * Output (`--out D`, pushed by `scripts/tf2-assets/publish.ts push --dir D --prefix <game>-game/
 * --state-key <game>-game/maps/_state.json --index maps/index.json`):
 *
 *     D/maps/<sha>.bsp         the BSP, every lump decompressed; pakfile, cubemaps and the unused
 *                              lighting lumps (LDR when the map has HDR) emptied; offsets rewritten
 *     D/maps/<sha>.hulls.bin   prop collision hulls (first .phy solid, model space, Source units)
 *     D/maps/<sha>.json        the manifest: materials, textures, sky, props
 *     D/maps/index.json        { v, maps: { <map>: { manifest, title, mode, bytes } } } — published last
 *     D/tex/<sha>.webp         base textures, named exactly like scripts/tf2-game/models.py's (so a
 *                              texture a model also uses is one object)
 *     D/wanted.json            { <path>: { src, bytes? } } — everything the maps want
 *     D/failed.json, D/untextured.json
 *
 * Every map file is named by the SHA-256 of its content; textures by models.py's source hash
 * (VTF bytes + encoding). With --state (the channel's published state) a file the state already
 * holds is neither written nor (for textures) decoded: an unchanged map writes nothing, but is
 * still listed in wanted.json. --props-list-out appends every prop model path (one per line) for
 * models.py. --nav is reserved for navigation meshes (not generated yet: `nav` stays null).
 */
import { createHash } from 'node:crypto';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { brotliCompressSync, constants as zc } from 'node:zlib';
import sharp from 'sharp';
import {
  BSP_IDENT,
  HEADER_LUMPS,
  LUMP,
  lumpBytes,
  openPakfile,
  parseBsp,
  type BspFile,
} from '../../lib/tf2-game/formats/bsp';
import {
  parseVmt,
  materialPath,
  texturePath,
  vmtFlag,
  vmtNumber,
  vmtVector,
  type Vmt,
} from '../../lib/tf2-game/formats/vmt';
import {
  GameFileSystem,
  normalizeGamePath,
  parseVpkDir,
  type SearchPath,
} from '../../lib/tf2-game/formats/vpk';
import {
  decodeVtf,
  IMAGE_FORMAT,
  parseVtfHeader,
  TEXTUREFLAGS,
  type VtfHeader,
} from '../../lib/tf2-game/formats/vtf';
import { loadPropCollisionModel } from '../../lib/tf2-game/world/prop-collision';
import { findGameMap, GAME_MAPS } from '../../lib/tf2-game/assets/game-maps';
import {
  MAP_PACKAGE_VERSION,
  writeHullsBin,
  type HullTable,
  type MapIndex,
  type MapManifest,
  type MapMaterial,
  type MapSky,
  type MapTexture,
} from '../../lib/tf2-game/assets/map-manifest';
import { GAME_IDS, type GameId } from '../../lib/tf2-game/assets/versions';

// Map files are named by their content, so a builder change renames exactly what it changes;
// bump the channel's `builder` (lib/tf2-game/assets/versions.ts) to make the workflow rerun it.
/** scripts/tf2-game/models.py TEX_VERSION — texture names must match the model channel's. */
export const TEX_VERSION = 1;
/** Largest texture side (the top mip ≤ this; models.py's cap for player/weapon textures). */
export const TEX_CAP = 1024;
const WEBP_QUALITY = 80;

// --- search paths -------------------------------------------------------------------------------

/** gameinfo.txt's SearchPaths, without the sound packs: VPKs first, then loose directories. */
export const GAME_SEARCH: Record<GameId, { vpks: string[]; loose: string[]; maps: string }> = {
  tf2: {
    vpks: ['tf/tf2_textures', 'tf/tf2_misc', 'hl2/hl2_textures', 'hl2/hl2_misc'],
    loose: ['tf', 'hl2'],
    maps: 'tf/maps',
  },
  hl2: {
    vpks: ['hl2/hl2_pak', 'hl2/hl2_textures', 'hl2/hl2_misc'],
    loose: ['hl2'],
    maps: 'hl2/maps',
  },
  portal: {
    vpks: ['portal/portal_pak', 'hl2/hl2_textures', 'hl2/hl2_misc'],
    loose: ['portal', 'hl2'],
    maps: 'portal/maps',
  },
};

/** A VPK whose archives are read with pread on demand; an archive the install lacks throws (the next path is tried). */
function vpkSearchPath(root: string, stem: string): SearchPath | null {
  const dir = path.join(root, `${stem}_dir.vpk`);
  if (!existsSync(dir)) return null;
  const index = parseVpkDir(new Uint8Array(readFileSync(dir)));
  const fds = new Map<number, number | null>();
  return {
    kind: 'vpk',
    name: stem,
    index,
    readArchive: (archive, offset, length) => {
      let fd = fds.get(archive);
      if (fd === undefined) {
        const file = path.join(root, `${stem}_${String(archive).padStart(3, '0')}.vpk`);
        fd = existsSync(file) ? openSync(file, 'r') : null;
        fds.set(archive, fd);
      }
      if (fd === null) throw new Error(`${stem}: archive ${archive} is not installed`);
      const out = new Uint8Array(length);
      readSync(fd, out, 0, length, offset);
      return out;
    },
  };
}

function looseSearchPath(dir: string): SearchPath {
  const file = (p: string) => path.join(dir, p);
  return {
    kind: 'loose',
    name: dir,
    read: (p) => {
      const f = file(p);
      try {
        const st = statSync(f);
        return st.isFile() && st.size > 0 ? new Uint8Array(readFileSync(f)) : null;
      } catch {
        return null;
      }
    },
    exists: (p) => existsSync(file(p)),
  };
}

export function openGameFileSystem(root: string, game: GameId): GameFileSystem {
  const gfs = new GameFileSystem();
  const s = GAME_SEARCH[game];
  for (const v of s.vpks) {
    const sp = vpkSearchPath(root, v);
    if (sp) gfs.add(sp);
  }
  for (const d of s.loose) gfs.add(looseSearchPath(path.join(root, d)));
  return gfs;
}

// --- hashing ------------------------------------------------------------------------------------

const sha256 = (data: Uint8Array | string): string =>
  createHash('sha256').update(data).digest('hex');

/**
 * models.py `TexStore.name`: sha1 over `tex|TEX_VERSION|kind|cap|alpha|sha1(vtf)|` (each part
 * followed by "|", the VTF digest raw).
 */
export function texName(vtf: Uint8Array, alpha: boolean, cap = TEX_CAP, kind = 'base'): string {
  const h = createHash('sha1');
  for (const part of ['tex', String(TEX_VERSION), kind, String(cap), alpha ? '1' : '0']) {
    h.update(part);
    h.update('|');
  }
  h.update(createHash('sha1').update(vtf).digest());
  h.update('|');
  return h.digest('hex');
}

// --- BSP stripping --------------------------------------------------------------------------------

/** The lighting lumps the package drops: whichever of LDR / HDR the map does not use. */
export function unusedLightingLumps(bsp: BspFile): { lighting: 'hdr' | 'ldr'; drop: number[] } {
  const L = bsp.lumps;
  const hdr = L[LUMP.LIGHTING_HDR].length > 0;
  const drop: number[] = hdr ? [LUMP.LIGHTING] : [LUMP.LIGHTING_HDR];
  if (L[LUMP.LEAF_AMBIENT_LIGHTING_HDR].length > 0 && L[LUMP.LEAF_AMBIENT_INDEX_HDR].length > 0)
    drop.push(LUMP.LEAF_AMBIENT_INDEX, LUMP.LEAF_AMBIENT_LIGHTING);
  else drop.push(LUMP.LEAF_AMBIENT_INDEX_HDR, LUMP.LEAF_AMBIENT_LIGHTING_HDR);
  return { lighting: hdr ? 'hdr' : 'ldr', drop };
}

/**
 * Rewrites a BSP with every lump decompressed (game lumps too, with their absolute offsets
 * rewritten), the pakfile, cubemaps and unused lighting emptied, lumps 4-byte aligned.
 */
export function stripBsp(
  bytes: Uint8Array,
  bsp: BspFile,
): { data: Uint8Array; lighting: 'hdr' | 'ldr' } {
  const { lighting, drop } = unusedLightingLumps(bsp);
  const empty = new Set<number>([LUMP.PAKFILE, LUMP.CUBEMAPS, LUMP.XZIPPAKFILE, ...drop]);
  const align = (n: number) => (n + 3) & ~3;
  const headerSize = 8 + HEADER_LUMPS * 16 + 4;

  const parts: Array<Uint8Array | null> = [];
  for (let i = 0; i < HEADER_LUMPS; i++) {
    if (empty.has(i) || i === LUMP.GAME_LUMP) parts.push(null);
    else parts.push(lumpBytes(bytes, bsp.lumps[i]));
  }
  // Lay out: header, then lumps in index order; the game lump's size is known up front.
  const gameHeader = 4 + bsp.gameLumps.length * 16;
  const gameSize = gameHeader + bsp.gameLumps.reduce((s, g) => s + g.data.length, 0);
  const offsets: number[] = [];
  const lengths: number[] = [];
  let at = headerSize;
  for (let i = 0; i < HEADER_LUMPS; i++) {
    at = align(at);
    const len =
      i === LUMP.GAME_LUMP ? (bsp.gameLumps.length ? gameSize : 0) : (parts[i]?.length ?? 0);
    offsets.push(len ? at : 0);
    lengths.push(len);
    at += len;
  }
  const out = new Uint8Array(at);
  const view = new DataView(out.buffer);
  view.setUint32(0, BSP_IDENT, true);
  view.setInt32(4, bsp.version, true);
  for (let i = 0; i < HEADER_LUMPS; i++) {
    const o = 8 + i * 16;
    view.setInt32(o, offsets[i], true);
    view.setInt32(o + 4, lengths[i], true);
    view.setInt32(o + 8, bsp.lumps[i].version, true);
    view.setInt32(o + 12, 0, true); // fourCC: not compressed
    const p = parts[i];
    if (p && p.length) out.set(p, offsets[i]);
  }
  view.setInt32(8 + HEADER_LUMPS * 16, bsp.mapRevision, true);
  if (bsp.gameLumps.length) {
    const base = offsets[LUMP.GAME_LUMP];
    view.setInt32(base, bsp.gameLumps.length, true);
    let dataAt = base + gameHeader;
    bsp.gameLumps.forEach((g, k) => {
      const o = base + 4 + k * 16;
      const id = g.id;
      view.setUint32(
        o,
        ((id.charCodeAt(0) << 24) |
          (id.charCodeAt(1) << 16) |
          (id.charCodeAt(2) << 8) |
          id.charCodeAt(3)) >>>
          0,
        true,
      );
      view.setUint16(o + 4, g.flags & ~1, true); // GAMELUMPFLAG_COMPRESSED cleared
      view.setUint16(o + 6, g.version, true);
      view.setInt32(o + 8, dataAt, true);
      view.setInt32(o + 12, g.data.length, true);
      out.set(g.data, dataAt);
      dataAt += g.data.length;
    });
  }
  return { data: out, lighting };
}

// --- materials ----------------------------------------------------------------------------------

/** Material name → manifest key: lowercase, forward slashes, no `materials/` or `.vmt`. */
export const materialKey = (name: string): string =>
  normalizeGamePath(name)
    .replace(/^materials\//, '')
    .replace(/\.vmt$/, '');

const textureId = (vtfPath: string, alpha: boolean): string =>
  vtfPath.replace(/^materials\//, '').replace(/\.vtf$/, '') + (alpha ? '@alpha' : '');

// Shader fallback blocks (">=dx90", ">dx80", "dx9", "<dx90"…) as a DX9-level PC applies them.
const DX_LEVEL = 95;
function appliesOnDx9(block: string): boolean {
  const m = /^(>=|>|<=|<)?dx(\d+)(?:_20b)?$/.exec(block.replace(/\s+/g, ''));
  if (!m) return false;
  const level = m[2].length === 1 ? Number(m[2]) * 10 : Number(m[2]);
  switch (m[1]) {
    case '>=':
      return DX_LEVEL >= level;
    case '>':
      return DX_LEVEL > level;
    case '<=':
      return DX_LEVEL <= level;
    case '<':
      return DX_LEVEL < level;
    default:
      return level === 90 || level === 95;
  }
}

function effectiveParams(vmt: Vmt): Record<string, string> {
  const params = { ...vmt.params };
  for (const [k, b] of Object.entries(vmt.blocks)) if (appliesOnDx9(k)) Object.assign(params, b);
  return params;
}

/** Any `tools/*` material is a compile tool and never drawn, except these. */
const SKY_TOOLS = /^tools\/toolsskybox/;
const BLACK_TOOLS = /^tools\/toolsblack/;
const NODRAW_COMPILE = [
  '%compilenodraw',
  '%compileclip',
  '%compileplayerclip',
  '%compilenpcclip',
  '%compiletrigger',
  '%compilehint',
  '%compileskip',
  '%compileareaportal',
  '%compileoccluder',
  '%compileinvisible',
  '%compilefog',
];

/** Shaders that draw without a base texture (refraction, water, eyes, sprites cards). */
const NO_BASE_SHADERS = new Set(['water', 'refract', 'eyerefract', 'spritecard', 'eyes']);

const IGNORED_TEXTURE = /^(?:_rt_|env_cubemap$|engine\/|\[)/i;

const ALPHA_FORMATS = new Set<number>([
  IMAGE_FORMAT.RGBA8888,
  IMAGE_FORMAT.ABGR8888,
  IMAGE_FORMAT.ARGB8888,
  IMAGE_FORMAT.BGRA8888,
  IMAGE_FORMAT.DXT1_ONEBITALPHA,
  IMAGE_FORMAT.DXT3,
  IMAGE_FORMAT.DXT5,
  IMAGE_FORMAT.BGRA4444,
  IMAGE_FORMAT.BGRA5551,
  IMAGE_FORMAT.IA88,
  IMAGE_FORMAT.A8,
  IMAGE_FORMAT.RGBA16161616F,
  IMAGE_FORMAT.RGBA16161616,
  IMAGE_FORMAT.RGBA32323232F,
]);

const formatHasAlpha = (h: VtfHeader): boolean =>
  ALPHA_FORMATS.has(h.imageFormat) ||
  (h.imageFormat === IMAGE_FORMAT.DXT1 && (h.flags & TEXTUREFLAGS.ONEBITALPHA) !== 0);

interface PlannedTexture {
  id: string;
  rel: string;
  key: string;
  vtfPath: string;
  vtf: Uint8Array;
  mip: number;
  w: number;
  h: number;
  /** The WebP keeps alpha unless every pixel is opaque. */
  keepAlpha: boolean;
  header: VtfHeader;
}

/**
 * The cap a texture's name is hashed with. A texture no larger than 512 px encodes the same at
 * models.py's prop cap (512) as at ours (1024), so it takes the 512 name — the one a prop using
 * the same VTF gets — and the map and model channels store it once.
 */
export const nameCap = (h: Pick<VtfHeader, 'width' | 'height'>): number =>
  Math.max(h.width, h.height) <= 512 ? 512 : TEX_CAP;

type TexResult = { tex: PlannedTexture } | { missing: string };

/** Which mip to store and at what size: the largest mip within the cap, resized only when no mip fits. */
export function textureSize(
  h: Pick<VtfHeader, 'width' | 'height' | 'numMipLevels'>,
  cap = TEX_CAP,
) {
  let mip = 0;
  const dim = (m: number) => [Math.max(1, h.width >> m), Math.max(1, h.height >> m)] as const;
  while (mip < h.numMipLevels - 1 && Math.max(...dim(mip)) > cap) mip++;
  let [w, hh] = dim(mip);
  if (Math.max(w, hh) > cap) {
    const s = cap / Math.max(w, hh);
    w = Math.max(1, Math.round(w * s));
    hh = Math.max(1, Math.round(hh * s));
  }
  return { mip, w, h: hh };
}

function planTexture(fs: GameFileSystem, name: string, wantAlpha: boolean): TexResult {
  if (IGNORED_TEXTURE.test(name.trim())) return { missing: `${name} is a render target` };
  const vtfPath = texturePath(name.trim());
  const vtf = fs.read(vtfPath);
  if (!vtf) return { missing: `${vtfPath} is not in the game files` };
  let header: VtfHeader;
  try {
    header = parseVtfHeader(vtf);
  } catch (e) {
    return { missing: `${vtfPath}: ${(e as Error).message}` };
  }
  const keepAlpha = wantAlpha && formatHasAlpha(header);
  const { mip, w, h } = textureSize(header);
  const key = texName(vtf, keepAlpha, nameCap(header));
  return {
    tex: {
      id: textureId(vtfPath, keepAlpha),
      rel: `tex/${key}.webp`,
      key,
      vtfPath,
      vtf,
      mip,
      w,
      h,
      keepAlpha,
      header,
    },
  };
}

const gamma = (c: number): number =>
  Math.round(Math.pow(Math.min(1, Math.max(0, c)), 1 / 2.2) * 1e4) / 1e4;

interface ResolvedMaterial {
  material: MapMaterial;
  textures: PlannedTexture[];
  untextured: string[];
}

/** Builds one material's manifest entry and plans its textures. */
export function resolveMaterial(
  fs: GameFileSystem,
  key: string,
  reflectivity: readonly [number, number, number] | null,
): ResolvedMaterial {
  const textures: PlannedTexture[] = [];
  const untextured: string[] = [];
  const color = (rgb: readonly number[] | null | undefined): [number, number, number] =>
    rgb ? [gamma(rgb[0]), gamma(rgb[1]), gamma(rgb[2])] : [0.5, 0.5, 0.5];

  const text = fs.readText(materialPath(key));
  if (BLACK_TOOLS.test(key)) {
    return {
      material: { shader: 'unlitgeneric', color: [0, 0, 0], unlit: true },
      textures,
      untextured,
    };
  }
  if (!text) {
    const m: MapMaterial = { shader: 'missing', color: color(reflectivity) };
    if (SKY_TOOLS.test(key)) m.sky = true;
    else if (key.startsWith('tools/')) m.nodraw = true;
    else untextured.push('no .vmt in the game files');
    return { material: m, textures, untextured };
  }
  const vmt = parseVmt(text, (p) => fs.readText(p));
  const shader = vmt.shader.replace(/_(?:hdr_)?dx\d+$/, '');
  const params = effectiveParams(vmt);
  const v: Vmt = { ...vmt, params };
  const m: MapMaterial = { shader, color: color(reflectivity) };

  if (SKY_TOOLS.test(key) || vmtFlag(v, '%compilesky') || vmtFlag(v, '%compile2dsky')) m.sky = true;
  else if (key.startsWith('tools/') || NODRAW_COMPILE.some((f) => vmtFlag(v, f))) m.nodraw = true;
  if (m.sky || m.nodraw) return { material: m, textures, untextured };

  const translucent = vmtFlag(v, '$translucent');
  const alphatest = vmtFlag(v, '$alphatest');
  const selfillum = vmtFlag(v, '$selfillum');
  if (translucent) m.translucent = true;
  if (alphatest) m.alphatest = vmtNumber(v, '$alphatestreference', 0.5);
  if (vmtFlag(v, '$additive')) m.additive = true;
  if (vmtFlag(v, '$nocull')) m.nocull = true;
  if (selfillum) m.selfillum = true;
  if (shader === 'unlitgeneric' || shader === 'unlittwotexture') m.unlit = true;
  if (vmtFlag(v, '$vertexalpha')) m.vertexAlpha = true;
  if (vmtFlag(v, '$decal')) m.decal = true;
  const alpha = vmtNumber(v, '$alpha', 1);
  if (alpha < 1) m.alpha = alpha;
  if (shader === 'refract') {
    // Glass: no base texture; drawn as a translucent pane in the refraction tint.
    const tint = vmtVector(v, '$refracttint');
    m.translucent = true;
    if (tint && tint.length >= 3)
      m.color = [tint[0], tint[1], tint[2]].map((c) => Math.round(c * 1e4) / 1e4) as [
        number,
        number,
        number,
      ];
  }
  if (shader === 'water') {
    const fog = vmtVector(v, '$fogcolor');
    m.water = {
      fogColor: fog && fog.length >= 3 ? [fog[0], fog[1], fog[2]] : [0, 0, 0],
      fogStart: vmtNumber(v, '$fogstart', 0),
      fogEnd: vmtNumber(v, '$fogend', 0),
    };
  }

  // The base texture's alpha matters for blending, cutouts and the self-illumination mask.
  const wantAlpha = translucent || alphatest || (selfillum && !params['$selfillummask']);
  const planParam = (param: string, keep: boolean): PlannedTexture | null => {
    const name = params[param];
    if (!name) return null;
    const r = planTexture(fs, name, keep);
    if ('missing' in r) {
      untextured.push(`${param}: ${r.missing}`);
      return null;
    }
    textures.push(r.tex);
    return r.tex;
  };
  const base = planParam('$basetexture', wantAlpha);
  if (base) {
    m.base = base.id;
    if (!reflectivity) m.color = color(base.header.reflectivity);
  } else if (!params['$basetexture'] && !NO_BASE_SHADERS.has(shader)) {
    untextured.push('no $basetexture');
  }
  const base2 =
    shader === 'unlittwotexture'
      ? planParam('$texture2', false)
      : planParam('$basetexture2', false);
  if (base2) m.base2 = base2.id;
  const blend = planParam('$blendmodulatetexture', false);
  if (blend) m.blendModulate = blend.id;

  for (const p of vmt.proxies) {
    if (p.name === 'texturescroll') {
      const target = (p.params.texturescrollvar ?? '').toLowerCase();
      if (target && target !== '$basetexturetransform') continue;
      const rate = parseFloat(p.params.texturescrollrate ?? '1');
      const angle = (parseFloat(p.params.texturescrollangle ?? '0') * Math.PI) / 180;
      if (!Number.isFinite(rate) || !Number.isFinite(angle)) continue;
      // SDK: CTextureScrollMaterialProxy::OnBind — offset = curtime * rate * (cos, sin)(angle).
      const r4 = (x: number) => Math.round(x * 1e4) / 1e4 + 0;
      m.scroll = [r4(Math.cos(angle) * rate), r4(Math.sin(angle) * rate)];
    } else if (p.name === 'animatedtexture' && base && base.header.numFrames > 1) {
      m.frames = base.header.numFrames;
    }
  }
  if (
    !m.frames &&
    base &&
    base.header.numFrames > 1 &&
    vmt.proxies.some((p) => p.name === 'animatedtexture')
  )
    m.frames = base.header.numFrames;
  return { material: m, textures, untextured };
}

// --- per-map collection -------------------------------------------------------------------------

/** Every material the map can draw: texdata (faces, displacements, overlays, brush entities, water) and entity references. */
export function collectMaterials(bsp: BspFile): Map<string, [number, number, number] | null> {
  const out = new Map<string, [number, number, number] | null>();
  for (const td of bsp.texData) {
    if (!td.name) continue;
    const k = materialKey(td.name);
    if (!out.has(k) || out.get(k) === null)
      out.set(k, [td.reflectivity.x, td.reflectivity.y, td.reflectivity.z]);
  }
  for (const e of bsp.entities) {
    const cls = e.classname.toLowerCase();
    for (const [k, v] of e.props) {
      const key = k.toLowerCase();
      const val = v.trim();
      if (!val) continue;
      const isVmt = /\.vmt$/i.test(val);
      const isRope = key === 'ropematerial' && (cls === 'move_rope' || cls === 'keyframe_rope');
      const isDecal = key === 'texture' && cls === 'infodecal';
      if (isVmt || isRope || isDecal) {
        const mk = materialKey(val);
        if (!out.has(mk)) out.set(mk, null);
      }
    }
  }
  return out;
}

const PROP_ENTITY = /^(?:prop_|item_)|^physics_cannister$/;
export const SOLID_VPHYSICS = 6;

/** Static prop models and prop/item entity models → the largest solid type any instance asks for. */
export function collectProps(bsp: BspFile): Map<string, number> {
  const props = new Map<string, number>();
  const add = (model: string, solid: number) => {
    const p = normalizeGamePath(model);
    if (!p.endsWith('.mdl')) return;
    props.set(p, Math.max(props.get(p) ?? -1, solid));
  };
  if (bsp.staticProps) for (const p of bsp.staticProps.props) add(p.model, p.solid);
  for (const e of bsp.entities) {
    if (!PROP_ENTITY.test(e.classname.toLowerCase())) continue;
    const model = e.get('model');
    if (model) add(model, e.getNumber('solid', SOLID_VPHYSICS));
  }
  return new Map([...props.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

const SKY_FACES = ['rt', 'lf', 'bk', 'ft', 'up', 'dn'] as const;

function resolveSky(
  fs: GameFileSystem,
  bsp: BspFile,
  texOut: PlannedTexture[],
): { sky: MapSky | null; missing: string[] } {
  const world = bsp.entities.find((e) => e.classname === 'worldspawn');
  const name = world?.get('skyname')?.trim();
  const missing: string[] = [];
  if (!name) return { sky: null, missing };
  const base = name.toLowerCase().replace(/_hdr$/, '');
  const faces: MapSky['faces'] = {};
  for (const f of SKY_FACES) {
    let found = false;
    for (const cand of [`skybox/${base}${f}`, `skybox/${base}_hdr${f}`]) {
      const text = fs.readText(materialPath(cand));
      if (!text) continue;
      const vmt = parseVmt(text, (p) => fs.readText(p));
      const tex =
        vmt.params['$basetexture'] ??
        vmt.params['$hdrcompressedtexture'] ??
        vmt.params['$hdrbasetexture'];
      if (!tex) continue;
      const r = planTexture(fs, tex, false);
      if ('missing' in r) {
        missing.push(`sky ${f}: ${r.missing}`);
        continue;
      }
      faces[f] = r.tex.id;
      texOut.push(r.tex);
      found = true;
      break;
    }
    if (!found && !missing.some((m) => m.startsWith(`sky ${f}:`)))
      missing.push(`sky ${f}: no material`);
  }
  const sky: MapSky = { name, faces };
  const cam = bsp.entities.find((e) => e.classname === 'sky_camera');
  if (cam) {
    const o = cam.origin;
    sky.camera = { origin: [o.x, o.y, o.z], scale: cam.getNumber('scale', 16) };
  }
  return { sky, missing };
}

// --- texture encoding ---------------------------------------------------------------------------

export async function encodeTexture(t: PlannedTexture): Promise<Buffer> {
  const img = decodeVtf(t.vtf, { mip: t.mip, frame: 0 });
  const rgba = img.rgba;
  let opaque = true;
  if (t.keepAlpha) {
    for (let i = 3; i < rgba.length; i += 4)
      if (rgba[i] !== 255) {
        opaque = false;
        break;
      }
  }
  let s = sharp(Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength), {
    raw: { width: img.width, height: img.height, channels: 4 },
  });
  if (img.width !== t.w || img.height !== t.h)
    s = s.resize(t.w, t.h, { fit: 'fill', kernel: 'lanczos3' });
  if (!t.keepAlpha || opaque) s = s.removeAlpha();
  return s.webp({ quality: WEBP_QUALITY, effort: 4 }).toBuffer();
}

// --- the build ----------------------------------------------------------------------------------

/** The map's BSP from the game's maps directory (or any search path). */
export function readMapBsp(
  root: string,
  game: GameId,
  fs: GameFileSystem,
  name: string,
): Uint8Array {
  const file = path.join(root, GAME_SEARCH[game].maps, `${name}.bsp`);
  const raw =
    existsSync(file) && statSync(file).size > 0
      ? new Uint8Array(readFileSync(file))
      : fs.read(`maps/${name}.bsp`);
  if (!raw || raw.length === 0) throw new Error(`maps/${name}.bsp is not in the install`);
  return raw;
}

/** The map's prop models that models.py can convert: it reads the install, not the map's pakfile. */
export function installedPropModels(fs: GameFileSystem, bsp: BspFile): string[] {
  return [...collectProps(bsp).keys()].filter((m) => fs.exists(m));
}

/**
 * Appends every map's installed prop models to `listFile` (models.py's list), without building
 * anything — so the model channel includes map props even on a run that does not rebuild maps.
 */
export function listMapProps(root: string, game: GameId, maps: string[], listFile: string): number {
  const fs = openGameFileSystem(root, game);
  const all = new Set<string>();
  for (const name of maps) {
    try {
      for (const m of installedPropModels(fs, parseBsp(readMapBsp(root, game, fs, name))))
        all.add(m);
    } catch (e) {
      process.stderr.write(`props: skipping ${name}: ${(e as Error).message}\n`);
    }
  }
  if (all.size) appendFileSync(listFile, [...all].sort().join('\n') + '\n');
  return all.size;
}

// --- the build (packages) --------------------------------------------------------------------

interface PublishedFile {
  src: string;
  size?: number;
}

export interface BuildOptions {
  root: string;
  game: GameId;
  maps: string[];
  out: string;
  /** The channel's published state (`publish.ts state`): `{ models: { <path>: { src, size } } }`. */
  state?: Record<string, PublishedFile>;
  prevIndex?: MapIndex | null;
  propsListOut?: string;
  force?: boolean;
  /** Also compute each BSP's Brotli size (what storage holds). */
  sizes?: boolean;
  log?: (line: string) => void;
}

export interface MapReport {
  map: string;
  manifest: string;
  bspBytes: number;
  bspBrotli?: number;
  hullsBytes: number;
  manifestBytes: number;
  materials: number;
  textured: number;
  untextured: number;
  textures: number;
  /** Bytes of this map's textures (encoded now, or as stored). */
  textureBytes: number;
  props: number;
  hulls: number;
  /** Files this map wrote (the rest the state already holds). */
  written: number;
  ms: number;
}

export interface BuildResult {
  reports: MapReport[];
  failed: Array<{ map: string; why: string }>;
  wanted: Record<string, { src: string; bytes?: number }>;
  index: MapIndex;
}

const sortKeys = <T>(o: Record<string, T>): Record<string, T> =>
  Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));

export async function buildMaps(o: BuildOptions): Promise<BuildResult> {
  const log = o.log ?? ((l: string) => process.stdout.write(l + '\n'));
  const state = o.state ?? {};
  const fs = openGameFileSystem(o.root, o.game);
  mkdirSync(path.join(o.out, 'maps'), { recursive: true });
  mkdirSync(path.join(o.out, 'tex'), { recursive: true });

  const wanted: BuildResult['wanted'] = {};
  const reports: MapReport[] = [];
  const failed: BuildResult['failed'] = [];
  const untexturedAll: Array<{ map: string; material: string; why: string }> = [];
  const index: MapIndex = { v: 1, maps: {} };
  const texBytes = new Map<string, number>(); // rel → bytes (encoded this run, or stored)
  const propsOut = new Set<string>();

  const unchanged = (rel: string, src: string) => !o.force && state[rel]?.src === src;
  const writeFile = (rel: string, src: string, data: Uint8Array): boolean => {
    if (unchanged(rel, src)) {
      wanted[rel] = { src };
      return false;
    }
    writeFileSync(path.join(o.out, rel), data);
    wanted[rel] = { src, bytes: data.length };
    return true;
  };

  for (const name of o.maps) {
    const t0 = Date.now();
    try {
      const raw = readMapBsp(o.root, o.game, fs, name);
      const bsp = parseBsp(raw);
      for (const model of installedPropModels(fs, bsp)) propsOut.add(model);

      // The map's own pakfile is searched first (cubemap-patched materials, custom textures/props).
      const pak = openPakfile(bsp);
      const pakPath: SearchPath = {
        kind: 'loose',
        name: 'pakfile',
        read: (p) => (pak.has(p) ? pak.read(p) : null),
        exists: (p) => pak.has(p),
      };
      fs.addFront(pakPath);
      let manifest: MapManifest;
      let planned: PlannedTexture[] = [];
      let untextured = 0;
      let textured = 0;
      let hullsBin: Uint8Array | null = null;
      let hullCount = 0;
      try {
        // Materials.
        const materials: Record<string, MapMaterial> = {};
        for (const [key, refl] of collectMaterials(bsp)) {
          const r = resolveMaterial(fs, key, refl);
          materials[key] = r.material;
          planned.push(...r.textures);
          if (r.material.base) textured++;
          const drawn = !r.material.nodraw && !r.material.sky && r.material.shader !== 'water';
          if (drawn && !r.material.base && r.untextured.length > 0) {
            untextured++;
            for (const why of r.untextured) untexturedAll.push({ map: name, material: key, why });
          }
        }
        const skyRes = resolveSky(fs, bsp, planned);
        for (const why of skyRes.missing)
          untexturedAll.push({ map: name, material: 'skybox', why });

        // Props and their collision hulls.
        const propSolids = collectProps(bsp);
        const props: MapManifest['props'] = {};
        const table: HullTable = [];
        for (const [model, solid] of propSolids) {
          const entry: MapManifest['props'][string] = { solid };
          const cm = loadPropCollisionModel(fs, model);
          if (cm && cm.hulls.length) {
            entry.hull = table.length;
            table.push(cm.hulls);
          }
          props[model] = entry;
        }
        hullCount = table.length;
        if (table.length) hullsBin = writeHullsBin(table);

        // Textures (deduplicated by name within the map).
        const textures: Record<string, MapTexture> = {};
        const uniq = new Map<string, PlannedTexture>();
        for (const t of planned) {
          textures[t.id] = { file: t.rel, w: t.w, h: t.h, alpha: t.keepAlpha };
          if (!uniq.has(t.rel)) uniq.set(t.rel, t);
        }
        planned = [...uniq.values()];

        const { data: bspData, lighting } = stripBsp(raw, bsp);
        const bspSha = sha256(bspData);
        const hullsSha = hullsBin ? sha256(hullsBin) : null;
        manifest = {
          v: MAP_PACKAGE_VERSION,
          game: o.game,
          map: name,
          bsp: `maps/${bspSha}.bsp`,
          bspBytes: bspData.length,
          lighting,
          materials: sortKeys(materials),
          textures: sortKeys(textures),
          sky: skyRes.sky,
          props,
          hulls: hullsSha ? `maps/${hullsSha}.hulls.bin` : null,
          nav: null,
        };

        // Write what the state does not hold yet.
        let written = 0;
        if (writeFile(manifest.bsp, bspSha, bspData)) written++;
        if (hullsBin && hullsSha && writeFile(`maps/${hullsSha}.hulls.bin`, hullsSha, hullsBin))
          written++;
        const todo = planned.filter((t) => {
          if (texBytes.has(t.rel)) {
            wanted[t.rel] ??= { src: t.key };
            return false;
          }
          if (unchanged(t.rel, t.key)) {
            wanted[t.rel] = { src: t.key };
            texBytes.set(t.rel, state[t.rel]?.size ?? 0);
            return false;
          }
          return true;
        });
        let next = 0;
        const worker = async () => {
          for (let t = todo[next++]; t; t = todo[next++]) {
            try {
              const webp = await encodeTexture(t);
              writeFileSync(path.join(o.out, t.rel), webp);
              wanted[t.rel] = { src: t.key, bytes: webp.length };
              texBytes.set(t.rel, webp.length);
              written++;
            } catch (e) {
              texBytes.set(t.rel, 0);
              untexturedAll.push({
                map: name,
                material: t.vtfPath,
                why: `decode: ${(e as Error).message}`,
              });
              // Drop the texture from the manifest so nothing points at a file that does not exist.
              for (const [id, tex] of Object.entries(manifest.textures))
                if (tex.file === t.rel) delete manifest.textures[id];
            }
          }
        };
        await Promise.all(Array.from({ length: 4 }, worker));
        // Materials whose texture failed to encode lose the reference.
        for (const m of Object.values(manifest.materials)) {
          if (m.base && !manifest.textures[m.base]) delete m.base;
          if (m.base2 && !manifest.textures[m.base2]) delete m.base2;
          if (m.blendModulate && !manifest.textures[m.blendModulate]) delete m.blendModulate;
        }
        if (manifest.sky)
          for (const f of SKY_FACES)
            if (manifest.sky.faces[f] && !manifest.textures[manifest.sky.faces[f]!])
              delete manifest.sky.faces[f];

        const json = JSON.stringify(manifest);
        const manifestSha = sha256(json);
        const manifestRel = `maps/${manifestSha}.json`;
        if (writeFile(manifestRel, manifestSha, Buffer.from(json))) written++;
        const textureBytes = Object.values(manifest.textures)
          .map((t) => t.file)
          .filter((f, i, a) => a.indexOf(f) === i)
          .reduce((s, f) => s + (texBytes.get(f) ?? 0), 0);
        const entry = findGameMap(o.game, name);
        index.maps[name] = {
          manifest: manifestRel,
          title: entry?.title ?? name,
          mode: entry?.mode ?? (o.game === 'tf2' ? (name.split('_')[0] ?? 'tf2') : 'sp'),
          bytes: bspData.length + (hullsBin?.length ?? 0) + json.length + textureBytes,
        };
        const report: MapReport = {
          map: name,
          manifest: manifestRel,
          bspBytes: bspData.length,
          hullsBytes: hullsBin?.length ?? 0,
          manifestBytes: json.length,
          materials: Object.keys(manifest.materials).length,
          textured,
          untextured,
          textures: Object.keys(manifest.textures).length,
          textureBytes,
          props: Object.keys(props).length,
          hulls: hullCount,
          written,
          ms: Date.now() - t0,
        };
        if (o.sizes)
          report.bspBrotli = brotliCompressSync(bspData, {
            params: { [zc.BROTLI_PARAM_QUALITY]: 9, [zc.BROTLI_PARAM_SIZE_HINT]: bspData.length },
          }).length;
        reports.push(report);
        const mib = (b: number) => (b / 1048576).toFixed(1);
        log(
          `${name}: bsp ${mib(report.bspBytes)} MiB${report.bspBrotli !== undefined ? ` (brotli ${mib(report.bspBrotli)})` : ''}, ` +
            `textures ${report.textures} (${mib(textureBytes)} MiB), materials ${report.materials} ` +
            `(textured ${textured}, untextured ${untextured}), props ${report.props} (hulls ${hullCount}, ` +
            `${mib(report.hullsBytes)} MiB), wrote ${written} files, ${(report.ms / 1000).toFixed(1)} s`,
        );
      } finally {
        fs.remove(pakPath);
      }
    } catch (e) {
      const why = `${(e as Error).name}: ${(e as Error).message}`;
      failed.push({ map: name, why });
      log(`fail ${name}: ${why}`);
      const old = o.prevIndex?.maps[name];
      if (old) index.maps[name] = old; // keep serving the last good package
    }
  }

  // Keep published maps this run did not build (a --maps subset), as long as the game still lists them.
  for (const [name, entry] of Object.entries(o.prevIndex?.maps ?? {}))
    if (!index.maps[name] && findGameMap(o.game, name)) index.maps[name] = entry;
  index.maps = sortKeys(index.maps);
  const indexJson = JSON.stringify(index);
  const indexRel = 'maps/index.json';
  writeFileSync(path.join(o.out, indexRel), indexJson);
  wanted[indexRel] = { src: sha256(indexJson), bytes: indexJson.length };

  const failedList: string[] = [];
  for (const f of failed) {
    failedList.push(f.map);
    const old = o.prevIndex?.maps[f.map];
    if (old) failedList.push(old.manifest);
  }
  writeFileSync(path.join(o.out, 'wanted.json'), JSON.stringify(sortKeys(wanted), null, 0));
  writeFileSync(path.join(o.out, 'failed.json'), JSON.stringify(failedList));
  writeFileSync(path.join(o.out, 'untextured.json'), JSON.stringify(untexturedAll, null, 1));
  if (o.propsListOut && propsOut.size)
    appendFileSync(o.propsListOut, [...propsOut].sort().join('\n') + '\n');
  return { reports, failed, wanted, index };
}

// --- CLI ----------------------------------------------------------------------------------------

function readJson<T>(file: string | undefined): T | null {
  if (!file || !existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as T;
  } catch {
    process.stderr.write(`ignoring unreadable ${file}\n`);
    return null;
  }
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const flags = new Map<string, string>();
  const bare = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      flags.set(a.slice(2), next);
      i++;
    } else bare.add(a.slice(2));
  }
  const root = flags.get('root');
  const out = flags.get('out');
  const game = (flags.get('game') ?? 'tf2') as GameId;
  const propsOnly = bare.has('props-only');
  if (!root || !GAME_IDS.includes(game) || (propsOnly ? !flags.get('props-list-out') : !out)) {
    process.stderr.write(
      'usage: build-maps.ts --root <install> --game tf2|hl2|portal --out <dir> [--maps a,b | --maps-file f] ' +
        '[--state state.json] [--prev-index index.json] [--props-list-out file] [--sizes] [--force] [--nav]\n' +
        '       build-maps.ts --root <install> --game … --props-only --props-list-out <file> [--maps …]\n',
    );
    return 2;
  }
  let maps: string[];
  if (flags.has('maps')) maps = flags.get('maps')!.split(',');
  else if (flags.has('maps-file'))
    maps = readFileSync(flags.get('maps-file')!, 'utf8')
      .split(/\r?\n/)
      .map((l) => l.replace(/#.*/, ''));
  else maps = GAME_MAPS[game].map((m) => m.name);
  maps = [...new Set(maps.map((m) => m.trim().replace(/\.bsp$/i, '')).filter(Boolean))];
  if (propsOnly) {
    const n = listMapProps(root, game, maps, flags.get('props-list-out')!);
    process.stdout.write(`props (${game}): ${n} models from ${maps.length} maps\n`);
    return 0;
  }
  if (bare.has('nav'))
    process.stdout.write('--nav: navigation meshes are not generated yet; nav stays null\n');

  const stateRaw = readJson<{ models?: Record<string, PublishedFile> }>(flags.get('state'));
  const prev = readJson<MapIndex>(flags.get('prev-index'));
  const result = await buildMaps({
    root,
    game,
    maps,
    out: out!,
    state: stateRaw?.models ?? {},
    prevIndex: prev && prev.v === 1 && prev.maps ? prev : null,
    propsListOut: flags.get('props-list-out'),
    force: bare.has('force') || process.env.FORCE === '1',
    sizes: bare.has('sizes'),
  });
  const made = Object.values(result.wanted).filter((w) => w.bytes !== undefined);
  const total = made.reduce((s, w) => s + (w.bytes ?? 0), 0);
  const pkg = Object.values(result.index.maps).reduce((s, m) => s + m.bytes, 0);
  process.stdout.write(
    `maps (${game}): ${result.reports.length} ok, ${result.failed.length} failed; files wanted ${Object.keys(result.wanted).length}, ` +
      `written ${made.length} (${(total / 1048576).toFixed(1)} MiB); packages ${(pkg / 1048576).toFixed(1)} MiB raw\n`,
  );
  // Every map failing is an error; some failing is reported (failed.json) like the model channel.
  return result.reports.length === 0 && result.failed.length > 0 ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().then(
    (code) => process.exit(code),
    (e) => {
      process.stderr.write(`${(e as Error).stack ?? e}\n`);
      process.exit(1);
    },
  );
}
