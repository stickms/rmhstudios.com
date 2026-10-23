'use client';

import { AdminHubCard } from '@/components/admin/AdminHubCard';
import { useTranslation } from 'react-i18next';

/** The admin dashboard card for the reading tools (glossary + news stories). */
export function AdminReadingLink() {
  const { t } = useTranslation('f-reading');
  return (
    <AdminHubCard
      to="/admin/reading"
      title={t('admin-reading', { defaultValue: 'Reading tools' })}
      description={t('admin-reading-card', {
        defaultValue:
          'Lore glossary terms that auto-link in articles and books, and news story timelines.',
      })}
    />
  );
}
