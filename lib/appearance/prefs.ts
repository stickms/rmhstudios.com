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

export const FONT_SCALE_KEY = 'rmh-font-scale';
export const DENSITY_KEY = 'rmh-density';
export const READABLE_FONT_KEY = 'rmh-readable-font';
export const CUSTOM_ACCENT_KEY = 'rmh-custom-accent';
export const COLOR_VISION_KEY = 'rmh-color-vision';

// ── Globe motion ────────────────────────────────────────────────────────────
// The WCAG 2.2.2 control for the one ambient motion Steel has: the globe's idle drift (`lib/globe/view.ts`), and the
// ambient canvases of the games that read it (`motionStill`). `lively` (default) lets it drift; `still` stops it.
// The name and the `html[data-jelly-motion]` attribute are kept from the control this replaces, so a stored choice,
// the account column and every reader keep working. A stored `calm` (the retired middle level) reads as `lively`.
//
// Contract: the attribute is present ONLY when the value is not the default (`lively`), the same as
// `data-color-vision` / `data-density`; the localStorage key is likewise written only for a non-default value.
export const JELLY_MOTION_LEVELS = ['lively', 'still'] as const;
export type JellyMotion = (typeof JELLY_MOTION_LEVELS)[number];
export const DEFAULT_JELLY_MOTION: JellyMotion = 'lively';

/** True while `html[data-jelly-motion='still']`: the visitor stopped ambient motion (WCAG 2.2.2). */
export function motionStill(
  doc: Document | undefined = typeof document === 'undefined' ? undefined : document,
): boolean {
  return doc?.documentElement.getAttribute('data-jelly-motion') === 'still';
}

export function isJellyMotion(v: unknown): v is JellyMotion {
  return typeof v === 'string' && (JELLY_MOTION_LEVELS as readonly string[]).includes(v);
}

/** An absent or unknown stored value means the default, never an error. */
export function resolveJellyMotion(v: unknown): JellyMotion {
  return isJellyMotion(v) ? v : DEFAULT_JELLY_MOTION;
}

/** Stamp the level on <html> (pre-paint safe; DOM only). Default removes it. */
export function applyJellyMotion(html: HTMLElement, value: JellyMotion) {
  if (value === DEFAULT_JELLY_MOTION) html.removeAttribute('data-jelly-motion');
  else html.setAttribute('data-jelly-motion', value);
}

/** Globe motion: cached only when not 'lively' (the default). */
export const JELLY_MOTION_KEY = 'rmh-jelly-motion';
