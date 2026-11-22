/**
 * The bass clef unit's words for a note's place on a staff, for a card's text alternative: "Bass staff,
 * second line", "Grand staff, treble staff, first ledger line below the staff". The place is what the
 * drawing says, so a learner who cannot see it hears it; the pure `staffSpot` (`grand-staff-layout.ts`)
 * decides where, and this names it. Every key is literal, in the `bass-clef` namespace.
 */
import { useTranslation } from 'react-i18next';
import { staffSpot } from '@/lib/rmhmusic/learn/grand-staff-layout';
import type { Clef } from '@/lib/rmhmusic/learn/theory/clef';

export interface StaffSpotText {
  /** "Bass staff, second line": the asking card, which must not say the note. */
  place: (staff: Clef, step: number, grand: boolean) => string;
  /** "E4, treble staff, first line": the answered card. */
  named: (note: string, staff: Clef, step: number, grand: boolean) => string;
}

export function useStaffSpotText(): StaffSpotText {
  const { t } = useTranslation('bass-clef');

  const staffName = (staff: Clef): string =>
    staff === 'bass'
      ? t('staff-bass', { defaultValue: 'Bass staff' })
      : t('staff-treble', { defaultValue: 'Treble staff' });

  const spotName = (step: number): string => {
    const spot = staffSpot(step);
    switch (spot.kind) {
      case 'line':
        switch (spot.n) {
          case 1:
            return t('spot-line-1', { defaultValue: 'first line' });
          case 2:
            return t('spot-line-2', { defaultValue: 'second line' });
          case 3:
            return t('spot-line-3', { defaultValue: 'third line' });
          case 4:
            return t('spot-line-4', { defaultValue: 'fourth line' });
          default:
            return t('spot-line-5', { defaultValue: 'fifth line' });
        }
      case 'space':
        switch (spot.n) {
          case 1:
            return t('spot-space-1', { defaultValue: 'first space' });
          case 2:
            return t('spot-space-2', { defaultValue: 'second space' });
          case 3:
            return t('spot-space-3', { defaultValue: 'third space' });
          default:
            return t('spot-space-4', { defaultValue: 'fourth space' });
        }
      case 'ledger-line':
        if (spot.side === 'below')
          return spot.n === 1
            ? t('spot-ledger-below-1', { defaultValue: 'first ledger line below the staff' })
            : t('spot-ledger-below-2', { defaultValue: 'second ledger line below the staff' });
        return spot.n === 1
          ? t('spot-ledger-above-1', { defaultValue: 'first ledger line above the staff' })
          : t('spot-ledger-above-2', { defaultValue: 'second ledger line above the staff' });
      default:
        if (spot.side === 'below')
          return spot.n === 1
            ? t('spot-ledger-space-below-1', { defaultValue: 'space just below the staff' })
            : t('spot-ledger-space-below-2', { defaultValue: 'space between the two ledger lines below the staff' });
        return spot.n === 1
          ? t('spot-ledger-space-above-1', { defaultValue: 'space just above the staff' })
          : t('spot-ledger-space-above-2', { defaultValue: 'space between the two ledger lines above the staff' });
    }
  };

  return {
    place: (staff, step, grand) =>
      grand
        ? t('place-grand', {
            staff: staffName(staff),
            spot: spotName(step),
            defaultValue: 'Grand staff, {{staff}}, {{spot}}',
          })
        : t('place', {
            staff: staffName(staff),
            spot: spotName(step),
            defaultValue: '{{staff}}, {{spot}}',
          }),
    named: (note, staff, step, grand) =>
      grand
        ? t('named-grand', {
            note,
            staff: staffName(staff),
            spot: spotName(step),
            defaultValue: '{{note}}, grand staff, {{staff}}, {{spot}}',
          })
        : t('named', {
            note,
            staff: staffName(staff),
            spot: spotName(step),
            defaultValue: '{{note}}, {{staff}}, {{spot}}',
          }),
  };
}
