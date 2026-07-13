/**
 * tw() — Tailwind-subset → canvas style translator.
 *
 * The DOM UI is written in Tailwind utilities over `--site-*` tokens; canvas
 * scenes keep that authoring idiom by passing the same class strings through
 * tw(), which produces a typed style object consumed by `<Box>`/`<Text>`:
 *
 *   <Box style={tw("flex items-center gap-2 rounded-site bg-site-surface p-4")}>
 *
 * Supported subset (documented in docs/design-language.md): flex layout,
 * spacing (p/m/gap, 4px scale + arbitrary [Npx]), sizing (w/h/min/max/size),
 * position (relative/absolute/inset), borders + radius, `*-site-*` token
 * colors + literal [#hex] colors, text size/weight/align/family, opacity,
 * shadow-site, truncate, hidden, overflow. Responsive `sm:/md:/lg:/xl:`
 * prefixes bucket into per-breakpoint declarations resolved against the
 * stage width (`resolveResponsive`).
 *
 * Unknown classes THROW in dev — silently dropping a class is how visual
 * drift sneaks in. Handle new utilities by extending this parser (and its
 * table tests in canvas-ui/__tests__/tw.test.ts).
 */

import { TEXT_SIZES, FONT_WEIGHTS, type TextSize, type FontWeight } from "../theme/tokens";

/** A color that is either a literal CSS color or a theme-token reference. */
export type TokenColor =
  | { token: TokenColorName }
  | { literal: string };

export type TokenColorName =
  | "bg" | "bg-subtle" | "surface" | "surface-hover" | "surface-active"
  | "border" | "border-bright" | "text" | "text-muted" | "text-dim"
  | "accent" | "accent-fg" | "accent-hover" | "accent-dim"
  | "success" | "danger" | "warning";

export interface Edges {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
}

export type Dimension = number | `${number}%` | "auto";

export interface LayoutStyle {
  display?: "flex" | "none";
  flexDirection?: "row" | "column" | "row-reverse" | "column-reverse";
  flexWrap?: "wrap" | "nowrap";
  alignItems?: "flex-start" | "center" | "flex-end" | "stretch" | "baseline";
  alignSelf?: "auto" | "flex-start" | "center" | "flex-end" | "stretch";
  justifyContent?: "flex-start" | "center" | "flex-end" | "space-between" | "space-around" | "space-evenly";
  flexGrow?: number;
  flexShrink?: number;
  flexBasis?: Dimension;
  rowGap?: number;
  columnGap?: number;
  padding?: Edges;
  margin?: Edges & { autoX?: boolean };
  width?: Dimension;
  height?: Dimension;
  minWidth?: Dimension;
  minHeight?: Dimension;
  maxWidth?: Dimension;
  maxHeight?: Dimension;
  position?: "relative" | "absolute";
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
  aspectRatio?: number;
  overflow?: "visible" | "hidden";
}

export interface PaintStyle {
  fill?: TokenColor;
  stroke?: TokenColor;
  /** stroke width; `"token"` uses the theme's --site-border-width */
  strokeWidth?: number | "token";
  /** corner radius; site radii resolve against the active theme */
  cornerRadius?: number | "site" | "site-sm" | "full";
  shadow?: "site" | "none";
  opacity?: number;
}

export interface TextStyle {
  size?: TextSize;
  weight?: FontWeight;
  color?: TokenColor;
  family?: "body" | "display" | "mono";
  align?: "left" | "center" | "right";
  lineHeightPx?: number;
  letterSpacingEm?: number;
  truncate?: boolean;
  uppercase?: boolean;
}

export interface TwDecl {
  layout: LayoutStyle;
  paint: PaintStyle;
  text: TextStyle;
}

export type Breakpoint = "sm" | "md" | "lg" | "xl";

/** Tailwind default breakpoints (px). */
export const BREAKPOINTS: Record<Breakpoint, number> = { sm: 640, md: 768, lg: 1024, xl: 1280 };

export interface TwStyle extends TwDecl {
  responsive?: Partial<Record<Breakpoint, TwDecl>>;
}

const emptyDecl = (): TwDecl => ({ layout: {}, paint: {}, text: {} });

