'use client';

import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

/** The admin dashboard card for the reading tools (glossary + news stories). */
export function AdminReadingLink() {
  const { t } = useTranslation('f-reading');
  return (
    <Link
      to="/admin/reading"
      className="glass-fill glass-interactive block p-6 rounded-site hover:-translate-y-px group"
    >
      <h2 className="text-xl font-bold text-site-text group-hover:text-site-accent transition-colors">
        {t('admin-reading', { defaultValue: 'Reading tools' })}
      </h2>
      <p className="text-site-text-muted text-sm mt-2">
        {t('admin-reading-card', {
          defaultValue:
            'Lore glossary terms that auto-link in articles and books, and news story timelines.',
        })}
      </p>
    </Link>
  );
}
