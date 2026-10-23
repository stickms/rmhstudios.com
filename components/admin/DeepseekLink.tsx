import { AdminHubCard } from '@/components/admin/AdminHubCard';
import { useTranslation } from 'react-i18next';

/** The /admin card that leads to the DeepSeek balance page. */
export function DeepseekLink() {
  const { t } = useTranslation('f-deepseek');
  return (
    <AdminHubCard
      to="/admin/deepseek"
      title={t('link-title', { defaultValue: 'DeepSeek Balance' })}
      description={t('link-description', {
        defaultValue:
          'Current API credit, hourly balance history, spend rate and how long the balance will last.',
      })}
    />
  );
}
