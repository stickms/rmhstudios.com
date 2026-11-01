import { createFileRoute, notFound } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequestSession } from '@/lib/auth-session.server';
import { getSteamGroup } from '@/lib/games/community.server';
import { getCommunity, getCommunityFeed } from '@/lib/community.server';
import { toGroupPosts, type SteamAnnouncement } from '@/lib/games/group-posts';
import { GroupPage } from '@/components/steam/GroupPage';
import { noindexHead } from '@/lib/seo';

const fetchGroup = createServerFn({ method: 'GET' })
  .validator((slug: string) => slug)
  .handler(async ({ data: slug }) => {
    const session = await getRequestSession();
    const viewerId = session?.user.id ?? null;
    const group = await getSteamGroup(viewerId, slug);
    if (!group) throw notFound();
    // Only public groups reach here (getSteamGroup refuses private ones), so the
    // feed and announcements need no membership gate.
    const [community, feed] = await Promise.all([
      getCommunity(slug, viewerId),
      getCommunityFeed(slug, viewerId, { limit: 20 }),
    ]);
    const announcements: SteamAnnouncement[] = (community?.announcements ?? []).map((a) => ({
      id: a.id,
      body: a.body,
      createdAt: a.createdAt,
      author: a.author,
    }));
    return { group, announcements, posts: toGroupPosts(feed?.items ?? []) };
  });

export const Route = createFileRoute('/games/groups/$slug')({
  // The community at /c/$slug is the indexed page for a group.
  head: ({ loaderData }: { loaderData?: { group: { name: string } } }) =>
    noindexHead(loaderData ? `${loaderData.group.name} group` : 'Group'),
  loader: ({ params }) => fetchGroup({ data: params.slug }),
  component: GroupRoute,
});

function GroupRoute() {
  const { group, announcements, posts } = Route.useLoaderData();
  return <GroupPage group={group} announcements={announcements} posts={posts} />;
}
