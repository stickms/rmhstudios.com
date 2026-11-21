/**
 * The theme editor's contrast-gate pair names, translated.
 *
 * `lintThemeContrast` in `lib/themes/tokens.ts` names each failing pair; a key
 * built from that name (`contrast-${pair}`) is invisible to
 * `pnpm i18n:extract`. Each known pair is written out here as a literal call;
 * the editor shows a pair this map does not know by its raw name.
 * `components/themes/__tests__/contrast-labels.test.ts` holds the map equal to
 * the pairs the gate can report.
 */
import type { TFunction } from 'i18next';

/** Translated name per contrast pair (namespace `theme-studio`). */
export function contrastPairLabels(t: TFunction): Record<string, string> {
  return {
    'text-on-glass': t('contrast-text-on-glass', { ns: 'theme-studio', defaultValue: 'Text on glass' }),
    'muted-on-glass': t('contrast-muted-on-glass', { ns: 'theme-studio', defaultValue: 'Muted text on glass' }),
    'accentFg-on-accent': t('contrast-accentFg-on-accent', {
      ns: 'theme-studio',
      defaultValue: 'Accent label on accent',
    }),
  };
}
