/**
 * /store — the combined Store.
 *
 * Merges what used to be two separate destinations — Membership (/pricing) and
 * the cosmetics Shop (/shop) — into a single page. Membership leads at the top
 * (the reusable `MembershipPanel`), with the coin-purchasable Shop catalog
 * below. Surfaced as a single "Store" link in the sidebar.
 */
import { useTranslation } from 'react-i18next';
import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { auth } from '@/lib/auth';
import { getUserTier, type Tier } from '@/lib/entitlements';
import { AnimatedMain } from '@/components/feed/AnimatedMain';
import { MobileTopBar } from '@/components/feed/MobileHeader';
import { MembershipPanel } from '@/components/membership/MembershipPanel';
import { ShopColumn } from '@/components/feed/ShopColumn';
import { WIDE_NO_RIGHT_SIDEBAR_WIDTH } from '@/lib/layout-width';

const fetchCurrentTier = createServerFn({ method: 'GET' }).handler(async (): Promise<Tier> => {
  const request = getRequest();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user?.id) return 'free';
  return getUserTier(session.user.id);
});

export const Route = createFileRoute('/_site/store/')({
  loader: () => fetchCurrentTier(),
  head: () => ({
    meta: [
      { title: 'Store — RMH Studios' },
      { name: 'description', content: 'Membership tiers and the cosmetics shop — all in one place.' },
    ],
  }),
  component: Store,
});

function Store() {
  const { t } = useTranslation('site');
  const currentTier = Route.useLoaderData() as Tier;

  return (
    <>
      <AnimatedMain
        className="relative isolate min-h-screen w-full min-w-0 overflow-hidden border-r border-site-border pb-16 md:pb-0"
        targetWidth={WIDE_NO_RIGHT_SIDEBAR_WIDTH}
      >
        <MobileTopBar title={t('store-title', { defaultValue: 'Store' })} />
        <MembershipPanel currentTier={currentTier} returnPath="/store" coinShopAnchorId="coins-shop" />
        <div id="coins-shop" className="scroll-mt-4 border-t border-site-border">
          <ShopColumn />
        </div>
      </AnimatedMain>
      {/* Trailing gutter to match the blog/library layout */}
      <div className="hidden lg:block w-4 shrink-0" />
    </>
  );
}
