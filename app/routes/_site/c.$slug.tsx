import { createFileRoute } from '@tanstack/react-router';
import { PageFrame } from '@/components/feed/PageLayout';
import { createServerFn } from '@tanstack/react-start';
import { CommunityColumn } from '@/components/feed/CommunityColumn';
import { LockedCommunityPreview } from '@/components/communities/LockedCommunity';
import { getRequestSession } from '@/lib/auth-session.server';
import { buildCanonical, buildMeta } from '@/lib/seo';
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
      const session = await getRequestSession();
      const viewerId = session?.user?.id ?? null;
      const [community, feed] = await Promise.all([
        getCommunity(slug, viewerId),
        getCommunityFeed(slug, viewerId),
      ]);
      return { community, feed };
    },
  );

export const Route = createFileRoute('/_site/c/$slug')({
  /**
   * The title used to be the raw slug, so `/c/retro-hardware` rendered
   * "retro-hardware | Communities" — the URL, echoed back, with no description
   * and no canonical. Communities are in the sitemap now; they need the name
   * people actually call them.
   *
   * A private community is listed as a locked card and its page is a
   * metadata-only preview for non-members; it is `noindex` (and out of the
   * sitemap) so a search snippet never stands in for a membership.
   */
  // Annotated for the inference quirk documented on `/games/$gameId`.
  head: ({
    loaderData,
    params,
  }: {
    loaderData?: { community: CommunityDetail | null; feed: CommunityFeedResult | null };
    params: { slug: string };
  }) => {
    const community = loaderData?.community;
    const path = `/c/${params.slug}`;
    if (!community || community.isPrivate) {
      return {
        meta: [
          { title: community ? `${community.name} | Communities` : 'Community | RMH Studios' },
          { name: 'robots', content: 'noindex, follow' },
        ],
        links: [buildCanonical(path)],
      };
    }
    return {
      meta: buildMeta({
        title: `${community.name} — community | RMH Studios`,
        description:
          community.description ||
          `${community.name} on RMH Studios — ${community.memberCount} members and ${community.postCount} posts.`,
        path,
        image: community.icon || undefined,
        imageAlt: community.icon ? `${community.name}'s community icon.` : undefined,
        imageSize: community.icon ? null : undefined,
      }),
      links: [buildCanonical(path)],
    };
  },
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
  if (community?.locked) {
    // A private community the viewer is not in: metadata only (the loader never
    // fetched the feed), with the way in. `head()` already marks it noindex.
    return (
      <PageFrame>
        <div className="px-4 pt-6 pb-12">
          <LockedCommunityPreview community={community} requestState={community.requestState} />
        </div>
      </PageFrame>
    );
  }
  return (
    <>
      <PageFrame>
        <CommunityColumn
          slug={slug}
          initialCommunity={community}
          initialItems={feed?.items ?? null}
        />
      </PageFrame>
    </>
  );
}
