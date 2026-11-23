import { readJson } from '@/lib/core/persist';
import { create } from 'zustand';
import type { AppliedUserTheme, AppliedUserThemePreview } from '@/lib/themes/tokens';
import {
  DEFAULT_COLOR_VISION,
  type ColorVisionMode,
  DEFAULT_JELLY_MOTION,
  resolveJellyMotion,
  type JellyMotion,
} from '@/lib/appearance/prefs';
import { colorSchemeForBackground } from '@/lib/appearance/contrast';
import { DEFAULT_FONTS, isFontFor, type FontChoice, type FontSlot } from '@/lib/appearance/fonts';
import { markAppearanceChanged } from '@/lib/appearance/sync-merge';

/**
 * Values applied by hydration or by the account pull are not the user changing their appearance, so they must not
 * move this device's "last changed" time (the most-recent-wins merge, lib/appearance/sync-merge.ts). Wrap those calls.
 */
let stampSuppressed = 0;
export function withoutStamp(fn: () => void): void {
  stampSuppressed++;
  try {
    fn();
  } finally {
    stampSuppressed--;
  }
}
function stamp(): void {
  if (stampSuppressed === 0) markAppearanceChanged();
}

// Each theme carries its document background color (`bg`) alongside its catalog
// metadata so there is ONE source of truth for the theme→background map. Both the
// runtime (Providers.tsx) and the no-flash inline script (app/routes/__root.tsx)
// derive `THEME_BG` from here — adding a theme no longer means editing a
// hand-copied color map in two other files.
//
// The shared site ships one new social-first system in three accessibility
// modes. Retired decorative themes self-heal to the device's edition during hydration.
// Listed in picker order: Day, then Night.
//
// The id `default` names Day (the bare `:root` tokens). It keeps its id because that is the value already persisted
// in `rmh-style` and in `AppearancePreference.style` for everyone who has Day — renaming it would silently move
// those people.
export const SITE_STYLES = [
  { id: 'default', label: 'Day', icon: '☀', group: 'RMH', bg: '#fafafa' },
  { id: 'graphite', label: 'Night', icon: '◐', group: 'RMH', bg: '#0b0d10' },
] as const;

/**
 * A visitor who never chose follows the device (owner, 2026-11-18; it was Night by default from 2026-10-23): Night
 * when the device asks for a dark scheme, Day when it asks for light, and DEFAULT_STYLE — Day — when it says nothing
 * (no `matchMedia`, or a browser that does not answer `prefers-color-scheme`).
 *
 * What is persisted decides it, not any migration code:
 * - `rmh-style` ABSENT (a new visitor, or a browser that never stored one) → the device's edition, re-read on every
 *   load and followed live while the tab is open. Nothing is written: storing the resolved value would freeze it,
 *   and the next flip of the OS setting would be ignored.
 * - `rmh-style` = `default` or `graphite` → that edition, kept. Only choosing a card in the theme picker writes it.
 * - `rmh-style` = an unknown/retired id → removed, so the device decides again.
 * - Signed in: a saved `AppearancePreference.style` wins (seeded pre-paint by `lib/appearance/account-seed.ts`); a
 *   null column follows the device too, and the account sync leaves it null until the visitor chooses.
 *
 * Read by the pre-paint theme step (lib/prepaint/theme.ts), Providers and the store's initial state; never restate it.
 */
export const DEFAULT_STYLE: SiteStyle = 'default';

/** The edition the device asks for: Night for `prefers-color-scheme: dark`, otherwise DEFAULT_STYLE (Day). */
export function deviceStyle(): SiteStyle {
  try {
    return typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia(DARK_SCHEME_QUERY).matches
      ? 'graphite'
      : DEFAULT_STYLE;
  } catch {
    return DEFAULT_STYLE;
  }
}

/** The media query the pre-paint step and `deviceStyle` both ask. */
export const DARK_SCHEME_QUERY = '(prefers-color-scheme: dark)';

export type SiteStyle = (typeof SITE_STYLES)[number]['id'];
/**
 * The edition a bought theme's background belongs to: Night (`graphite`) for a dark ground, Day (`default`) for a
 * light one, by the same WCAG luminance rule that pins `color-scheme`. While a bought theme is on, this — not the
 * stored `style` — is the class on `<html>`, so the globe and everything else that reads `.style-graphite` follows the
 * theme (owner, 2026-11-18). The pre-paint script (`lib/prepaint/theme.ts`) applies the same threshold.
 */
