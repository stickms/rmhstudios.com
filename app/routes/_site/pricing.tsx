/**
 * Pricing Page Route (/pricing)
 *
 * Standalone "membership" page. The tier UI itself lives in the reusable
 * `MembershipPanel` (also embedded at the top of the combined /store page);
 * this route just supplies the loader (current tier) and page chrome.
 */
import { useTranslation } from 'react-i18next';
import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { auth } from '@/lib/auth';
import { getUserTier, type Tier } from '@/lib/entitlements';
import { AnimatedMain } from '@/components/feed/AnimatedMain';
import { ContextRail } from '@/components/feed/ContextRail';
import { MobileTopBar } from '@/components/feed/MobileHeader';
import { MembershipPanel } from '@/components/membership/MembershipPanel';
import { AppleHero } from '@/components/shared/AppleHero';
import { WIDE_NO_RIGHT_SIDEBAR_WIDTH } from '@/lib/layout-width';

const fetchCurrentTier = createServerFn({ method: 'GET' }).handler(async (): Promise<Tier> => {
  const request = getRequest();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user?.id) return 'free';
  return getUserTier(session.user.id);
});

export const Route = createFileRoute('/_site/pricing')({
  loader: () => fetchCurrentTier(),
  head: () => ({
    meta: [
      { title: 'Membership — RMH Studios' },
      {
        name: 'description',
        content: 'Become a member of RMH Studios. Four tiers, from Free to Enterprise.',
      },
    ],
  }),
  component: Pricing,
});

function Pricing() {
  // Cast to Tier: until app/routeTree.gen.ts regenerates (first dev/build),
  // useLoaderData() infers `any`, which breaks RANK[currentTier] indexing.
  const { t } = useTranslation('site');
  const currentTier = Route.useLoaderData() as Tier;

  return (
    <>
      <AnimatedMain
        className="relative isolate min-h-screen w-full min-w-0 pb-dock"
        targetWidth={WIDE_NO_RIGHT_SIDEBAR_WIDTH}
      >
        {/* Mobile: hamburger + brand (this page leads with an editorial hero) */}
        <MobileTopBar title={t('membership-title', { defaultValue: 'Membership' })} />
        <AppleHero
          eyebrow={t('membership-eyebrow', { defaultValue: 'RMH Studios Membership' })}
          title={t('membership-hero-title', { defaultValue: 'Everything you love. Elevated.' })}
          subtitle={t('membership-hero-sub', {
            defaultValue:
              'One membership across every game, app, and creator tool on the platform. Four tiers, from Free to Enterprise — upgrade or cancel anytime.',
          })}
        />
        <MembershipPanel currentTier={currentTier} returnPath="/pricing" />
      </AnimatedMain>
      {/* Trailing gutter to match the blog/library layout */}
      <ContextRail reserve compactReserve />
    </>
  );
}
