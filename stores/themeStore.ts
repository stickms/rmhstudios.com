import { create } from "zustand";

// Each theme carries its document background color (`bg`) alongside its catalog
// metadata so there is ONE source of truth for the theme→background map. Both the
// runtime (Providers.tsx) and the no-flash inline script (app/routes/__root.tsx)
// derive `THEME_BG` from here — adding a theme no longer means editing a
// hand-copied color map in two other files.
//
// Themes are now TINTS OF THE GLASS: each re-tints the shared --site-* + glass
// material contract in app/globals.css over its own --site-canvas aurora. The
// former `liquid-glass` id is retired into `default` (Glass Dark) — the site
// default; persisted `liquid-glass` prefs self-heal to `default` in Providers.
export const SITE_STYLES = [
  { id: "default", label: "Glass Dark", icon: "🫧", group: "Base", bg: "#0d1b2e" },
  { id: "light", label: "Glass Light", icon: "☀️", group: "Base", bg: "#e9edf6" },
  { id: "high-contrast", label: "High Contrast", icon: "◐", group: "Base", bg: "#000" },
  { id: "graphite", label: "Graphite Glass", icon: "🪨", group: "Curated", bg: "#17171a" },
  { id: "sepia", label: "Sepia Glass", icon: "📖", group: "Curated", bg: "#efe4cf" },
  { id: "nocturne", label: "Nocturne Glass", icon: "🌌", group: "Curated", bg: "#0a1424" },
] as const;

/**
 * Theme applied when the visitor has no stored/saved preference. Must stay in
 * sync with the fallback in app/routes/__root.tsx's inline themeScript and the
 * self-heal rewrite in components/Providers.tsx. Glass Dark (`default`, the
 * bare :root) is the site default.
 */
export const DEFAULT_STYLE: SiteStyle = "default";

export type SiteStyle = (typeof SITE_STYLES)[number]["id"];

/**
 * Theme → document background color, derived from SITE_STYLES. Used to paint the
 * body/theme-color synchronously (before CSS resolves) so there is no flash and
 * Safari derives its bar tint correctly on the first frame.
 */
export const THEME_BG: Record<SiteStyle, string> = Object.fromEntries(
  SITE_STYLES.map((s) => [s.id, s.bg])
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
}

export const useThemeStore = create<ThemeStore>((set) => ({
  style: DEFAULT_STYLE,
  setStyle: (style) => set({ style, preview: null }),
  preview: null,
  setPreview: (preview) => set({ preview }),
  accent: null,
  setAccent: (accent) => set({ accent }),
  reduceTransparency: false,
  setReduceTransparency: (reduceTransparency) => set({ reduceTransparency }),
}));

/** localStorage key for the reduce-transparency preference (no-flash cache). */
export const REDUCE_TRANSPARENCY_KEY = "rmh-reduce-transparency";
