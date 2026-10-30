/**
 * `clientscheme.res` → colours, fonts, borders and custom font files.
 *
 * Panels never carry literal colours or font faces; they name scheme entries
 * (`fgcolor "TanDark"`, `font "HudClassHealth"`, `border "ButtonBorder"`). This
 * module is the lookup behind those names.
 */

import { parseKv } from '../kv/parse';
import { kvChild, kvChildren } from '../kv/query';
import { evalCond, type CondEnv } from './cond';
import type { KvNode } from '../kv/types';

export interface Rgba {
  r: number;
  g: number;
  b: number;
  /** 0–255 */
  a: number;
}

export interface FontDef {
  name: string;
  tall: number;
  weight: number;
  italic: boolean;
  underline: boolean;
  outline: boolean;
  dropshadow: boolean;
  antialias: boolean;
  additive: boolean;
  /** Inclusive screen-height window this face is for; absent = proportional. */
  yres?: [number, number];
}

export interface BorderLayer {
  color: string;
  offset: [number, number];
}

export interface BorderDef {
  inset: [number, number, number, number];
  left: BorderLayer[];
  right: BorderLayer[];
  top: BorderLayer[];
  bottom: BorderLayer[];
  /**
   * `"bordertype" "scalable_image"` (vgui ScalableImageBorder): a nine-slice texture under `vgui/`, its
   * corners `src_corner_*` texels in the image and `draw_corner_*` units (proportional) on screen.
   */
  image?: { name: string; srcCorner: [number, number]; drawCorner: [number, number] };
}

export interface CustomFontFile {
  file: string;
  /** Family name the scheme refers to this file by. */
  name?: string;
}

export interface Scheme {
  colors: Map<string, string>;
  /** Lower-case colour name → the name as written (for pickers). */
  colorNames: Map<string, string>;
  base: Map<string, string>;
  fonts: Map<string, FontDef[]>;
  /** Lower-case scheme font name → the name as written (for pickers). */
  fontNames: Map<string, string>;
  borders: Map<string, BorderDef>;
  customFontFiles: CustomFontFile[];
}

export const EMPTY_SCHEME: Scheme = {
  colors: new Map(),
  colorNames: new Map(),
  base: new Map(),
  fonts: new Map(),
  fontNames: new Map(),
  borders: new Map(),
  customFontFiles: [],
};

const lower = (s: string) => s.toLowerCase();
const byNumericKey = (a: KvNode, b: KvNode) =>
  (Number.parseInt(a.key.text, 10) || 0) - (Number.parseInt(b.key.text, 10) || 0);

function parseFont(node: KvNode, env: CondEnv): FontDef | undefined {
  const get = new Map<string, string>();
  for (const c of kvChildren(node)) {
    if (c.value && evalCond(c.cond?.text, env) && !get.has(lower(c.key.text))) {
      get.set(lower(c.key.text), c.value.text);
    }
  }
  const name = get.get('name');
  if (!name) return undefined;
  const flag = (k: string) => (get.get(k) ?? '0') !== '0';
  const yres = get.get('yres')?.split(/\s+/).map(Number);
  return {
    name,
    tall: Number.parseFloat(get.get('tall') ?? '12') || 12,
    weight: Number.parseInt(get.get('weight') ?? '400', 10) || 400,
    italic: flag('italic'),
    underline: flag('underline'),
    outline: flag('outline'),
    dropshadow: flag('dropshadow'),
    antialias: flag('antialias'),
    additive: flag('additive'),
    yres: yres && yres.length >= 2 && yres.every(Number.isFinite) ? [yres[0], yres[1]] : undefined,
  };
}

function parseLayers(node: KvNode | undefined): BorderLayer[] {
  if (!node) return [];
  return [...kvChildren(node)]
    .filter((c) => c.children)
    .sort(byNumericKey)
    .map((layer) => {
      const color = kvChild(layer, 'color')?.value?.text ?? 'Blank';
      const off = (kvChild(layer, 'offset')?.value?.text ?? '0 0').split(/\s+/).map(Number);
      return { color, offset: [off[0] || 0, off[1] || 0] as [number, number] };
    });
}

