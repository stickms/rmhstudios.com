import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { AdminBody } from '@/components/admin/AdminBody';
import { HomesAdmin } from '@/components/admin/HomesAdmin';
import { PageLayout } from '@/components/feed/PageLayout';
import { NoMargin } from '@/components/shell/NoMargin';

export const Route = createFileRoute('/_site/admin/homes')({
  head: () => ({
    meta: [{ title: 'Homes feeds | Admin | RMH Studios' }],
  }),
  component: AdminHomesPage,
});

function AdminHomesPage() {
  const { t } = useTranslation('admin-homes');
  return (
    <PageLayout
      title={t('page-title', { defaultValue: 'Homes feeds' })}
      description={t('page-description', {
        defaultValue:
          'The feeds that fill RMHHomes with outside listings: their status, the latest runs, and the controls to pause one, add one or run a scrape.',
      })}
      wide
      backTo="/admin"
    >
      <NoMargin />
      <AdminBody width="wide">
        <HomesAdmin />
      </AdminBody>
    </PageLayout>
  );
}
