import { lazy, Suspense } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import { Skeleton } from '@/components/ui/skeleton';
import { buildCanonical, buildMeta } from '@/lib/seo';

const RingPage = lazy(() => import('@/components/profile/plus/rings/RingPage'));

export const Route = createFileRoute('/_site/rings/$slug')({
  head: ({ params }) => ({
    meta: buildMeta({
      title: 'Webring | RMH Studios',
      description: 'A member-run webring on RMH Studios.',
      path: `/rings/${params.slug}`,
    }),
    links: [buildCanonical(`/rings/${params.slug}`)],
  }),
  component: RingRoute,
});

function RingRoute() {
  const { t } = useTranslation('f-profile-plus');
  const { slug } = Route.useParams();
  return (
    <PageLayout
      title={t('ring-page-title', { defaultValue: 'Webring' })}
      backTo="/rings"
      backLabel={t('rings-page-title', { defaultValue: 'Webrings' })}
    >
      <Suspense fallback={<Skeleton className="m-4 h-48" />}>
        <RingPage slug={slug} />
      </Suspense>
    </PageLayout>
  );
}
