import { create } from "zustand";

// Each theme carries its document background color (`bg`) alongside its catalog
// metadata so there is ONE source of truth for the theme→background map. Both the
// runtime (Providers.tsx) and the no-flash inline script (app/routes/__root.tsx)
// derive `THEME_BG` from here — adding a theme no longer means editing a
// hand-copied color map in two other files.
export const SITE_STYLES = [
  { id: "default", label: "Dark", icon: "🌙", group: "Base", bg: "#000" },
  { id: "light", label: "Light", icon: "☀️", group: "Base", bg: "#f5f5f7" },
  { id: "high-contrast", label: "High Contrast", icon: "◐", group: "Base", bg: "#000" },
  { id: "graphite", label: "Graphite", icon: "🪨", group: "Curated", bg: "#1c1c1e" },
  { id: "sepia", label: "Sepia", icon: "📖", group: "Curated", bg: "#f3e9d6" },
  { id: "nocturne", label: "Nocturne", icon: "🌌", group: "Curated", bg: "#0b0f1a" },
] as const;

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
}

export const useThemeStore = create<ThemeStore>((set) => ({
  style: "default",
  setStyle: (style) => set({ style, preview: null }),
  preview: null,
  setPreview: (preview) => set({ preview }),
  accent: null,
  setAccent: (accent) => set({ accent }),
}));
