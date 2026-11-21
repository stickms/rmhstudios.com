import { createFileRoute } from '@tanstack/react-router';
import { Webhook } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSession } from '@/components/Providers';
import { WebhooksConsole } from '@/components/developer/WebhooksConsole';
import { PageLayout } from '@/components/feed/PageLayout';
import { Spinner } from '@/components/ui/spinner';
import { SignedOutPrompt } from '@/components/ui/signed-out-prompt';
import { useArrival } from '@/components/ui/arrive';
import { noindexHead } from '@/lib/seo';

export const Route = createFileRoute('/_site/developer/webhooks')({
  head: () => noindexHead('Webhooks'),
  component: WebhooksPage,
});

function WebhooksPage() {
  const { t } = useTranslation('dev-webhooks');
  const { data: session, isPending } = useSession();
  const arrival = useArrival(!isPending);

  return (
    <PageLayout
      title={t('page-title', { defaultValue: 'Webhooks' })}
      description={t('page-description', {
        defaultValue:
          'Each endpoint receives a signed POST for the events it subscribes to. Inspect deliveries, send a test event and rotate the signing secret without dropping events.',
      })}
      backTo="/developer"
      backLabel={t('page-back', { defaultValue: 'Developer API' })}
      wide
    >
      <div className="px-4 pt-4 pb-12">
        {isPending ? (
          <div className="flex justify-center py-20">
            <Spinner />
          </div>
        ) : !session ? (
          <SignedOutPrompt
            className={arrival}
            icon={Webhook}
            callbackURL="/developer/webhooks"
            title={t('page-sign-in', { defaultValue: 'Sign in to manage webhooks' })}
          />
        ) : (
          <div className={arrival}>
            <WebhooksConsole />
          </div>
        )}
      </div>
    </PageLayout>
  );
}
