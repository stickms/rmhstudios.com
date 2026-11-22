/**
 * RMHBox player page — `/rmhbox/players/$userId`.
 *
 * A player's record: totals, per-minigame stats and recent matches. Who may see
 * it is decided server-side from the member's game-activity setting
 * (`lib/rmhbox/player-stats.server.ts`); the loader runs the stats endpoint
 * in-process, so the page and the endpoint cannot disagree. Only a public record
 * is indexable.
 */
import { createFileRoute } from '@tanstack/react-router';
import PlayerStatsPage from '@/components/rmhbox/PlayerStatsPage';
import { playerStatsQuery } from '@/lib/rmhbox/player-stats.queries';
import { buildMeta, noindexHead } from '@/lib/seo';
import { prefetchRouteQuery } from '@/lib/route/route-query';

export const Route = createFileRoute('/rmhbox/players/$userId')({
  loader: async ({ context, params }) => {
    await prefetchRouteQuery(context.queryClient, playerStatsQuery(params.userId));
    const data = context.queryClient.getQueryData(playerStatsQuery(params.userId).queryKey);
    // `totals` is what a signed-out visitor (a crawler) gets, and only for a public record.
    return { indexable: data?.access === 'totals', name: data?.player.name ?? null };
  },
  head: ({ loaderData, params }) =>
    loaderData?.indexable && loaderData.name
      ? {
          meta: buildMeta({
            title: `${loaderData.name} on RMHBox`,
            description: `${loaderData.name}'s RMHBox record: games played, wins and streaks.`,
            path: `/rmhbox/players/${params.userId}`,
          }),
        }
      : noindexHead('RMHBox player'),
  component: PlayerStatsRoute,
});

function PlayerStatsRoute() {
  const { userId } = Route.useParams();
  return <PlayerStatsPage userId={userId} />;
}
