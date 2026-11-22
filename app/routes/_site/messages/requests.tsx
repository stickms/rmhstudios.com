/**
 * Message requests — the Requests folder (s04-16). Private to the signed-in member,
 * so it is `noindex` and outside the sitemap.
 */
import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import { RequestsList } from '@/components/messages/RequestsList';

export const Route = createFileRoute('/_site/messages/requests')({
  head: () => ({
    meta: [{ title: 'Message requests | RMH Studios' }, { name: 'robots', content: 'noindex' }],
  }),
  component: RequestsPage,
});

function RequestsPage() {
  const { t } = useTranslation('message-requests');
  return (
    <PageLayout
      title={t('page-title', { defaultValue: 'Message requests' })}
      description={t('page-description', {
        defaultValue: 'First messages from people who cannot message you directly. Declining does not tell them.',
      })}
      backTo="/messages"
      backLabel={t('back-to-messages', { defaultValue: 'Messages' })}
    >
      <RequestsList />
    </PageLayout>
  );
}
