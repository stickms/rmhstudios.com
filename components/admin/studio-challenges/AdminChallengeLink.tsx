'use client';

import { AdminHubCard } from '@/components/admin/AdminHubCard';
import { useTranslation } from 'react-i18next';

/** Admin dashboard card for the Studio sample flip. */
export function AdminChallengeLink() {
  const { t } = useTranslation('f-creative');
  return (
    <AdminHubCard
      to="/admin/studio-challenges"
      title={t('admin-link-title', { defaultValue: 'Studio sample flip' })}
      description={t('admin-link-desc', {
        defaultValue: 'Post a weekly sample and run the voting.',
      })}
    />
  );
}
