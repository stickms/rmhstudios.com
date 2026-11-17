import { createFileRoute, Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import { ChangelogList } from '@/components/devplatform/ChangelogList';
import { buildCanonical, buildMeta } from '@/lib/seo';

export const Route = createFileRoute('/_site/changelog')({
  head: () => ({
    meta: buildMeta({
      title: 'Changelog | RMH Studios',
      description: 'What changed on RMH Studios: new features, fixes and improvements.',
      path: '/changelog',
    }),
    links: [buildCanonical('/changelog')],
  }),
  component: ChangelogPage,
});

function ChangelogPage() {
  const { t } = useTranslation('site');
  return (
    <PageLayout
      title={t('changelog-title', { defaultValue: 'Changelog' })}
      backTo="/"
      headerRight={
        <Link to="/site-history" className="t-body text-site-text underline">
          {t('changelog-site-history', { defaultValue: 'Site history' })}
        </Link>
      }
    >
      <div className="px-4 pt-4 pb-12">
        <ChangelogList />
      </div>
    </PageLayout>
  );
}