export function editionForBackground(bg: string): SiteStyle {
  return colorSchemeForBackground(bg) === 'dark' ? 'graphite' : 'default';
}

/** Neutral document chrome for full-screen games/apps that own their palette. */
export const APP_THEME_BG = '#0b0b0b';

/**
 * Full-screen routes whose own palette is NOT the near-black `APP_THEME_BG`
 * ground.
 *
 * The pre-paint script paints `APP_THEME_BG` for every excluded route, which is
 * right for a game that is dark and wrong for one that is not: Slice It's light
 * theme was `#e0e5ec`, so opening it painted the document near-black and then
 * flipped to near-white as soon as `.slice-theme` resolved. A full-screen
 * black-to-white flash on every load.
 *
 * Keyed by route prefix. Each entry names the page's own persisted preference so
 * the script can pre-paint the SAME colour that page is about to use:
 *
 * - `key` — the localStorage key the page persists under.
 * - `darkFlag` — the field inside that JSON (zustand `persist` nests it under
 *   `state`) that says which theme is up. A boolean, true when dark, unless
 *   `darkWhen` names a string to compare against.
 * - `darkWhen` — for a page that stores a NAMED theme rather than a boolean
 *   (Temple of Joy stores `theme: 'dawn' | 'vespers'`), the value that means
 *   dark. Without it the field is read as a boolean, which is what every
 *   zustand-backed page here stores.
 * - `dark` / `light` — the two grounds, mirroring the page's own stylesheet.
 * - `defaultDark` — what to assume when nothing is stored. Defaults to TRUE,
 *   because the `--app-*` tier is dark and that is right for most games. A page
 *   that opens light must say so: Temple of Joy opens at Dawn, and assuming dark
 *   for it would pre-paint near-black under a cream page, which is the flash this
 *   map exists to prevent, just in the other direction.
 * - `system` — when nothing is stored yet, ask `prefers-color-scheme` instead of
 *   using `defaultDark`. A page whose default is "follow the OS" must not persist
 *   a resolved flag while it is on that setting, or the stored value goes stale
 *   the moment the OS flips with the tab closed; leaving the flag absent is what
 *   routes it back through the media query on the next load.
 *
 * A page with no entry keeps `APP_THEME_BG`, which is the correct default for
 * the dark `--app-*` tier that most of them use.
 */
export const APP_ROUTE_THEME_BG: Record<
  string,
  {
    key: string;
    darkFlag: string;
    darkWhen?: string;
    dark: string;
    light: string;
    defaultDark?: boolean;
    system?: boolean;
  }
