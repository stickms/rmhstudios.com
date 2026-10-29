/**
 * VMT (Valve material) parsing: a KeyValues block whose key is the shader name
 * and whose pairs are `$params` (and `%compile` flags), with an optional
 * `Proxies` block. `Patch` materials include another VMT and apply `insert` /
 * `replace` blocks on top (SDK: materialsystem's CMaterial patch handling,
 * mirrored by public/materialpatch.cpp `LoadPatchedMaterial`).
 */

import { parseKeyValues, type KvNode } from './keyvalues';
import { normalizeGamePath } from './vpk';

export interface VmtProxy {
  /** Proxy name, lowercased (e.g. "animatedtexture"). */
  name: string;
  params: Record<string, string>;
}

export interface Vmt {
  /** Shader name, lowercased (e.g. "lightmappedgeneric", "vertexlitgeneric"). */
  shader: string;
  /** Parameters by lowercased name ("$basetexture", "%compilenodraw"); values as written. */
  params: Record<string, string>;
  proxies: VmtProxy[];
  /** Other nested blocks (shader fallbacks like ">=dx90", "dx80"), by lowercased key. */
  blocks: Record<string, Record<string, string>>;
  /** Materials included through `patch`, outermost first (normalized paths). */
  includes: string[];
}

/** Returns VMT text for a material path (e.g. "materials/foo/bar.vmt"), or null. */
export type VmtResolver = (path: string) => string | null;

/** Turns a material name into its VMT path ("Foo\\Bar" → "materials/foo/bar.vmt"). */
export function materialPath(name: string): string {
  let p = normalizeGamePath(name);
  if (!p.startsWith('materials/')) p = 'materials/' + p;
  if (!p.endsWith('.vmt')) p += '.vmt';
  return p;
}

/** Turns a texture param value into its VTF path ("foo/bar" → "materials/foo/bar.vtf"). */
export function texturePath(name: string): string {
  let p = normalizeGamePath(name);
  if (!p.startsWith('materials/')) p = 'materials/' + p;
  if (!p.endsWith('.vtf')) p += '.vtf';
  return p;
}

function collect(
  node: KvNode,
  into: Record<string, string>,
  blocks: Record<string, Record<string, string>> | null,
): void {
  for (const c of node.children) {
    const k = c.key.toLowerCase();
    if (c.isBlock) {
      if (k === 'proxies' || !blocks) continue;
      const b: Record<string, string> = (blocks[k] ??= {});
      collect(c, b, null);
    } else {
      into[k] = c.value ?? '';
    }
  }
}

function collectProxies(node: KvNode): VmtProxy[] {
  const out: VmtProxy[] = [];
  const proxies = node.get('proxies');
  if (!proxies) return out;
  for (const p of proxies.children) {
    if (!p.isBlock) continue;
    const params: Record<string, string> = {};
    for (const c of p.children) if (!c.isBlock) params[c.key.toLowerCase()] = c.value ?? '';
    out.push({ name: p.key.toLowerCase(), params });
  }
  return out;
}

/**
 * Parses VMT text. `resolve` loads included materials for `patch` shaders;
 * without it (or when the include is missing) the patch's own params are
 * returned with shader "patch".
 */
export function parseVmt(text: string, resolve?: VmtResolver, depth = 0): Vmt {
  const { root } = parseKeyValues(text);
  const top = root.children.find((c) => c.isBlock);
  if (!top) return { shader: '', params: {}, proxies: [], blocks: {}, includes: [] };
  const shader = top.key.toLowerCase();

  if (shader === 'patch') {
    const include = top.getString('include');
    const base = include && resolve && depth < 8 ? resolve(materialPath(include)) : null;
    if (base !== null && include) {
      const parent = parseVmt(base, resolve, depth + 1);
      const params = { ...parent.params };
      const blocks = { ...parent.blocks };
      // SDK: ApplyPatchKeyValues — "insert" adds keys, "replace" overwrites only existing ones.
      const insert = top.get('insert');
      if (insert) collect(insert, params, blocks);
      const replace = top.get('replace');
      if (replace) {
        const repl: Record<string, string> = {};
        collect(replace, repl, null);
        for (const [k, v] of Object.entries(repl)) if (k in params) params[k] = v;
      }
      const proxies = [
        ...parent.proxies,
        ...(insert ? collectProxies(insert) : []),
        ...(replace ? collectProxies(replace) : []),
      ];
      return {
        shader: parent.shader,
        params,
        proxies,
        blocks,
        includes: [normalizeGamePath(materialPath(include)), ...parent.includes],
      };
    }
  }

  const params: Record<string, string> = {};
  const blocks: Record<string, Record<string, string>> = {};
  collect(top, params, blocks);
  return { shader, params, proxies: collectProxies(top), blocks, includes: [] };
}

