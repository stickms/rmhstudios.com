/**
 * Embeddable replay widget (platform expansion §7).
 *
 * A chrome-free, iframe-friendly rendering of a single PUBLIC replay for
 * embedding on external sites. Top-level route (outside `_site`) so it carries
 * no sidebars or app navigation. Only public replays are embeddable; anything
 * else renders a neutral fallback so unlisted replays never leak.
 */

import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { useTranslation } from 'react-i18next';
import { getReplay } from '@/lib/replays.server';
import { REPLAY_GAME_TITLES } from '@/lib/game/replay';
import { GameReplayPlayer } from '@/components/replays/GameReplayPlayer';

const fetchEmbed = createServerFn({ method: 'GET' })
  .validator((id: string) => id)
  .handler(async ({ data: id }) => {
    const replay = await getReplay(id);
    if (!replay || replay.visibility !== 'public') return null;
    return replay;
  });

export const Route = createFileRoute('/embed/replay/$id')({
  loader: async ({ params }) => ({ replay: await fetchEmbed({ data: params.id }) }),
  head: () => ({ meta: [{ name: 'robots', content: 'noindex' }] }),
  component: EmbedReplay,
});

function gameTitle(game: string): string {
  return REPLAY_GAME_TITLES[game] ?? game;
}

function EmbedReplay() {
  const { t } = useTranslation('site');
  const { replay } = Route.useLoaderData();
  const replayHref = replay ? `https://rmhstudios.com/replays/${replay.id}` : '#';

  if (!replay) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-site-bg p-4">
        <div className="rounded-xl border border-site-border bg-site-surface px-5 py-4 text-sm text-site-text-muted">
          {t('replay-not-embeddable', { defaultValue: 'This replay isn’t available to embed.' })}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-site-bg p-3">
      <div className="mx-auto max-w-xl rounded-2xl border border-site-border bg-site-surface p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-site-text">{gameTitle(replay.game)}</p>
            <p className="truncate text-xs text-site-text-dim">
              {t('replay-by', { defaultValue: 'by' })} {replay.author.name ?? 'Someone'}
              {replay.score != null && ` · ${t('replay-score', { defaultValue: 'Score' })} ${replay.score}`}
            </p>
          </div>
          <a
            href={replayHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-semibold text-site-accent hover:underline"
          >
            <span className="inline-block h-3.5 w-3.5 rounded bg-site-accent" />
            {t('replay-view-on-rmh', { defaultValue: 'View on RMH Studios' })}
          </a>
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
      </div>
    </div>
  );
}
