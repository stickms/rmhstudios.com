import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { AdminBody } from '@/components/admin/AdminBody';
import { WikiPanel } from '@/components/admin/wiki/WikiPanel';
import { PageLayout } from '@/components/feed/PageLayout';

export const Route = createFileRoute('/_site/admin/wiki')({
  head: () => ({ meta: [{ title: 'Wiki | Admin | RMH Studios' }] }),
  component: WikiAdminPage,
});

function WikiAdminPage() {
  const { t } = useTranslation('f-wiki');
  return (
    <PageLayout title={t('page-title', { defaultValue: 'Wiki' })} wide backTo="/admin">
      <AdminBody width="wide">
        <WikiPanel />
      </AdminBody>
    </PageLayout>
  );
}
