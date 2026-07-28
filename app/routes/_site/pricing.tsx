/**
 * Pricing Page Route (/pricing)
 *
 * Standalone "membership" page. The tier UI itself lives in the reusable
 * `MembershipPanel` (also embedded at the top of the combined /store page);
 * this route just supplies the loader (current tier) and page chrome.
 */
import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { auth } from '@/lib/auth';
import { getUserTier, type Tier } from '@/lib/entitlements';
import { AnimatedMain } from '@/components/feed/AnimatedMain';
import { ContextRail } from '@/components/feed/ContextRail';
import { MembershipPanel } from '@/components/membership/MembershipPanel';
import { WIDE_NO_RIGHT_SIDEBAR_WIDTH } from '@/lib/layout-width';

/**
 * `null` means "nobody is signed in" — distinct from the free tier. Collapsing
 * the two showed signed-out visitors a Free card badged "Current" with a
 * disabled "Your current plan" button where its call to action belongs.
 */
const fetchCurrentTier = createServerFn({ method: 'GET' }).handler(
  async (): Promise<Tier | null> => {
    const request = getRequest();
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user?.id) return null;
    return getUserTier(session.user.id);
  },
);

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
  // Cast: until app/routeTree.gen.ts regenerates (first dev/build),
  // useLoaderData() infers `any`, which breaks RANK[currentTier] indexing.
  const currentTier = Route.useLoaderData() as Tier | null;

  return (
    <>
      <AnimatedMain
        className="relative isolate min-h-screen w-full min-w-0 pb-dock"
        targetWidth={WIDE_NO_RIGHT_SIDEBAR_WIDTH}
      >
        {/* One hero. The panel's own PinnedHero is the page's h1 and carries
            the tier CTAs; a route-level AppleHero above it stacked a second
            full hero (and a second h1) in front of every price. */}
        <MembershipPanel currentTier={currentTier} returnPath="/pricing" />
      </AnimatedMain>
      {/* Trailing gutter to match the blog/library layout */}
      <ContextRail reserve compactReserve />
    </>
  );
}
