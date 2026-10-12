import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import { buildCanonical, buildMeta } from '@/lib/seo';

import RingsIndex from '@/components/profile/plus/rings/RingsIndex';

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
      <RingsIndex />
    </PageLayout>
  );
}
