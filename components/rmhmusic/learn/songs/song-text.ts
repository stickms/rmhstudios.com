/**
 * Words for the songbook that are not proper names. A composer's name (Beethoven, Petzold) is shown
 * as the catalogue writes it; "Traditional" and its notes of origin are words, so they are
 * translated.
 */
import type { useTranslation } from 'react-i18next';

type T =
  ReturnType<
    typeof useTranslation
  >['t'];

export function composerName(
  t: T,
  composer: string,
): string {
  switch (
    composer
  ) {
    case 'Traditional':
      return t(
        'song-composer-traditional',
        {
          ns: 'c-rmhmusic',
          defaultValue:
            'Traditional',
        },
      );
    case 'Traditional (French)':
      return t(
        'song-composer-traditional-french',
        {
          ns: 'c-rmhmusic',
          defaultValue:
            'Traditional (French)',
        },
      );
    case 'Traditional (German)':
      return t(
        'song-composer-traditional-german',
        {
          ns: 'c-rmhmusic',
          defaultValue:
            'Traditional (German)',
        },
      );
    default:
      return composer;
  }
}
