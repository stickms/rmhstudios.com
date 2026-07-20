/**
 * Theme Studio — publish gate (§14). A theme must be legible before it can be
 * sold: the key text/surface pairs must pass WCAG AA. Reuses the §13 contrast
 * math. Client-safe (used by the editor for inline lint and the API).
 */
import { contrastRatio } from '@/lib/appearance/contrast';
import type { ThemeTokens } from '@/lib/themes/tokens';

const AA = 4.5;
const AA_LARGE = 3; // headings/large text

export interface ThemeLintIssue {
  pair: string;
  ratio: number;
  need: number;
}

/** Returns the failing contrast pairs (empty = passes the gate). */
export function lintThemeContrast(tokens: ThemeTokens): ThemeLintIssue[] {
  const checks: { pair: string; a: string; b: string; need: number }[] = [
    { pair: 'text-on-surface', a: tokens.text, b: tokens.surface, need: AA },
    { pair: 'text-on-bg', a: tokens.text, b: tokens.bg, need: AA },
    { pair: 'muted-on-surface', a: tokens.textMuted, b: tokens.surface, need: AA_LARGE },
    { pair: 'accentFg-on-accent', a: tokens.accentFg, b: tokens.accent, need: AA },
  ];
  const issues: ThemeLintIssue[] = [];
  for (const c of checks) {
    const ratio = Math.round(contrastRatio(c.a, c.b) * 10) / 10;
    if (ratio < c.need) issues.push({ pair: c.pair, ratio, need: c.need });
  }
  return issues;
}

export function canPublish(tokens: ThemeTokens): boolean {
  return lintThemeContrast(tokens).length === 0;
}
