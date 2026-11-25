import { createFileRoute } from '@tanstack/react-router';
import { buildCanonical, buildMeta } from '@/lib/seo';
import { useTranslation } from 'react-i18next';
import { RMHCoinsPage } from '@/components/rmhcoins/RMHCoinsPage';
import { PageLayout } from '@/components/feed/PageLayout';
import { ExcludedNotice } from '@/components/settings/ExcludedNotice';
import { fetchExclusionNotice } from '@/lib/economy/exclusion-page.functions';

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
  // A self-excluded member gets the notice instead of the hub, decided here so it holds with scripting off.
  loader: () => fetchExclusionNotice(),
  component: PredictionsRoute,
});

function PredictionsRoute() {
  const { t } = useTranslation('site');
  const notice = Route.useLoaderData();
  return (
    <PageLayout title={t('predictions-title', { defaultValue: 'Predictions' })} wide>
      {notice.excluded ? <ExcludedNotice until={notice.until} /> : <RMHCoinsPage />}
    </PageLayout>
  );
}
