import { createFileRoute } from '@tanstack/react-router';
import { PageLayout } from '@/components/feed/PageLayout';
import { AdminReleaseNotes } from '@/components/devplatform/AdminReleaseNotes';

export const Route = createFileRoute('/_site/admin/release-notes')({
  head: () => ({
    meta: [
      { title: 'Release notes | Admin | RMH Studios' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: () => (
    <PageLayout title="Release notes" backTo="/admin">
      <AdminReleaseNotes />
    </PageLayout>
  ),
});
