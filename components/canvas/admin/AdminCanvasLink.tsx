'use client';

import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

/** Admin dashboard card for canvas events and context notes. */
export function AdminCanvasLink() {
  const { t } = useTranslation('f-canvas');
  return (
    <Link
      to="/admin/canvas"
      className="glass-fill glass-interactive block p-6 rounded-site hover:-translate-y-px group"
    >
      <h2 className="text-xl font-bold text-site-text group-hover:text-site-accent transition-colors">
        {t('admin-link-title', { defaultValue: 'Canvas and context notes' })}
      </h2>
      <p className="text-site-text-muted text-sm mt-2">
        {t('admin-link-desc', {
          defaultValue: 'Run community pixel canvas events and hide context notes.',
        })}
      </p>
    </Link>
  );
}