> = {
  // The games library paints Steam's header colour (`--stm-header` in
  // `components/steam/steam.css`) under the page, and is dark in every case.
  '/games': {
    key: 'steam-library-theme',
    darkFlag: 'dark',
    defaultDark: true,
    dark: '#171d25',
    light: '#171d25',
  },
  // Slice It has one theme (`--slice-bg` in `features/slice-it/ui/slice-it.css`),
  // so both grounds are the same navy whatever an older save says. The key and
  // flag stay only because an entry must name them.
  '/slice-it': {
    key: 'slice-it-storage',
    darkFlag: 'isDarkMode',
    defaultDark: true,
    dark: '#0b1241',
    light: '#0b1241',
  },
  // The Dunesday marathon planner. Grounds mirror `--ds-ground` in
  // `components/dunesday/dunesday.css` — Aero sky blue by day, deep night blue
  // with the page's Night toggle on. The toggle lives in the page's own stored
  // plan (`dunesday:v1` → `night`), so the pre-paint script reads it from there.
  '/dunesday': {
    key: 'dunesday:v1',
    darkFlag: 'night',
    // `night: false` in `lib/dunesday/state.ts`, so a first visit is DAY. Without
    // this the pre-paint script took the map's old silent default and painted
    // `#0b1a3a` under a day page — measured Δluma 0.738, every first load, by
    // `testing/e2e/fouc.mjs`.
    defaultDark: false,
    dark: '#0b1a3a',
    // `#1a4f8f`, NOT `--ds-ground` (`#bfe6ff`). The CSS token is the desktop
    // wallpaper's base; what the document itself is painted is whatever
    // `DunesdayOS` passes to `paintDocumentGround`, and the two are different
    // colours. The entry named the wrong one, so correcting the default alone
    // moved the flash rather than removing it (Δluma 0.738 → 0.671). `DunesdayOS`
    // now reads these two values instead of repeating them, so the two cannot
    // drift apart again.
    light: '#1a4f8f',
  },
  // The activity dossier. Grounds mirror `--stk-bg` in
  // `components/sohumtracker/sohumtracker.css` — Discord's app frame in dark, its
  // light theme's chat ground in light. `system: true` because the page follows
  // `prefers-color-scheme` and ships no toggle of its own; `key` is therefore a
  // reserved slot that nothing writes yet, and the lookup falls through to the
  // system preference exactly as intended.
  '/sohumtracker': {
    key: 'sohumtracker-theme',
    darkFlag: 'dark',
    dark: '#1a1b1e',
    light: '#f2f3f5',
    system: true,
  },
  // RMH Music. Grounds mirror `--app-bg` in `components/rmhmusic/rmhmusic.css` —
  // cream notebook paper by day, the deep ink-navy "night manuscript" by night.
  // `system: true`: a first visit follows `prefers-color-scheme`; the header
  // toggle stores `{"dark":true|false}` under this key
  // (`lib/rmhmusic/learn/mode.ts`), and the boolean wins once it is there.
  '/rmhmusic': {
    key: 'rmhmusic-mode',
    darkFlag: 'dark',
    dark: '#0f182b',
    light: '#f6f0e1',
    system: true,
  },
  // Temple of Joy. Grounds mirror `--toj-ground` in
  // `components/temple-of-joy/temple-of-joy.css` — Dawn's cream page and
  // Vespers' near-black one.
  //
  // This entry is the reason `darkWhen` and `defaultDark` exist. The temple is
  // the first page here that stores a NAMED theme (`theme: 'dawn' | 'vespers'`,
  // at the top level of its own save rather than under a zustand `state`) and the
  // first whose default is LIGHT. Without it the pre-paint script painted
  // `APP_THEME_BG` near-black and `useDocumentTheme` in
  // `components/temple-of-joy/hooks.ts` repainted the document cream from an
  // effect — a full-viewport black-to-cream flash on every load, measured at
  // Δluma 0.945 by `testing/e2e/fouc.mjs`. The effect stays: it is the
  // client-navigation path and it restores what it found on the way out. It is
  // now a no-op on a hard load, which is where the flash was.
  '/temple-of-joy': {
    key: 'temple_of_joy_save_v2',
    darkFlag: 'theme',
    darkWhen: 'vespers',
    defaultDark: false,
    dark: '#16130e',
    light: '#fbf9f4',
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
      : entry.defaultDark !== false;
    // Unreadable or non-JSON storage falls through to the default above
    // (readJson never throws: a pre-paint path may not).
    {
      const parsed = readJson<Record<string, unknown> | null>(entry.key, null);
      const state = (parsed?.state ?? parsed) as Record<string, unknown> | null;
      const flag = state?.[entry.darkFlag];
      if (entry.darkWhen !== undefined) {
        if (typeof flag === 'string') dark = flag === entry.darkWhen;
      } else if (typeof flag === 'boolean') {
        dark = flag;
      }
    }
    return { bg: dark ? entry.dark : entry.light, dark };
  }
  return null;
}

/**
 * Paint the document ground and everything pinned to it.
 *
 * Extracted so the two callers cannot drift: `Providers` runs it whenever the
 * theme resolves, and a full-screen page that owns its own light/dark (the
 * Dunesday planner) runs it when the visitor flips that switch — an effect inside the page
 * cannot wait for `Providers`, whose theme effect deliberately does not re-run
 * on a pathname change.
 *
 * `dark` is the app-tier flag the page's own stylesheet keys off; pass null on
 * the site tier, where the style class carries it instead.
 */
