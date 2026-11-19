/**
 * RMH Music Friends and sharing — `/rmhmusic/friends` (Phase 6): the learner's two social
 * switches, the friends who share their progress, and the learner's shared result links. The
 * layout route (`rmhmusic.tsx`) already gates auth and applies the app theme. Personal (signed in,
 * noindex), like the rest of the app. The loader seeds the page's reads (redesign audit B4).
 */

import { createFileRoute } from '@tanstack/react-router';
import { noindexHead } from '@/lib/seo';
import { prefetchRouteQuery } from '@/lib/route/route-query';
import {
  musicFriendsQuery,
  musicSharesQuery,
  musicSocialQuery,
} from '@/lib/rmhmusic/social/social.queries';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import { FriendsPage } from '@/components/rmhmusic/learn/social/FriendsPage';

export const Route =
  createFileRoute(
    '/rmhmusic/friends',
  )(
    {
      head: () =>
        noindexHead(
          'RMHMusic Friends and sharing',
        ),
      loader:
        async ({
          context,
        }) => {
          await Promise.all(
            [
              prefetchRouteQuery(
                context.queryClient,
                musicSocialQuery(),
              ),
              prefetchRouteQuery(
                context.queryClient,
                musicFriendsQuery(
                  100,
                ),
              ),
              prefetchRouteQuery(
                context.queryClient,
                musicSharesQuery(),
              ),
            ],
          );
          return undefined;
        },
      component:
        FriendsRoute,
    },
  );

function FriendsRoute() {
  return (
    <GameErrorBoundary gameName="RMH Music">
      <FriendsPage />
    </GameErrorBoundary>
  );
}