// --- helpers ----------------------------------------------------------------

const truthy = (v: string | undefined): boolean => {
  if (v === undefined) return false;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n !== 0 : v.trim() !== '';
};

/** Integer/boolean param ($translucent "1"). */
export const vmtFlag = (m: Vmt, name: string): boolean => truthy(m.params[name.toLowerCase()]);

/** String param, or undefined. */
export const vmtParam = (m: Vmt, name: string): string | undefined => m.params[name.toLowerCase()];

/** Numeric param (first number of the value), or the fallback. */
export function vmtNumber(m: Vmt, name: string, fallback = 0): number {
  const v = m.params[name.toLowerCase()];
  if (v === undefined) return fallback;
  const n = parseFloat(v.replace(/^[[{"\s]+/, ''));
  return Number.isFinite(n) ? n : fallback;
}

/** A colour/vector param: "[1 0.5 0]" or "{255 128 0}" (braces are 0–255). */
export function vmtVector(m: Vmt, name: string): number[] | undefined {
  const v = m.params[name.toLowerCase()];
  if (v === undefined) return undefined;
  const t = v.trim();
  const brace = t.startsWith('{');
  const nums = t
    .replace(/[[\]{}]/g, ' ')
    .trim()
    .split(/\s+/)
    .map(Number)
    .filter((n) => Number.isFinite(n));
  return brace ? nums.map((n) => n / 255) : nums;
}

export interface VmtSummary {
  shader: string;
  baseTexture?: string;
  baseTexture2?: string;
  bumpMap?: string;
  envMap?: string;
  detail?: string;
  translucent: boolean;
  alphaTest: boolean;
  alphaTestReference: number;
  additive: boolean;
  noCull: boolean;
  selfIllum: boolean;
  vertexColor: boolean;
  vertexAlpha: boolean;
  /** %compile* flags that make a brush face invisible / non-rendered. */
  compileNoDraw: boolean;
  compileSky: boolean;
  compileClip: boolean;
  compilePlayerClip: boolean;
  compileWater: boolean;
  compileTrigger: boolean;
  compileNonSolid: boolean;
  compileLadder: boolean;
  compileGrate: boolean;
  /** $surfaceprop (lowercased), e.g. "metal". */
  surfaceProp?: string;
}

/** The common rendering/collision flags of a material in one object. */
export function summarizeVmt(m: Vmt): VmtSummary {
  const p = (k: string) => m.params[k];
  return {
    shader: m.shader,
    baseTexture: p('$basetexture'),
    baseTexture2: p('$basetexture2'),
    bumpMap: p('$bumpmap') ?? p('$normalmap'),
    envMap: p('$envmap'),
    detail: p('$detail'),
    translucent: vmtFlag(m, '$translucent'),
    alphaTest: vmtFlag(m, '$alphatest'),
    alphaTestReference: vmtNumber(m, '$alphatestreference', 0.5),
    additive: vmtFlag(m, '$additive'),
    noCull: vmtFlag(m, '$nocull'),
    selfIllum: vmtFlag(m, '$selfillum'),
    vertexColor: vmtFlag(m, '$vertexcolor'),
    vertexAlpha: vmtFlag(m, '$vertexalpha'),
    compileNoDraw: vmtFlag(m, '%compilenodraw'),
    compileSky: vmtFlag(m, '%compilesky') || vmtFlag(m, '%compile2dsky'),
    compileClip: vmtFlag(m, '%compileclip'),
    compilePlayerClip: vmtFlag(m, '%compileplayerclip'),
    compileWater: vmtFlag(m, '%compilewater'),
    compileTrigger: vmtFlag(m, '%compiletrigger'),
    compileNonSolid: vmtFlag(m, '%compilenonsolid'),
    compileLadder: vmtFlag(m, '%compileladder'),
    compileGrate: vmtFlag(m, '%compilegrate'),
    surfaceProp: p('$surfaceprop')?.toLowerCase(),
  };
}
