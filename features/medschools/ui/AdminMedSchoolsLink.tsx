import { AdminHubCard } from '@/components/admin/AdminHubCard';
import { useTranslation } from 'react-i18next';

/** The /admin card that leads to the Med Schools admin page (aliases, Q&A limits). */
export function AdminMedSchoolsLink() {
  const { t } = useTranslation('medschools');
  return (
    <AdminHubCard
      to="/admin/medschools"
      title={t('admin-link-title', {
        defaultValue: 'Med Schools',
      })}
      description={t('admin-link-description', {
        defaultValue: 'Map source names that match no school, and review requests for a higher Q&A limit.',
      })}
    />
  );
}
