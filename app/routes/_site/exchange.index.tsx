import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import ExchangesPage from '@/components/gifting/ExchangesPage';
import { Gift } from 'lucide-react';
import { SignedOutPrompt } from '@/components/ui/signed-out-prompt';
import { useSession } from '@/components/Providers';
import { noindexHead } from '@/lib/seo';

export const Route = createFileRoute('/_site/exchange/')({
  head: () => noindexHead('Gift & Mixtape Exchanges'),
  component: ExchangeIndexPage,
});

function ExchangeIndexPage() {
  const { t } = useTranslation('f-gifting');
  const { data: session } = useSession();
  return (
    <PageLayout
      title={t('exchange-title', { defaultValue: 'Exchanges' })}
      description={t('exchange-desc', {
        defaultValue: 'Secret gifts and mixtape swaps with friends.',
      })}
    >
      {session?.user ? (
        <ExchangesPage />
      ) : (
        <SignedOutPrompt
          icon={Gift}
          title={t('exchange-signin', { defaultValue: 'Sign in to join or start an exchange.' })}
          callbackURL="/exchange"
        />
      )}
    </PageLayout>
  );
}
