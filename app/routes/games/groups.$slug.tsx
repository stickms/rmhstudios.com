import { createFileRoute, notFound } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequestSession } from '@/lib/auth-session.server';
import { getSteamGroup } from '@/lib/games/community.server';
import { GroupPage } from '@/components/steam/GroupPage';
import { noindexHead } from '@/lib/seo';

const fetchGroup = createServerFn({ method: 'GET' })
  .validator((slug: string) => slug)
  .handler(async ({ data: slug }) => {
    const session = await getRequestSession();
    const group = await getSteamGroup(session?.user.id ?? null, slug);
    if (!group) throw notFound();
    return group;
  });

export const Route = createFileRoute('/games/groups/$slug')({
  // The community at /c/$slug is the indexed page for a group.
  head: ({ loaderData }: { loaderData?: { name: string } }) =>
    noindexHead(loaderData ? `${loaderData.name} group` : 'Group'),
  loader: ({ params }) => fetchGroup({ data: params.slug }),
  component: GroupRoute,
});

function GroupRoute() {
  return <GroupPage group={Route.useLoaderData()} />;
}
