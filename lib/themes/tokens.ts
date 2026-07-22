/**
 * Theme Studio — the closed token contract (§14 of the Liquid Glass v2 optics
 * plan). A user theme is a **fixed, versioned map of colors + numbers** — never
 * CSS strings — so applying/publishing one can't inject styles or content. The
 * zod schema is `.strict()`, so unknown keys are rejected. Client-safe: used by
 * the editor, the runtime applier, and the API.
 *
 * **v2 — themes are tints of the glass (§14.1).** A theme supplies the scene
 * colors (`canvasBase` + three aurora `glow*`), the material tint (`tint` +
 * `tintAlpha` + `glintStrength`), and ink/accent, and the SYSTEM owns the glass
 * geometry (blur tiers, bevel, shadow composition, aurora keyframes, glint
 * mechanics). `themeCssVars()` derives the full `--site-*` contract from those
 * few knobs — so every user theme is automatically a correct glass tint and
 * future optics upgrades apply to every sold theme retroactively.
 *
 * v1 maps (9 flat colors + radius) **upcast on read** ({@link upcastTokens}) so
 * existing drafts and purchases keep working — never a breaking reject.
 */
import { z } from 'zod';
import { parseHex, toHex, relativeLuminance, contrastRatio } from '@/lib/appearance/contrast';

export const THEME_TOKENS_VERSION = 2 as const;

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

// tintAlpha clamps (§14.1): 0.04–0.30 on a dark base; up to 0.65 when canvasBase
// luminance is high (a bright frost over a bright scene needs more body to read).
export const TINT_ALPHA_MIN = 0.04;
export const TINT_ALPHA_MAX_DARK = 0.3;
export const TINT_ALPHA_MAX_LIGHT = 0.65;
/** The luminance above which canvasBase counts as a "light" scene. */
const LIGHT_CANVAS_LUMINANCE = 0.5;

function maxTintAlpha(canvasBase: string): number {
  return relativeLuminance(canvasBase) >= LIGHT_CANVAS_LUMINANCE
    ? TINT_ALPHA_MAX_LIGHT
    : TINT_ALPHA_MAX_DARK;
}

/** Clamp a tint alpha into the luminance-dependent legal range for a base color. */
export function clampTintAlpha(alpha: number, canvasBase: string): number {
  return Math.min(Math.max(alpha, TINT_ALPHA_MIN), maxTintAlpha(canvasBase));
}

export const themeTokensSchema = z
  .object({
    v: z.literal(THEME_TOKENS_VERSION),
    // The scene — base + three aurora glows (the radial GEOMETRY is a fixed
    // system template; the theme only colors it).
    canvasBase: hex,
    glow1: hex,
    glow2: hex,
    glow3: hex,
    // The material — one tint color + alpha + rim/glint strength.
    tint: hex,
    tintAlpha: z.number().min(TINT_ALPHA_MIN).max(TINT_ALPHA_MAX_LIGHT),
    glintStrength: z.number().min(0).max(1),
    // Ink & accent (as v1).
    text: hex,
    textMuted: hex,
    border: hex,
    accent: hex,
    accentFg: hex,
    radius: z.number().int().min(0).max(32),
  })
  .strict()
  .superRefine((t, ctx) => {
    // Skip when canvasBase already failed the hex field check (avoids re-parsing
    // an invalid color here — the field schema already recorded that issue).
    if (!/^#[0-9a-fA-F]{6}$/.test(t.canvasBase)) return;
    // The high-alpha ceiling depends on the base luminance (§14.1).
    const max = maxTintAlpha(t.canvasBase);
    if (t.tintAlpha > max) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['tintAlpha'],
        message: `tintAlpha must be ≤ ${max} for this canvasBase luminance`,
      });
    }
  });

export type ThemeTokens = z.infer<typeof themeTokensSchema>;

/** The v1 contract (still parsed on read, then upcast — never written anew). */
const themeTokensV1Schema = z
  .object({
    v: z.literal(1),
    bg: hex,
    surface: hex,
    surfaceHover: hex,
    text: hex,
    textMuted: hex,
    border: hex,
    accent: hex,
    accentFg: hex,
    radius: z.number().int().min(0).max(32),
  })
  .strict();
type ThemeTokensV1 = z.infer<typeof themeTokensV1Schema>;

