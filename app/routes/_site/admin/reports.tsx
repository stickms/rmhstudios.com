import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AdminBody } from '@/components/admin/AdminBody';
import { PageLayout } from '@/components/feed/PageLayout';
import { PageTabs } from '@/components/feed/PageTabs';
import { ReportFilters } from '@/components/admin/reports/ReportFilters';
import { ReportGroups } from '@/components/admin/reports/ReportGroups';
import { ReportList } from '@/components/admin/reports/ReportList';
import { DEFAULT_STATUS, parseTriageSearch, type TriageSearch } from '@/lib/moderation/triage';
import { TRIAGE_STATUSES } from '@/lib/moderation/triage-constants';

export const Route = createFileRoute('/_site/admin/reports')({
  head: () => ({ meta: [{ title: 'Moderation Queue | RMH Studios' }] }),
  // Filters live in the URL so a view can be linked: ?status=&reasons=SPAM,HATE&type=&min=&sort=&flat=true
  validateSearch: (search: Record<string, unknown>): TriageSearch => parseTriageSearch(search),
  component: AdminReportsPage,
});

function AdminReportsPage() {
  const { t } = useTranslation('admin');
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const [counts, setCounts] = useState<Record<string, number>>({});
  const status = search.status ?? DEFAULT_STATUS;

  const STATUS_LABELS = {
    PENDING: t('status-pending', { defaultValue: 'Pending' }),
    REVIEWING: t('status-reviewing', { defaultValue: 'Reviewing' }),
    RESOLVED: t('status-resolved', { defaultValue: 'Resolved' }),
    DISMISSED: t('status-dismissed', { defaultValue: 'Dismissed' }),
  } as const;

  const setSearch = useCallback(
    (next: TriageSearch) => void navigate({ search: parseTriageSearch({ ...next }), replace: true }),
    [navigate],
  );

  return (
    <PageLayout
      title={t('moderation-queue-title', { defaultValue: 'Moderation Queue' })}
      description={t('moderation-queue-description', { defaultValue: 'Review and resolve user reports.' })}
      wide
      backTo="/admin"
      backLabel={t('back-to-admin', { defaultValue: 'Back to admin' })}
    >
      <PageTabs
        tabs={TRIAGE_STATUSES.map((s) => ({ id: s, label: STATUS_LABELS[s], count: counts[s] || undefined }))}
        value={status}
        onChange={(id) => setSearch({ ...search, status: id as (typeof TRIAGE_STATUSES)[number] })}
        aria-label={t('moderation-queue', { defaultValue: 'Moderation queue' })}
      />

      <AdminBody>
        <div className="space-y-4">
          <ReportFilters search={search} onChange={setSearch} />
          {search.flat ? (
            <ReportList status={status} onCounts={setCounts} />
          ) : (
            <ReportGroups status={status} search={search} onCounts={setCounts} />
          )}
        </div>
      </AdminBody>
    </PageLayout>
  );
}
