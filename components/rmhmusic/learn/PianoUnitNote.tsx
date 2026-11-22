/**
 * A line above a bass clef lesson for a guitarist who reached it by a link: the unit is on the piano
 * path only, because guitar music is written in the treble clef, an octave above where it sounds. The
 * lesson still runs (nothing here is locked). The bass clef unit's only prose outside the cards' text
 * alternatives (`staff-spot-text.ts`); the namespace is `bass-clef`.
 */
import { useTranslation } from 'react-i18next';

export function PianoUnitNote() {
  const { t } = useTranslation('bass-clef');
  return (
    <p className="mb-4 text-center text-sm leading-5 text-app-text-muted">
      {t('guitar-note', {
        defaultValue:
          'This unit is for piano. Guitar music is written in the treble clef, an octave above where it sounds, so you can skip it.',
      })}
    </p>
  );
}
