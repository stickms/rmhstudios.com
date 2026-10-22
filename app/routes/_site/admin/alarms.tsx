import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import { AlarmsPanel } from '@/components/admin/oncall/AlarmsPanel';

// Admin-only through the /admin layout's beforeLoad gate, and its data route
// (/api/admin/oncall) is `auth: 'admin'` on its own.
export const Route = createFileRoute('/_site/admin/alarms')({
  head: () => ({ meta: [{ title: 'Alarms | RMH Studios' }] }),
  component: AlarmsPage,
});

function AlarmsPage() {
  const { t } = useTranslation('f-oncall');
  return (
    <PageLayout title={t('page-title', { defaultValue: 'On-call alarms' })} wide backTo="/admin">
      <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
        <AlarmsPanel />
      </div>
    </PageLayout>
  );
}