/** 4px spacing scale; supports fractions ("1.5") and "px". */
function spacing(v: string): number | null {
  if (v === "px") return 1;
  const n = Number(v);
  if (Number.isFinite(n)) return n * 4;
  const arb = v.match(/^\[(-?[\d.]+)(?:px)?\]$/);
  if (arb) return Number(arb[1]);
  return null;
}

function dimension(v: string): Dimension | null {
  if (v === "full") return "100%";
  if (v === "auto") return "auto";
  if (v === "screen") return "100%"; // stage fills the viewport
  const frac = v.match(/^(\d+)\/(\d+)$/);
  if (frac) return `${(Number(frac[1]) / Number(frac[2])) * 100}%` as Dimension;
  return spacing(v);
}

const TOKEN_COLORS = new Set<string>([
  "bg", "bg-subtle", "surface", "surface-hover", "surface-active",
  "border", "border-bright", "text", "text-muted", "text-dim",
  "accent", "accent-fg", "accent-hover", "accent-dim",
  "success", "danger", "warning",
]);

/** Parse "site-surface" / "[#ff0000]" / "transparent" / "white" / "black". */
function color(v: string): TokenColor | null {
  if (v.startsWith("site-")) {
    const name = v.slice(5);
    if (TOKEN_COLORS.has(name)) return { token: name as TokenColorName };
    return null;
  }
  const arb = v.match(/^\[(#[0-9a-fA-F]{3,8}|rgba?\([^\]]+\)|transparent)\]$/);
  if (arb) return { literal: arb[1] };
  if (v === "transparent") return { literal: "transparent" };
  if (v === "white") return { literal: "#ffffff" };
  if (v === "black") return { literal: "#000000" };
  return null;
}

const RADII: Record<string, number> = {
  none: 0, sm: 4, "": 8, md: 6, lg: 8, xl: 12, "2xl": 16, "3xl": 24,
};

function setEdge(target: Edges, side: "top" | "right" | "bottom" | "left" | "x" | "y" | "all", px: number) {
  if (side === "all") {
    target.top = target.right = target.bottom = target.left = px;
  } else if (side === "x") {
    target.left = target.right = px;
  } else if (side === "y") {
    target.top = target.bottom = px;
  } else {
    target[side] = px;
  }
}

function applyClass(decl: TwDecl, cls: string): boolean {
  const { layout, paint, text } = decl;
  let m: RegExpMatchArray | null;

  switch (cls) {
    // display / flex container
    case "flex": layout.display = "flex"; layout.flexDirection ??= "row"; return true;
    case "hidden": layout.display = "none"; return true;
    case "flex-row": layout.flexDirection = "row"; return true;
    case "flex-row-reverse": layout.flexDirection = "row-reverse"; return true;
    case "flex-col": layout.flexDirection = "column"; return true;
    case "flex-col-reverse": layout.flexDirection = "column-reverse"; return true;
    case "flex-wrap": layout.flexWrap = "wrap"; return true;
    case "flex-nowrap": layout.flexWrap = "nowrap"; return true;
    case "flex-1": layout.flexGrow = 1; layout.flexShrink = 1; layout.flexBasis = 0; return true;
    case "flex-auto": layout.flexGrow = 1; layout.flexShrink = 1; layout.flexBasis = "auto"; return true;
    case "flex-none": layout.flexGrow = 0; layout.flexShrink = 0; return true;
    case "grow": layout.flexGrow = 1; return true;
    case "grow-0": layout.flexGrow = 0; return true;
    case "shrink": layout.flexShrink = 1; return true;
    case "shrink-0": layout.flexShrink = 0; return true;
    // alignment
    case "items-start": layout.alignItems = "flex-start"; return true;
    case "items-center": layout.alignItems = "center"; return true;
    case "items-end": layout.alignItems = "flex-end"; return true;
    case "items-stretch": layout.alignItems = "stretch"; return true;
    case "items-baseline": layout.alignItems = "baseline"; return true;
    case "justify-start": layout.justifyContent = "flex-start"; return true;
    case "justify-center": layout.justifyContent = "center"; return true;
    case "justify-end": layout.justifyContent = "flex-end"; return true;
    case "justify-between": layout.justifyContent = "space-between"; return true;
    case "justify-around": layout.justifyContent = "space-around"; return true;
    case "justify-evenly": layout.justifyContent = "space-evenly"; return true;
    case "self-start": layout.alignSelf = "flex-start"; return true;
    case "self-center": layout.alignSelf = "center"; return true;
    case "self-end": layout.alignSelf = "flex-end"; return true;
    case "self-stretch": layout.alignSelf = "stretch"; return true;
    // position
    case "relative": layout.position = "relative"; return true;
    case "absolute": layout.position = "absolute"; return true;
    case "inset-0": layout.top = layout.right = layout.bottom = layout.left = 0; return true;
    // sizing shorthands
    case "min-w-0": layout.minWidth = 0; return true;
    case "min-h-0": layout.minHeight = 0; return true;
    // overflow
    case "overflow-hidden": layout.overflow = "hidden"; return true;
    case "overflow-visible": layout.overflow = "visible"; return true;
    // borders / radius / shadow
    case "border": paint.stroke ??= { token: "border" }; paint.strokeWidth = "token"; return true;
    case "border-2": paint.stroke ??= { token: "border" }; paint.strokeWidth = 2; return true;
    case "rounded-site": paint.cornerRadius = "site"; return true;
    case "rounded-site-sm": paint.cornerRadius = "site-sm"; return true;
    case "rounded-full": paint.cornerRadius = "full"; return true;
    case "shadow-site": paint.shadow = "site"; return true;
    case "shadow-none": paint.shadow = "none"; return true;
    // typography
    case "font-body": text.family = "body"; return true;
    case "font-display": text.family = "display"; return true;
    case "font-mono": text.family = "mono"; return true;
    case "text-left": text.align = "left"; return true;
    case "text-center": text.align = "center"; return true;
    case "text-right": text.align = "right"; return true;
    case "truncate": text.truncate = true; return true;
    case "uppercase": text.uppercase = true; return true;
    case "italic": return true; // rendered via fontStyle at draw time — accepted, minor
    case "tracking-site": text.letterSpacingEm = undefined; return true; // theme default
    case "tracking-tight": text.letterSpacingEm = -0.025; return true;
    case "tracking-wide": text.letterSpacingEm = 0.025; return true;
    case "tracking-widest": text.letterSpacingEm = 0.1; return true;
  }

  // rounded / rounded-{key}
  if (cls === "rounded") { paint.cornerRadius = RADII[""]; return true; }
  if ((m = cls.match(/^rounded-(none|sm|md|lg|xl|2xl|3xl)$/))) {
    paint.cornerRadius = RADII[m[1]];
    return true;
  }
  if ((m = cls.match(/^rounded-\[(\d+(?:\.\d+)?)px\]$/))) {
    paint.cornerRadius = Number(m[1]);
    return true;
  }

  // gap
  if ((m = cls.match(/^gap(-x|-y)?-(.+)$/))) {
    const px = spacing(m[2]);
    if (px === null) return false;
    if (m[1] === "-x") layout.columnGap = px;
    else if (m[1] === "-y") layout.rowGap = px;
    else { layout.rowGap = px; layout.columnGap = px; }
    return true;
  }

  // padding / margin
  if ((m = cls.match(/^(-?)([pm])([trblxy])?-(.+)$/))) {
    const neg = m[1] === "-";
    const isPad = m[2] === "p";
    const sideKey = (m[3] ?? "all") as "t" | "r" | "b" | "l" | "x" | "y" | "all";
    const side = ({ t: "top", r: "right", b: "bottom", l: "left", x: "x", y: "y", all: "all" } as const)[sideKey];
    if (m[4] === "auto") {
      if (!isPad && side === "x") {
        layout.margin = { ...layout.margin, autoX: true };
        return true;
      }
      return false;
    }
    const px = spacing(m[4]);
    if (px === null) return false;
    const value = neg ? -px : px;
    if (isPad) {
      layout.padding = { ...layout.padding };
      setEdge(layout.padding, side, value);
    } else {
      layout.margin = { ...layout.margin };
      setEdge(layout.margin, side, value);
    }
    return true;
  }

  // size-N (w+h)
  if ((m = cls.match(/^size-(.+)$/))) {
    const d = dimension(m[1]);
    if (d === null) return false;
    layout.width = d;
    layout.height = d;
    return true;
  }

  // w/h/min/max
  if ((m = cls.match(/^(w|h|min-w|min-h|max-w|max-h)-(.+)$/))) {
    const d = dimension(m[2]);
    if (d === null) return false;
    const key = ({ w: "width", h: "height", "min-w": "minWidth", "min-h": "minHeight", "max-w": "maxWidth", "max-h": "maxHeight" } as const)[m[1] as "w"];
    layout[key] = d;
    return true;
  }

  // position offsets
  if ((m = cls.match(/^(top|right|bottom|left)-(.+)$/))) {
    const px = spacing(m[2]);
    if (px === null) return false;
    layout[m[1] as "top"] = px;
    return true;
  }

  // opacity
  if ((m = cls.match(/^opacity-(\d+)$/))) {
    paint.opacity = Number(m[1]) / 100;
    return true;
  }

  // text size: text-sm etc. (vs text color below)
  if ((m = cls.match(/^text-(xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl)$/))) {
    text.size = m[1] as TextSize;
    return true;
  }

  // leading-N
  if ((m = cls.match(/^leading-(.+)$/))) {
    const px = spacing(m[1]);
    if (px === null) return false;
    text.lineHeightPx = px;
    return true;
  }

  // font weight
  if ((m = cls.match(/^font-(normal|medium|semibold|bold|extrabold|black)$/))) {
    text.weight = m[1] as FontWeight;
    return true;
  }

  // colors: bg-*, text-*, border-*
  if ((m = cls.match(/^bg-(.+)$/))) {
    const c = color(m[1]);
    if (!c) return false;
    paint.fill = c;
    return true;
  }
  if ((m = cls.match(/^text-(.+)$/))) {
    const c = color(m[1]);
    if (!c) return false;
    text.color = c;
    return true;
  }
  if ((m = cls.match(/^border-(.+)$/))) {
    const c = color(m[1]);
    if (!c) return false;
    paint.stroke = c;
    paint.strokeWidth ??= "token";
    return true;
  }

  return false;
}

function mergeDecl(base: TwDecl, extra: TwDecl): TwDecl {
  return {
    layout: {
      ...base.layout,
      ...extra.layout,
      padding: extra.layout.padding || base.layout.padding
        ? { ...base.layout.padding, ...extra.layout.padding }
        : undefined,
      margin: extra.layout.margin || base.layout.margin
        ? { ...base.layout.margin, ...extra.layout.margin }
        : undefined,
    },
    paint: { ...base.paint, ...extra.paint },
    text: { ...base.text, ...extra.text },
  };
}

const isDev = typeof process !== "undefined"
  ? process.env.NODE_ENV !== "production"
  : true;

const cache = new Map<string, TwStyle>();

/** Parse a Tailwind-subset class string into a canvas style. Cached. */
export function tw(classes: string): TwStyle {
  const cached = cache.get(classes);
  if (cached) return cached;

  const style: TwStyle = emptyDecl();
  for (const raw of classes.split(/\s+/)) {
    if (!raw) continue;
    const bp = raw.match(/^(sm|md|lg|xl):(.+)$/);
    let decl: TwDecl = style;
    let cls = raw;
    if (bp) {
      style.responsive ??= {};
      decl = style.responsive[bp[1] as Breakpoint] ??= emptyDecl();
      cls = bp[2];
    }
    if (!applyClass(decl, cls)) {
      if (isDev) {
        throw new Error(
          `tw(): unsupported class "${raw}". Extend canvas-ui/runtime/tw.ts (and its tests) rather than letting it silently drop.`
        );
      }
    }
  }
  cache.set(classes, style);
  return style;
}

/** Flatten a TwStyle against a viewport width (mobile-first, like Tailwind). */
export function resolveResponsive(style: TwStyle, viewportWidth: number): TwDecl {
  if (!style.responsive) return style;
  let out: TwDecl = { layout: style.layout, paint: style.paint, text: style.text };
  for (const bp of ["sm", "md", "lg", "xl"] as const) {
    const decl = style.responsive[bp];
    if (decl && viewportWidth >= BREAKPOINTS[bp]) out = mergeDecl(out, decl);
  }
  return out;
}

export { TEXT_SIZES, FONT_WEIGHTS };
