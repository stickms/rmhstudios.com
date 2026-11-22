import { createFileRoute, notFound } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { PageFrame } from '@/components/feed/PageLayout';
import { WikiIndex } from '@/components/communities/wiki/WikiIndex';
import { getRequestSession } from '@/lib/auth-session.server';
import { buildCanonical, buildMeta } from '@/lib/seo';
import { isModerator } from '@/lib/communities/page-policy';
import { resolveWikiCommunity, type WikiCommunity } from '@/lib/communities/page-access.server';
import { listCommunityPages, type CommunityPageSummary } from '@/lib/communities/pages.server';

interface WikiIndexData {
  community: WikiCommunity;
  pages: CommunityPageSummary[];
  /** A moderator or site admin who is not refused by a timeout or a ban. */
  canCreate: boolean;
  signedIn: boolean;
}

// The guard is inside the handler (a server function is its own HTTP endpoint): `resolveWikiCommunity` answers
// null, and the loader a 404, for a missing community and for a private one the viewer may not read alike.
const fetchWikiIndex = createServerFn({ method: 'GET' })
  .validator((slug: string) => slug)
  .handler(async ({ data: slug }): Promise<WikiIndexData | null> => {
    const session = await getRequestSession();
    const viewerId = session?.user?.id ?? null;
    const isAdmin = Boolean((session?.user as { isAdmin?: boolean } | undefined)?.isAdmin);
    const resolved = await resolveWikiCommunity({ slug }, viewerId, isAdmin);
    if (!resolved) return null;
    const { community, access } = resolved;
    return {
      community,
      pages: await listCommunityPages(access),
      canCreate: (isAdmin || isModerator(access.role)) && access.writeRefusal === null,
      signedIn: viewerId !== null,
    };
  });

export const Route = createFileRoute('/_site/c/$slug_/wiki/')({
  // Annotated for the inference quirk documented on `/games/$gameId`.
  head: ({ loaderData, params }: { loaderData?: WikiIndexData | null; params: { slug: string } }) => {
    const community = loaderData?.community;
    const path = `/c/${params.slug}/wiki`;
    // A private community's wiki is for its members: never indexed.
    if (!community || community.isPrivate) {
      return {
        meta: [
          { title: community ? `Wiki — ${community.name} | RMH Studios` : 'Wiki | RMH Studios' },
          { name: 'robots', content: 'noindex, follow' },
        ],
        links: [buildCanonical(path)],
      };
    }
    return {
      meta: buildMeta({
        title: `${community.name} wiki | RMH Studios`,
        description: `The pages the ${community.name} community keeps up together.`,
        path,
        image: community.icon || undefined,
        imageAlt: community.icon ? `${community.name}'s community icon.` : undefined,
        imageSize: community.icon ? null : undefined,
      }),
      links: [buildCanonical(path)],
    };
  },
  loader: async ({ params }) => {
    const data = await fetchWikiIndex({ data: params.slug });
    if (!data) throw notFound();
    return data;
  },
  component: WikiIndexPage,
});

function WikiIndexPage() {
  const { slug } = Route.useParams();
  const data = Route.useLoaderData() as WikiIndexData;
  return (
    <PageFrame>
      <WikiIndex
        communityId={data.community.id}
        communitySlug={slug}
        communityName={data.community.name}
        pages={data.pages}
        canCreate={data.canCreate}
        signedIn={data.signedIn}
      />
    </PageFrame>
  );
}
