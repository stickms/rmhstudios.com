import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import PollPage from '@/components/calendar/PollPage';

export const Route = createFileRoute('/_site/when/$id')({
  head: () => ({
    // A poll is a private link between the people it was sent to: keep it out of search.
    meta: [{ title: 'Availability poll | RMH Studios' }, { name: 'robots', content: 'noindex' }],
  }),
  component: PollRoute,
});

function PollRoute() {
  const { t } = useTranslation('f-calendar');
  const { id } = Route.useParams();
  return (
    <PageLayout
      title={t('poll-page-title', { defaultValue: 'Availability poll' })}
      breadcrumbs={[
        { label: t('home-page-title', { defaultValue: 'Find a time' }), to: '/when' },
        { label: t('poll-page-title', { defaultValue: 'Availability poll' }) },
      ]}
    >
      <PollPage id={id} />
    </PageLayout>
  );
}
