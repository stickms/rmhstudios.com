import { createFileRoute, notFound } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { PageLayout } from '@/components/feed/PageLayout';
import { GameHub } from '@/components/games/GameHub';
import { auth } from '@/lib/auth';
import { games } from '@/lib/games';
import { buildMeta, buildCanonical, ogCardPath } from '@/lib/seo';
import { jsonLdScript, videoGameSchema, breadcrumbSchema } from '@/lib/schema';
import { listReviews, getRatingAgg, listGuides } from '@/lib/games/meta.server';
import type { ReviewView, RatingAgg, GuideSummary } from '@/lib/games/reviews';

interface HubPayload {
  gameId: string;
  title: string;
  description: string;
  tags: string[];
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
      description: game.description,
      tags: game.tags,
      playHref: game.href,
      image: game.imagePath ?? null,
      agg,
      reviews,
      guides,
      signedIn: !!viewerId,
    };
  });

export const Route = createFileRoute('/_site/games/$gameId')({
  // Every hub used to emit the same static title with no description, canonical
  // or structured data, so eighteen distinct games were indistinguishable to a
  // crawler — and to anyone sharing a link. Meta is built per game from the
  // catalog, and VideoGame + BreadcrumbList JSON-LD makes the page eligible for
  // rich results (including the star rating, when the game has one).
  // `loaderData` is annotated explicitly: the head option is evaluated while the
  // route's own type is still being inferred, so without this it resolves to
  // `never` and every field access errors.
  head: ({ loaderData, params }: { loaderData?: HubPayload; params: { gameId: string } }) => ({
    meta: buildMeta({
      title: loaderData
        ? `${loaderData.title} — reviews, guides & leaderboard | RMH Studios`
        : 'Game hub | RMH Studios',
      description: loaderData?.description ?? '',
      path: `/games/${params.gameId}`,
      // The hub's own card — title, tagline, rating, review and guide counts —
      // rather than the game's key art, which told a recipient nothing about
      // the page they were being sent to. The art is still what the JSON-LD
      // below advertises, because that IS a picture of the game.
      image: ogCardPath('game', params.gameId),
      imageAlt: loaderData
        ? `${loaderData.title} on RMH Studios — rating, reviews and guides.`
        : undefined,
      type: 'article',
    }),
    links: [buildCanonical(`/games/${params.gameId}`)],
    scripts: loaderData
      ? [
          jsonLdScript([
            videoGameSchema({
              name: loaderData.title,
              description: loaderData.description,
              path: `/games/${params.gameId}`,
              image: loaderData.image ?? undefined,
              genres: loaderData.tags,
              // Omitted below the threshold: a zero-count aggregateRating is
              // invalid structured data and invalidates the whole block.
              rating:
                loaderData.agg.count > 0
                  ? { value: loaderData.agg.average, count: loaderData.agg.count }
                  : undefined,
            }),
            breadcrumbSchema([
              { name: 'Games', path: '/games' },
              { name: loaderData.title, path: `/games/${params.gameId}` },
            ]),
          ]),
        ]
      : [],
  }),
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
