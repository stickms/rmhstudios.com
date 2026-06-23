import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from "react-i18next";
import { RMHCoinsPage } from '@/components/rmhcoins/RMHCoinsPage';
import { PageLayout } from '@/components/feed/PageLayout';

export const Route = createFileRoute('/_site/predictions')({
  head: () => ({
    meta: [
      { title: 'Predictions | RMH Studios' },
      { name: 'description', content: 'Prediction markets and RMH Coins — back your calls on YES/NO markets, or play Plinko, Blackjack, Hold\'em, Baccarat, and Roulette.' },
    ],
  }),
  component: PredictionsRoute,
});

function PredictionsRoute() {
  const { t } = useTranslation("site");
  return (
    <PageLayout title={t("predictions-title", { defaultValue: "Predictions" })} wide>
      <RMHCoinsPage />
    </PageLayout>
  );
}
