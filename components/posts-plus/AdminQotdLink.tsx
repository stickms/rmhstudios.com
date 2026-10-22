'use client';

import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

/** Dashboard card linking to the question-of-the-day queue (X4). */
export function AdminQotdLink() {
  const { t } = useTranslation('f-posts-plus');
  return (
    <Link
      to="/admin/qotd"
      className="glass-fill glass-interactive block p-6 rounded-site hover:-translate-y-px group"
    >
      <h2 className="text-xl font-bold text-site-text group-hover:text-site-accent transition-colors">
        {t('admin-link-title', { defaultValue: 'Question of the day' })}
      </h2>
      <p className="text-site-text-muted text-sm mt-2">
        {t('admin-link-desc', {
          defaultValue: 'Queue the daily prompts shown at the top of the home feed.',
        })}
      </p>
    </Link>
  );
}
