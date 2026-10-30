import { createFileRoute, notFound } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequestSession } from '@/lib/auth-session.server';
import { games } from '@/lib/games';
import { apps } from '@/lib/apps';
import { hueFromString } from '@/lib/builds/curated';
import { getLibraryExtras } from '@/lib/games/detail.server';
import { getAlsoPlayed } from '@/lib/games/store.server';
import type { AlsoPlayed } from '@/lib/games/store-types';
import type { LibraryExtras } from '@/lib/games/detail-types';
import { GamePage } from '@/components/steam/GamePage';
import { buildMeta, buildCanonical, ogCardPath, noindexHead } from '@/lib/seo';
import { jsonLdScript, videoGameSchema, breadcrumbSchema } from '@/lib/schema';
import { GAMES_INDEX_PATH } from '@/lib/seo-catalog';
import { aiAvailable } from '@/lib/devplatform/ai.server';
import { listReviews, getRatingAgg, listGuides } from '@/lib/games/meta.server';
import type { ReviewView, RatingAgg, GuideSummary } from '@/lib/games/reviews';
import { getTrickOfTheWeek } from '@/lib/trick-week/trick-week.server';
import type { TrickView } from '@/lib/trick-week/trick-week';

interface HubPayload {
  gameId: string;
  /** Apps share the namespace (`/games/$gameId`) but have no reviews or guides. */
  kind: 'game' | 'app';
  title: string;
  cta: string;
  description: string;
  tags: string[];
  playHref: string;
  image: string | null;
  bannerUrl: string | null;
  hue: number;
  agg: RatingAgg;
  reviews: ReviewView[];
  guides: GuideSummary[];
  signedIn: boolean;
  /** I1: show the AI "How do I play?" panel. */
  aiEnabled: boolean;
  /** R21: last week's winning Nightrail trick (Nightrail hub only). */
  trickOfTheWeek: TrickView | null;
  /** The viewer's activity, the title's achievements, friends and community. */
  extras: LibraryExtras;
  /** Titles people who play this also play (public players, totals only). */
  alsoPlayed: AlsoPlayed[];
}

const NO_RATINGS: RatingAgg = { average: 0, count: 0 };

const fetchHub = createServerFn({ method: 'GET' })
  .validator((gameId: string) => gameId)
  .handler(async ({ data: gameId }): Promise<HubPayload> => {
    // Games first (an unlisted one is still reachable by direct link), then
    // apps; a hidden app is not a page.
    const game = games.find((g) => g.id === gameId);
    const app = game ? undefined : apps.find((a) => a.id === gameId && !a.hidden);
    const entry = game ?? app;
    if (!entry) throw notFound();
    const kind = game ? 'game' : 'app';
    const session = await getRequestSession();
    const viewerId = session?.user.id ?? null;
    const [reviews, agg, guides, trickOfTheWeek, extras, alsoPlayed] = await Promise.all([
      kind === 'game' ? listReviews(gameId, viewerId) : [],
      kind === 'game' ? getRatingAgg(gameId) : NO_RATINGS,
      kind === 'game' ? listGuides(gameId, viewerId) : [],
      gameId === 'nightrail' ? getTrickOfTheWeek().catch(() => null) : null,
      getLibraryExtras(viewerId, gameId),
      getAlsoPlayed(gameId),
    ]);
    return {
      gameId,
      kind,
      title: entry.title,
      cta: entry.cta,
      description: entry.description,
      tags: entry.tags,
      playHref: entry.href,
      image: entry.imagePath ?? null,
      bannerUrl: entry.bannerPath ?? null,
      hue: hueFromString(entry.id),
      agg,
      reviews,
      guides,
      signedIn: !!viewerId,
      aiEnabled: !!viewerId && aiAvailable(),
      trickOfTheWeek,
      extras,
      alsoPlayed,
    };
  });

export const Route = createFileRoute('/games/_library/$gameId')({
  // Every hub used to emit the same static title with no description, canonical
  // or structured data, so eighteen distinct games were indistinguishable to a
  // crawler — and to anyone sharing a link. Meta is built per game from the
  // catalog, and VideoGame + BreadcrumbList JSON-LD makes the page eligible for
  // rich results (including the star rating, when the game has one).
  // `loaderData` is annotated explicitly: the head option is evaluated while the
  // route's own type is still being inferred, so without this it resolves to
  // `never` and every field access errors.
  head: ({ loaderData, params }: { loaderData?: HubPayload; params: { gameId: string } }) =>
    // An app's page is not indexed in v1: no reviews, guides or card of its own.
    loaderData?.kind === 'app'
      ? noindexHead(loaderData.title)
      : {
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
                    // The library index. A breadcrumb that points at a URL that does
                    // not resolve is dropped from the rich result along with
                    // everything after it.
                    { name: 'Games', path: GAMES_INDEX_PATH },
                    { name: loaderData.title, path: `/games/${params.gameId}` },
                  ]),
                ]),
              ]
            : [],
        },
  loader: ({ params }) => fetchHub({ data: params.gameId }),
  component: GameHubPage,
});

function GameHubPage() {
  const data = Route.useLoaderData();
  return (
    <GamePage data={data} />
  );
}
