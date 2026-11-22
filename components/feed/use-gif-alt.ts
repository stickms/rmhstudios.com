import { useTranslation } from 'react-i18next';
import { gifAltOrNull } from '@/lib/feed/gif-alt';

/**
 * The alt text for a GIF: its description when it has one, otherwise the translated word "GIF" (a screen reader says
 * what it is rather than "Embedded image"). The fallback is its own key in `gif-descriptions`, never a new default on
 * the shipped `embedded-image-alt`.
 */
export function useGifAlt(): (gifAlt: string | null | undefined) => string {
  const { t } = useTranslation('gif-descriptions');
  const fallback = t('gif-fallback-alt', { defaultValue: 'GIF' });
  return (gifAlt) => gifAltOrNull(gifAlt) ?? fallback;
}
