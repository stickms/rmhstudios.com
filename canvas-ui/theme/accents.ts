/**
 * Accent resolution for canvas themes.
 *
 * The DOM pipeline applies accents by setting `--site-accent*` CSS variables
 * with `color-mix()` derivations (`lib/appearance.ts#accentCssVars`). The
 * canvas pipeline resolves the same derivations in JS via `mixOklab` so a
 * picked accent produces identical hover/dim colors on canvas and in the
 * residual DOM.
 */

import { ACCENT_PRESETS, getAccentPreset } from "@/lib/appearance";
import { mixOklab } from "./color";
import type { ThemeTokens } from "./tokens";

export { ACCENT_PRESETS };

export interface ResolvedAccent {
  accent: string;
  accentFg: string;
  accentHover: string;
  accentDim: string;
}

/** Compute the four accent tokens for a preset id (null → theme default). */
export function resolveAccent(id: string | null | undefined): ResolvedAccent | null {
  const preset = getAccentPreset(id);
  if (!preset) return null;
  return {
    accent: preset.value,
    accentFg: preset.fg,
    // Mirrors accentCssVars(): color-mix(in oklab, value 82%, #000) and
    // color-mix(in oklab, value 15%, transparent).
    accentHover: mixOklab(preset.value, 0.82, "#000"),
    accentDim: mixOklab(preset.value, 0.15, "transparent"),
  };
}

/** Overlay an accent (if any) onto a theme's token set. */
export function applyAccentToTokens(tokens: ThemeTokens, accentId: string | null | undefined): ThemeTokens {
  const accent = resolveAccent(accentId);
  if (!accent) return tokens;
  return { ...tokens, ...accent };
}
