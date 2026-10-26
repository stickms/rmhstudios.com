/**
 * "Where does this value come from?" — resolution helpers behind the inspector's
 * previews. A property rarely holds a final value: `fgcolor "TanDark"` names a
 * scheme colour that may itself name another, `font "HudFontMediumBold"` names a
 * face that depends on the resolution, `xpos "r120"` means something different
 * at every height. These turn each into something a person can read.
 */

import { kvAt, kvChild, kvChildren } from '../kv/query';
import { parseKv } from '../kv/parse';
import { parseDim, scaled } from '../layout/geometry';
import { parseRgba, type FontDef, type Rgba, type Scheme } from './scheme';

const lower = (s: string) => s.toLowerCase();

/* ───────────────────────────── colours ───────────────────────────── */

export interface ColorResolution {
  /** Each hop: the literal text, then every name it was resolved through. */
  chain: string[];
  rgba?: Rgba;
  /** `literal`: typed as numbers · `scheme`: a Colors entry · `base`: a BaseSettings entry */
  kind: 'literal' | 'scheme' | 'base' | 'unknown';
}

export function resolveColorChain(scheme: Scheme, value: string | undefined): ColorResolution {
  const chain: string[] = [];
  let cur = value?.trim();
  if (!cur) return { chain, kind: 'unknown' };
  let kind: ColorResolution['kind'] = 'literal';
  for (let depth = 0; depth < 8; depth++) {
    chain.push(cur);
    const literal = parseRgba(cur);
    if (literal) return { chain, rgba: literal, kind: chain.length === 1 ? 'literal' : kind };
    const key = lower(cur);
    const fromScheme = scheme.colors.get(key);
    const fromBase = fromScheme === undefined ? scheme.base.get(key) : undefined;
    const next = fromScheme ?? fromBase;
    if (next === undefined || next === cur) return { chain, kind: 'unknown' };
    if (kind === 'literal') kind = fromScheme !== undefined ? 'scheme' : 'base';
    cur = next;
  }
  return { chain, kind: 'unknown' };
}

export interface SchemeColor {
  name: string;
  raw: string;
  rgba?: Rgba;
  /** The raw text is another colour's name. */
  alias: boolean;
}

export function listSchemeColors(
  scheme: Scheme,
  source: 'colors' | 'base' = 'colors',
): SchemeColor[] {
  const map = source === 'colors' ? scheme.colors : scheme.base;
  const out: SchemeColor[] = [];
  for (const [key, raw] of map) {
    const r = resolveColorChain(scheme, raw);
    out.push({
      name: source === 'colors' ? (scheme.colorNames.get(key) ?? key) : key,
      raw,
      rgba: r.rgba,
      alias: !parseRgba(raw),
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** Original-case name of a scheme colour (the map is keyed lower-case). */
export function schemeColorName(schemeText: string, key: string): string {
  const doc = parseKv(schemeText);
  const root = doc.roots.find((n) => lower(n.key.text) === 'scheme');
  const colors = root && kvChild(root, 'Colors');
  const hit = colors && kvChildren(colors).find((c) => lower(c.key.text) === lower(key));
  return hit?.key.text ?? key;
}

/* ───────────────────────────── fonts ───────────────────────────── */

export interface FontPreview {
  /** Scheme name as written. */
  name: string;
  /** Faces in order, each marked as the one used at this height. */
  faces: { def: FontDef; active: boolean; proportional: boolean; px: number }[];
}

export function describeFont(
  scheme: Scheme,
  name: string,
  screenH: number,
): FontPreview | undefined {
  const defs = scheme.fonts.get(lower(name));
  if (!defs) return undefined;
  let activeSet = false;
  const faces = defs.map((def) => {
    const proportional = !def.yres;
    const inWindow = def.yres ? screenH >= def.yres[0] && screenH <= def.yres[1] : true;
    const active = !activeSet && inWindow;
    if (active) activeSet = true;
    return {
      def,
      active,
      proportional,
      px: proportional ? Math.max(1, def.tall * (screenH / 480)) : def.tall,
    };
  });
  return { name: scheme.fontNames.get(lower(name)) ?? name, faces };
}

/** Does the browser have a face with this family name (system or registered)? */
export function fontInstalled(family: string): boolean {
  if (typeof document === 'undefined') return true;
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return true;
  const sample = 'mmmmmmmmmmlli wWÆ0123';
  const widthWith = (stack: string) => {
    ctx.font = `72px ${stack}`;
    return ctx.measureText(sample).width;
  };
  const q = `"${family.replace(/"/g, '')}"`;
  return (
    widthWith(`${q}, monospace`) !== widthWith('monospace') ||
    widthWith(`${q}, serif`) !== widthWith('serif')
  );
}

/* ───────────────────────────── positions ───────────────────────────── */

export interface DimExplanation {
  /** One readable sentence, e.g. `120 units from the bottom edge → 270 px`. */
  text: string;
  /** Resolved distance in pixels at the given scale (null for pins). */
  px: number | null;
}

/**
 * Explain a position/size value in plain words at the current resolution.
 * `axis` says which edge names to use; `parentPx` is the parent's extent on that axis.
 */
export function explainDim(
  key: 'xpos' | 'ypos' | 'wide' | 'tall',
  raw: string | undefined,
  scale: number,
  parentPx: number,
  pinned?: { sibling: string },
): DimExplanation {
  const horizontal = key === 'xpos' || key === 'wide';
  const dim = parseDim(raw);
  const px = scaled(dim.value, scale);
  const lo = horizontal ? 'left' : 'top';
  const hi = horizontal ? 'right' : 'bottom';
  const isSize = key === 'wide' || key === 'tall';
  const units = `${dim.value} unit${dim.value === 1 ? '' : 's'}`;

  if (isSize) {
    if (dim.fill)
      return {
        text: `parent ${horizontal ? 'width' : 'height'} − ${units} → ${Math.max(0, parentPx - px)} px`,
        px: Math.max(0, parentPx - px),
      };
    return { text: `${units} → ${px} px`, px };
  }
  if (pinned) return { text: `${units} offset from “${pinned.sibling}” (pinned)`, px: null };
  if (dim.align === 'end')
    return {
      text: `${units} from the ${hi} edge → ${parentPx - px} px from the ${lo}`,
      px: parentPx - px,
    };
  if (dim.align === 'center')
    return {
      text: `${units} from the centre → ${Math.trunc(parentPx / 2) + px} px from the ${lo}`,
      px: Math.trunc(parentPx / 2) + px,
    };
  return { text: `${units} from the ${lo} edge → ${px} px`, px };
}

/* ───────────────────────────── scheme editing ───────────────────────────── */

/** Names of the borders/colours/fonts a property may reference, for pickers. */
export function schemeRoot(schemeText: string) {
  const doc = parseKv(schemeText);
  const root = doc.roots.find((n) => lower(n.key.text) === 'scheme');
  return { doc, root };
}

export function schemeSectionPath(schemeText: string, section: string): string[] | undefined {
  const { doc, root } = schemeRoot(schemeText);
  if (!root) return undefined;
  const node = kvAt(doc, [root.key.text, section]);
  return node ? [root.key.text, node.key.text] : undefined;
}
