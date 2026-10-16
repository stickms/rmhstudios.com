'use client';

import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

/** Admin dashboard card for the Studio sample flip. */
export function AdminChallengeLink() {
  const { t } = useTranslation('f-creative');
  return (
    <Link
      to="/admin/studio-challenges"
      className="glass-fill glass-interactive block p-6 rounded-site hover:-translate-y-px group"
    >
      <h2 className="text-xl font-bold text-site-text group-hover:text-site-accent transition-colors">
        {t('admin-link-title', { defaultValue: 'Studio sample flip' })}
      </h2>
      <p className="text-site-text-muted text-sm mt-2">
        {t('admin-link-desc', { defaultValue: 'Post a weekly sample and run the voting.' })}
      </p>
    </Link>
  );
}
