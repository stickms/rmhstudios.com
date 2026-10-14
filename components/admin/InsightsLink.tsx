import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

/** The /admin card that leads to the insights page. */
export function InsightsLink() {
  const { t } = useTranslation('f-ops');
  return (
    <Link
      to="/admin/insights"
      className="glass-fill glass-interactive group block rounded-site p-6 hover:-translate-y-px"
    >
      <h2 className="text-xl font-bold text-site-text transition-colors group-hover:text-site-accent">
        {t('link-title', { defaultValue: 'Insights' })}
      </h2>
      <p className="mt-2 text-sm text-site-text-muted">
        {t('link-description', {
          defaultValue:
            'Cohort retention, targeted notices, dead-route detector, client error inbox and A/B experiments.',
        })}
      </p>
    </Link>
  );
}
