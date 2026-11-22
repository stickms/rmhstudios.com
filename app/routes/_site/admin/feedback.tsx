import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import { AdminBody } from '@/components/admin/AdminBody';
import { FeedbackInbox } from '@/components/feedback/FeedbackInbox';

export const Route = createFileRoute('/_site/admin/feedback')({
  head: () => ({
    meta: [
      {
        title: 'Feedback | Admin | RMH Studios',
      },
    ],
  }),
  component: AdminFeedbackPage,
});

function AdminFeedbackPage() {
  const { t } = useTranslation('feedback-inbox');
  return (
    <PageLayout
      title={t('page-title', {
        defaultValue: 'Feedback',
      })}
      description={t('page-description', {
        defaultValue: 'What members sent, with the page they were on. Reply, and close it with an outcome.',
      })}
      wide
      backTo="/admin"
    >
      <AdminBody width="narrow">
        <FeedbackInbox />
      </AdminBody>
    </PageLayout>
  );
}
