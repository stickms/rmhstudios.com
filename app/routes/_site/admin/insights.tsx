import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { BarChart3, Bell, FlaskConical, Bug, Route as RouteIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import { LiquidTabs } from '@/components/ui/liquid-tabs';
import { CohortsTab } from '@/components/admin/insights/CohortsTab';
import { DeadRoutesTab } from '@/components/admin/insights/DeadRoutesTab';
import { ErrorsTab } from '@/components/admin/insights/ErrorsTab';
import { ExperimentsTab } from '@/components/admin/insights/ExperimentsTab';
import { NoticesTab } from '@/components/admin/insights/NoticesTab';

export const Route = createFileRoute('/_site/admin/insights')({
  head: () => ({ meta: [{ title: 'Insights | RMH Studios' }] }),
  component: InsightsPage,
});

type TabId = 'cohorts' | 'notices' | 'routes' | 'errors' | 'experiments';

function InsightsPage() {
  const { t } = useTranslation('f-ops');
  const [tab, setTab] = useState<TabId>('cohorts');
  return (
    <PageLayout title={t('page-title', { defaultValue: 'Insights' })} wide backTo="/admin">
      <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-8">
        <LiquidTabs
          aria-label={t('page-tabs', { defaultValue: 'Insight tools' })}
          value={tab}
          onChange={(id) => setTab(id as TabId)}
          tabs={[
            {
              id: 'cohorts',
              label: t('tab-cohorts', { defaultValue: 'Retention' }),
              icon: BarChart3,
            },
            { id: 'notices', label: t('tab-notices', { defaultValue: 'Notices' }), icon: Bell },
            {
              id: 'routes',
              label: t('tab-routes', { defaultValue: 'Dead routes' }),
              icon: RouteIcon,
            },
            { id: 'errors', label: t('tab-errors', { defaultValue: 'Errors' }), icon: Bug },
            {
              id: 'experiments',
              label: t('tab-experiments', { defaultValue: 'Experiments' }),
              icon: FlaskConical,
            },
          ]}
        />
        {tab === 'cohorts' && <CohortsTab />}
        {tab === 'notices' && <NoticesTab />}
        {tab === 'routes' && <DeadRoutesTab />}
        {tab === 'errors' && <ErrorsTab />}
        {tab === 'experiments' && <ExperimentsTab />}
      </div>
    </PageLayout>
  );
}