/** A sensible starting palette (Glass-Dark-ish) for a new draft. */
export const DEFAULT_THEME_TOKENS: ThemeTokens = {
  v: THEME_TOKENS_VERSION,
  canvasBase: '#0d1b2e',
  glow1: '#568cff',
  glow2: '#aa6cff',
  glow3: '#34d0bc',
  tint: '#ffffff',
  tintAlpha: 0.1,
  glintStrength: 1,
  text: '#f4f8ff',
  textMuted: '#c4d2ea',
  border: '#2b3d59',
  accent: '#6cc9ff',
  accentFg: '#042a41',
  radius: 18,
};

// ── color math (pure; deterministic hex/rgba, no color-mix) ──────────────────
function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/** rgba() string for a hex color at a given alpha. */
function rgba(hexColor: string, alpha: number): string {
  const { r, g, b } = parseHex(hexColor);
  return `rgba(${r}, ${g}, ${b}, ${Math.round(clamp01(alpha) * 1000) / 1000})`;
}

/** Linear-RGB-ish blend of two hex colors, `t` of `b` into `a`. Returns hex. */
function mix(a: string, b: string, t: number): string {
  const ca = parseHex(a);
  const cb = parseHex(b);
  const k = clamp01(t);
  return toHex({
    r: ca.r + (cb.r - ca.r) * k,
    g: ca.g + (cb.g - ca.g) * k,
    b: ca.b + (cb.b - ca.b) * k,
  });
}

/** Composite a translucent `top` (at `alpha`) over an opaque `bottom`; hex out. */
function over(top: string, alpha: number, bottom: string): string {
  const ct = parseHex(top);
  const cb = parseHex(bottom);
  const k = clamp01(alpha);
  const ch = (t: number, b: number): number => t * k + b * (1 - k);
  return toHex({ r: ch(ct.r, cb.r), g: ch(ct.g, cb.g), b: ch(ct.b, cb.b) });
}

// ── derivation (§14.1) ───────────────────────────────────────────────────────

/** The glow with the highest luminance — the brightest region of the canvas. */
function brightestGlow(t: ThemeTokens): string {
  return [t.glow1, t.glow2, t.glow3].reduce((a, b) =>
    relativeLuminance(b) > relativeLuminance(a) ? b : a,
  );
}

/**
 * The effective surface a body of text sits on: the glass tint composited over
 * the brightest aurora glow over the base. This is the worst-case legibility
 * backdrop the §14.3 contrast gate checks `text`/`textMuted` against.
 */
export function effectiveTextBackdrop(t: ThemeTokens): string {
  const glowLit = over(brightestGlow(t), 0.3, t.canvasBase); // radial stop ~0.30
  return over(t.tint, t.tintAlpha, glowLit);
}

/**
 * Derive the FULL `--site-*` glass contract from the closed token map (§14.1).
 * Everything the built-in themes set as a re-tint is derived here; the system
 * keeps the glass GEOMETRY (blur tiers, saturate, bevel, fonts) — those are
 * intentionally absent so a user theme can never break the material.
 */
