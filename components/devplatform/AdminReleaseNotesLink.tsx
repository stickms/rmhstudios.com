import { AdminHubCard } from '@/components/admin/AdminHubCard';
import { useTranslation } from 'react-i18next';

/** Admin hub card linking to the release-notes writer. */
export function AdminReleaseNotesLink() {
  const { t } = useTranslation('f-devplatform');
  return (
    <AdminHubCard
      to="/admin/release-notes"
      title={t('admin-cardTitle', { defaultValue: 'Release notes' })}
      description={t('admin-cardBody', {
        defaultValue:
          'Draft a changelog entry from merged PRs with AI, edit it, and publish it to the changelog.',
      })}
    />
  );
}
