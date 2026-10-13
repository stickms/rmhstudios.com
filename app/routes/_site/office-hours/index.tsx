import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import OfficeHoursManage from '@/components/calendar/OfficeHoursManage';

export const Route = createFileRoute('/_site/office-hours/')({
  // One member's own settings and bookings.
  head: () => ({
    meta: [{ title: 'Office hours | RMH Studios' }, { name: 'robots', content: 'noindex' }],
  }),
  component: OfficeHoursPage,
});

function OfficeHoursPage() {
  const { t } = useTranslation('f-calendar');
  return (
    <PageLayout title={t('oh-page-title', { defaultValue: 'Office hours' })}>
      <OfficeHoursManage />
    </PageLayout>
  );
}
