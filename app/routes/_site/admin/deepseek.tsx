import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { AdminBody } from '@/components/admin/AdminBody';
import { PageLayout } from '@/components/feed/PageLayout';
import { DeepseekPanel } from '@/components/admin/deepseek/DeepseekPanel';

export const Route = createFileRoute('/_site/admin/deepseek')({
  head: () => ({ meta: [{ title: 'DeepSeek Balance | RMH Studios' }] }),
  component: DeepseekPage,
});

function DeepseekPage() {
  const { t } = useTranslation('f-deepseek');
  return (
    <PageLayout title={t('page-title', { defaultValue: 'DeepSeek balance' })} wide backTo="/admin">
      <AdminBody width="wide">
        <DeepseekPanel />
      </AdminBody>
    </PageLayout>
  );
}
