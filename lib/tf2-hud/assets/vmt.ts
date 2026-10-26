/**
 * Valve Material (VMT) reading — just the parameters that decide how a HUD
 * texture is drawn: which VTF it uses, tint, opacity, blend mode and frame.
 *
 * A VMT is KeyValues: the root key is the shader (`UnlitGeneric`, `VertexLitGeneric`, `Sprite`…), its
 * children are `$parameters`. A `patch` material has no shader of its own; it includes another
 * VMT and then inserts/replaces parameters, so reading one means following the include.
 */

import { parseKv } from '../kv/parse';
import type { KvNode } from '../kv/types';

export interface VmtDoc {
  shader: string;
  /** Lower-cased parameter name → raw value. */
  params: Map<string, string>;
  /** `patch` only: the material this one builds on (extension-less, rooted at `materials/`). */
  include?: string;
}

export interface MaterialInfo {
  shader: string;
  /** Extension-less VTF path relative to `materials/` (forward slashes). */
  baseTexture?: string;
  /** `$color` as a 0–255 multiplier per channel; absent = white. */
  color?: [number, number, number];
  /** `$alpha`, 0–1. */
  alpha: number;
  additive: boolean;
  /** Texture alpha is used (`$translucent`, or `$alphatest`). Otherwise the texture is drawn opaque. */
  usesAlpha: boolean;
  alphatest: boolean;
  alphaRef: number;
  frame: number;
}

function childText(n: KvNode): string | undefined {
  const v = n.value;
  return v === undefined ? undefined : v.text;
}

function collect(block: KvNode, into: Map<string, string>): void {
  for (const c of block.children ?? []) {
    const v = childText(c);
    if (v !== undefined) into.set(c.key.text.toLowerCase(), v);
  }
}

export function parseVmt(text: string): VmtDoc | null {
  const doc = parseKv(text);
  const root = doc.roots.find((n) => n.children);
  if (!root?.children) return null;
  const shader = root.key.text.toLowerCase();
  const params = new Map<string, string>();
  collect(root, params);
  if (shader !== 'patch') return { shader, params };

  const include = params.get('include');
  const merged = new Map<string, string>();
  // `insert` adds parameters, `replace` overrides existing ones; for preview both just set them.
  for (const c of root.children) {
    const k = c.key.text.toLowerCase();
    if (c.children && (k === 'insert' || k === 'replace')) collect(c, merged);
  }
  return { shader, params: merged, include: include ? normaliseMaterialPath(include) : undefined };
}

/** `Materials\\hud/foo.vmt` → `hud/foo`: lower-case, forward slashes, no `materials/` root or extension. */
export function normaliseMaterialPath(raw: string): string {
  return raw
    .trim()
    .replace(/\\/g, '/')
    .replace(/\/{2,}/g, '/')
    .replace(/^\/+/, '')
    .replace(/^materials\//i, '')
    .replace(/\.(vmt|vtf)$/i, '');
}

const truthy = (v: string | undefined) => v !== undefined && /^(1|true|yes)$/i.test(v.trim());

/** `[r g b]` is 0–1 floats, `{r g b}` is 0–255 ints; a bare triple is read as floats unless any is > 1. */
export function parseColorParam(raw: string | undefined): [number, number, number] | undefined {
  if (!raw) return undefined;
  const nums = (raw.match(/-?\d*\.?\d+/g) ?? []).map(Number);
  if (nums.length < 3 || nums.some((n) => !Number.isFinite(n))) return undefined;
  const [r, g, b] = nums;
  const bytes = raw.includes('{') || Math.max(r, g, b) > 1;
  const f = (n: number) => Math.max(0, Math.min(255, Math.round(bytes ? n : n * 255)));
  return [f(r), f(g), f(b)];
}

export function materialInfo(doc: VmtDoc, params: Map<string, string> = doc.params): MaterialInfo {
  const tex = params.get('$basetexture');
  const alphatest = truthy(params.get('$alphatest'));
  const alpha = Number(params.get('$alpha'));
  const ref = Number(params.get('$alphatestreference'));
  const frame = Number(params.get('$frame'));
  return {
    shader: doc.shader,
    baseTexture: tex ? normaliseMaterialPath(tex) : undefined,
    color: parseColorParam(params.get('$color')),
    alpha: Number.isFinite(alpha) && params.has('$alpha') ? Math.max(0, Math.min(1, alpha)) : 1,
    additive: truthy(params.get('$additive')),
    usesAlpha: truthy(params.get('$translucent')) || alphatest,
    alphatest,
    alphaRef: Number.isFinite(ref) && params.has('$alphatestreference') ? ref : 0.7,
    frame: Number.isFinite(frame) && frame > 0 ? Math.floor(frame) : 0,
  };
}
