'use client';

import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

/** Admin dashboard card for the delight tools. */
export function AdminDelightLink() {
  const { t } = useTranslation('f-delight');
  return (
    <Link
      to="/admin/delight"
      className="glass-fill glass-interactive block p-6 rounded-site hover:-translate-y-px group"
    >
      <h2 className="text-xl font-bold text-site-text group-hover:text-site-accent transition-colors">
        {t('admin-link-title', { defaultValue: 'Delight tools' })}
      </h2>
      <p className="text-site-text-muted text-sm mt-2">
        {t('admin-link-desc', {
          defaultValue: 'Hunt, museum, fortunes, April Fools and community translations.',
        })}
      </p>
    </Link>
  );
}
