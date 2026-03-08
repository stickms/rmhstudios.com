import { createFileRoute } from '@tanstack/react-router';
import { RMHCoinsPage } from '@/components/rmhcoins/RMHCoinsPage';
import { PageLayout } from '@/components/feed/PageLayout';

export const Route = createFileRoute('/_site/wallet')({
  head: () => ({
    meta: [
      { title: 'Wallet | RMH Studios' },
      { name: 'description', content: 'Your RMH Coins wallet — play Plinko and shop for profile items.' },
    ],
  }),
  component: WalletRoute,
});

function WalletRoute() {
  return (
    <PageLayout title="Wallet" wide>
      <RMHCoinsPage defaultTab="shop" />
    </PageLayout>
  );
}
