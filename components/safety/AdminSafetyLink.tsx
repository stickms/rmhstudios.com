import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

export function AdminSafetyLink() {
  const { t } = useTranslation('f-safety');
  return (
    <Link
      to="/admin/safety"
      className="glass-fill glass-interactive block p-6 rounded-site hover:-translate-y-px group"
    >
      <h2 className="text-xl font-bold text-site-text group-hover:text-site-accent transition-colors">
        {t('admin-title', { defaultValue: 'Safety Tools' })}
      </h2>
      <p className="text-site-text-muted text-sm mt-2">
        {t('admin-card', {
          defaultValue: 'Link-warning domain rules and a read-only view of what a member sees.',
        })}
      </p>
    </Link>
  );
}
