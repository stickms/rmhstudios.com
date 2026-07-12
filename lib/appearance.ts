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
 * The accent palette. Each `fg` is chosen (black vs. white) for legible contrast
 * on its `value`. Ordered roughly around the wheel. Not exhaustive — a deliberate,
 * on-brand spread. `null` accent (no entry here) means "use the theme's own
 * accent", which the picker surfaces as the "Theme default" tile.
 */
export const ACCENT_PRESETS = [
  { id: 'violet', label: 'Violet', value: '#8b5cf6', fg: '#ffffff' },
  { id: 'indigo', label: 'Indigo', value: '#6366f1', fg: '#ffffff' },
  { id: 'blue', label: 'Blue', value: '#3b82f6', fg: '#ffffff' },
  { id: 'sky', label: 'Sky', value: '#0ea5e9', fg: '#ffffff' },
  { id: 'cyan', label: 'Cyan', value: '#06b6d4', fg: '#00131a' },
  { id: 'teal', label: 'Teal', value: '#14b8a6', fg: '#00201c' },
  { id: 'emerald', label: 'Emerald', value: '#10b981', fg: '#00231a' },
  { id: 'lime', label: 'Lime', value: '#84cc16', fg: '#12210a' },
  { id: 'amber', label: 'Amber', value: '#f59e0b', fg: '#231600' },
  { id: 'orange', label: 'Orange', value: '#f97316', fg: '#200c00' },
  { id: 'rose', label: 'Rose', value: '#f43f5e', fg: '#ffffff' },
  { id: 'pink', label: 'Pink', value: '#ec4899', fg: '#ffffff' },
  { id: 'fuchsia', label: 'Fuchsia', value: '#d946ef', fg: '#ffffff' },
  { id: 'red', label: 'Red', value: '#ef4444', fg: '#ffffff' },
] as const satisfies readonly AccentPreset[];

export type AccentId = (typeof ACCENT_PRESETS)[number]['id'];

/** id → preset lookup, also the compact map serialized into the no-flash script. */
export const ACCENT_MAP: Record<string, { value: string; fg: string }> = Object.fromEntries(
  ACCENT_PRESETS.map((a) => [a.id, { value: a.value, fg: a.fg }])
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
  };
}

const ACCENT_VAR_NAMES = ['--site-accent', '--site-accent-fg', '--site-accent-hover', '--site-accent-dim'];

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
