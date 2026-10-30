/**
 * VGUI proportional layout, as the Source engine does it.
 *
 * Every number in a `.res` file is in a virtual 640×480 screen and scales by
 * `screenHeight / 480` on both axes — so a 1920×1080 client has a scale of
 * 2.25 and a virtual width of 853⅓. Prefixes change what the number means:
 *
 *   xpos/ypos  `r120`  → parent edge − 120   (right/bottom aligned)
 *              `c-50`  → parent centre − 50
 *   wide/tall  `f20`   → parent size − 20    ("fill")
 *
 * `pin_to_sibling` and its corner properties replace the above with an offset
 * from a corner of another panel.
 */

import type { Props } from '../kv/props';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Screen {
  w: number;
  h: number;
}

/** Virtual 640×480 → device pixels. */
export const screenScale = (s: Screen): number => s.h / 480;

export type Align = 'start' | 'center' | 'end';

export interface Dim {
  value: number;
  align: Align;
  /** `f` prefix: the number is subtracted from the parent's size. */
  fill: boolean;
  /**
   * Positions only (`Panel::ComputePos`): `s` after the anchor makes the number a fraction of the panel's
   * own size (`cs-0.5` centres it), `p` a fraction of the parent's.
   */
  of?: 'self' | 'parent';
  /** Sizes only (`ComputeWide` / `ComputeTall`): `o1.6` is 1.6 × the panel's other dimension. */
  ofOther?: boolean;
  /**
   * Positions only: the rest of an operator chain (`c-34+273`, `rs1-18`) — `ComputePos` parses each
   * `+` / `-` term as a position of its own and adds or subtracts it.
   */
  more?: Array<{ sign: 1 | -1; dim: Dim }>;
}

export function parseDim(raw: string | undefined, depth = 0): Dim {
  const s = (raw ?? '').trim();
  const m = /^([rcfo]?)([sp]?)([-+]?\d*\.?\d+)?/i.exec(s);
  const prefix = (m?.[1] ?? '').toLowerCase();
  const rel = (m?.[2] ?? '').toLowerCase();
  const value = m?.[3] === undefined ? 0 : Number.parseFloat(m[3]);
  const dim: Dim = {
    value: Number.isFinite(value) ? value : 0,
    align: prefix === 'r' ? 'end' : prefix === 'c' ? 'center' : 'start',
    fill: prefix === 'f',
  };
  if (prefix === 'o') dim.ofOther = true;
  if (rel === 's') dim.of = 'self';
  else if (rel === 'p') dim.of = 'parent';
  // The operator chain: `+n` / `-n` after the first term (bounded: files are hostile input).
  const rest = s.slice(m?.[0].length ?? 0);
  if (depth < 8 && (rest[0] === '+' || rest[0] === '-') && m?.[3] !== undefined) {
    dim.more = [{ sign: rest[0] === '-' ? -1 : 1, dim: parseDim(rest.slice(1), depth + 1) }];
  }
  return dim;
}

/**
 * `CScheme::GetProportionalScaledValue`: virtual units → whole pixels, truncated
 * toward zero. Layout is integer arithmetic in the engine, and matching it is
 * what makes 1px borders and tight stacks land where they do in game.
 */
export const scaled = (value: number, scale: number): number =>
  // The nudge absorbs float error (2.2499999 for 2.25) and must push away from zero either way, or an
  // exact negative product such as -288 × 2.25 = -648 would truncate to -647.
  Math.trunc(value * scale + Math.sign(value) * 1e-9);

/** Resolve a position component against the parent's extent (and the panel's own, for `s` values). */
export function resolveAxis(dim: Dim, parentExtent: number, scale: number, ownExtent = 0): number {
  const v =
    dim.of === 'self'
      ? Math.trunc(ownExtent * dim.value)
      : dim.of === 'parent'
        ? Math.trunc(parentExtent * dim.value)
        : scaled(dim.value, scale);
  const pos = dim.align === 'end' ? parentExtent - v : dim.align === 'center' ? Math.trunc(parentExtent / 2) + v : v;
  let out = pos;
  for (const term of dim.more ?? []) out += term.sign * resolveAxis(term.dim, parentExtent, scale, ownExtent);
  return out;
}

