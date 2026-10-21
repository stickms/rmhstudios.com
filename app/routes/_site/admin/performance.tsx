import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import {
  Bug,
  Cpu,
  Database,
  Flame,
  Gauge,
  RefreshCw,
  Route as RouteIcon,
  Server,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import { Button } from '@/components/ui/button';
import { LiquidTabs } from '@/components/ui/liquid-tabs';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { usePerfOverview } from '@/components/admin/perf/api';
import { fmtClock } from '@/components/admin/perf/format';
import { DatabaseTab } from '@/components/admin/perf/DatabaseTab';
import { ErrorsTab } from '@/components/admin/perf/ErrorsTab';
import { OverviewTab } from '@/components/admin/perf/OverviewTab';
import { ProcessesTab } from '@/components/admin/perf/ProcessesTab';
import { ProfilerTab } from '@/components/admin/perf/ProfilerTab';
import { RoutesTab } from '@/components/admin/perf/RoutesTab';
import { RuntimeTab } from '@/components/admin/perf/RuntimeTab';

export const Route = createFileRoute('/_site/admin/performance')({
  head: () => ({ meta: [{ title: 'Performance | RMH Studios' }] }),
  component: PerformancePage,
});

type TabId = 'overview' | 'routes' | 'database' | 'processes' | 'errors' | 'runtime' | 'profiler';

function PerformancePage() {
  const { t } = useTranslation('f-perf');
  const [tab, setTab] = useState<TabId>('overview');
  const [auto, setAuto] = useState(true);
  const { data, loading, failed, updatedAt, reload } = usePerfOverview(auto);

  return (
    <PageLayout title={t('page-title', { defaultValue: 'Performance' })} wide backTo="/admin">
      <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-site-text-muted">
            <Switch
              checked={auto}
              onCheckedChange={setAuto}
              aria-label={t('auto-refresh', { defaultValue: 'Auto-refresh every 10 seconds' })}
            />
            {t('auto-refresh-short', { defaultValue: 'Auto-refresh' })}
          </label>
          <Button size="xs" variant="outline" onClick={() => void reload()}>
            <RefreshCw aria-hidden />
            {t('refresh', { defaultValue: 'Refresh' })}
          </Button>
          <span className="text-xs text-site-text-dim">
            {t('updated-at', { defaultValue: 'Updated {{time}}', time: fmtClock(updatedAt) })}
          </span>
          {failed && (
            <span role="alert" className="text-xs text-site-danger">
              {t('refresh-failed', { defaultValue: 'Last refresh failed; showing older data.' })}
            </span>
          )}
        </div>

        <LiquidTabs
          aria-label={t('page-tabs', { defaultValue: 'Performance views' })}
          value={tab}
          onChange={(id) => setTab(id as TabId)}
          tabs={[
            { id: 'overview', label: t('tab-overview', { defaultValue: 'Overview' }), icon: Gauge },
            { id: 'routes', label: t('tab-routes', { defaultValue: 'Routes' }), icon: RouteIcon },
            {
              id: 'database',
              label: t('tab-database', { defaultValue: 'Database' }),
              icon: Database,
            },
            {
              id: 'processes',
              label: t('tab-processes', { defaultValue: 'Processes' }),
              icon: Server,
            },
            { id: 'errors', label: t('tab-errors', { defaultValue: 'Errors' }), icon: Bug },
            { id: 'runtime', label: t('tab-runtime', { defaultValue: 'Runtime' }), icon: Cpu },
            { id: 'profiler', label: t('tab-profiler', { defaultValue: 'Profiler' }), icon: Flame },
          ]}
        />

        {tab === 'profiler' ? (
          <ProfilerTab />
        ) : loading && !data ? (
          <Spinner />
        ) : !data ? (
          <p className="glass-fill rounded-site p-6 text-center text-sm text-site-text-muted">
            {t('load-failed', { defaultValue: 'Could not load performance data.' })}
          </p>
        ) : (
          <>
            {tab === 'overview' && <OverviewTab overview={data} />}
            {tab === 'routes' && <RoutesTab routes={data.cluster.routes} />}
            {tab === 'database' && <DatabaseTab overview={data} />}
            {tab === 'processes' && <ProcessesTab overview={data} />}
            {tab === 'errors' && <ErrorsTab overview={data} />}
            {tab === 'runtime' && <RuntimeTab overview={data} />}
          </>
        )}
      </div>
    </PageLayout>
  );
}
