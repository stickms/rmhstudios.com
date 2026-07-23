/**
 * Appearance customization: the curated accent-color palette and the helpers
 * that apply it on top of any theme.
 *
 * A theme (see `stores/themeStore.ts`) sets the whole `--site-*` token contract;
 * an accent preset is a lighter-touch override that swaps just the accent tokens
 * (`--site-accent` and its derived hover/dim/fg) so a user can keep a theme they
 * like but recolor its highlights. Accents are a *curated* set rather than a free
 * color wheel so every option ships a known-good foreground contrast — no user can
 * pick an accent that makes button labels unreadable.
 *
 * This module is framework-agnostic (no React) so it can be used from the Zustand
 * store, the Providers effect, and — via `ACCENT_MAP` — serialized into the
 * no-flash inline script in `app/routes/__root.tsx`. Keeping the palette here as
 * the single source of truth means adding an accent never means editing the inline
 * script by hand.
 */

/** One selectable accent. `fg` is the text/icon color that sits on the accent. */
export interface AccentPreset {
  id: string;
  label: string;
  /** The accent color (`--site-accent`). */
  value: string;
  /** Readable foreground on top of `value` (`--site-accent-fg`). */
  fg: string;
}

/**
 * The accent palette is intentionally monochrome. Each foreground is chosen for
 * legible contrast on its value. `null` means "use the theme's own accent".
 */
export const ACCENT_PRESETS = [
  { id: 'ink', label: 'Ink', value: '#0b0b0b', fg: '#ffffff' },
  { id: 'graphite', label: 'Graphite', value: '#343432', fg: '#ffffff' },
  { id: 'slate', label: 'Slate', value: '#62625e', fg: '#ffffff' },
  { id: 'stone', label: 'Stone', value: '#a7a69f', fg: '#111111' },
  { id: 'paper', label: 'Paper', value: '#e8e8e3', fg: '#111111' },
  { id: 'white', label: 'White', value: '#ffffff', fg: '#111111' },
] as const satisfies readonly AccentPreset[];

export type AccentId = (typeof ACCENT_PRESETS)[number]['id'];

/** id → preset lookup, also the compact map serialized into the no-flash script. */
export const ACCENT_MAP: Record<string, { value: string; fg: string }> = Object.fromEntries(
  ACCENT_PRESETS.map((a) => [a.id, { value: a.value, fg: a.fg }]),
);

/** Narrow an arbitrary string (from storage / the API) to a known accent id. */
export function isAccentId(id: string | null | undefined): id is AccentId {
  return !!id && id in ACCENT_MAP;
}

export function getAccentPreset(id: string | null | undefined): AccentPreset | null {
  if (!isAccentId(id)) return null;
  return ACCENT_PRESETS.find((a) => a.id === id) ?? null;
}

/** The `--site-*` CSS variables an accent override sets, given a base color. */
export function accentCssVars(value: string, fg: string): Record<string, string> {
  return {
    '--site-accent': value,
    '--site-accent-fg': fg,
    // Derived so a single picked color restyles hover + translucent states too,
    // matching how the built-in themes define these tokens.
    '--site-accent-hover': `color-mix(in oklab, ${value} 82%, #000)`,
    '--site-accent-dim': `color-mix(in oklab, ${value} 15%, transparent)`,
    // The glass pointer light multiplies with the accent so an accent choice
    // subtly warms the specular highlight (§3.4). Mixed against a neutral white
    // base rather than var(--site-glass-light) to avoid a self-referential cycle.
    '--site-glass-light': `color-mix(in srgb, ${value} 20%, rgba(255, 255, 255, 0.14))`,
    // The viewport-anchored rim glint (v2 §4.2) warms the same way the pointer
    // light does: mostly the theme's rim with a touch of accent. Default (no
    // preset) resolves to the plain rim via the token declared in globals.css.
    '--site-glass-glint': `color-mix(in srgb, ${value} 18%, var(--site-glass-rim))`,
  };
}

const ACCENT_VAR_NAMES = [
  '--site-accent',
  '--site-accent-fg',
  '--site-accent-hover',
  '--site-accent-dim',
  '--site-glass-light',
  '--site-glass-glint',
];

/** Apply an accent id's tokens to an element (usually <html>), or clear them. */
export function applyAccent(el: HTMLElement, id: string | null | undefined): void {
  const preset = getAccentPreset(id);
  if (!preset) {
    clearAccent(el);
    return;
  }
  const vars = accentCssVars(preset.value, preset.fg);
  for (const [name, val] of Object.entries(vars)) el.style.setProperty(name, val);
}

/** Remove any accent override so the active theme's own accent shows through. */
export function clearAccent(el: HTMLElement): void {
  for (const name of ACCENT_VAR_NAMES) el.style.removeProperty(name);
}

/** localStorage key holding the chosen accent id (the no-flash cache). */
export const ACCENT_STORAGE_KEY = 'rmh-accent';