/** Resolve a size component against the parent's extent. */
export function resolveSize(dim: Dim, parentExtent: number, scale: number): number {
  const v = scaled(dim.value, scale);
  return Math.max(0, dim.fill ? parentExtent - v : v);
}

/** Corner ids from `vgui_controls/Panel.h`. */
const PIN_POINT: Record<number, (r: Rect) => [number, number]> = {
  0: (r) => [r.x, r.y],
  1: (r) => [r.x + r.w, r.y],
  2: (r) => [r.x, r.y + r.h],
  3: (r) => [r.x + r.w, r.y + r.h],
  4: (r) => [r.x + r.w / 2, r.y],
  5: (r) => [r.x + r.w, r.y + r.h / 2],
  6: (r) => [r.x + r.w / 2, r.y + r.h],
  7: (r) => [r.x, r.y + r.h / 2],
};
const OWN_ORIGIN: Record<number, (w: number, h: number) => [number, number]> = {
  0: () => [0, 0],
  1: (w) => [w, 0],
  2: (_w, h) => [0, h],
  3: (w, h) => [w, h],
  4: (w) => [w / 2, 0],
  5: (w, h) => [w, h / 2],
  6: (w, h) => [w / 2, h],
  7: (_w, h) => [0, h / 2],
};

export interface PinSpec {
  sibling: string;
  /** Corner of THIS panel that is placed (`pin_corner_to_sibling`). */
  own: number;
  /** Corner of the sibling it is measured from (`pin_to_sibling_corner`). */
  target: number;
}

export function pinOf(props: Props): PinSpec | undefined {
  const sibling = props.get('pin_to_sibling');
  if (!sibling) return undefined;
  return {
    sibling,
    own: props.num('pin_corner_to_sibling', 0),
    target: props.num('pin_to_sibling_corner', 0),
  };
}

export interface LayoutInput {
  props: Props;
  parent: Rect;
  scale: number;
  /** Resolved rect of the pin target, when the panel has one and it exists. */
  sibling?: Rect;
}

/** Local → parent-relative rectangle (origin = parent's top-left). */
export function layoutRect({ props, parent, scale, sibling }: LayoutInput): Rect {
  const wd = parseDim(props.get('wide'));
  const hd = parseDim(props.get('tall'));
  let w = resolveSize(wd, parent.w, scale);
  let h = resolveSize(hd, parent.h, scale);
  // `o`: one dimension from the other (both `o` is an error in the engine: 0).
  if (wd.ofOther && hd.ofOther) w = h = 0;
  else if (wd.ofOther) w = Math.max(0, Math.trunc(h * wd.value));
  else if (hd.ofOther) h = Math.max(0, Math.trunc(w * hd.value));
  const pin = pinOf(props);
  const xd = parseDim(props.get('xpos'));
  const yd = parseDim(props.get('ypos'));

  if (pin && sibling) {
    const [ax, ay] = (PIN_POINT[pin.target] ?? PIN_POINT[0])(sibling);
    const [ox, oy] = (OWN_ORIGIN[pin.own] ?? OWN_ORIGIN[0])(w, h);
    return { x: ax + scaled(xd.value, scale) - ox, y: ay + scaled(yd.value, scale) - oy, w, h };
  }
  return {
    x: resolveAxis(xd, parent.w, scale, w),
    y: resolveAxis(yd, parent.h, scale, h),
    w,
    h,
  };
}

export const translate = (r: Rect, dx: number, dy: number): Rect => ({
  x: r.x + dx,
  y: r.y + dy,
  w: r.w,
  h: r.h,
});

export const containsPoint = (r: Rect, x: number, y: number): boolean =>
  x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;
