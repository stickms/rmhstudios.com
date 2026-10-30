import { createFileRoute, notFound } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequestSession } from '@/lib/auth-session.server';
import { getThreadPage } from '@/lib/games/hub.server';
import { ThreadPage } from '@/components/steam/ThreadPage';
import { noindexHead } from '@/lib/seo';

const fetchThread = createServerFn({ method: 'GET' })
  .validator((input: { gameId: string; threadId: string }) => input)
  .handler(async ({ data }) => {
    const session = await getRequestSession();
    const user = session?.user as { id: string; isAdmin?: boolean } | undefined;
    const page = await getThreadPage({ id: user?.id ?? null, isAdmin: !!user?.isAdmin }, data.gameId, data.threadId);
    if (!page) throw notFound();
    return page;
  });

export const Route = createFileRoute('/games/hub/$gameId/t/$threadId')({
  head: ({ loaderData }: { loaderData?: { thread: { title: string } } }) =>
    noindexHead(loaderData ? loaderData.thread.title : 'Discussion'),
  loader: ({ params }) => fetchThread({ data: params }),
  component: ThreadRoute,
});

function ThreadRoute() {
  return <ThreadPage data={Route.useLoaderData()} />;
}
