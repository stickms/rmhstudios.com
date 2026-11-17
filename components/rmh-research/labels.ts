/**
 * Translated labels for the fields and divisions.
 *
 * Every key is a string literal in its own `t()` call on purpose: the
 * extractor (`pnpm i18n:extract`) cannot see a key built at runtime, and a key
 * it cannot see never reaches `locales/`. Paper titles, abstracts, author
 * names and venues are catalogue content and are shown as published, the way
 * an archive shows them; only the site's own words go through `t()`.
 *
 * The namespace is written as the literal `'c-rmh-research'` at every
 * `useTranslation` call, never through a constant: the extractor cannot
 * resolve a variable, and keys behind one land in `common` instead.
 */
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { DivisionId, FieldId } from '@/lib/rmh-research/types';

export interface FieldLabels {
  /** The field's name, e.g. "Mathematics". */
  name: (id: FieldId) => string;
  /** One sentence on what RMH Research does in the field. */
  blurb: (id: FieldId) => string;
  division: (id: DivisionId) => string;
}

export function useFieldLabels(): FieldLabels {
  const { t } = useTranslation('c-rmh-research');
  return useMemo(() => {
    const names: Record<FieldId, string> = {
      mathematics: t('field-mathematics-name', { defaultValue: 'Mathematics' }),
      'computer-science': t('field-computer-science-name', { defaultValue: 'Computer Science' }),
      engineering: t('field-engineering-name', { defaultValue: 'Engineering & Materials' }),
      physics: t('field-physics-name', { defaultValue: 'Physics' }),
      chemistry: t('field-chemistry-name', { defaultValue: 'Chemistry' }),
      astronomy: t('field-astronomy-name', { defaultValue: 'Astronomy & Space' }),
      earth: t('field-earth-name', { defaultValue: 'Earth & Climate' }),
      biology: t('field-biology-name', { defaultValue: 'Biology' }),
      medicine: t('field-medicine-name', { defaultValue: 'Medicine & Health' }),
      neuroscience: t('field-neuroscience-name', { defaultValue: 'Neuroscience' }),
      psychology: t('field-psychology-name', { defaultValue: 'Psychology & Behaviour' }),
      'social-sciences': t('field-social-sciences-name', { defaultValue: 'Economics & Social Science' }),
    };
    const blurbs: Record<FieldId, string> = {
      mathematics: t('field-mathematics-blurb', { defaultValue: 'Structure, proof and the combinatorics underneath everything else the institute builds.' }),
      'computer-science': t('field-computer-science-blurb', { defaultValue: 'Systems, algorithms and the measured engineering of software at scale.' }),
      engineering: t('field-engineering-blurb', { defaultValue: 'Materials, structures and machines, from the bench to the campus.' }),
      physics: t('field-physics-blurb', { defaultValue: 'Matter, energy and the models that connect the very small to the very large.' }),
      chemistry: t('field-chemistry-blurb', { defaultValue: 'Reactions, synthesis and the chemistry of the things people actually handle.' }),
      astronomy: t('field-astronomy-blurb', { defaultValue: 'Observation and instrumentation, from near orbit to the deep field.' }),
      earth: t('field-earth-blurb', { defaultValue: 'Climate, oceans and the ground the datacentres stand on.' }),
      biology: t('field-biology-blurb', { defaultValue: 'Living systems, evolution and the dynamics of populations.' }),
      medicine: t('field-medicine-blurb', { defaultValue: 'Human health, studied in the lab and in the field.' }),
      neuroscience: t('field-neuroscience-blurb', { defaultValue: 'How nervous systems compute, learn and pay attention.' }),
      psychology: t('field-psychology-blurb', { defaultValue: 'Why people do what they do, and what a product owes them for it.' }),
      'social-sciences': t('field-social-sciences-blurb', { defaultValue: 'Markets, institutions and the behaviour of people in groups.' }),
    };
    const divisions: Record<DivisionId, string> = {
      formal: t('division-formal', { defaultValue: 'Formal sciences & engineering' }),
      physical: t('division-physical', { defaultValue: 'Physical sciences' }),
      life: t('division-life', { defaultValue: 'Life sciences' }),
      human: t('division-human', { defaultValue: 'Human sciences' }),
    };
    return {
      name: (id) => names[id],
      blurb: (id) => blurbs[id],
      division: (id) => divisions[id],
    };
  }, [t]);
}
