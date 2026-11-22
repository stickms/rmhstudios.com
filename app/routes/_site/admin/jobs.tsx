import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import { AdminBody } from '@/components/admin/AdminBody';
import { JobsConsole } from '@/components/admin/jobs/JobsConsole';

export const Route = createFileRoute('/_site/admin/jobs')({
  head: () => ({
    meta: [
      {
        title: 'Background Jobs | Admin | RMH Studios',
      },
    ],
  }),
  // The open queue is in the address, so Back returns to the list and a link to a failing queue works.
  validateSearch: (
    search: Record<string, unknown>,
  ): {
    queue?: string;
  } =>
    typeof search.queue === 'string' && /^[a-z0-9._:-]{1,100}$/.test(search.queue)
      ? {
          queue: search.queue,
        }
      : {},
  component: AdminJobsPage,
});

function AdminJobsPage() {
  const { t } = useTranslation('admin-jobs');
  const { queue } = Route.useSearch();
  return (
    <PageLayout
      title={t('page-title', {
        defaultValue: 'Background Jobs',
      })}
      description={t('page-description', {
        defaultValue: 'Every queue, why its jobs failed, and a way to retry or cancel them.',
      })}
      wide
      backTo="/admin"
    >
      <AdminBody width="narrow">
        <JobsConsole queue={queue} />
      </AdminBody>
    </PageLayout>
  );
}
