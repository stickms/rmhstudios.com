'use client';

import { AdminHubCard } from '@/components/admin/AdminHubCard';
import { useTranslation } from 'react-i18next';

/** Admin dashboard card for the delight tools. */
export function AdminDelightLink() {
  const { t } = useTranslation('f-delight');
  return (
    <AdminHubCard
      to="/admin/delight"
      title={t('admin-link-title', { defaultValue: 'Delight tools' })}
      description={t('admin-link-desc', {
        defaultValue: 'Hunt, museum, fortunes, April Fools and community translations.',
      })}
    />
  );
}
