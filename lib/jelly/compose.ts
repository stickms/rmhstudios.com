/**
 * How the soft body's writes compose with Tailwind and framer-motion (docs/plans/plasmatic-jelly/02-soft-body.md §3.4).
 *
 * CSS applies `translate` → `rotate` → `scale` → `transform`, each about `transform-origin`. Jelly writes only the two
 * independent properties `translate` and `scale`, so:
 *
 * 1. **Tailwind v4** utilities (`scale-*`, `translate-*`, `-translate-x-1/2`) write those same properties. The
 *    computed values are read ONCE at activation ({@link readBase}) and every write composes on top of them:
 *    `calc(base + Δpx)` for translate (a `-50%` base survives) and `base·s` for scale. Bases are not re-read during a
 *    body's life (under 1.5s).
 * 2. **framer-motion** writes `style.transform`. Jelly's `scale` sits outside it and would scale framer's
 *    translation mid-animation, so {@link FramerWatch} compares the inline `transform` string (an inline read, no
 *    style flush) frame to frame: while it changes the element is framer-owned, jelly heads to rest and stops
 *    writing; two stable frames later it resumes. That also covers `layout`/`layoutId` FLIP animations.
 * 3. An inline `transform` that already holds a non-identity offset at activation (framer `x`/`y` at rest) gets
 *    lean only, no scale ({@link hasInlineTransformOffset}).
 *
 * `rotate` is never written. Pure string work plus one `getComputedStyle` in {@link readBase}; no layout reads.
 */

/** The element's own `translate`/`scale` at activation, and the inline values to restore at sleep. */
export interface ComposeBase {
  /** Computed translate components (CSS lengths/percentages); `'0px'` for `none`. */
  tx: string;
  ty: string;
  /** Third component when the base is 3D, else `null`. */
  tz: string | null;
  /** Computed scale factors (`none` → 1). */
  sx: number;
  sy: number;
  /** The inline values present before jelly wrote anything (`''` when none) — what sleep restores. */
  inlineTranslate: string;
  inlineScale: string;
}

/** Split a CSS value list on top-level whitespace (keeps `calc(a + b)` intact). */
function splitTopLevel(value: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of value.trim()) {
    if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    if (depth === 0 && /\s/.test(ch)) {
      if (cur) out.push(cur);
      cur = '';
    } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

const isZeroLength = (v: string) => /^-?0(?:\.0+)?(?:px|%|em|rem)?$/.test(v.trim());

/** Parse a computed `translate` (`none`, `10px`, `-50% -50%`, `1px 2px 3px`). */
export function parseTranslate(value: string | null | undefined): {
  tx: string;
  ty: string;
  tz: string | null;
} {
  const v = (value ?? '').trim();
  if (!v || v === 'none') return { tx: '0px', ty: '0px', tz: null };
  const parts = splitTopLevel(v);
  return {
    tx: parts[0] ?? '0px',
    ty: parts[1] ?? '0px',
    tz: parts[2] && !isZeroLength(parts[2]) ? parts[2] : null,
  };
}

/** Parse a computed `scale` (`none`, `1.05`, `1 0.5`, `1 1 1`, `50%`). */
export function parseScale(value: string | null | undefined): { sx: number; sy: number } {
  const v = (value ?? '').trim();
  if (!v || v === 'none') return { sx: 1, sy: 1 };
  const num = (s: string) => {
    const n = s.endsWith('%') ? Number.parseFloat(s) / 100 : Number.parseFloat(s);
    return Number.isFinite(n) ? n : 1;
  };
  const parts = splitTopLevel(v);
  const sx = num(parts[0] ?? '1');
  const sy = parts[1] !== undefined ? num(parts[1]) : sx;
  return { sx, sy };
}

/** The identity base (no Tailwind transform, nothing inline). */
export const IDENTITY_BASE: Readonly<ComposeBase> = Object.freeze({
  tx: '0px',
  ty: '0px',
  tz: null,
  sx: 1,
  sy: 1,
  inlineTranslate: '',
  inlineScale: '',
});

/** Minimal shapes so this module can be driven by a fake DOM in tests. */
export interface StyleLike {
  translate?: string;
  scale?: string;
  transform?: string;
}
export interface ComputedLike {
  translate?: string;
  scale?: string;
}

/**
 * Read the base once, from a `getComputedStyle` result the caller already holds (one call per activation, shared
 * with any other computed read the activation needs).
 */
export function readBase(style: StyleLike, computed: ComputedLike | null): ComposeBase {
  const t = parseTranslate(computed?.translate);
  const s = parseScale(computed?.scale);
  return {
    ...t,
    ...s,
    inlineTranslate: style.translate ?? '',
    inlineScale: style.scale ?? '',
  };
}

const px = (n: number) => `${Number(n.toFixed(2))}px`;

/** The `translate` value for a jelly offset `(dx, dy)` px on top of `base`. */
export function composeTranslate(base: ComposeBase, dx: number, dy: number): string {
  const axis = (b: string, d: number) => (isZeroLength(b) ? px(d) : `calc(${b} + ${px(d)})`);
  const out = `${axis(base.tx, dx)} ${axis(base.ty, dy)}`;
  return base.tz ? `${out} ${base.tz}` : out;
}

/** The `scale` value for jelly factors `(sx, sy)` on top of `base`. */
export function composeScale(base: ComposeBase, sx: number, sy: number): string {
  return `${Number((base.sx * sx).toFixed(4))} ${Number((base.sy * sy).toFixed(4))}`;
}

/**
 * Identity-only transform functions (what framer leaves behind at rest: `translateX(0px) translateY(0px)`, `none`,
 * `scale(1)`, `translateZ(0)`). Anything else is a real offset.
 */
const IDENTITY_FN =
  /\b(?:translate(?:3d|X|Y|Z)?\(\s*(?:-?0(?:\.0+)?(?:px|%)?\s*,?\s*)+\)|scale(?:3d|X|Y)?\(\s*(?:1(?:\.0+)?\s*,?\s*)+\)|rotate[XYZ]?\(\s*-?0(?:\.0+)?(?:deg|rad|turn)?\s*\))/g;

/** True when an inline `transform` holds a non-identity translate/scale (framer `x`/`y` resting off zero). */
export function hasInlineTransformOffset(transform: string | null | undefined): boolean {
  const v = (transform ?? '').trim();
  if (!v || v === 'none') return false;
  return v.replace(IDENTITY_FN, '').trim().length > 0;
}

/** Frames the inline `transform` must stay unchanged before jelly writes again (02 §3.4). */
export const FRAMER_STABLE_FRAMES = 2;

/**
 * framer-motion ownership detector for one element. Call {@link FramerWatch.observe} once per frame in the read
 * phase with the element's inline `style.transform`; it reports whether jelly must keep its hands off this frame.
 */
export class FramerWatch {
  private last: string;
  private stable = FRAMER_STABLE_FRAMES;

  constructor(initial: string | null | undefined) {
    this.last = initial ?? '';
  }

  /** `true` while framer owns the element (its transform changed within the last two frames). */
  observe(transform: string | null | undefined): boolean {
    const v = transform ?? '';
    if (v !== this.last) {
      this.last = v;
      this.stable = 0;
      return true;
    }
    if (this.stable < FRAMER_STABLE_FRAMES) this.stable++;
    return this.stable < FRAMER_STABLE_FRAMES;
  }

  get owned(): boolean {
    return this.stable < FRAMER_STABLE_FRAMES;
  }
}
