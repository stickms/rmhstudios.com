import { createFileRoute, notFound } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequestSession } from '@/lib/auth-session.server';
import { getCardMarket } from '@/lib/cards/market.server';
import { CardMarketPage } from '@/components/steam/CardMarketPage';
import { cardName } from '@/lib/cards/cards';
import { noindexHead } from '@/lib/seo';

const fetchCard = createServerFn({ method: 'GET' })
  .validator((i: { gameId: string; cardIndex: number; foil: boolean }) => i)
  .handler(async ({ data }) => {
    const session = await getRequestSession();
    const page = await getCardMarket(session?.user.id ?? null, data);
    if (!page) throw notFound();
    return page;
  });

export const Route = createFileRoute('/games/market/$gameId/$cardIndex')({
  validateSearch: (s: Record<string, unknown>): { foil?: boolean } =>
    s.foil === true || s.foil === 'true' || s.foil === '1' ? { foil: true } : {},
  loaderDeps: ({ search }) => ({ foil: !!search.foil }),
  head: ({ loaderData }: { loaderData?: { gameId: string; cardIndex: number; title: string } }) =>
    noindexHead(loaderData ? `${cardName(loaderData.gameId, loaderData.cardIndex)} · ${loaderData.title}` : 'Card'),
  loader: ({ params, deps }) =>
    fetchCard({ data: { gameId: params.gameId, cardIndex: Number(params.cardIndex), foil: deps.foil } }),
  component: CardRoute,
});

function CardRoute() {
  return <CardMarketPage data={Route.useLoaderData()} />;
}
