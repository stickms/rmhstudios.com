import { createFileRoute } from '@tanstack/react-router';
import { buildCanonical, buildMeta } from '@/lib/seo';
import { useTranslation } from 'react-i18next';
import { RMHCoinsPage } from '@/components/rmhcoins/RMHCoinsPage';
import { PageLayout } from '@/components/feed/PageLayout';

export const Route = createFileRoute('/_site/predictions')({
  head: () => ({
    meta: buildMeta({
      title: 'Predictions | RMH Studios',
      description:
        'Prediction markets, plus Plinko, Blackjack, Hold’em, Baccarat and Roulette, played with RMH Coins.',
      path: '/predictions',
    }),
    links: [buildCanonical('/predictions')],
  }),
  component: PredictionsRoute,
});

function PredictionsRoute() {
  const { t } = useTranslation('site');
  return (
    <PageLayout title={t('predictions-title', { defaultValue: 'Predictions' })} wide>
      <RMHCoinsPage />
    </PageLayout>
  );
}
