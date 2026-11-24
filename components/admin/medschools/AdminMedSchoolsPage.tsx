import { useCallback } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { AdminBody } from '@/components/admin/AdminBody';
import { PageLayout } from '@/components/feed/PageLayout';
import { PageTabs } from '@/components/feed/PageTabs';
import type { TabItem } from '@/components/ui/tabs';
import { AliasMissesPanel } from './AliasMissesPanel';
import { QaLimitRequestsPanel } from './QaLimitRequestsPanel';
import { ADMIN_TABS, type AdminTab } from '@features/medschools/engine/admin-search';

export { ADMIN_TABS, parseAdminSearch, type AdminTab } from '@features/medschools/engine/admin-search';

/**
 * /admin/medschools: two jobs on one page, as /admin/library has two (`?tab=`). Aliases map the names a source used that
 * match no school; Q&A limits is the queue of members asking for a higher daily question limit (plan R19), the sibling of
 * the library's upload appeals. The /admin layout gates admins.
 */
export function AdminMedSchoolsPage({ tab = 'aliases' }: { tab?: AdminTab }) {
  const { t } = useTranslation('medschools');
  const navigate = useNavigate();
  const setTab = useCallback(
    (next: string) => {
      void navigate({ to: '/admin/medschools', search: { tab: next as AdminTab }, replace: true });
    },
    [navigate],
  );
  const tabs: TabItem[] = [
    { id: 'aliases', label: t('admin-tab-aliases', { defaultValue: 'Aliases' }) },
    { id: 'limits', label: t('admin-tab-limits', { defaultValue: 'Q&A limits' }) },
  ];
  return (
    <PageLayout
      title={t('admin-title', { defaultValue: 'Med Schools' })}
      wide
      backTo="/admin"
      backLabel={t('back', { defaultValue: 'Back to admin' })}
    >
      <PageTabs
        tabs={tabs}
        value={tab}
        onChange={setTab}
        idBase="admin-medschools"
        aria-label={t('admin-title', { defaultValue: 'Med Schools' })}
      />
      <AdminBody width="narrow">
        <div role="tabpanel" id={`admin-medschools-panel-${tab}`} aria-labelledby={`admin-medschools-tab-${tab}`}>
          {tab === 'limits' ? <QaLimitRequestsPanel /> : <AliasMissesPanel />}
        </div>
      </AdminBody>
    </PageLayout>
  );
}
