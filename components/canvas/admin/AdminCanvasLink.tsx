'use client';

import { AdminHubCard } from '@/components/admin/AdminHubCard';
import { useTranslation } from 'react-i18next';

/** Admin dashboard card for canvas events and context notes. */
export function AdminCanvasLink() {
  const { t } = useTranslation('f-canvas');
  return (
    <AdminHubCard
      to="/admin/canvas"
      title={t('admin-link-title', { defaultValue: 'Canvas and context notes' })}
      description={t('admin-link-desc', {
        defaultValue: 'Run community pixel canvas events and hide context notes.',
      })}
    />
  );
}
