/**
 * M9 — chat themes.
 *
 * A theme is `"<accent>.<wallpaper>"`, both picked from the fixed sets below.
 * Nothing here is a raw colour: every value is a `--site-*` token or a
 * `color-mix()` of tokens, so each of the site's themes (and high-contrast)
 * restyles a chat for free and a stored preset can never become unreadable.
 *
 * The accent works by re-pointing the accent tokens on the chat's root element,
 * so the bubbles, links and buttons inside pick it up with no per-component
 * code. The wallpaper only paints the message scroller.
 */

import type { CSSProperties } from 'react';

export const CHAT_ACCENTS = ['default', 'success', 'warning', 'danger', 'mono'] as const;
export type ChatAccent = (typeof CHAT_ACCENTS)[number];
export const CHAT_WALLPAPERS = ['none', 'aurora', 'dusk', 'paper', 'dots', 'grid'] as const;
export type ChatWallpaper = (typeof CHAT_WALLPAPERS)[number];

export interface ChatTheme {
  accent: ChatAccent;
  wallpaper: ChatWallpaper;
}

export const DEFAULT_CHAT_THEME: ChatTheme = { accent: 'default', wallpaper: 'none' };

export function encodeTheme(theme: ChatTheme): string | null {
  if (theme.accent === 'default' && theme.wallpaper === 'none') return null;
  return `${theme.accent}.${theme.wallpaper}`;
}

/** Parse a stored key. Anything unrecognised falls back to the default. */
export function parseTheme(key: string | null | undefined): ChatTheme {
  if (!key) return DEFAULT_CHAT_THEME;
  const [accent, wallpaper] = key.split('.');
  return {
    accent: (CHAT_ACCENTS as readonly string[]).includes(accent)
      ? (accent as ChatAccent)
      : 'default',
    wallpaper: (CHAT_WALLPAPERS as readonly string[]).includes(wallpaper)
      ? (wallpaper as ChatWallpaper)
      : 'none',
  };
}

/** A stored key is valid when both halves are in the preset sets. */
export function isValidThemeKey(key: string): boolean {
  const [accent, wallpaper, extra] = key.split('.');
  return (
    extra === undefined &&
    (CHAT_ACCENTS as readonly string[]).includes(accent) &&
    (CHAT_WALLPAPERS as readonly string[]).includes(wallpaper)
  );
}

const ACCENT_VARS: Record<Exclude<ChatAccent, 'default'>, Record<string, string>> = {
  success: {
    '--site-accent': 'var(--site-success)',
    '--site-accent-fg': 'var(--site-success-fg)',
    '--site-accent-hover': 'color-mix(in oklab, var(--site-success) 88%, var(--site-text))',
    '--site-accent-dim': 'color-mix(in oklab, var(--site-success) 16%, transparent)',
  },
  warning: {
    '--site-accent': 'var(--site-warning)',
    '--site-accent-fg': 'var(--site-warning-fg)',
    '--site-accent-hover': 'color-mix(in oklab, var(--site-warning) 88%, var(--site-text))',
    '--site-accent-dim': 'color-mix(in oklab, var(--site-warning) 16%, transparent)',
  },
  danger: {
    '--site-accent': 'var(--site-danger)',
    '--site-accent-fg': 'var(--site-danger-fg)',
    '--site-accent-hover': 'color-mix(in oklab, var(--site-danger) 88%, var(--site-text))',
    '--site-accent-dim': 'color-mix(in oklab, var(--site-danger) 16%, transparent)',
  },
  mono: {
    '--site-accent': 'var(--site-text)',
    '--site-accent-fg': 'var(--site-bg)',
    '--site-accent-hover': 'color-mix(in oklab, var(--site-text) 85%, var(--site-bg))',
    '--site-accent-dim': 'color-mix(in oklab, var(--site-text) 12%, transparent)',
  },
};

const WALLPAPER_STYLE: Record<Exclude<ChatWallpaper, 'none'>, CSSProperties> = {
  aurora: {
    backgroundImage:
      'radial-gradient(120% 70% at 0% 0%, color-mix(in oklab, var(--site-accent) 18%, transparent), transparent 60%), radial-gradient(100% 60% at 100% 100%, color-mix(in oklab, var(--site-success) 12%, transparent), transparent 60%)',
  },
  dusk: {
    backgroundImage:
      'linear-gradient(160deg, color-mix(in oklab, var(--site-accent) 14%, transparent), color-mix(in oklab, var(--site-danger) 10%, transparent))',
  },
  paper: { backgroundColor: 'var(--site-bg-subtle)' },
  dots: {
    backgroundImage:
      'radial-gradient(color-mix(in oklab, var(--site-border) 70%, transparent) 1px, transparent 1.5px)',
    backgroundSize: '18px 18px',
  },
  grid: {
    backgroundImage:
      'linear-gradient(color-mix(in oklab, var(--site-border) 45%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in oklab, var(--site-border) 45%, transparent) 1px, transparent 1px)',
    backgroundSize: '28px 28px',
  },
};

/** Style for the chat root: re-points the accent tokens. Empty for the default. */
export function accentStyle(theme: ChatTheme): CSSProperties {
  if (theme.accent === 'default') return {};
  return ACCENT_VARS[theme.accent] as CSSProperties;
}

/** Style for the message scroller: the wallpaper. Empty for none. */
export function wallpaperStyle(theme: ChatTheme): CSSProperties {
  if (theme.wallpaper === 'none') return {};
  return WALLPAPER_STYLE[theme.wallpaper];
}