export function themeCssVars(tokens: ThemeTokens): Record<string, string> {
  const t = tokens;
  const lc = relativeLuminance(t.canvasBase); // scene luminance
  const lt = relativeLuminance(t.tint); // tint luminance drives rim/glint (§4.35.4)

  // Surfaces — the tint plate at rising alpha.
  const surface = rgba(t.tint, t.tintAlpha);
  const surfaceHover = rgba(t.tint, Math.min(t.tintAlpha * 1.7, 0.9));
  const surfaceActive = rgba(t.tint, Math.min(t.tintAlpha * 2.4, 0.95));
  const surfaceOpaque = over(t.tint, t.tintAlpha, t.canvasBase); // solid mix

  // Rim / glint from tint luminance: bright frost gets a brighter, more opaque
  // rim but at a LOWER glint opacity (mirrors §4.35.4).
  const rimBase = mix(t.tint, '#ffffff', 0.4);
  const rimA = Math.min(0.24 + 0.62 * lt, 0.9);
  const glintOpacity = clamp01((0.9 - 0.4 * lt) * t.glintStrength);

  // Depth shadows tinted from a darkened canvasBase; lighter scenes cast softer.
  const depthColor = mix(t.canvasBase, '#000000', 0.6);
  const depthA = Math.min(Math.max(0.6 - 0.42 * lc, 0.18), 0.6);

  // Canvas — the fixed radial template (positions/alphas copied from :root's
  // --site-canvas), only re-colored by the four scene colors.
  const canvasMid = mix(t.canvasBase, '#ffffff', 0.05);
  const canvasBottom = mix(t.canvasBase, '#000000', 0.1);
  const canvas = [
    `radial-gradient(110% 85% at 10% -5%, ${rgba(t.glow1, 0.3)}, transparent 62%)`,
    `radial-gradient(95% 75% at 94% 4%, ${rgba(t.glow2, 0.27)}, transparent 60%)`,
    `radial-gradient(110% 95% at 86% 102%, ${rgba(t.glow3, 0.22)}, transparent 64%)`,
    `radial-gradient(80% 70% at 8% 98%, ${rgba(t.glow1, 0.16)}, transparent 60%)`,
    `linear-gradient(180deg, ${t.canvasBase} 0%, ${canvasMid} 48%, ${canvasBottom} 100%)`,
  ].join(', ');

  return {
    // Base
    '--site-bg': t.canvasBase,
    '--site-bg-subtle': rgba(t.tint, 0.08),
    '--site-canvas': canvas,
    '--site-surface': surface,
    '--site-surface-hover': surfaceHover,
    '--site-surface-active': surfaceActive,
    '--site-surface-opaque': surfaceOpaque,
    '--site-border': t.border,
    '--site-border-bright': mix(t.border, t.text, 0.22),
    '--site-text': t.text,
    '--site-text-muted': t.textMuted,
    '--site-text-dim': mix(t.textMuted, t.canvasBase, 0.35),
    '--site-accent': t.accent,
    '--site-accent-fg': t.accentFg,
    '--site-accent-hover': `color-mix(in oklab, ${t.accent} 82%, #000)`,
    '--site-accent-dim': `color-mix(in oklab, ${t.accent} 15%, transparent)`,
    '--site-radius': `${t.radius}px`,
    '--site-radius-sm': `${Math.round(t.radius * 0.66)}px`,
    // Glass material contract (rims/glint/depth feed --site-shadow via var()).
    '--site-glass-tint': surface,
    '--site-glass-tint-strong': surfaceHover,
    '--site-glass-ink': rgba(t.canvasBase, 0.45),
    '--site-glass-rim': rgba(rimBase, rimA),
    '--site-glass-rim-soft': rgba(rimBase, rimA * 0.45),
    '--site-glass-light': rgba(rimBase, Math.min(0.14 + 0.5 * lt, 0.6)),
    '--site-glass-glint': rgba(rimBase, rimA),
    '--glass-glint-opacity': String(Math.round(glintOpacity * 1000) / 1000),
    '--site-glass-depth': `0 24px 64px ${rgba(depthColor, depthA)}`,
    '--site-glass-depth-sm': `0 4px 16px ${rgba(depthColor, depthA * 0.5)}`,
    // Aurora depth layer (§5.1) at reduced alpha.
    '--site-aurora-far-1': rgba(t.glow1, 0.1),
    '--site-aurora-far-2': rgba(t.glow2, 0.09),
  };
}

/** The `--site-*` variable NAMES a theme sets (so a removal can clear them all). */
export const THEME_VAR_NAMES: readonly string[] = Object.keys(themeCssVars(DEFAULT_THEME_TOKENS));

/**
 * A derived, cacheable blob for site-wide runtime application (§14.1): the id,
 * the solid document background (`canvasBase`, for the browser bar / no-flash),
 * and the pre-derived `--site-*` vars. Persisted under `rmh-user-theme` so the
 * no-flash script can paint the theme before hydration.
 */
export interface AppliedUserTheme {
  id: string;
  bg: string;
  vars: Record<string, string>;
}

export function deriveAppliedTheme(id: string, tokens: ThemeTokens): AppliedUserTheme {
  return { id, bg: tokens.canvasBase, vars: themeCssVars(tokens) };
}

/** Clear every `--site-*` a theme sets, restoring the underlying theme cascade. */
export function clearThemeTokens(el: HTMLElement): void {
  for (const name of THEME_VAR_NAMES) el.style.removeProperty(name);
}

