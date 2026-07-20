/**
 * Full-screen replay viewer (platform expansion §7).
 *
 * Top-level route (outside `_site`) so it renders without the app sidebar —
 * it carries its own minimal chrome + a back link, like the game routes. The
 * board/timeline is driven by <GameReplayPlayer>. Public replays are viewable
 * by anyone (including signed-out); unlisted replays are owner-only.
 */

import { createFileRoute, Link } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Clock, Trophy } from 'lucide-react';
import { auth } from '@/lib/auth';
import { getReplay } from '@/lib/replays.server';
import { REPLAY_GAME_TITLES } from '@/lib/game/replay';
import { buildMeta, buildCanonical } from '@/lib/seo';
import { GameReplayPlayer } from '@/components/replays/GameReplayPlayer';

const fetchReplay = createServerFn({ method: 'GET' })
  .validator((id: string) => id)
  .handler(async ({ data: id }) => {
    const replay = await getReplay(id);
    if (!replay) return { replay: null };

    // Unlisted replays only render for their owner.
    if (replay.visibility !== 'public') {
      const request = getRequest();
      const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
      if (!session || session.user.id !== replay.author.id) return { replay: null };
    }
    return { replay };
  });

function gameTitle(game: string): string {
  return REPLAY_GAME_TITLES[game] ?? game;
}

function formatDuration(ms: number): string {
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export const Route = createFileRoute('/replays/$id')({
  loader: ({ params }) => fetchReplay({ data: params.id }),
  head: ({ loaderData, params }) => {
    const replay = loaderData?.replay;
    const title = replay
      ? `${gameTitle(replay.game)} replay${replay.score != null ? ` · ${replay.score}` : ''} | RMH Studios`
      : 'Replay | RMH Studios';
    const description = replay
      ? `Watch this ${gameTitle(replay.game)} run by ${replay.author.name ?? 'a player'} on RMH Studios.`
      : 'This replay is not available.';
    return {
      meta: buildMeta({
        title,
        description,
        path: `/replays/${params.id}`,
        image: replay ? `/api/og/replay/${params.id}` : undefined,
      }),
      links: [buildCanonical(`/replays/${params.id}`)],
    };
  },
  component: ReplayPage,
});

function ReplayPage() {
  const { t } = useTranslation('site');
  const { replay } = Route.useLoaderData();

  return (
    <div className="flex min-h-screen flex-col bg-site-bg text-site-text">
      <header className="flex items-center justify-between border-b border-site-border px-4 py-3">
        <Link
          to="/arcade"
          className="inline-flex items-center gap-2 text-sm font-medium text-site-text-muted hover:text-site-text"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {t('replay-back-to-games', { defaultValue: 'Back to games' })}
        </Link>
        <span className="text-sm font-bold">RMH Studios</span>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 py-8">
        {!replay ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
            <p className="font-medium text-site-text">
              {t('replay-not-available', { defaultValue: 'This replay isn’t available.' })}
            </p>
            <Link to="/arcade" className="text-sm font-semibold text-site-accent hover:underline">
              {t('replay-browse-games', { defaultValue: 'Browse games' })}
            </Link>
          </div>
        ) : (
          <>
            <div className="mb-6 flex flex-col items-center gap-2 text-center">
              <h1 className="text-2xl font-bold">{gameTitle(replay.game)}</h1>
              <div className="flex flex-wrap items-center justify-center gap-4 text-sm text-site-text-muted">
                <span className="inline-flex items-center gap-1.5">
                  <Trophy className="h-4 w-4" aria-hidden />
                  {replay.score != null
                    ? `${t('replay-score', { defaultValue: 'Score' })}: ${replay.score}`
                    : t('replay-unscored', { defaultValue: 'Unscored' })}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="h-4 w-4" aria-hidden />
                  {formatDuration(replay.durationMs)}
                </span>
                <span>
                  {t('replay-by', { defaultValue: 'by' })}{' '}
                  {replay.author.handle ? (
                    <Link
                      to="/u/$userid"
                      params={{ userid: replay.author.handle }}
                      className="font-semibold text-site-accent hover:underline"
                    >
                      {replay.author.name ?? replay.author.handle}
                    </Link>
                  ) : (
                    <span className="font-semibold text-site-text">
                      {replay.author.name ?? 'Someone'}
                    </span>
                  )}
                </span>
              </div>
            </div>

            <GameReplayPlayer
              game={replay.game}
              version={replay.version}
              currentVersion={replay.currentVersion}
              versionMatch={replay.versionMatch}
              data={replay.data}
              score={replay.score}
              durationMs={replay.durationMs}
            />
          </>
        )}
      </main>
    </div>
  );
}
