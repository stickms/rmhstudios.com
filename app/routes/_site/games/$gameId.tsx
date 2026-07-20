import { createFileRoute, notFound } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { PageLayout } from '@/components/feed/PageLayout';
import { GameHub } from '@/components/games/GameHub';
import { auth } from '@/lib/auth';
import { games } from '@/lib/games';
import { listReviews, getRatingAgg, listGuides } from '@/lib/games/meta.server';
import type { ReviewView, RatingAgg, GuideSummary } from '@/lib/games/reviews';

interface HubPayload {
  gameId: string;
  title: string;
  playHref: string;
  image: string | null;
  agg: RatingAgg;
  reviews: ReviewView[];
  guides: GuideSummary[];
  signedIn: boolean;
}

const fetchHub = createServerFn({ method: 'GET' })
  .validator((gameId: string) => gameId)
  .handler(async ({ data: gameId }): Promise<HubPayload> => {
    const game = games.find((g) => g.id === gameId);
    if (!game) throw notFound();
    const request = getRequest();
    const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
    const viewerId = session?.user.id ?? null;
    const [reviews, agg, guides] = await Promise.all([
      listReviews(gameId, viewerId),
      getRatingAgg(gameId),
      listGuides(gameId, viewerId),
    ]);
    return {
      gameId,
      title: game.title,
      playHref: game.href,
      image: game.imagePath ?? null,
      agg,
      reviews,
      guides,
      signedIn: !!viewerId,
    };
  });

export const Route = createFileRoute('/_site/games/$gameId')({
  head: () => ({ meta: [{ title: 'Game hub | RMH Studios' }] }),
  loader: ({ params }) => fetchHub({ data: params.gameId }),
  component: GameHubPage,
});

function GameHubPage() {
  const data = Route.useLoaderData();
  return (
    <PageLayout title={data.title} backTo="/">
      <GameHub data={data} />
    </PageLayout>
  );
}
