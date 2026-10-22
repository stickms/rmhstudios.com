import { useTranslation } from 'react-i18next';

/** The profile's Kudos tab label, kept out of ProfileColumn's own namespace. */
export function useKudosTabLabel(): string {
  const { t } = useTranslation('f-gifting');
  return t('kudos-tab', { defaultValue: 'Kudos' });
}
