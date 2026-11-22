import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { useTranslation } from 'react-i18next';
import { AdminBody } from '@/components/admin/AdminBody';
import { SpeedrunQueue } from '@/components/admin/SpeedrunQueue';
import { PageLayout } from '@/components/feed/PageLayout';
import { NoMargin } from '@/components/shell/NoMargin';
import { requireAdminServerFn } from '@/lib/auth/server-fn-guards.server';
import { listSpeedrunQueue } from '@/lib/speedrun/review-queue.server';

// A server function is its own HTTP endpoint, so the admin layout's `beforeLoad` does not cover a direct call: this
// first page of waiting runs checks the admin flag itself. The decided list and every refetch go through the API.
const loadWaitingRuns = createServerFn({ method: 'GET' }).handler(async () => {
  await requireAdminServerFn();
  return { rows: await listSpeedrunQueue('pending') };
});

export const Route = createFileRoute('/_site/admin/speedruns')({
  head: () => ({
    meta: [{ title: 'Speedrun review | Admin | RMH Studios' }],
  }),
  loader: () => loadWaitingRuns(),
  component: AdminSpeedrunsPage,
});

function AdminSpeedrunsPage() {
  const { t } = useTranslation('speedrun-queue');
  const { rows } = Route.useLoaderData();
  return (
    <PageLayout
      title={t('page-title', { defaultValue: 'Speedrun review' })}
      description={t('page-description', {
        defaultValue:
          'Runs waiting for a human verdict, oldest first. Watch the replay, then verify or reject with a reason.',
      })}
      wide
      backTo="/admin"
    >
      <NoMargin />
      <AdminBody width="wide">
        <SpeedrunQueue initial={rows} />
      </AdminBody>
    </PageLayout>
  );
}