/**
 * A transient site-wide preview (try-before-buy / preview-on-site) — the applied
 * blob plus optional storefront metadata the floating confirm bar shows (name,
 * price, whether a Buy action applies). Runtime application only reads `vars`/`bg`.
 */
export interface AppliedUserThemePreview extends AppliedUserTheme {
  name?: string;
  priceCoins?: number | null;
  purchasable?: boolean;
}

// ── v1 → v2 upcast (§14.1) ───────────────────────────────────────────────────

/**
 * Deterministic v1 → v2 conversion (§14.1): glows are derived from accent/bg
 * mixes, the tint keeps the v1 surface color, and tintAlpha comes from the v1
 * surface-vs-bg luminance delta (clamped to the base's legal range). Ink/accent
 * carry over 1:1. Pure and reversible enough for a round-trip test.
 */
export function upcastV1(v1: ThemeTokensV1): ThemeTokens {
  const delta = Math.abs(relativeLuminance(v1.surface) - relativeLuminance(v1.bg));
  return {
    v: THEME_TOKENS_VERSION,
    canvasBase: v1.bg,
    glow1: mix(v1.bg, v1.accent, 0.35),
    glow2: mix(v1.bg, v1.accent, 0.2),
    glow3: mix(v1.bg, v1.surface, 0.5),
    tint: v1.surface,
    tintAlpha: clampTintAlpha(0.1 + delta * 1.5, v1.bg),
    glintStrength: 1,
    text: v1.text,
    textMuted: v1.textMuted,
    border: v1.border,
    accent: v1.accent,
    accentFg: v1.accentFg,
    radius: v1.radius,
  };
}

/**
 * Parse stored tokens (v2 preferred, v1 upcast) — the read path for drafts and
 * purchases persisted before v2. Throws only on a map that is neither.
 */
export function upcastTokens(raw: unknown): ThemeTokens {
  const v2 = themeTokensSchema.safeParse(raw);
  if (v2.success) return v2.data;
  const v1 = themeTokensV1Schema.safeParse(raw);
  if (v1.success) return upcastV1(v1.data);
  throw new Error('INVALID_TOKENS');
}

/** Best-effort read: upcast if possible, else fall back to the default palette. */
export function readTokens(raw: unknown): ThemeTokens {
  try {
    return upcastTokens(raw);
  } catch {
    return DEFAULT_THEME_TOKENS;
  }
}

// ── contrast gate (§14.3) — pure math, shared by editor + publish API ─────────
const AA = 4.5;
const AA_LARGE = 3;

export interface ThemeLintIssue {
  pair: string;
  ratio: number;
  need: number;
}

/**
 * The failing WCAG contrast pairs for a theme (empty = passes the gate). Checks
 * text/muted against the glass tint over the brightest glow (the worst-case
 * legible backdrop) and accentFg against accent (§14.3).
 */
export function lintThemeContrast(tokens: ThemeTokens): ThemeLintIssue[] {
  const backdrop = effectiveTextBackdrop(tokens);
  const checks: { pair: string; a: string; b: string; need: number }[] = [
    { pair: 'text-on-glass', a: tokens.text, b: backdrop, need: AA },
    { pair: 'muted-on-glass', a: tokens.textMuted, b: backdrop, need: AA_LARGE },
    { pair: 'accentFg-on-accent', a: tokens.accentFg, b: tokens.accent, need: AA },
  ];
  const issues: ThemeLintIssue[] = [];
  for (const c of checks) {
    const ratio = Math.round(contrastRatio(c.a, c.b) * 10) / 10;
    if (ratio < c.need) issues.push({ pair: c.pair, ratio, need: c.need });
  }
  return issues;
}

/** True when a theme clears every AA pair — the publish gate (editor + server). */
export function canPublish(tokens: ThemeTokens): boolean {
  return lintThemeContrast(tokens).length === 0;
}

export const THEME_PRICE_MIN = 200;
export const THEME_PRICE_MAX = 5000;

export interface UserThemeView {
  id: string;
  name: string;
  tokens: ThemeTokens;
  status: string;
  priceCoins: number | null;
  sales: number;
  author?: { name: string | null; handle: string | null };
  owned?: boolean;
  isAuthor?: boolean;
}
