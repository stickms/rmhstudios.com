import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { AdminBody } from '@/components/admin/AdminBody';
import { DeletionsAdmin } from '@/components/admin/DeletionsAdmin';
import { PageLayout } from '@/components/feed/PageLayout';
import { NoMargin } from '@/components/shell/NoMargin';

export const Route = createFileRoute('/_site/admin/deletions')({
  head: () => ({
    meta: [{ title: 'Account deletions | Admin | RMH Studios' }],
  }),
  component: AdminDeletionsPage,
});

function AdminDeletionsPage() {
  const { t } = useTranslation('admin-deletions');
  return (
    <PageLayout
      title={t('page-title', { defaultValue: 'Account deletions' })}
      description={t('page-description', {
        defaultValue:
          'Accounts waiting out their grace period, deletions that are overdue, and erasures finished in the last 30 days.',
      })}
      wide
      backTo="/admin"
    >
      <NoMargin />
      <AdminBody width="wide">
        <DeletionsAdmin />
      </AdminBody>
    </PageLayout>
  );
}
