/**
 * The theme editor's contrast-gate pair names are literal `t()` calls (so
 * `pnpm i18n:extract` sees them). A pair added to `lintThemeContrast` without
 * an entry here would ship untranslated in every locale but English; the editor
 * shows a pair the map does not know by its raw name.
 */
import { describe, expect, it } from 'vitest';
import { englishByKey, recordingT } from '@/lib/__tests__/i18n-label-recorder';
import { contrastPairLabels } from '@/components/themes/contrast-labels';
import { DEFAULT_THEME_TOKENS, lintThemeContrast } from '@/lib/themes/tokens';

/** Every pair the gate can report: a theme of one flat colour, text and accent included, fails each check. */
function reportablePairs(): string[] {
  const pairs = new Set<string>();
  for (const colour of ['#000000', '#ffffff']) {
    const flat = {
      ...DEFAULT_THEME_TOKENS,
      text: colour,
      textMuted: colour,
      accent: colour,
      accentFg: colour,
      canvasBase: colour,
      glow1: colour,
      glow2: colour,
      glow3: colour,
      tint: colour,
    };
    for (const issue of lintThemeContrast(flat)) pairs.add(issue.pair);
  }
  return [...pairs];
}

describe('contrast pair labels', () => {
  it('covers every pair the contrast gate reports', () => {
    const { t, calls } = recordingT();
    const labels = contrastPairLabels(t);
    expect(Object.keys(labels).sort()).toEqual(reportablePairs().sort());
    expect(Object.keys(englishByKey(calls)).sort()).toEqual(Object.keys(labels).map((p) => `contrast-${p}`).sort());
    expect(new Set(calls.map((c) => c.ns))).toEqual(new Set(['theme-studio']));
  });

  it('keeps the English the editor has always shown', () => {
    const { t } = recordingT();
    expect(contrastPairLabels(t)).toEqual({
      'text-on-glass': 'Text on glass',
      'muted-on-glass': 'Muted text on glass',
      'accentFg-on-accent': 'Accent label on accent',
    });
  });
});
