/**
 * Canvas theme tokens — the JS-side source of truth for the `--site-*` design
 * contract, consumed by every canvas-ui widget instead of CSS custom
 * properties (a Konva scene cannot read CSS variables per-node).
 *
 * Values are transcribed 1:1 from the theme blocks in `app/globals.css`
 * (`:root` = default dark, `.style-light`, `.style-high-contrast`). The
 * residual DOM (mirror, overlays, hidden helpers) still consumes the CSS
 * variables, so until the DOM surface is fully purged BOTH must be updated
 * together when a token changes. Theme ids stay in sync with
 * `stores/themeStore.ts` `SITE_STYLES`.
 */

import type { SiteStyle } from "@/stores/themeStore";

/** A parsed shadow the canvas renderer can draw (Konva shadow* attrs). */
export interface ShadowToken {
  offsetX: number;
  offsetY: number;
  blur: number;
  color: string;
}

/** The full token contract one theme provides. Mirrors the `--site-*` set. */
export interface ThemeTokens {
  id: SiteStyle;
  bg: string;
  bgSubtle: string;
  surface: string;
  surfaceHover: string;
  surfaceActive: string;
  border: string;
  borderBright: string;
  borderWidth: number;
  text: string;
  textMuted: string;
  textDim: string;
  accent: string;
  accentFg: string;
  accentHover: string;
  accentDim: string;
  success: string;
  danger: string;
  warning: string;
  radius: number;
  radiusSm: number;
  shadow: ShadowToken;
  glow: ShadowToken | null;
  fontDisplay: string;
  fontBody: string;
  fontMono: string;
  letterSpacing: number;
  /** `--site-heading-transform` — "none" | "uppercase" */
  headingTransform: "none" | "uppercase";
  transitionMs: number;
}

const FONT_BODY =
  'Inter, -apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif';
const FONT_MONO = '"JetBrains Mono", "Cascadia Code", monospace';

/** Default (dark) — from the `:root` block in globals.css. */
const dark: ThemeTokens = {
  id: "default",
  bg: "#000",
  bgSubtle: "#0b0b0c",
  surface: "#161617",
  surfaceHover: "#1d1d1f",
  surfaceActive: "#242426",
  border: "rgba(255, 255, 255, 0.08)",
  borderBright: "rgba(255, 255, 255, 0.16)",
  borderWidth: 1,
  text: "#f5f5f7",
  textMuted: "#86868b",
  textDim: "#6e6e73",
  accent: "#9d7bff",
  accentFg: "#fff",
  accentHover: "#ae8fff",
  accentDim: "rgba(157, 123, 255, 0.12)",
  success: "#30d158",
  danger: "#ff453a",
  warning: "#ffd60a",
  radius: 18,
  radiusSm: 12,
  shadow: { offsetX: 0, offsetY: 24, blur: 64, color: "rgba(0, 0, 0, 0.5)" },
  glow: null,
  fontDisplay: FONT_BODY,
  fontBody: FONT_BODY,
  fontMono: FONT_MONO,
  letterSpacing: -0.022,
  headingTransform: "none",
  transitionMs: 200,
};

/** Light — from `.style-light`. Tokens it doesn't override inherit dark's. */
const light: ThemeTokens = {
  ...dark,
  id: "light",
  bg: "#f5f5f7",
  bgSubtle: "#ebebed",
  surface: "#fff",
  surfaceHover: "#f5f5f7",
  surfaceActive: "#ebebed",
  border: "rgba(0, 0, 0, 0.08)",
  borderBright: "rgba(0, 0, 0, 0.16)",
  text: "#1d1d1f",
  textMuted: "#6e6e73",
  textDim: "#86868b",
  accent: "#7d56d8",
  accentFg: "#fff",
  accentHover: "#8f6ce0",
  accentDim: "rgba(125, 86, 216, 0.10)",
  success: "#248a3d",
  danger: "#d70015",
  warning: "#c48a00",
  shadow: { offsetX: 0, offsetY: 24, blur: 64, color: "rgba(0, 0, 0, 0.10)" },
};

/** High Contrast — from `.style-high-contrast` (WCAG AAA). */
const highContrast: ThemeTokens = {
  ...dark,
  id: "high-contrast",
  bg: "#000000",
  bgSubtle: "#000000",
  surface: "#000000",
  surfaceHover: "#1a1a1a",
  surfaceActive: "#2a2a2a",
  border: "#ffffff",
  borderBright: "#ffffff",
  borderWidth: 2,
  text: "#ffffff",
  textMuted: "#ededed",
  textDim: "#cfcfcf",
  accent: "#ffff00",
  accentFg: "#000000",
  accentHover: "#e6e600",
  accentDim: "rgba(255, 255, 0, 0.18)",
  success: "#00e676",
  danger: "#ff8080",
  warning: "#ffd54a",
  // `0 0 0 1px #fff` is a spread ring; approximate with the border tokens
  // (Konva has no shadow-spread) — a zero-blur shadow reads as nothing.
  shadow: { offsetX: 0, offsetY: 0, blur: 0, color: "transparent" },
};

export const THEME_TOKENS: Record<SiteStyle, ThemeTokens> = {
  default: dark,
  light,
  "high-contrast": highContrast,
};

/** Text sizes matching the Tailwind scale the DOM UI used. */
export const TEXT_SIZES = {
  xs: { fontSize: 12, lineHeight: 16 },
  sm: { fontSize: 14, lineHeight: 20 },
  base: { fontSize: 16, lineHeight: 24 },
  lg: { fontSize: 18, lineHeight: 28 },
  xl: { fontSize: 20, lineHeight: 28 },
  "2xl": { fontSize: 24, lineHeight: 32 },
  "3xl": { fontSize: 30, lineHeight: 36 },
  "4xl": { fontSize: 36, lineHeight: 40 },
  "5xl": { fontSize: 48, lineHeight: 48 },
  "6xl": { fontSize: 60, lineHeight: 60 },
} as const;

export type TextSize = keyof typeof TEXT_SIZES;

/** Font weights matching the Tailwind scale (canvas needs numeric weights). */
export const FONT_WEIGHTS = {
  normal: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
  extrabold: 800,
  black: 900,
} as const;

export type FontWeight = keyof typeof FONT_WEIGHTS;
