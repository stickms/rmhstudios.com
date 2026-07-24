import { create } from 'zustand';
import type { AppliedUserTheme, AppliedUserThemePreview } from '@/lib/themes/tokens';

// Each theme carries its document background color (`bg`) alongside its catalog
// metadata so there is ONE source of truth for the theme→background map. Both the
// runtime (Providers.tsx) and the no-flash inline script (app/routes/__root.tsx)
// derive `THEME_BG` from here — adding a theme no longer means editing a
// hand-copied color map in two other files.
//
// The shared site ships one new social-first system in three accessibility
// modes. Retired decorative themes self-heal to Daylight during hydration.
export const SITE_STYLES = [
  { id: 'default', label: 'Daylight', icon: '☀', group: 'RMH', bg: '#f3f5fb' },
  { id: 'graphite', label: 'Midnight', icon: '◐', group: 'RMH', bg: '#0e1018' },
  { id: 'high-contrast', label: 'High contrast', icon: '◑', group: 'RMH', bg: '#000000' },
] as const;

/**
 * Theme applied when the visitor has no stored/saved preference. Must stay in
 * sync with the fallback in app/routes/__root.tsx's inline themeScript and the
 * self-heal rewrite in components/Providers.tsx. Daylight (`default`, the bare
 * :root) is the site default.
 */
export const DEFAULT_STYLE: SiteStyle = 'default';

export type SiteStyle = (typeof SITE_STYLES)[number]['id'];

/** Neutral document chrome for full-screen games/apps that own their palette. */
export const APP_THEME_BG = '#0b0b0b';

/**
 * Theme → document background color, derived from SITE_STYLES. Used to paint the
 * body/theme-color synchronously (before CSS resolves) so there is no flash and
 * Safari derives its bar tint correctly on the first frame.
 */
export const THEME_BG: Record<SiteStyle, string> = Object.fromEntries(
  SITE_STYLES.map((s) => [s.id, s.bg]),
) as Record<SiteStyle, string>;

interface ThemeStore {
  /** The committed site theme (persisted). */
  style: SiteStyle;
  setStyle: (style: SiteStyle) => void;
  /**
   * A transient theme to render *instead of* `style` without persisting it —
   * powers the theme gallery's hover/focus "try it on" preview. Committing a
   * theme (setStyle) clears it.
   */
  preview: SiteStyle | null;
  setPreview: (style: SiteStyle | null) => void;
  /**
   * Accent-color override (an ACCENT_PRESETS id) applied on top of the active
   * theme, or null to use the theme's own accent. Persisted like `style`.
   */
  accent: string | null;
  setAccent: (accent: string | null) => void;
  /**
   * User "reduce transparency" preference: collapses the glass material to
   * opaque surfaces with no blur (html.reduce-transparency), the manual
   * equivalent of the OS `prefers-reduced-transparency` media query — the only
   * way Firefox users (no media-query support) can turn glass off. Persisted
   * and account-synced like `style`.
   */
  reduceTransparency: boolean;
  setReduceTransparency: (value: boolean) => void;
  /**
   * Glass clarity stop (§5.46): 0 Opaque · 1 Calm · 2 Default · 3 Airy · 4 Clear.
   * Stop 0 is the reduce-transparency mechanism; stops 1/3/4 set inline user
   * blur/tint factors. Persisted and account-synced like `style` (default 2).
   */
  glassLevel: number;
  setGlassLevel: (value: number) => void;

  // ── Appearance & accessibility comfort suite (§13) ──────────────────────
  /** Root font scale in per-mille (875|1000|1125|1250); null = default (1000). */
  fontScale: number | null;
  setFontScale: (value: number | null) => void;
  /** 'cozy' (default) | 'compact'; null = cozy. */
  density: 'cozy' | 'compact' | null;
  setDensity: (value: 'cozy' | 'compact' | null) => void;
  /** Legible body-font stack for dyslexia-friendly reading. */
  readableFont: boolean;
  setReadableFont: (value: boolean) => void;
  /** Custom accent hex (#rrggbb); wins over the `accent` preset. null = none. */
  customAccent: string | null;
  setCustomAccent: (value: string | null) => void;
  /** Account-level reduce-motion, OR-ed with the OS media query. */
  reduceMotion: boolean;
  setReduceMotion: (value: boolean) => void;

  // ── Marketplace user themes (§14) ────────────────────────────────────────
  /**
   * The owned marketplace theme applied site-wide (a v2 derived-vars blob), or
   * null for a built-in theme. A full retint set inline on <html> over the
   * built-in cascade; persisted (localStorage `rmh-user-theme`) and painted
   * pre-paint by the no-flash script. High-contrast + reduced-transparency win.
   */
  userTheme: AppliedUserTheme | null;
  setUserTheme: (theme: AppliedUserTheme | null) => void;
  /**
   * A transient user theme rendered *instead of* `userTheme` without persisting
   * — powers try-before-buy and the editor's "preview on site". Committing (or
   * choosing a built-in style) clears it.
   */
  userThemePreview: AppliedUserThemePreview | null;
  setUserThemePreview: (theme: AppliedUserThemePreview | null) => void;
}

export const useThemeStore = create<ThemeStore>((set) => ({
  style: DEFAULT_STYLE,
  // Committing a built-in style clears any user-theme preview (they are mutually
  // exclusive site looks) but keeps a committed user theme until removed.
  setStyle: (style) => set({ style, preview: null, userThemePreview: null }),
  preview: null,
  setPreview: (preview) => set({ preview }),
  accent: null,
  setAccent: (accent) => set({ accent }),
  reduceTransparency: false,
  setReduceTransparency: (reduceTransparency) => set({ reduceTransparency }),
  glassLevel: 2,
  setGlassLevel: (glassLevel) => set({ glassLevel }),
  fontScale: null,
  setFontScale: (fontScale) => set({ fontScale }),
  density: null,
  setDensity: (density) => set({ density }),
  readableFont: false,
  setReadableFont: (readableFont) => set({ readableFont }),
  customAccent: null,
  setCustomAccent: (customAccent) => set({ customAccent }),
  reduceMotion: false,
  setReduceMotion: (reduceMotion) => set({ reduceMotion }),
  userTheme: null,
  // Applying/removing an owned theme also clears any transient preview.
  setUserTheme: (userTheme) => set({ userTheme, userThemePreview: null }),
  userThemePreview: null,
  setUserThemePreview: (userThemePreview) => set({ userThemePreview }),
}));

/** localStorage key for the reduce-transparency preference (no-flash cache). */
export const REDUCE_TRANSPARENCY_KEY = 'rmh-reduce-transparency';

/** localStorage key for the applied marketplace user theme (§14 no-flash cache). */
export const USER_THEME_KEY = 'rmh-user-theme';
