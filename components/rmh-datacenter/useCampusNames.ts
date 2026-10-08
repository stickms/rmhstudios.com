'use client';

/**
 * The six campuses' human names, in one place.
 *
 * They are spelled out as literal `t()` keys rather than composed from the
 * campus id — `i18next-parser` cannot see through a computed key, so
 * `t(\`campus-${id}-name\`)` never reaches `locales/` and every non-English
 * locale silently serves the English default forever (CLAUDE.md §5b). Two pages
 * need these names, so they live here rather than being typed out twice.
 */

import { useTranslation } from 'react-i18next';

export function useCampusNames(): Record<string, string> {
  const { t } = useTranslation('c-rmh-datacenter');
  return {
    'ash-01': t('fac-ash-name', { defaultValue: 'Ashburn, Virginia' }),
    'dub-02': t('fac-dub-name', { defaultValue: 'Dublin, Ireland' }),
    'sin-01': t('fac-sin-name', { defaultValue: 'Singapore' }),
    'fra-03': t('fac-fra-name', { defaultValue: 'Frankfurt, Germany' }),
    'pdx-01': t('fac-pdx-name', { defaultValue: 'Hillsboro, Oregon' }),
    'gru-01': t('fac-gru-name', { defaultValue: 'São Paulo, Brazil' }),
  };
}
