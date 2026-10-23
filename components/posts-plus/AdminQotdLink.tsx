'use client';

import { AdminHubCard } from '@/components/admin/AdminHubCard';
import { useTranslation } from 'react-i18next';

/** Dashboard card linking to the question-of-the-day queue (X4). */
export function AdminQotdLink() {
  const { t } = useTranslation('f-posts-plus');
  return (
    <AdminHubCard
      to="/admin/qotd"
      title={t('admin-link-title', { defaultValue: 'Question of the day' })}
      description={t('admin-link-desc', {
        defaultValue: 'Queue the daily prompts shown at the top of the home feed.',
      })}
    />
  );
}
