import { create } from 'zustand';
import type { AppliedUserTheme, AppliedUserThemePreview } from '@/lib/themes/tokens';
import { DEFAULT_COLOR_VISION, type ColorVisionMode } from '@/lib/appearance/prefs';
import { colorSchemeForBackground } from '@/lib/appearance/contrast';

// Each theme carries its document background color (`bg`) alongside its catalog
// metadata so there is ONE source of truth for the theme→background map. Both the
// runtime (Providers.tsx) and the no-flash inline script (app/routes/__root.tsx)
// derive `THEME_BG` from here — adding a theme no longer means editing a
// hand-copied color map in two other files.
//
// The shared site ships one new social-first system in three accessibility
// modes. Retired decorative themes self-heal to Daylight during hydration.
export const SITE_STYLES = [
  { id: 'default', label: 'Daylight', icon: '☀', group: 'RMH', bg: '#ffffff' },
  { id: 'graphite', label: 'Midnight', icon: '◐', group: 'RMH', bg: '#000000' },
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
 * Full-screen routes whose own palette is NOT the near-black `APP_THEME_BG`
 * ground.
 *
 * The pre-paint script paints `APP_THEME_BG` for every excluded route, which is
 * right for a game that is dark and wrong for one that is not: Slice It's light
 * theme is `#e0e5ec`, so opening it painted the document near-black and then
 * flipped to near-white as soon as `.slice-theme` resolved. A full-screen
 * black-to-white flash on every load.
 *
 * Keyed by route prefix. Each entry names the page's own persisted preference so
 * the script can pre-paint the SAME colour that page is about to use:
 *
 * - `key` — the localStorage key the page persists under.
 * - `darkFlag` — the boolean inside that JSON (zustand `persist` nests it under
 *   `state`) which is true when the page is in its dark theme.
 * - `dark` / `light` — the two grounds, mirroring the page's own stylesheet.
 * - `system` — when nothing is stored yet, ask `prefers-color-scheme` instead of
 *   assuming dark. A page whose default is "follow the OS" must not persist a
 *   resolved flag while it is on that setting, or the stored value goes stale
 *   the moment the OS flips with the tab closed; leaving the flag absent is what
 *   routes it back through the media query on the next load.
 *
 * A page with no entry keeps `APP_THEME_BG`, which is the correct default for
 * the dark `--app-*` tier that most of them use.
 */
export const APP_ROUTE_THEME_BG: Record<
  string,
  { key: string; darkFlag: string; dark: string; light: string; system?: boolean }
> = {
  '/slice-it': {
    key: 'slice-it-storage',
    darkFlag: 'isDarkMode',
    dark: '#16161a',
    light: '#e0e5ec',
  },
  // The PF2e board. Grounds mirror `--pf2e-bg` in
  // `components/pf2ecal/pf2ecal.css` — true black in dark, iOS systemGrey6 in
  // light. Without this entry the site painted the document Daylight white
  // under a page that had gone dark from `prefers-color-scheme`, which is
  // invisible on a desktop (the page covers the viewport) and glaring on a
  // phone, where every rubber-band overscroll flashes the gutter.
  '/pf2ecal': {
    key: 'pf2ecal-theme',
    darkFlag: 'dark',
    dark: '#000000',
    light: '#f2f2f7',
    system: true,
  },
  // The activity dossier. Grounds mirror `--sb2-bg` in
  // `components/sohumbum2/sohumbum2.css` — Discord's app frame in dark, its
  // light theme's chat ground in light. `system: true` because the page follows
  // `prefers-color-scheme` and ships no toggle of its own; `key` is therefore a
  // reserved slot that nothing writes yet, and the lookup falls through to the
  // system preference exactly as intended.
  '/sohumbum2': {
    key: 'sohumbum2-theme',
    darkFlag: 'dark',
    dark: '#1a1b1e',
    light: '#f2f3f5',
    system: true,
  },
};

/**
 * The ground a full-screen route wants right now, or null when it has no entry.
 *
 * Browser-only (it reads `localStorage` and `matchMedia`). This is the runtime
 * half of the pre-paint script's `RB` loop in `app/routes/__root.tsx` — the two
 * resolve the same preference the same way and must be changed together.
 */
export function appRouteGround(pathname: string): { bg: string; dark: boolean } | null {
  for (const [base, entry] of Object.entries(APP_ROUTE_THEME_BG)) {
    if (pathname !== base && !pathname.startsWith(`${base}/`)) continue;

    let dark = entry.system
      ? typeof window !== 'undefined' &&
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-color-scheme: dark)').matches
      : true;
    try {
      const raw = localStorage.getItem(entry.key);
      const parsed = raw ? (JSON.parse(raw) as Record<string, unknown> | null) : null;
      const state = (parsed?.state ?? parsed) as Record<string, unknown> | null;
      const flag = state?.[entry.darkFlag];
      if (typeof flag === 'boolean') dark = flag;
    } catch {
      // Unreadable or non-JSON storage falls through to the default above,
      // which is the whole reason this is wrapped: a pre-paint path may not
      // throw.
    }
    return { bg: dark ? entry.dark : entry.light, dark };
  }
  return null;
}

