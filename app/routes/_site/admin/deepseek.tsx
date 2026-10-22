import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
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
      <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
        <DeepseekPanel />
      </div>
    </PageLayout>
  );
}
