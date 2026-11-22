import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { AdminBody } from '@/components/admin/AdminBody';
import { SweepsList } from '@/components/admin/sweeps/SweepsList';
import { PageLayout } from '@/components/feed/PageLayout';
import { NoMargin } from '@/components/shell/NoMargin';

export const Route = createFileRoute('/_site/admin/sweeps')({
  head: () => ({
    meta: [{ title: 'Spam sweeps | Admin | RMH Studios' }],
  }),
  component: AdminSweepsPage,
});

function AdminSweepsPage() {
  const { t } = useTranslation('admin-spam-sweep');
  return (
    <PageLayout
      title={t('page-title', { defaultValue: 'Spam sweeps' })}
      description={t('page-description', {
        defaultValue:
          "Posts and replies removed in one step, with who removed them and why. Start a sweep from a member's admin view or from the lookup.",
      })}
      wide
      backTo="/admin"
    >
      <NoMargin />
      <AdminBody width="wide">
        <SweepsList />
      </AdminBody>
    </PageLayout>
  );
}
