import { createFileRoute, notFound } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequestSession } from '@/lib/auth-session.server';
import { getHub } from '@/lib/games/hub.server';
import { HubPage } from '@/components/steam/HubPage';
import { noindexHead } from '@/lib/seo';

const fetchHub = createServerFn({ method: 'GET' })
  .validator((input: { gameId: string; page: number }) => input)
  .handler(async ({ data }) => {
    const session = await getRequestSession();
    const user = session?.user as { id: string; isAdmin?: boolean } | undefined;
    const hub = await getHub({ id: user?.id ?? null, isAdmin: !!user?.isAdmin }, data.gameId, data.page);
    if (!hub) throw notFound();
    return hub;
  });

export const Route = createFileRoute('/games/hub/$gameId/')({
  validateSearch: (s: Record<string, unknown>): { page?: number } => {
    const n = Number(s.page);
    return Number.isInteger(n) && n > 1 && n < 10_000 ? { page: n } : {};
  },
  loaderDeps: ({ search }) => ({ page: search.page ?? 1 }),
  head: ({ loaderData }: { loaderData?: { title: string } }) =>
    noindexHead(loaderData ? `${loaderData.title} Community Hub` : 'Community Hub'),
  loader: ({ params, deps }) => fetchHub({ data: { gameId: params.gameId, page: deps.page } }),
  component: HubRoute,
});

function HubRoute() {
  return <HubPage data={Route.useLoaderData()} />;
}
