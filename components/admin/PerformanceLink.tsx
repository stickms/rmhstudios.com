import { AdminHubCard } from '@/components/admin/AdminHubCard';
import { useTranslation } from 'react-i18next';

/** The /admin card that leads to the performance page. */
export function PerformanceLink() {
  const { t } = useTranslation('f-perf');
  return (
    <AdminHubCard
      to="/admin/performance"
      title={t('link-title', { defaultValue: 'Performance' })}
      description={t('link-description', {
        defaultValue:
          'Live latency, errors, event loop, memory, database and cache health for every process, plus an on-demand CPU profiler.',
      })}
    />
  );
}
