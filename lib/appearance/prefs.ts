/**
 * Appearance & accessibility comfort preferences (§13) — client-safe shared
 * constants, DOM appliers, and localStorage keys used by the store, the
 * Providers runtime, the settings panel, and the sync API.
 *
 * NOTE — this module must stay zod-free; the request schema lives next door in
 * `./prefs-schema`. `Providers.tsx` and `__root.tsx` both import constants from
 * here on every page, and because zod builds schemas by CALLING `z.object(...)`
 * at module scope, rolldown cannot prove those calls side-effect-free and drop
 * them. One `import { z }` here therefore put **69.7 KB of zod on the client
 * critical path of every route** to validate a settings PATCH body that only
 * `/api/preferences/appearance` ever receives.
 */

import { NAV_TRANSITIONS, type NavTransition } from '@/lib/eversion/types';

export const FONT_SCALES = [875, 1000, 1125, 1250] as const;
export type FontScale = (typeof FONT_SCALES)[number];
export const DEFAULT_FONT_SCALE = 1000;

export const DENSITIES = ['cozy', 'compact'] as const;
export type Density = (typeof DENSITIES)[number];

export const HEX_RE = /^#[0-9a-fA-F]{6}$/;

// ── Colour-vision deficiency modes ──────────────────────────────────────────
// The accessibility suite already covers contrast, motion, transparency,
// density, text size and dyslexia-friendly type — but had no colour-vision
// axis, on a site where colour IS state (win/loss, up/down, rarity, health,
// leaderboard deltas, moderation status). Roughly 8% of men and 0.5% of women
// have some colour-vision deficiency, so this is the largest single group the
// suite was missing.
//
// Each mode retints the three semantic tokens (`--site-success`,
// `--site-danger`, `--site-warning`) to a palette whose members stay separable
// under that deficiency:
//   - deuteranopia / protanopia (red–green): success becomes BLUE and warning a
//     high-lightness amber, so the three differ in hue AND lightness rather
//     than relying on a red/green contrast the viewer cannot see.
//   - tritanopia (blue–yellow): red and green are seen normally, so those stay;
//     the yellow warning becomes magenta, which blue–yellow deficiency does not
//     collapse.
//
// The retint alone is not sufficient — colour must never be the ONLY carrier of
// meaning — which is why `components/ui/badge.tsx` also pairs each status
// variant with a distinct glyph.
export const COLOR_VISION_MODES = ['none', 'deuteranopia', 'protanopia', 'tritanopia'] as const;
export type ColorVisionMode = (typeof COLOR_VISION_MODES)[number];
export const DEFAULT_COLOR_VISION: ColorVisionMode = 'none';

/** Labels for the settings UI (already English; callers translate). */
export const COLOR_VISION_LABELS: Record<ColorVisionMode, string> = {
  none: 'Standard',
  deuteranopia: 'Deuteranopia',
  protanopia: 'Protanopia',
  tritanopia: 'Tritanopia',
};

/** Short explanation shown under each option. */
export const COLOR_VISION_HINTS: Record<ColorVisionMode, string> = {
  none: 'The default palette.',
  deuteranopia: 'Red–green (most common). Success turns blue.',
  protanopia: 'Red–green, reduced red sensitivity. Success turns blue.',
  tritanopia: 'Blue–yellow. Warnings turn magenta.',
};

export function isColorVisionMode(v: unknown): v is ColorVisionMode {
  return typeof v === 'string' && (COLOR_VISION_MODES as readonly string[]).includes(v);
}

/**
 * Apply a mode to <html> (pre-paint safe; DOM only). `none` removes the
 * attribute entirely so the untouched theme cascade applies.
 */
export function applyColorVision(html: HTMLElement, mode: ColorVisionMode) {
  if (mode === 'none') html.removeAttribute('data-color-vision');
  else html.setAttribute('data-color-vision', mode);
}

// ── Glass clarity slider (§5.46) ─────────────────────────────────────────────
// One axis, five stops: 0 Opaque · 1 Calm · 2 Default · 3 Airy · 4 Clear.
// Stop 0 IS the reduce-transparency mechanism (html.reduce-transparency) — the
// slider owns that class. Stops 1/3/4 set two inline factors on <html> that the
// glass classes consume; stop 2 is the shipped default (no class, no vars).
export const GLASS_LEVEL_KEY = 'rmh-glass-level';
export const DEFAULT_GLASS_LEVEL = 2;
export const GLASS_LEVELS = [0, 1, 2, 3, 4] as const;
export type GlassLevel = (typeof GLASS_LEVELS)[number];