export function parseScheme(text: string, env: CondEnv): Scheme {
  const doc = parseKv(text);
  const root = doc.roots.find((n) => lower(n.key.text) === 'scheme') ?? doc.roots[0];
  if (!root?.children) return EMPTY_SCHEME;

  const scheme: Scheme = {
    colors: new Map(),
    colorNames: new Map(),
    base: new Map(),
    fonts: new Map(),
    fontNames: new Map(),
    borders: new Map(),
    customFontFiles: [],
  };

  const section = (name: string) => kvChild(root, name);

  for (const c of kvChildren(section('Colors') ?? root)) {
    if (section('Colors') && c.value && evalCond(c.cond?.text, env)) {
      if (!scheme.colors.has(lower(c.key.text))) {
        scheme.colors.set(lower(c.key.text), c.value.text);
        scheme.colorNames.set(lower(c.key.text), c.key.text);
      }
    }
  }
  for (const c of kvChildren(section('BaseSettings') ?? root)) {
    if (section('BaseSettings') && c.value && evalCond(c.cond?.text, env)) {
      if (!scheme.base.has(lower(c.key.text))) scheme.base.set(lower(c.key.text), c.value.text);
    }
  }

  const fonts = section('Fonts');
  if (fonts) {
    for (const f of kvChildren(fonts)) {
      if (!f.children || !evalCond(f.cond?.text, env)) continue;
      const defs = [...f.children]
        .filter((c) => c.children && evalCond(c.cond?.text, env))
        .sort(byNumericKey)
        .map((c) => parseFont(c, env))
        .filter((d): d is FontDef => d !== undefined);
      if (defs.length && !scheme.fonts.has(lower(f.key.text))) {
        scheme.fonts.set(lower(f.key.text), defs);
        scheme.fontNames.set(lower(f.key.text), f.key.text);
      }
    }
  }

  const borders = section('Borders');
  if (borders) {
    for (const b of kvChildren(borders)) {
      if (!b.children) continue;
      const inset = (kvChild(b, 'inset')?.value?.text ?? '0 0 0 0')
        .split(/\s+/)
        .map((n) => Number.parseFloat(n) || 0);
      const num = (k: string) => Number.parseFloat(kvChild(b, k)?.value?.text ?? '') || 0;
      const imageName = kvChild(b, 'image')?.value?.text;
      const scalable = (kvChild(b, 'bordertype')?.value?.text ?? '').toLowerCase() === 'scalable_image';
      scheme.borders.set(lower(b.key.text), {
        inset: [inset[0] ?? 0, inset[1] ?? 0, inset[2] ?? 0, inset[3] ?? 0],
        left: parseLayers(kvChild(b, 'Left')),
        right: parseLayers(kvChild(b, 'Right')),
        top: parseLayers(kvChild(b, 'Top')),
        bottom: parseLayers(kvChild(b, 'Bottom')),
        ...(scalable && imageName
          ? {
              image: {
                name: imageName,
                srcCorner: [num('src_corner_width'), num('src_corner_height')] as [number, number],
                drawCorner: [num('draw_corner_width'), num('draw_corner_height')] as [number, number],
              },
            }
          : {}),
      });
    }
  }

  const files = section('CustomFontFiles');
  if (files) {
    for (const f of [...kvChildren(files)].sort(byNumericKey)) {
      if (f.value) scheme.customFontFiles.push({ file: f.value.text });
      else if (f.children) {
        const file = kvChild(f, 'font')?.value?.text;
        if (file) scheme.customFontFiles.push({ file, name: kvChild(f, 'name')?.value?.text });
      }
    }
  }

  return scheme;
}

/* ───────────────────────────── colours ───────────────────────────── */

const RGBA_RE =
  /^\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)(?:\s+(-?\d+(?:\.\d+)?))?\s*$/;
const clamp255 = (n: number) => Math.max(0, Math.min(255, Math.round(n)));

export function parseRgba(value: string): Rgba | undefined {
  const m = RGBA_RE.exec(value);
  if (!m) return undefined;
  return {
    r: clamp255(Number(m[1])),
    g: clamp255(Number(m[2])),
    b: clamp255(Number(m[3])),
    a: m[4] === undefined ? 255 : clamp255(Number(m[4])),
  };
}

/** A literal `"r g b a"` or the name of a scheme / base colour. */
export function resolveColor(scheme: Scheme, value: string | undefined): Rgba | undefined {
  let cur = value;
  for (let depth = 0; cur !== undefined && depth < 6; depth++) {
    const literal = parseRgba(cur);
    if (literal) return literal;
    const key = lower(cur.trim());
    const next = scheme.colors.get(key) ?? scheme.base.get(key);
    if (next === undefined || next === cur) return undefined;
    cur = next;
  }
  return undefined;
}

export function rgbaCss(c: Rgba, alpha = 1): string {
  return `rgba(${c.r},${c.g},${c.b},${((c.a / 255) * alpha).toFixed(3)})`;
}

/* ────────────────────────────── fonts ────────────────────────────── */

export interface ResolvedFont {
  def: FontDef;
  /** Pixel size at the given screen height. */
  px: number;
}

/**
 * Choose the face for `name` at `screenH`. Faces with a `yres` window are
 * absolute and used only inside it; faces without one are proportional to the
 * 480-line virtual screen. The first face that applies wins, as in the engine.
 */
export function pickFont(
  scheme: Scheme,
  name: string | undefined,
  screenH: number,
): ResolvedFont | undefined {
  const defs = scheme.fonts.get(lower(name ?? 'Default')) ?? scheme.fonts.get('default');
  if (!defs) return undefined;
  for (const def of defs) {
    if (def.yres) {
      if (screenH >= def.yres[0] && screenH <= def.yres[1]) return { def, px: def.tall };
      continue;
    }
    return { def, px: Math.max(1, def.tall * (screenH / 480)) };
  }
  const last = defs[defs.length - 1];
  return { def: last, px: last.tall };
}

export function borderOf(scheme: Scheme, name: string | undefined): BorderDef | undefined {
  return name ? scheme.borders.get(lower(name)) : undefined;
}
