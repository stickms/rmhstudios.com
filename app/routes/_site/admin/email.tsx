import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import { AdminBody } from '@/components/admin/AdminBody';
import { EmailComposer } from '@/components/admin/email/EmailComposer';

export const Route = createFileRoute('/_site/admin/email')({
  head: () => ({
    meta: [
      {
        title: 'Email | RMH Studios',
      },
    ],
  }),
  component: AdminEmailPage,
});

function AdminEmailPage() {
  const { t } = useTranslation('admin');
  return (
    <PageLayout
      title={t('email-title', {
        defaultValue: 'Email',
      })}
      description={t('email-page-description', {
        defaultValue: 'Send an email to everyone, a filtered group, or people you choose.',
      })}
      backTo="/admin"
      backLabel={t('back-to-admin', {
        defaultValue: 'Back to admin',
      })}
      wide
    >
      <AdminBody width="narrow">
        <EmailComposer />
      </AdminBody>
    </PageLayout>
  );
}
