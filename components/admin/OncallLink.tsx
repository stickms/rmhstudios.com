import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

/** The /admin card that leads to the on-call alarms page. */
export function OncallLink() {
  const { t } = useTranslation('f-oncall');
  return (
    <Link
      to="/admin/alarms"
      className="glass-fill glass-interactive group block rounded-site p-6 hover:-translate-y-px"
    >
      <h2 className="text-xl font-bold text-site-text transition-colors group-hover:text-site-accent">
        {t('link-title', { defaultValue: 'On-call Alarms' })}
      </h2>
      <p className="mt-2 text-sm text-site-text-muted">
        {t('link-description', {
          defaultValue:
            'What is paging right now, who acknowledged it, and whether every sender is checking in.',
        })}
      </p>
    </Link>
  );
}
