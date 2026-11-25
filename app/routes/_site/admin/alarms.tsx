import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { AdminBody } from '@/components/admin/AdminBody';
import { PageLayout } from '@/components/feed/PageLayout';
import { AlarmsPanel } from '@/components/admin/oncall/AlarmsPanel';

// Admin-only through the /admin layout's beforeLoad gate, and its data route
// (/api/admin/oncall) is `auth: 'admin'` on its own.
export const Route = createFileRoute('/_site/admin/alarms')({
  // The Discord alert's "Open in panel" button links here with the alarm's key.
  validateSearch: (search: Record<string, unknown>): { alarm?: string } =>
    typeof search.alarm === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$/.test(search.alarm) ? { alarm: search.alarm } : {},
  head: () => ({ meta: [{ title: 'Alarms | RMH Studios' }] }),
  component: AlarmsPage,
});

function AlarmsPage() {
  const { t } = useTranslation('f-oncall');
  const { alarm } = Route.useSearch();
  return (
    <PageLayout title={t('page-title', { defaultValue: 'On-call alarms' })} wide backTo="/admin">
      <AdminBody width="wide">
        <AlarmsPanel focusKey={alarm} />
      </AdminBody>
    </PageLayout>
  );
}
