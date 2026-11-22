import { createFileRoute, notFound } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { useTranslation } from 'react-i18next';
import { RssLink } from '@/components/feed/RssLink';
import { GameUpdates } from '@/components/steam/GameUpdates';
import { SteamPane } from '@/components/steam/SteamPane';
import { getRequestSession } from '@/lib/auth-session.server';
import { getFollowState, listPatchNotes, updatesGame } from '@/lib/arcade/updates.server';
import type { PatchNoteItem } from '@/lib/arcade/updates';
import type { FollowState } from '@/lib/arcade/updates.contract';
import { SITE_URL, buildCanonical, buildMeta, ogCardPath } from '@/lib/seo';
import { breadcrumbSchema, jsonLdScript } from '@/lib/schema';
import { GAMES_INDEX_PATH } from '@/lib/seo-catalog';

interface UpdatesPayload {
  gameId: string;
  title: string;
  signedIn: boolean;
  notes: PatchNoteItem[];
  nextCursor: string | null;
  follow: FollowState;
}

/** Public: the notes are the same for everyone; the session only says whether the viewer follows. */
const fetchUpdates = createServerFn({
  method: 'GET',
})
  .validator((gameId: string) => gameId)
  .handler(async ({ data: gameId }): Promise<UpdatesPayload> => {
    const game = updatesGame(gameId);
    if (!game) throw notFound();
    const session = await getRequestSession();
    const userId = session?.user.id ?? null;
    const [page, follow] = await Promise.all([listPatchNotes(gameId, undefined), getFollowState(userId, gameId)]);
    return {
      gameId,
      title: game.title,
      signedIn: !!userId,
      notes: page.notes,
      nextCursor: page.nextCursor,
      follow,
    };
  });

export const Route = createFileRoute('/games/_library/$gameId_/updates')({
  // Annotated for the inference quirk documented on `/games/$gameId`.
  head: ({
    loaderData,
    params,
  }: {
    loaderData?: UpdatesPayload;
    params: {
      gameId: string;
    };
  }) => {
    const path = `/games/${params.gameId}/updates`;
    const title = loaderData?.title ?? params.gameId;
    const latest = loaderData?.notes[0];
    return {
      meta: buildMeta({
        title: `${title} updates and patch notes | RMH Studios`,
        description: latest
          ? `Every update to ${title}. Latest: ${latest.version}, ${latest.title}.`
          : `Every update to ${title}, newest first.`,
        path,
        image: ogCardPath('game', params.gameId),
        imageAlt: `${title} on RMH Studios.`,
      }),
      links: [
        buildCanonical(path),
        {
          rel: 'alternate',
          type: 'application/rss+xml',
          title: `${title} updates — RMH Studios`,
          href: `${SITE_URL}${path}/rss.xml`,
        },
      ],
      scripts: [
        jsonLdScript([
          breadcrumbSchema([
            {
              name: 'Games',
              path: GAMES_INDEX_PATH,
            },
            {
              name: title,
              path: `/games/${params.gameId}`,
            },
            {
              name: 'Updates',
              path,
            },
          ]),
        ]),
      ],
    };
  },
  loader: ({ params }) =>
    fetchUpdates({
      data: params.gameId,
    }),
  component: UpdatesPage,
});

function UpdatesPage() {
  const { t } = useTranslation('game-updates');
  const data = Route.useLoaderData();
  return (
    <SteamPane
      title={t('page-title', {
        defaultValue: '{{game}} updates',
        game: data.title,
      })}
      backTo={`/games/${data.gameId}`}
    >
      {/* The games library keeps its own look (L8): the steam shell's muted text, not the site's Steel classes. */}
      <p className="stm-muted">
        <RssLink href={`/games/${data.gameId}/updates/rss.xml`} className="inline-flex items-center gap-1.5" />
      </p>
      <GameUpdates
        gameId={data.gameId}
        signedIn={data.signedIn}
        initialNotes={data.notes}
        initialCursor={data.nextCursor}
        follow={data.follow}
      />
    </SteamPane>
  );
}
