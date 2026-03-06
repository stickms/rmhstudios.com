import { createFileRoute } from '@tanstack/react-router';
import { RMHCoinsPage } from '@/components/rmhcoins/RMHCoinsPage';
import { PageLayout } from '@/components/feed/PageLayout';

export const Route = createFileRoute('/_site/rmhcoins')({
  head: () => ({
    meta: [
      { title: 'RMH Coins | RMH Studios' },
      { name: 'description', content: 'Play Plinko and earn RMH Coins to unlock profile items.' },
    ],
  }),
  component: RMHCoinsRoute,
});

function RMHCoinsRoute() {
  return (
    <PageLayout title="RMH Coins">
      <RMHCoinsPage />
    </PageLayout>
  );
}
