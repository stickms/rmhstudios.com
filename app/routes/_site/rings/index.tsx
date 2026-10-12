import { lazy, Suspense } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import { Skeleton } from '@/components/ui/skeleton';
import { buildCanonical, buildMeta } from '@/lib/seo';

const RingsIndex = lazy(() => import('@/components/profile/plus/rings/RingsIndex'));

export const Route = createFileRoute('/_site/rings/')({
  head: () => ({
    meta: buildMeta({
      title: 'Webrings | RMH Studios',
      description:
        'Member-run webrings: small circles of people who share a thing, with a previous / next strip on each profile.',
      path: '/rings',
    }),
    links: [buildCanonical('/rings')],
  }),
  component: RingsPage,
});

function RingsPage() {
  const { t } = useTranslation('f-profile-plus');
  return (
    <PageLayout title={t('rings-page-title', { defaultValue: 'Webrings' })}>
      <Suspense fallback={<Skeleton className="m-4 h-48" />}>
        <RingsIndex />
      </Suspense>
    </PageLayout>
  );
}
