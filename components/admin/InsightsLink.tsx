import { AdminHubCard } from '@/components/admin/AdminHubCard';
import { useTranslation } from 'react-i18next';

/** The /admin card that leads to the insights page. */
export function InsightsLink() {
  const { t } = useTranslation('f-ops');
  return (
    <AdminHubCard
      to="/admin/insights"
      title={t('link-title', { defaultValue: 'Insights' })}
      description={t('link-description', {
        defaultValue:
          'Cohort retention, targeted notices, dead-route detector, client error inbox and A/B experiments.',
      })}
    />
  );
}
