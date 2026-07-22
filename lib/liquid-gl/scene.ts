/**
 * Scene uniforms (§16.1.1) — the shader OWNS the aurora, so it must reproduce the
 * CSS `--site-canvas` gradient stack closely enough that toggling `html.liquid-gl`
 * is not jarring. Every theme (built-in and marketplace) colours the SAME radial
 * geometry template (see lib/themes/tokens.ts + globals.css), so we parse the
 * colours + positions out of the resolved token once per theme change and feed a
 * fixed shader that composites base-linear + radial glows procedurally.
 *
 * Split into a PURE parser ({@link parseSceneColors} — unit-tested, no DOM) and
 * thin DOM readers ({@link readSceneStatic} once per theme via `getComputedStyle`,
 * {@link readLiveInputs} per frame via cheap inline-style reads that never flush
 * layout).
 */

import type { SceneGlow, SceneState } from './types';

/** The colour + geometry portion of the scene — everything but the live inputs. */
export type SceneStatic = Pick<
  SceneState,
  'baseTop' | 'baseMid' | 'baseBot' | 'glows' | 'accent' | 'rim'
>;

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

/**
 * Parse a CSS colour to linear-ish rgb 0..1 + alpha. Handles `#rgb`, `#rrggbb`,
 * `#rrggbbaa`, `rgb()/rgba()` (incl. `/`-alpha), and `transparent`. Returns null
 * for anything unrecognised (e.g. `none`).
 */
export function parseCssColor(input: string): [number, number, number, number] | null {
  const s = input.trim().toLowerCase();
  if (s === 'transparent') return [0, 0, 0, 0];
  if (s === 'none' || s === '') return null;

  if (s[0] === '#') {
    const hex = s.slice(1);
    if (hex.length === 3 || hex.length === 4) {
      const r = parseInt(hex[0] + hex[0], 16);
      const g = parseInt(hex[1] + hex[1], 16);
      const b = parseInt(hex[2] + hex[2], 16);
      const a = hex.length === 4 ? parseInt(hex[3] + hex[3], 16) / 255 : 1;
      if ([r, g, b].some(Number.isNaN)) return null;
      return [r / 255, g / 255, b / 255, a];
    }
    if (hex.length === 6 || hex.length === 8) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
      if ([r, g, b].some(Number.isNaN)) return null;
      return [r / 255, g / 255, b / 255, a];
    }
    return null;
  }

  const m = s.match(/^rgba?\(([^)]+)\)$/);
  if (m) {
    // Comma-, space-, and slash-separated forms all normalise here.
    const parts = m[1].split(/[\s,/]+/).map((p) => p.trim()).filter(Boolean);
    if (parts.length < 3) return null;
    const chan = (p: string) =>
      p.endsWith('%') ? (parseFloat(p) / 100) * 255 : parseFloat(p);
    const r = chan(parts[0]);
    const g = chan(parts[1]);
    const b = chan(parts[2]);
    const a = parts[3] !== undefined ? (parts[3].endsWith('%') ? parseFloat(parts[3]) / 100 : parseFloat(parts[3])) : 1;
    if ([r, g, b, a].some(Number.isNaN)) return null;
    return [clamp01(r / 255), clamp01(g / 255), clamp01(b / 255), clamp01(a)];
  }
  return null;
}

/** Split a value into its top-level `*-gradient(...)` chunks (paren-aware). */
export function splitGradients(value: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (c === '(') {
      if (depth === 0) {
        // Rewind to the gradient keyword start.
        let j = i - 1;
        while (j >= 0 && /[a-z-]/i.test(value[j])) j--;
        start = j + 1;
      }
      depth++;
    } else if (c === ')') {
      depth--;
      if (depth === 0 && start >= 0) {
        out.push(value.slice(start, i + 1).trim());
        start = -1;
      }
    }
  }
  return out;
}

