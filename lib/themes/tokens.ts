/**
 * Theme Studio — the closed token contract (§14 of
 * docs/plans/2026-07-20-parity-qol-customization-design.md).
 *
 * A user theme is a **fixed, versioned map of colors + numbers** — never CSS
 * strings — so applying/publishing one can't inject styles or content. The zod
 * schema is `.strict()`, so unknown keys are rejected. Client-safe: used by the
 * editor, the runtime applier, and the API.
 */
import { z } from 'zod';

export const THEME_TOKENS_VERSION = 1 as const;

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const themeTokensSchema = z
  .object({
    v: z.literal(THEME_TOKENS_VERSION),
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

export type ThemeTokens = z.infer<typeof themeTokensSchema>;

/** A sensible starting palette (Glass-Dark-ish) for a new draft. */
export const DEFAULT_THEME_TOKENS: ThemeTokens = {
  v: THEME_TOKENS_VERSION,
  bg: '#0d1b2e',
  surface: '#16263c',
  surfaceHover: '#1d3350',
  text: '#e8eefc',
  textMuted: '#9fb2cf',
  border: '#243a58',
  accent: '#6d28d9',
  accentFg: '#ffffff',
  radius: 18,
};

/** The `--site-*` variables a theme token map sets on an element. */
export function themeCssVars(tokens: ThemeTokens): Record<string, string> {
  return {
    '--site-bg': tokens.bg,
    '--site-bg-subtle': tokens.bg,
    '--site-canvas': tokens.bg,
    '--site-surface': tokens.surface,
    '--site-surface-hover': tokens.surfaceHover,
    '--site-surface-active': tokens.surfaceHover,
    '--site-surface-opaque': tokens.surface,
    '--site-text': tokens.text,
    '--site-text-muted': tokens.textMuted,
    '--site-text-dim': tokens.textMuted,
    '--site-border': tokens.border,
    '--site-border-bright': tokens.border,
    '--site-accent': tokens.accent,
    '--site-accent-fg': tokens.accentFg,
    '--site-accent-hover': `color-mix(in oklab, ${tokens.accent} 82%, #000)`,
    '--site-accent-dim': `color-mix(in oklab, ${tokens.accent} 15%, transparent)`,
    '--site-radius': `${tokens.radius}px`,
    '--site-radius-sm': `${Math.round(tokens.radius * 0.66)}px`,
  };
}

/** Apply a theme token map to an element (a preview container, or :root). */
export function applyThemeTokens(el: HTMLElement, tokens: ThemeTokens): void {
  for (const [k, v] of Object.entries(themeCssVars(tokens))) el.style.setProperty(k, v);
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
