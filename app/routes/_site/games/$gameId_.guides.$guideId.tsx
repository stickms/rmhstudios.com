import { createFileRoute, notFound } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { PageLayout } from '@/components/feed/PageLayout';
import { GuideView, type GuideData } from '@/components/games/GuideView';
import { auth } from '@/lib/auth';
import { games } from '@/lib/games';
import { getGuide } from '@/lib/games/meta.server';
import { buildCanonical, buildMeta, ogCardPath } from '@/lib/seo';
import { articleSchema, breadcrumbSchema, jsonLdScript } from '@/lib/schema';
import { GAMES_INDEX_PATH } from '@/lib/seo-catalog';

interface GuidePayload {
  gameId: string;
  guide: GuideData | null; // null = "new" draft editor
}

const fetchGuide = createServerFn({ method: 'GET' })
  .validator((input: { gameId: string; guideId: string }) => input)
  .handler(async ({ data }): Promise<GuidePayload> => {
    const game = games.find((g) => g.id === data.gameId);
    if (!game) throw notFound();
    const request = getRequest();
    const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
    if (data.guideId === 'new') {
      if (!session) throw notFound();
      return { gameId: data.gameId, guide: null };
    }
    const guide = await getGuide(data.guideId, session?.user.id ?? null);
    if (!guide || guide.gameId !== data.gameId) throw notFound();
    return { gameId: data.gameId, guide };
  });

export const Route = createFileRoute('/_site/games/$gameId_/guides/$guideId')({
  /**
   * Player guides are the highest-intent pages on the site — someone searching
   * "how do I beat X" is looking for exactly this — and every one of them was
   * titled "Guide | RMH Studios" with no description. The guide's own title,
   * the game it belongs to, and an opening excerpt make it findable.
   *
   * Unpublished drafts and the `new` editor are `noindex`: they're reachable
   * only by their author, and the sitemap lists published guides only.
   */
  // Annotated for the inference quirk documented on `/games/$gameId`.
  head: ({
    loaderData,
    params,
  }: {
    loaderData?: GuidePayload;
    params: { gameId: string; guideId: string };
  }) => {
    const guide = loaderData?.guide;
    const game = games.find((g) => g.id === params.gameId);
    const path = `/games/${params.gameId}/guides/${params.guideId}`;

    if (!guide || !guide.published) {
      return {
        meta: [
          { title: guide ? `${guide.title} (draft) | RMH Studios` : 'New guide | RMH Studios' },
          { name: 'robots', content: 'noindex, follow' },
        ],
      };
    }

    // The body is markdown; strip the syntax that would otherwise show up as
    // literal `##` and `**` in a search snippet.
    const excerpt = guide.body
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/[#*_>`[\]()]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    const gameName = game?.title ?? params.gameId;
    const description = excerpt
      ? excerpt.length > 155
        ? `${excerpt.slice(0, 154)}…`
        : excerpt
      : `A player guide for ${gameName} on RMH Studios.`;

    return {
      meta: buildMeta({
        title: `${guide.title} — ${gameName} guide | RMH Studios`,
        description,
        path,
        image: ogCardPath('game', params.gameId),
        imageAlt: `${gameName} on RMH Studios.`,
        type: 'article',
      }),
      links: [buildCanonical(path)],
      scripts: [
        jsonLdScript([
          articleSchema({
            title: guide.title,
            description,
            path,
            type: 'Article',
            section: gameName,
          }),
          breadcrumbSchema([
            { name: 'Games', path: GAMES_INDEX_PATH },
            { name: gameName, path: `/games/${params.gameId}` },
            { name: guide.title, path },
          ]),
        ]),
      ],
    };
  },
  loader: ({ params }) => fetchGuide({ data: { gameId: params.gameId, guideId: params.guideId } }),
  component: GuidePage,
});

function GuidePage() {
  const { gameId, guide } = Route.useLoaderData();
  return (
    <PageLayout title={guide?.title ?? 'New guide'} backTo={`/games/${gameId}`}>
      <GuideView gameId={gameId} guide={guide} />
    </PageLayout>
  );
}
