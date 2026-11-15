import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { AdminBody } from '@/components/admin/AdminBody';
import { CensusPanel } from '@/components/admin/census/CensusPanel';
import { PageLayout } from '@/components/feed/PageLayout';
import { NoMargin } from '@/components/shell/NoMargin';
import { adminCensusQuery } from '@/lib/admin/admin-ops.queries';
import { prefetchRouteQuery } from '@/lib/route/route-query';

export const Route = createFileRoute('/_site/admin/census')({
  head: () => ({ meta: [{ title: 'Census | RMH Studios' }] }),
  // The live census; a stored month is fetched when it is picked.
  loader: ({ context }) => prefetchRouteQuery(context.queryClient, adminCensusQuery(null)),
  component: CensusPage,
});

function CensusPage() {
  const { t } = useTranslation('admin');
  return (
    <PageLayout
      title={t('census-title', { defaultValue: 'Census' })}
      description={t('census-description', {
        defaultValue: 'Every table and every product, with the signs of use the database keeps.',
      })}
      wide
      backTo="/admin"
    >
      <NoMargin />
      <AdminBody width="wide">
        <CensusPanel />
      </AdminBody>
    </PageLayout>
  );
}
