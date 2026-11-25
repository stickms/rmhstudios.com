/**
 * The four pads' spoken names. Each is a literal call so the extractor sees it
 * (a key built at run time never reaches `locales/en/sequence-sam.json`).
 */
import type { TFunction } from 'i18next';

export function padName(t: TFunction, pad: number): string {
  switch (pad) {
    case 0:
      return t('pad-circle', { ns: 'sequence-sam', defaultValue: 'Circle' });
    case 1:
      return t('pad-square', { ns: 'sequence-sam', defaultValue: 'Square' });
    case 2:
      return t('pad-triangle', { ns: 'sequence-sam', defaultValue: 'Triangle' });
    default:
      return t('pad-diamond', { ns: 'sequence-sam', defaultValue: 'Diamond' });
  }
}

/** One low-to-high tone per pad (C4, E4, G4, C5). */
export const PAD_TONES_HZ = [262, 330, 392, 523] as const;
