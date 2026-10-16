import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import PollsHome from '@/components/calendar/PollsHome';
import { validateWhenSearch } from '@/lib/calendar/search';
import { buildCanonical, buildMeta } from '@/lib/seo';

export const Route = createFileRoute('/_site/when/')({
  validateSearch: validateWhenSearch,
  head: () => ({
    meta: buildMeta({
      title: 'Find a time | RMH Studios',
      description:
        'Availability polls: share a link, everyone paints the times they are free in their own timezone, and the best slot rises to the top.',
      path: '/when',
    }),
    links: [buildCanonical('/when')],
  }),
  component: WhenPage,
});

function WhenPage() {
  const { t } = useTranslation('f-calendar');
  const search = Route.useSearch();
  return (
    <PageLayout title={t('home-page-title', { defaultValue: 'Find a time' })}>
      <PollsHome attach={search} />
    </PageLayout>
  );
}
