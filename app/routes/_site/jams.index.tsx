import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import { JamsList } from '@/components/competitive/JamsList';
import { buildCanonical, buildMeta } from '@/lib/seo';

export const Route = createFileRoute('/_site/jams/')({
  head: () => ({
    meta: buildMeta({
      title: 'Game Jams | RMH Studios',
      description:
        'Build a game around a secret theme, ship it as a User Build, and get rated by the community.',
      path: '/jams',
    }),
    links: [buildCanonical('/jams')],
  }),
  component: JamsPage,
});

function JamsPage() {
  const { t } = useTranslation('f-competitive');
  return (
    <PageLayout
      title={t('jams-title', { defaultValue: 'Game jams' })}
      description={t('jams-desc', {
        defaultValue: 'A secret theme, a deadline, and a build to ship.',
      })}
      wide
    >
      <JamsList />
    </PageLayout>
  );
}