export function paintDocumentGround(bg: string, dark: boolean | null): void {
  const html = document.documentElement;
  html.style.backgroundColor = bg;
  // The site tier's ground is the root's: a body fill would paint over the fixed aurora (z-index -1) that the glass
  // refracts. App/game routes keep painting their own body.
  document.body.style.backgroundColor = html.classList.contains('app-route') ? bg : '';

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
  /** The committed site theme. Persisted only once chosen (`styleFromDevice` false). */
  style: SiteStyle;
  /** Choose an edition: stored on the device and, signed in, saved to the account. */
  setStyle: (style: SiteStyle) => void;
  /**
   * True while nothing was chosen and `style` is the device's edition (DEFAULT_STYLE's doc). Providers neither
   * persists nor syncs it then, and follows the device when its scheme changes.
   */
  styleFromDevice: boolean;
  /** Follow the device: set its edition without marking it chosen. */
  followDeviceStyle: (style: SiteStyle) => void;
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
  /**
   * Colour-vision deficiency mode. Retints the three semantic tokens
   * (success/danger/warning) to a palette that stays separable under that
   * deficiency; 'none' leaves the theme untouched. Persisted and
   * account-synced like `style`.
   */
  colorVision: ColorVisionMode;
  setColorVision: (value: ColorVisionMode) => void;
  /**
   * Globe motion (WCAG 2.2.2): `lively` (default) | `still`. Stamped on
   * `html[data-jelly-motion]` (absent when `lively`) by the pre-paint script and
   * Providers; cached in localStorage (`rmh-jelly-motion`) and synced to the account.
   */
  jellyMotion: JellyMotion;
  setJellyMotion: (value: JellyMotion) => void;
  /**
   * The reader's fonts (lib/appearance/fonts.ts): main, reading and mono. Stamped on <html> as `data-font-*` (absent
   * for a default), cached in localStorage and the `rmh-fonts` cookie, and synced to the account while sync is on.
   */
  fonts: FontChoice;
  setFont: <S extends FontSlot>(slot: S, id: FontChoice[S]) => void;
  /** Appearance sync for THIS device (owner, 2026-11-23): off = neither pull nor push appearance. */
  appearanceSync: boolean;
  setAppearanceSync: (on: boolean) => void;
  /**
   * True once Providers has read this device's stored appearance into the store. Until then the store holds defaults,
   * so effects that write appearance back (fonts, the sync switch) and readers that prefer the store over the server's
   * render wait for it. A flag rather than a first-run skip: React's dev double effects defeat a first-run ref.
   */
  appearanceHydrated: boolean;
  markAppearanceHydrated: () => void;

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
  setStyle: (style) => {
    stamp();
    set({ style, styleFromDevice: false, userThemePreview: null });
  },
  styleFromDevice: true,
  followDeviceStyle: (style) => set({ style, styleFromDevice: true }),
  fontScale: null,
  setFontScale: (fontScale) => set({ fontScale }),
  density: null,
  setDensity: (density) => set({ density }),
  readableFont: false,
  setReadableFont: (readableFont) => {
    stamp();
    set({ readableFont });
  },
  colorVision: DEFAULT_COLOR_VISION,
  setColorVision: (colorVision) => {
    stamp();
    set({ colorVision });
  },
  jellyMotion: DEFAULT_JELLY_MOTION,
  setJellyMotion: (jellyMotion) => {
    stamp();
    set({ jellyMotion: resolveJellyMotion(jellyMotion) });
  },
  fonts: DEFAULT_FONTS,
  setFont: (slot, id) => {
    if (!isFontFor(slot, id)) return;
    if (useThemeStore.getState().fonts[slot] === id) return;
    stamp();
    set((st) => ({ fonts: { ...st.fonts, [slot]: id } }));
  },
  appearanceSync: true,
  setAppearanceSync: (appearanceSync) => set({ appearanceSync }),
  appearanceHydrated: false,
  markAppearanceHydrated: () => set({ appearanceHydrated: true }),
  userTheme: null,
  // Applying/removing an owned theme also clears any transient preview.
  setUserTheme: (userTheme) => set({ userTheme, userThemePreview: null }),
  userThemePreview: null,
  setUserThemePreview: (userThemePreview) => set({ userThemePreview }),
}));

/** localStorage key for the applied marketplace user theme (§14 no-flash cache). */
export const USER_THEME_KEY = 'rmh-user-theme';
