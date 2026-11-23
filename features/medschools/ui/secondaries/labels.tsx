import { useTranslation } from 'react-i18next';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';
import type { MedPromptLimitDto, MedPromptSourceId, MedPromptStatus } from '../../medschools.contract';

/**
 * Every wording of the Secondaries tab and the overlap view, one switch per family so `i18next-parser` finds each key as a
 * literal. Source names are proper nouns and are not translated; the school's own page is named by the school.
 */
export interface SecondaryLabels {
  status(s: MedPromptStatus): string;
  theme(id: string): string;
  limit(l: MedPromptLimitDto): string;
  optional: string;
  sourceName(source: MedPromptSourceId, schoolName: string): string;
  date(iso: string): string;
}

export function useSecondaryLabels(): SecondaryLabels {
  const { t } = useTranslation('medschools');
  const { locale, number } = useLocaleFormat();
  const day = new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });

  return {
    status: (s) => {
      switch (s) {
        case 'same':
          return t('secondaries-status-same', { defaultValue: 'Same as last cycle' });
        case 'reworded':
          return t('secondaries-status-reworded', { defaultValue: 'Reworded' });
        case 'new':
          return t('secondaries-status-new', { defaultValue: 'New' });
        case 'gone':
          return t('secondaries-status-gone', { defaultValue: 'Not seen this cycle' });
        case 'last-cycle':
          return t('secondaries-status-last-cycle', { defaultValue: 'From last cycle' });
      }
    },
    theme: (id) => {
      switch (id) {
        case 'why-school':
          return t('secondaries-theme-why-school', { defaultValue: 'Why this school' });
        case 'why-medicine':
          return t('secondaries-theme-why-medicine', { defaultValue: 'Why medicine' });
        case 'diversity':
          return t('secondaries-theme-diversity', { defaultValue: 'Diversity' });
        case 'adversity':
          return t('secondaries-theme-adversity', { defaultValue: 'Adversity' });
        case 'challenge':
          return t('secondaries-theme-challenge', { defaultValue: 'Challenge' });
        case 'gap-year':
          return t('secondaries-theme-gap-year', { defaultValue: 'Gap year' });
        case 'service':
          return t('secondaries-theme-service', { defaultValue: 'Service' });
        case 'research':
          return t('secondaries-theme-research', { defaultValue: 'Research' });
        case 'leadership':
          return t('secondaries-theme-leadership', { defaultValue: 'Leadership' });
        case 'growth':
          return t('secondaries-theme-growth', { defaultValue: 'Growth' });
        case 'additional-info':
          return t('secondaries-theme-additional-info', { defaultValue: 'Additional information' });
        case 'future-goals':
          return t('secondaries-theme-future-goals', { defaultValue: 'Future goals' });
        default:
          return t('secondaries-theme-other', { defaultValue: 'Other' });
      }
    },
    limit: (l) =>
      l.kind === 'WORDS'
        ? t('secondaries-limit-words', {
            count: l.value,
            n: number(l.value),
            defaultValue_one: '{{n}} word',
            defaultValue_other: '{{n}} words',
            defaultValue: '{{n}} words',
          })
        : t('secondaries-limit-chars', {
            count: l.value,
            n: number(l.value),
            defaultValue_one: '{{n}} character',
            defaultValue_other: '{{n}} characters',
            defaultValue: '{{n}} characters',
          }),
    optional: t('secondaries-optional', { defaultValue: 'Optional' }),
    sourceName: (source, schoolName) => {
      switch (source) {
        case 'ADMIT':
          return t('secondaries-source-admit', { defaultValue: 'Admit.org' });
        case 'SDN':
          return t('secondaries-source-sdn', { defaultValue: 'Student Doctor Network' });
        case 'SCHOOL':
          return t('secondaries-source-school', { defaultValue: '{{school}} website', school: schoolName });
      }
    },
    date: (iso) => day.format(new Date(iso)),
  };
}
