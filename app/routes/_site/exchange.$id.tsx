import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import ExchangeDetail from '@/components/gifting/ExchangeDetail';
import { Gift } from 'lucide-react';
import { SignedOutPrompt } from '@/components/ui/signed-out-prompt';
import { useSession } from '@/components/Providers';
import { noindexHead } from '@/lib/seo';

export const Route = createFileRoute('/_site/exchange/$id')({
  head: () => noindexHead('Exchange'),
  component: ExchangePage,
});

function ExchangePage() {
  const { t } = useTranslation('f-gifting');
  const { id } = Route.useParams();
  const { data: session } = useSession();
  return (
    <PageLayout
      title={t('exchange-title', { defaultValue: 'Exchanges' })}
      backTo="/exchange"
      backLabel={t('exchange-back', { defaultValue: 'All exchanges' })}
    >
      {session?.user ? (
        <ExchangeDetail id={id} />
      ) : (
        <SignedOutPrompt
          icon={Gift}
          title={t('exchange-signin', { defaultValue: 'Sign in to join or start an exchange.' })}
          callbackURL={`/exchange/${id}`}
        />
      )}
    </PageLayout>
  );
}
