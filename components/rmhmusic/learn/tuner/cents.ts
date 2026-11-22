/**
 * The tuner's and the note reader's one way of writing cents: "−12 cents", "+1 cent", "0 cents",
 * with a real minus sign and the plural from the count (`tuner-cents-count_one` / `_other`; `count`
 * is the size, so "−1 cent" too). The call names its namespace (`ns`): this file has no
 * `useTranslation` of its own, so the extractor would otherwise file the key elsewhere.
 */
import type { TFunction } from 'i18next';

export function centsText(t: TFunction, cents: number): string {
  const n = Math.round(cents) || 0;
  const signed = n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0';
  return t('tuner-cents-count', {
    ns: 'c-rmhmusic',
    count: Math.abs(n),
    cents: signed,
    defaultValue_one: '{{cents}} cent',
    defaultValue: '{{cents}} cents',
  });
}
