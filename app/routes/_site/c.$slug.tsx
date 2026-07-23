import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { AnimatedMain } from '@/components/feed/AnimatedMain';
import { ContextRail } from "@/components/feed/ContextRail";
import { WIDE_NO_RIGHT_SIDEBAR_WIDTH } from '@/lib/layout-width';
import { CommunityColumn } from '@/components/feed/CommunityColumn';
import { auth } from '@/lib/auth';
import {
  getCommunity,
  getCommunityFeed,
  type CommunityDetail,
  type CommunityFeedResult,
} from '@/lib/community.server';

// Prefetch the community details + first page of posts server-side so the page
// is present at first paint / prefetched on intent instead of a two-request
// client waterfall on mount. The explicit return type keeps createServerFn from
// choking on FeedItem's recursive `original` type (which otherwise collapses the
// inferred loader data to `undefined`).
const fetchCommunityPage = createServerFn({ method: 'GET' })
  .validator((slug: string) => slug)
  .handler(
    async ({
      data: slug,
    }): Promise<{ community: CommunityDetail | null; feed: CommunityFeedResult | null }> => {
      const request = getRequest();
      const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
      const viewerId = session?.user?.id ?? null;
      const [community, feed] = await Promise.all([
        getCommunity(slug, viewerId),
        getCommunityFeed(slug, viewerId),
      ]);
      return { community, feed };
    }
  );

export const Route = createFileRoute('/_site/c/$slug')({
  head: ({ params }) => ({ meta: [{ title: `${params.slug} | Communities` }] }),
  loader: ({ params }) => fetchCommunityPage({ data: params.slug }),
  component: CommunityPage,
});

function CommunityPage() {
  const { slug } = Route.useParams();
  // createServerFn's `.validator` + FeedItem's recursive `original` type defeat
  // loader-data inference (it collapses to `undefined`); the runtime shape is
  // exactly the loader's return, so assert it.
  const { community, feed } = Route.useLoaderData() as unknown as {
    community: CommunityDetail | null;
    feed: CommunityFeedResult | null;
  };
  return (
    <>
      <AnimatedMain
        className="w-full min-w-0 pb-dock"
      >
        <CommunityColumn
          slug={slug}
          initialCommunity={community}
          initialItems={feed?.items ?? null}
        />
      </AnimatedMain>
      <ContextRail reserve />
    </>
  );
}
