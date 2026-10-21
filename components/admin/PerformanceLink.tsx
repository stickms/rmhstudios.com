import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

/** The /admin card that leads to the performance page. */
export function PerformanceLink() {
  const { t } = useTranslation('f-perf');
  return (
    <Link
      to="/admin/performance"
      className="glass-fill glass-interactive group block rounded-site p-6 hover:-translate-y-px"
    >
      <h2 className="text-xl font-bold text-site-text transition-colors group-hover:text-site-accent">
        {t('link-title', { defaultValue: 'Performance' })}
      </h2>
      <p className="mt-2 text-sm text-site-text-muted">
        {t('link-description', {
          defaultValue:
            'Live latency, errors, event loop, memory, database and cache health for every process, plus an on-demand CPU profiler.',
        })}
      </p>
    </Link>
  );
}
