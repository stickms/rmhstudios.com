import { useTranslation } from 'react-i18next';
import { SOURCE_NAMES } from '../engine/public-read';
import type {
  MedDegreeId,
  MedEventTypeId,
  MedLiveProgramFilter,
  MedProgramId,
  MedSourceId,
} from '../medschools.contract';

/**
 * Every word the med schools pages show for an event type, program or source. Each `t()` key is a literal so
 * `pnpm i18n:extract` finds it. Source names are proper nouns and are not translated (D11).
 */
export function useMedLabels() {
  const { t } = useTranslation('medschools');

  const eventLabel = (type: MedEventTypeId): string => {
    switch (type) {
      case 'INTERVIEW':
        return t('event-interview', { defaultValue: 'Interview invite' });
      case 'SECONDARY':
        return t('event-secondary', { defaultValue: 'Secondary' });
      case 'WAITLIST':
        return t('event-waitlist', { defaultValue: 'Waitlist' });
      case 'REJECTION':
        return t('event-rejection', { defaultValue: 'Rejection' });
      case 'ACCEPTANCE':
        return t('event-acceptance', { defaultValue: 'Acceptance' });
      case 'WITHDRAWN':
        return t('event-withdrawn', { defaultValue: 'Withdrawn' });
      case 'HOLD':
        return t('event-hold', { defaultValue: 'Hold' });
    }
  };

  /** The label for a program filter value; `degree` names the school's own degree when one is known (O5). */
  const programFilterLabel = (value: MedLiveProgramFilter, degree?: MedDegreeId): string => {
    switch (value) {
      case 'ALL':
        return t('program-all', { defaultValue: 'All' });
      case 'NONE':
        return t('program-not-reported', { defaultValue: 'Program not reported' });
      case 'REG':
        if (degree === 'MD') return t('program-md', { defaultValue: 'MD' });
        if (degree === 'DO') return t('program-do', { defaultValue: 'DO' });
        return t('program-reg', { defaultValue: 'MD / DO' });
      case 'PHD':
        if (degree === 'MD') return t('program-md-phd', { defaultValue: 'MD-PhD' });
        if (degree === 'DO') return t('program-do-phd', { defaultValue: 'DO-PhD' });
        return t('program-phd', { defaultValue: 'MD-PhD / DO-PhD' });
    }
  };

  /** A stored event's program; null is an event that did not say one. */
  const programLabel = (p: MedProgramId | null, degree?: MedDegreeId): string =>
    programFilterLabel(p ?? 'NONE', degree);

  const sourceName = (s: MedSourceId): string => SOURCE_NAMES[s];

  return { eventLabel, programLabel, programFilterLabel, sourceName };
}