/** Split a gradient's inner argument list on top-level commas (paren-aware). */
function splitArgs(inner: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const c of inner) {
    if (c === '(') depth++;
    else if (c === ')') depth--;
    if (c === ',' && depth === 0) {
      out.push(cur.trim());
      cur = '';
    } else cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function innerOf(gradient: string): string {
  const open = gradient.indexOf('(');
  const close = gradient.lastIndexOf(')');
  return open >= 0 && close > open ? gradient.slice(open + 1, close) : '';
}

/** Pull the color + trailing stop% out of a gradient color-stop token. */
function colorAndStop(token: string): { color: [number, number, number, number] | null; stop: number } {
  // e.g. "rgba(86,140,255,0.3)" | "transparent 62%" | "#131316 100%"
  const stopMatch = token.match(/(-?\d*\.?\d+)%\s*$/);
  const stop = stopMatch ? parseFloat(stopMatch[1]) / 100 : NaN;
  const colorPart = stopMatch ? token.slice(0, stopMatch.index).trim() : token.trim();
  return { color: parseCssColor(colorPart), stop };
}

/** Parse one radial-gradient into a {@link SceneGlow} (fixed-template geometry). */
function parseRadial(gradient: string): SceneGlow | null {
  const inner = innerOf(gradient);
  const args = splitArgs(inner);
  if (args.length === 0) return null;

  // First arg holds the ending-shape size + `at` position:
  //   "110% 85% at 10% -5%"  (size may be omitted → default 50% 50% center).
  const head = args[0];
  const atIdx = head.indexOf(' at ');
  const sizePart = atIdx >= 0 ? head.slice(0, atIdx) : /%/.test(head) && !/,/.test(head) ? head : '';
  const posPart = atIdx >= 0 ? head.slice(atIdx + 4) : '';
  const pcts = (str: string) => (str.match(/-?\d*\.?\d+%/g) ?? []).map((p) => parseFloat(p) / 100);
  const sizes = pcts(sizePart);
  const pos = pcts(posPart);
  const sx = sizes[0] ?? 0.9;
  const sy = sizes[1] ?? sx;
  const cx = pos[0] ?? 0.5;
  const cy = pos[1] ?? 0.5;

  // The glow colour is the first *stop* arg (index 1 when a head existed).
  const colorArg = atIdx >= 0 || /%/.test(head) ? args[1] : args[0];
  if (!colorArg) return null;
  const first = colorAndStop(colorArg);
  if (!first.color) return null;
  // Transparent stop — from the last arg that fades out (fallback 0.62).
  let stop = 0.62;
  for (let i = args.length - 1; i >= 1; i--) {
    const cs = colorAndStop(args[i]);
    if (cs.color && cs.color[3] === 0 && !Number.isNaN(cs.stop)) {
      stop = cs.stop;
      break;
    }
  }
  const [r, g, b, a] = first.color;
  return { r, g, b, a, cx, cy, sx: Math.max(sx, 0.05), sy: Math.max(sy, 0.05), stop: Math.max(stop, 0.05) };
}

/**
 * Parse the resolved `--site-canvas` (+ accent + rim tokens) into the static
 * scene. Pure — no DOM. Falls back gracefully on unparseable input (returns a
 * flat dark base with no glows) so a weird theme never throws in the frame path.
 */
export function parseSceneColors(canvas: string, accent: string, rim: string): SceneStatic {
  const accentC = parseCssColor(accent);
  const rimC = parseCssColor(rim);
  const accentRgb: [number, number, number] = accentC ? [accentC[0], accentC[1], accentC[2]] : [0.42, 0.79, 1];
  const rimRgb: [number, number, number] = rimC ? [rimC[0], rimC[1], rimC[2]] : [1, 1, 1];

  const empty: SceneStatic = {
    baseTop: [0.05, 0.1, 0.18],
    baseMid: [0.07, 0.14, 0.24],
    baseBot: [0.04, 0.1, 0.19],
    glows: [],
    accent: accentRgb,
    rim: rimRgb,
  };
  if (!canvas || canvas.trim() === 'none') return empty;

  const gradients = splitGradients(canvas);
  const glows: SceneGlow[] = [];
  type Rgb = [number, number, number];
  let base: { top: Rgb; mid: Rgb; bot: Rgb } | null = null;

  for (const grad of gradients) {
    if (grad.startsWith('radial')) {
      const glow = parseRadial(grad);
      if (glow) glows.push(glow);
    } else if (grad.startsWith('linear')) {
      const args = splitArgs(innerOf(grad));
      const cols: Rgb[] = [];
      for (const a of args) {
        const cs = colorAndStop(a);
        if (cs.color) cols.push([cs.color[0], cs.color[1], cs.color[2]]);
      }
      if (cols.length >= 1) {
        const top = cols[0];
        const bot = cols[cols.length - 1];
        const mid: Rgb =
          cols.length >= 3
            ? cols[Math.floor(cols.length / 2)]
            : [(top[0] + bot[0]) / 2, (top[1] + bot[1]) / 2, (top[2] + bot[2]) / 2];
        base = { top, mid, bot };
      }
    }
  }

  return {
    baseTop: base ? base.top : empty.baseTop,
    baseMid: base ? base.mid : empty.baseMid,
    baseBot: base ? base.bot : empty.baseBot,
    glows: glows.slice(0, MAX_GLOWS),
    accent: accentRgb,
    rim: rimRgb,
  };
}

/** Shader-side cap — the uniform array is sized to this. */
export const MAX_GLOWS = 5;

/** Read the static scene from the live document (once per theme change). */
export function readSceneStatic(): SceneStatic {
  if (typeof document === 'undefined') {
    return parseSceneColors('', '', '');
  }
  const cs = getComputedStyle(document.documentElement);
  const canvas = cs.getPropertyValue('--site-canvas');
  const accent = cs.getPropertyValue('--site-accent');
  const rim = cs.getPropertyValue('--site-glass-glint') || cs.getPropertyValue('--site-glass-rim');
  return parseSceneColors(canvas, accent, rim);
}

/** Mutable live-input target — reused each frame (zero allocation). */
export interface LiveInputs {
  mx: number;
  my: number;
  lightX: number; // viewport-normalized 0..1
  lightY: number;
  hasLight: boolean;
}

const px = (v: string): number => {
  const n = parseFloat(v);
  return Number.isNaN(n) ? 0 : n;
};

/**
 * Refresh the frequently-changing inputs from INLINE `<html>` style (written by
 * useLiquidBackground / useGlassLight). Reading `element.style` does not flush
 * layout — unlike `getComputedStyle`. Mutates `out` in place.
 */
export function readLiveInputs(out: LiveInputs): void {
  if (typeof document === 'undefined') return;
  const st = document.documentElement.style;
  out.mx = px(st.getPropertyValue('--aurora-mx'));
  out.my = px(st.getPropertyValue('--aurora-my'));
  const lx = st.getPropertyValue('--light-x');
  const ly = st.getPropertyValue('--light-y');
  if (lx && ly) {
    const vw = window.innerWidth || 1;
    const vh = window.innerHeight || 1;
    out.lightX = px(lx) / vw;
    out.lightY = px(ly) / vh;
    out.hasLight = true;
  } else {
    out.lightX = 0.5; // the sun default (§4.1)
    out.lightY = -0.08;
    out.hasLight = false;
  }
}
