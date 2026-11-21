/**
 * The colour-vision modes' names and hints, translated.
 *
 * `COLOR_VISION_MODES` in `lib/appearance/prefs.ts` is the list; a key built
 * from a mode (`color-vision-${mode}`) is invisible to `pnpm i18n:extract`, so
 * these strings never reached `locales/en/settings-appearance.json`. Each one
 * is written out here as a literal call instead, with the English that
 * `COLOR_VISION_LABELS` and `COLOR_VISION_HINTS` carry;
 * `components/settings/__tests__/color-vision-labels.test.ts` holds them equal.
 */
import type { TFunction } from 'i18next';
import type { ColorVisionMode } from '@/lib/appearance/prefs';

export interface ColorVisionText {
  label: string;
  hint: string;
}

/** Translated name and hint per colour-vision mode (namespace `settings-appearance`). */
export function colorVisionText(t: TFunction): Record<ColorVisionMode, ColorVisionText> {
  return {
    none: {
      label: t('color-vision-none', { ns: 'settings-appearance', defaultValue: 'Standard' }),
      hint: t('color-vision-none-hint', { ns: 'settings-appearance', defaultValue: 'The default palette.' }),
    },
    deuteranopia: {
      label: t('color-vision-deuteranopia', { ns: 'settings-appearance', defaultValue: 'Deuteranopia' }),
      hint: t('color-vision-deuteranopia-hint', {
        ns: 'settings-appearance',
        defaultValue: 'Red–green (most common). Success turns blue.',
      }),
    },
    protanopia: {
      label: t('color-vision-protanopia', { ns: 'settings-appearance', defaultValue: 'Protanopia' }),
      hint: t('color-vision-protanopia-hint', {
        ns: 'settings-appearance',
        defaultValue: 'Red–green, reduced red sensitivity. Success turns blue.',
      }),
    },
    tritanopia: {
      label: t('color-vision-tritanopia', { ns: 'settings-appearance', defaultValue: 'Tritanopia' }),
      hint: t('color-vision-tritanopia-hint', {
        ns: 'settings-appearance',
        defaultValue: 'Blue–yellow. Warnings turn magenta.',
      }),
    },
  };
}
