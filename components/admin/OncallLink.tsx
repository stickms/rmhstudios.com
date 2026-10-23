import { AdminHubCard } from '@/components/admin/AdminHubCard';
import { useTranslation } from 'react-i18next';

/** The /admin card that leads to the on-call alarms page. */
export function OncallLink() {
  const { t } = useTranslation('f-oncall');
  return (
    <AdminHubCard
      to="/admin/alarms"
      title={t('link-title', { defaultValue: 'On-call Alarms' })}
      description={t('link-description', {
        defaultValue:
          'What is paging right now, who acknowledged it, and whether every sender is checking in.',
      })}
    />
  );
}
