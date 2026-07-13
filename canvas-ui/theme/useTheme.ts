/**
 * Live theme tokens for canvas scenes.
 *
 * Subscribes to the existing site theme store (`stores/themeStore.ts`) —
 * style, hover preview, and accent override — and returns the resolved
 * `ThemeTokens` object canvas widgets draw with. The same store drives the
 * residual DOM's `style-*` class, so canvas and DOM can never disagree.
 */

import { useMemo } from "react";
import { useThemeStore } from "@/stores/themeStore";
import { THEME_TOKENS, type ThemeTokens } from "./tokens";
import { applyAccentToTokens } from "./accents";

export function useTheme(): ThemeTokens {
  const style = useThemeStore((s) => s.preview ?? s.style);
  const accent = useThemeStore((s) => s.accent);
  return useMemo(() => applyAccentToTokens(THEME_TOKENS[style], accent), [style, accent]);
}

/** Non-hook accessor for imperative code (tweens, event handlers). */
export function getThemeTokens(): ThemeTokens {
  const { style, preview, accent } = useThemeStore.getState();
  return applyAccentToTokens(THEME_TOKENS[preview ?? style], accent);
}