/**
 * Paint the document ground and everything pinned to it.
 *
 * Extracted so the two callers cannot drift: `Providers` runs it whenever the
 * theme resolves, and a full-screen page that owns its own light/dark (the PF2e
 * board) runs it when the visitor flips that switch — an effect inside the page
 * cannot wait for `Providers`, whose theme effect deliberately does not re-run
 * on a pathname change.
 *
 * `dark` is the app-tier flag the page's own stylesheet keys off; pass null on
 * the site tier, where the style class carries it instead.
 */
export function paintDocumentGround(bg: string, dark: boolean | null): void {
  const html = document.documentElement;
  html.style.backgroundColor = bg;
  document.body.style.backgroundColor = bg;

  if (dark === null) html.removeAttribute('data-app-dark');
  else html.setAttribute('data-app-dark', dark ? '1' : '0');

  // Pin the UA colour scheme to the ACTUAL background so native controls,
  // scrollbars, autofill and `<select>` popups never fall back to the OS
  // default and misrender. Derived from luminance so it stays correct for
  // marketplace themes that carry no style class.
  html.style.colorScheme = colorSchemeForBackground(bg);

  // Keep the browser-chrome tint in step — but NOT on iOS, and only ever our
  // own tag. Both halves are explained above the pre-paint `themeScript` in
  // `app/routes/__root.tsx`: iOS Safari fills the strip behind its floating tab
  // bar with this colour, flat, over the aurora the page paints there, and a
  // route that sets its own `theme-color` in `head()` means it (this used to
  // overwrite those too, because it wrote to every matching tag on the page).
  //
  // Ours is still appended when a route already has one, rather than skipped:
  // the browser uses the FIRST applicable `theme-color` in document order, so
  // the route's — which the framework emits in the head before this appends —
  // wins for as long as that route is mounted, and ours is already in place for
  // when the framework removes it on the way out. Skipping instead would leave
  // the site with no tag at all after such a navigation.
  const marked = document.querySelector<HTMLMetaElement>(
    'meta[name="theme-color"][data-rmh-theme]',
  );
  if (html.classList.contains('ios-webkit')) {
    marked?.remove();
  } else if (marked) {
    marked.content = bg;
  } else {
    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    meta.content = bg;
    meta.setAttribute('data-rmh-theme', '');
    document.head.appendChild(meta);
  }
}

/**
 * Theme → document background color, derived from SITE_STYLES. Used to paint the
 * document synchronously (before CSS resolves) so there is no flash, and — off
 * iOS — to tint the browser's own chrome via `<meta name="theme-color">`.
 *
 * iOS is excluded deliberately: Safari fills the strip behind its floating
 * bottom tab bar with that colour, flat, on top of the aurora the page paints
 * edge to edge there. See the note above `themeScript` in app/routes/__root.tsx.
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
  /**
   * Colour-vision deficiency mode. Retints the three semantic tokens
   * (success/danger/warning) to a palette that stays separable under that
   * deficiency; 'none' leaves the theme untouched. Persisted and
   * account-synced like `style`.
   */
  colorVision: ColorVisionMode;
  setColorVision: (value: ColorVisionMode) => void;

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
  colorVision: DEFAULT_COLOR_VISION,
  setColorVision: (colorVision) => set({ colorVision }),
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
