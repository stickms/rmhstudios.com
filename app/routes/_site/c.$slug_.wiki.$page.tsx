import { createFileRoute, notFound } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { PageFrame } from '@/components/feed/PageLayout';
import { WikiPage } from '@/components/communities/wiki/WikiPage';
import { getRequestSession } from '@/lib/auth-session.server';
import { buildCanonical, buildMeta } from '@/lib/seo';
import { isModerator } from '@/lib/communities/page-policy';
import { wikiDescription } from '@/lib/communities/wiki-seo';
import { resolveWikiCommunity, type WikiCommunity } from '@/lib/communities/page-access.server';
import { getCommunityPage, type CommunityPageDTO } from '@/lib/communities/pages.server';

interface WikiPageData {
  community: WikiCommunity;
  page: CommunityPageDTO;
  /** A moderator or site admin who is not refused by a timeout or a ban. */
  canModerate: boolean;
}

// The guard is inside the handler (a server function is its own HTTP endpoint): a missing community, a private one
// the viewer may not read and a missing page are the same null, and the loader's 404.
const fetchWikiPage = createServerFn({ method: 'GET' })
  .validator((input: { slug: string; page: string }) => input)
  .handler(async ({ data }): Promise<WikiPageData | null> => {
    const session = await getRequestSession();
    const viewerId = session?.user?.id ?? null;
    const isAdmin = Boolean((session?.user as { isAdmin?: boolean } | undefined)?.isAdmin);
    const resolved = await resolveWikiCommunity({ slug: data.slug }, viewerId, isAdmin);
    if (!resolved) return null;
    const page = await getCommunityPage(resolved.access, data.page, viewerId, isAdmin);
    if (!page) return null;
    return {
      community: resolved.community,
      page,
      canModerate: (isAdmin || isModerator(resolved.access.role)) && resolved.access.writeRefusal === null,
    };
  });

export const Route = createFileRoute('/_site/c/$slug_/wiki/$page')({
  // Annotated for the inference quirk documented on `/games/$gameId`.
  head: ({ loaderData, params }: { loaderData?: WikiPageData | null; params: { slug: string; page: string } }) => {
    const community = loaderData?.community;
    const page = loaderData?.page;
    const path = `/c/${params.slug}/wiki/${params.page}`;
    // A private community's pages are for its members: never indexed, and no text in the head.
    if (!community || !page || community.isPrivate) {
      return {
        meta: [{ title: 'Wiki | RMH Studios' }, { name: 'robots', content: 'noindex, follow' }],
        links: [buildCanonical(path)],
      };
    }
    return {
      meta: buildMeta({
        title: `${page.title} — ${community.name} wiki | RMH Studios`,
        description: wikiDescription(page.body) || `${page.title} in the ${community.name} wiki.`,
        path,
        image: community.icon || undefined,
        imageAlt: community.icon ? `${community.name}'s community icon.` : undefined,
        imageSize: community.icon ? null : undefined,
      }),
      links: [buildCanonical(path)],
    };
  },
  loader: async ({ params }) => {
    const data = await fetchWikiPage({ data: { slug: params.slug, page: params.page } });
    if (!data) throw notFound();
    return data;
  },
  component: WikiPageRoute,
});

function WikiPageRoute() {
  const { slug } = Route.useParams();
  const data = Route.useLoaderData() as WikiPageData;
  return (
    <PageFrame>
      <WikiPage
        // A different page is a different editor, tab and draft: remount rather than carry state across.
        key={data.page.id}
        communitySlug={slug}
        communityName={data.community.name}
        page={data.page}
        canModerate={data.canModerate}
      />
    </PageFrame>
  );
}
