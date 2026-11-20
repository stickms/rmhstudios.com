import { AdminHubCard } from '@/components/admin/AdminHubCard';
import { useTranslation } from 'react-i18next';

/** The /admin card that leads to the Med Schools alias page. */
export function AdminMedSchoolsLink() {
  const {
    t,
  } =
    useTranslation(
      'medschools',
    );
  return (
    <AdminHubCard
      to="/admin/medschools"
      title={t(
        'link-title',
        {
          defaultValue:
            'Med Schools aliases',
        },
      )}
      description={t(
        'link-description',
        {
          defaultValue:
            'Source names that match no school yet. Map each to a school or ignore it.',
        },
      )}
    />
  );
}
