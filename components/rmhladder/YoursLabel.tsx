import { useTranslation } from 'react-i18next';

/** The "Yours" meta label on a job the member added themselves: plain `t-meta` text, not a badge (feature 08). */
export function YoursLabel() {
  const { t } = useTranslation('ladder-own-jobs');
  return <span className="t-meta">{t('yours', { defaultValue: 'Yours' })}</span>;
}