/** Per-stop inline factors. `null` = no vars (stop 0 uses the class; stop 2 = base). */
export const GLASS_LEVEL_VARS: Record<number, { blur: number; tint: number } | null> = {
  0: null,
  1: { blur: 1.25, tint: 1.35 },
  2: null,
  3: { blur: 0.65, tint: 0.75 },
  4: { blur: 0.35, tint: 0.5 },
};

export function isGlassLevel(v: unknown): v is GlassLevel {
  return typeof v === 'number' && GLASS_LEVELS.includes(v as GlassLevel);
}

/**
 * Apply a clarity stop to <html> (pre-paint safe; DOM only). Stop 0 adds the
 * reduce-transparency class (the slider is now that class's sole owner); other
 * stops remove it and set/clear the two user factors. Persistence and the OS /
 * high-contrast / perf-lite overrides live elsewhere (they win regardless).
 */
export function applyGlassLevel(html: HTMLElement, level: number) {
  const opaque = level === 0;
  html.classList.toggle('reduce-transparency', opaque);
  const vars = opaque ? null : GLASS_LEVEL_VARS[level];
  if (vars) {
    html.style.setProperty('--glass-user-blur', String(vars.blur));
    html.style.setProperty('--glass-user-tint', String(vars.tint));
  } else {
    html.style.removeProperty('--glass-user-blur');
    html.style.removeProperty('--glass-user-tint');
  }
}

// ── Navigation transition (globe eversion, spec §9.3) ───────────────────────
// Which projection the page-to-page eversion uses, or `random` (a fresh draw
// per navigation). The value list is owned by the eversion contract so the API
// enum, the select and the controller can never disagree; it is re-exported here
// because this module is the one the store and the no-flash cache import.
// `lib/eversion/types.ts` imports nothing at runtime, so this stays zod-free
// and adds nothing to the client critical path.
//
// The default is Mercator (amended 2026-10-19; it was `random`): the owner asked
// for "a better projection of the page onto the sphere". Mercator is conformal, so
// every letter keeps its shape on the globe (only its size grows toward the
// poles), the page wraps round the globe like a wall map onto a globe, and it is
// the same every time. Equirectangular - what NASA's globe textures use - stretches
// text sideways; Peirce and the azimuthal maps fold the page into petals and
// wedges. A visitor who chose another keeps it.
export const DEFAULT_NAV_TRANSITION: NavTransition = 'mercator';
export { NAV_TRANSITIONS };
export type { NavTransition };

export function isNavTransition(v: unknown): v is NavTransition {
  return typeof v === 'string' && (NAV_TRANSITIONS as readonly string[]).includes(v);
}

/** An absent or unknown stored value means the default, never an error. */
export function resolveNavTransition(v: unknown): NavTransition {
  return isNavTransition(v) ? v : DEFAULT_NAV_TRANSITION;
}

// ── Eversion level (amended 2026-10-21) ─────────────────────────────────────
// How much of the site the Globe Eversion carries: `all` (default) = every
// page transition (full-screen from the liquid-globe hub; anywhere else the
// pressed control plays a button-sized eversion and the navigation is never
// held); `globe` = only a navigation confirmed through the liquid-globe hub
// (hold-release, pin click, Enter). Page navigations only: the per-control
// "evert every button/input" state animation is a different thing and not
// governed by this. Defined here (not in lib/eversion) so the root's static
// closure and the settings panel get it without touching the effect's runtime.
export const EVERSION_LEVELS = ['all', 'globe'] as const;
export type EversionLevel = (typeof EVERSION_LEVELS)[number];
export const DEFAULT_EVERSION_LEVEL: EversionLevel = 'all';

export function isEversionLevel(v: unknown): v is EversionLevel {
  return typeof v === 'string' && (EVERSION_LEVELS as readonly string[]).includes(v);
}

/** An absent or unknown stored value means the default, never an error. */
export function resolveEversionLevel(v: unknown): EversionLevel {
  return isEversionLevel(v) ? v : DEFAULT_EVERSION_LEVEL;
}

export const FONT_SCALE_KEY = 'rmh-font-scale';
export const DENSITY_KEY = 'rmh-density';
export const READABLE_FONT_KEY = 'rmh-readable-font';
export const CUSTOM_ACCENT_KEY = 'rmh-custom-accent';
export const REDUCE_MOTION_KEY = 'rmh-reduce-motion';
export const COLOR_VISION_KEY = 'rmh-color-vision';
export const NAV_TRANSITION_KEY = 'rmh-nav-transition';
/** Eversion level: cached as 'globe' when set, absent when 'all' (the default). */
export const EVERSION_LEVEL_KEY = 'rmh-eversion-level';
/** "Always evert globe": cached as '1' when on, absent when off (the default). */
export const ALWAYS_EVERT_GLOBE_KEY = 'rmh-always-evert-globe';
