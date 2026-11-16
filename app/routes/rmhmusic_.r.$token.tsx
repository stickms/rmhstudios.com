/**
 * A shared RMH Music result — `/rmhmusic/r/$token` (Phase 6, plan 1.4).
 *
 * PUBLIC: the trailing underscore un-nests it from the auth-gated `/rmhmusic` layout
 * (`rmhmusic.tsx` redirects a signed-out visitor to sign in), as `c.$slug_.invite.$code.tsx` does,
 * so a signed-out viewer and an unfurl bot get the page. It carries the app's theme and paper
 * itself (no animated backdrop). A capability link: `noindex, nofollow`, never in the sitemap,
 * but not disallowed in robots.txt, so Twitterbot and LinkedInBot can read it and its card. Its
 * head goes through `buildMeta` with its own card (`ogCardPath('music', token)`) and its own copy;
 * a link that is gone heads with the app's catalogue card, never the old result.
 * `lib/rmhmusic/learn/social/share-route.test.ts` holds all of that.
 */
import { createFileRoute } from '@tanstack/react-router';
import {
  buildMeta,
  ogCardPath,
} from '@/lib/seo';
import { prefetchRouteQuery } from '@/lib/route/route-query';
import { preloadFont } from '@/lib/fonts/self-hosted';
import { musicSharedResultQuery } from '@/lib/music-social/social.queries';
import type { SharedResultView } from '@/lib/music-social/share.contract';
import { cardLines } from '@/lib/rmhmusic/learn/social/share';
import { RmhMusicStyles } from '@/components/rmhmusic/RmhMusicStyles';
import { useRmhMusicModeRoot } from '@/components/rmhmusic/useRmhMusicMode';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import { SharedResultPage } from '@/components/rmhmusic/learn/social/SharedResultPage';
// The headings' face (rmhmusic.css), preloaded as the app's layout does.
import fellFont from '@/components/shared/game-fonts/IMFellEnglish/IMFellEnglish-Regular.woff2?url';

const NOINDEX =
  {
    name: 'robots',
    content:
      'noindex, nofollow',
  };

export const Route =
  createFileRoute(
    '/rmhmusic_/r/$token',
  )(
    {
      loader:
        async ({
          context,
          params,
        }) => {
          const query =
            musicSharedResultQuery(
              params.token,
            );
          await prefetchRouteQuery(
            context.queryClient,
            query,
          );
          // The head needs the result on the server; the page reads the same cached query.
          const view: SharedResultView | null =
            context.queryClient.getQueryData(
              query.queryKey,
            ) ??
            null;
          return {
            view,
          };
        },
      head: ({
        params,
        loaderData,
      }) => {
        const view =
          loaderData?.view;
        const links =
          [
            preloadFont(
              fellFont,
            ),
          ];
        if (
          !view ||
          view.state !==
            'live'
        ) {
          return {
            meta: [
              ...buildMeta(
                {
                  title:
                    'A shared result | RMH Music',
                  description:
                    'This result is no longer shared. RMH Music teaches reading music and playing it.',
                  path: '/rmhmusic',
                  image:
                    '/images/og/rmhmusic.png',
                  imageAlt:
                    'The RMH Music wordmark on hand-ruled manuscript paper.',
                },
              ),
              NOINDEX,
            ],
            links,
          };
        }
        const lines =
          cardLines(
            view.payload,
          );
        const who =
          view.name ??
          'A learner';
        return {
          meta: [
            ...buildMeta(
              {
                title: `${lines.title}: ${lines.lead} | RMH Music`,
                description: `${who} shared a result from RMH Music. ${[lines.subtitle, lines.stars].filter(Boolean).join(' · ')}.`,
                path: `/rmhmusic/r/${params.token}`,
                image:
                  ogCardPath(
                    'music',
                    params.token,
                  ),
                imageAlt: `RMH Music: ${lines.lead}, ${lines.title}.`,
              },
            ),
            NOINDEX,
          ],
          links,
        };
      },
      component:
        SharedResultRoute,
    },
  );

function SharedResultRoute() {
  const {
    token,
  } =
    Route.useParams();
  useRmhMusicModeRoot();
  return (
    <div className="app-theme rmhmusic-theme">
      <RmhMusicStyles />
      <GameErrorBoundary gameName="RMH Music">
        <SharedResultPage
          token={
            token
          }
        />
      </GameErrorBoundary>
    </div>
  );
}
