import { createFileRoute } from '@tanstack/react-router';
import { createHash } from 'node:crypto';
import { getReplay } from '@/lib/replays.server';
import { renderReplayOgImage } from '@/lib/og/replay-image.server';
import { REPLAY_GAME_TITLES, lightsOutShapeLabel } from '@/lib/game/replay';

/** Best-effort subtitle from the game-specific payload. */
function replaySubtitle(game: string, data: unknown): string | null {
  const d = data as { seed?: number; inputs?: unknown[]; track?: string } | null;
  try {
    if (game === 'lights-out' && typeof d?.seed === 'number') {
      const moves = Array.isArray(d?.inputs) ? d.inputs.length : null;
      const shape = lightsOutShapeLabel(d.seed);
      return moves != null ? `${shape} · ${moves} moves` : shape;
    }
    if (game === 'slice-it' && typeof d?.track === 'string') {
      return d.track;
    }
  } catch {
    /* fall through to null */
  }
  return null;
}

/** GET /api/og/replay/$id — dynamic Open Graph card image (PNG) for a replay. */
export const Route = createFileRoute('/api/og/replay/$id')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        try {
          const replay = await getReplay(params.id);
          // Only public replays get a content card; anything else → 404 so
          // unlisted replays don't leak a preview.
          if (!replay || replay.visibility !== 'public') {
            return new Response('Not found', { status: 404 });
          }

          const gameTitle = REPLAY_GAME_TITLES[replay.game] ?? replay.game;
          const subtitle = replaySubtitle(replay.game, replay.data);

          // Replays are immutable once created, so the card can be cached
          // forever, keyed by a content hash of the visible fields.
          const hash = createHash('sha1')
            .update(`${replay.id}:${replay.version}:${replay.score}:${gameTitle}:${subtitle ?? ''}`)
            .digest('hex')
            .slice(0, 16);

          const png = await renderReplayOgImage({
            cacheKey: `${replay.id}:${hash}`,
            gameTitle,
            score: replay.score,
            authorName: replay.author.name ?? 'Someone',
            subtitle,
          });

          return new Response(new Uint8Array(png), {
            headers: {
              'Content-Type': 'image/png',
              'Cache-Control': 'public, max-age=31536000, immutable',
              ETag: `"${hash}"`,
            },
          });
        } catch (error) {
          console.error('Replay OG image error:', error);
          return new Response('Failed to render image', { status: 500 });
        }
      },
    },
  },
});
