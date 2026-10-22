import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

/** The /admin card that leads to the DeepSeek balance page. */
export function DeepseekLink() {
  const { t } = useTranslation('f-deepseek');
  return (
    <Link
      to="/admin/deepseek"
      className="glass-fill glass-interactive group block rounded-site p-6 hover:-translate-y-px"
    >
      <h2 className="text-xl font-bold text-site-text transition-colors group-hover:text-site-accent">
        {t('link-title', { defaultValue: 'DeepSeek Balance' })}
      </h2>
      <p className="mt-2 text-sm text-site-text-muted">
        {t('link-description', {
          defaultValue:
            'Current API credit, hourly balance history, spend rate and how long the balance will last.',
        })}
      </p>
    </Link>
  );
}
