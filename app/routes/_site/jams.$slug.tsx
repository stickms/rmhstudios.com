import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import { JamDetail } from '@/components/competitive/JamDetail';
import { buildCanonical, buildMeta } from '@/lib/seo';

export const Route = createFileRoute('/_site/jams/$slug')({
  head: ({ params }) => ({
    meta: buildMeta({
      title: 'Game Jam | RMH Studios',
      description: 'A community game jam on RMH Studios.',
      path: `/jams/${params.slug}`,
    }),
    links: [buildCanonical(`/jams/${params.slug}`)],
  }),
  component: JamPage,
});

function JamPage() {
  const { slug } = Route.useParams();
  const { t } = useTranslation('f-competitive');
  return (
    <PageLayout title={t('jam-page-title', { defaultValue: 'Game jam' })} backTo="/jams" wide>
      <JamDetail slug={slug} />
    </PageLayout>
  );
}
