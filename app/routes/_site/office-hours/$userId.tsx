import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import OfficeHoursBook from '@/components/calendar/OfficeHoursBook';

export const Route = createFileRoute('/_site/office-hours/$userId')({
  head: () => ({
    meta: [{ title: 'Book office hours | RMH Studios' }, { name: 'robots', content: 'noindex' }],
  }),
  component: BookPage,
});

function BookPage() {
  const { t } = useTranslation('f-calendar');
  const { userId } = Route.useParams();
  return (
    <PageLayout
      title={t('oh-book-page-title', { defaultValue: 'Book office hours' })}
      breadcrumbs={[
        { label: t('oh-page-title', { defaultValue: 'Office hours' }), to: '/office-hours' },
        { label: t('oh-book-page-title', { defaultValue: 'Book office hours' }) },
      ]}
    >
      <OfficeHoursBook hostId={userId} />
    </PageLayout>
  );
}
