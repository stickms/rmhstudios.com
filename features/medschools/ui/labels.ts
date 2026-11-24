import { useTranslation } from 'react-i18next';
import { programPair, type ProgramKey } from '../engine/programs';
import { SOURCE_NAMES } from '../engine/public-read';
import type { MilestoneType } from '../engine/tracker';
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

  /** A tracker milestone: the shareable types read as their event (`SECONDARY` is relabelled "Secondary received"), plus the three that never leave the tracker. */
  const milestoneLabel = (type: MilestoneType): string => {
    switch (type) {
      case 'SUBMITTED':
        return t('tracker-milestone-submitted', { defaultValue: 'Application submitted' });
      case 'COMPLETE':
        return t('tracker-milestone-complete', { defaultValue: 'Application complete' });
      // `SECONDARY` is the date the school sent the secondary; the public event of the same name stays "Secondary".
      case 'SECONDARY':
        return t('tracker-milestone-secondary-received', { defaultValue: 'Secondary received' });
      case 'SECONDARY_SUBMITTED':
        return t('tracker-milestone-secondary-submitted', { defaultValue: 'Secondary submitted' });
      case 'MATRICULATED':
        return t('tracker-milestone-matriculated', { defaultValue: 'Matriculating' });
      default:
        return eventLabel(type);
    }
  };

  /** Where the full label does not fit (chart end labels on a phone). */
  const eventShortLabel = (type: MedEventTypeId): string =>
    type === 'INTERVIEW' ? t('event-interview-short', { defaultValue: 'Interview' }) : eventLabel(type);

  /** The label for a program filter value; `degree` names the school's own degree when one is known (O5). */
  const programFilterLabel = (value: MedLiveProgramFilter, degree?: MedDegreeId): string => {
    switch (value) {
      case 'ALL':
        return t('program-all-programs', { defaultValue: 'All programs' });
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

  /** One of the four program toggles: "MD", "MD-PhD", "DO", "DO-PhD". */
  const programKeyLabel = (k: ProgramKey): string => {
    const p = programPair(k);
    return programFilterLabel(p.program, p.degree);
  };

  const sourceName = (s: MedSourceId): string => SOURCE_NAMES[s];

  return {
    eventLabel,
    milestoneLabel,
    eventShortLabel,
    programLabel,
    programFilterLabel,
    programKeyLabel,
    sourceName,
  };
}
