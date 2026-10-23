import { AdminHubCard } from '@/components/admin/AdminHubCard';
import { useTranslation } from 'react-i18next';

export function AdminSafetyLink() {
  const { t } = useTranslation('f-safety');
  return (
    <AdminHubCard
      to="/admin/safety"
      title={t('admin-title', { defaultValue: 'Safety Tools' })}
      description={t('admin-card', {
        defaultValue: 'Link-warning domain rules and a read-only view of what a member sees.',
      })}
    />
  );
}
