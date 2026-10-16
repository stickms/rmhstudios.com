import { createFileRoute } from '@tanstack/react-router';
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
  return (
    <PageLayout title="Changelog" backTo="/">
      <div className="px-4 pb-12">
        <ChangelogList />
      </div>
    </PageLayout>
  );
}
