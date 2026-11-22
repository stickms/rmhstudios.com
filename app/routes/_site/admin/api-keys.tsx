import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { AdminBody } from '@/components/admin/AdminBody';
import { ApiKeysTable } from '@/components/admin/api-keys/ApiKeysTable';
import { PageLayout } from '@/components/feed/PageLayout';
import { NoMargin } from '@/components/shell/NoMargin';

export const Route = createFileRoute('/_site/admin/api-keys')({
  head: () => ({
    meta: [
      {
        title: 'API keys | Admin | RMH Studios',
      },
    ],
  }),
  component: AdminApiKeysPage,
});

function AdminApiKeysPage() {
  const { t } = useTranslation('admin-api-oversight');
  return (
    <PageLayout
      title={t('page-title', {
        defaultValue: 'API keys',
      })}
      description={t('page-description', {
        defaultValue: 'Developer keys ranked by units used in the last 7 days. Suspend a key or cap its rate.',
      })}
      wide
      backTo="/admin"
    >
      <NoMargin />
      <AdminBody width="wide">
        <ApiKeysTable />
      </AdminBody>
    </PageLayout>
  );
}
