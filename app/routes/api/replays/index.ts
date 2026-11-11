import { createFileRoute } from '@tanstack/react-router';
import { implement } from '@/lib/api/implement.server';
import { submitReplayApi } from '@/lib/game/replay.contract';
import { submitReplayBody } from '@/lib/game/replay-schema';
import { saveReplay, ReplayError, type ReplayErrorCode } from '@/lib/replays.server';
import { REPLAYABLE_GAME_IDS } from '@/lib/game/replay';

/** Map a ReplayError code to an HTTP status + message. */
const ERROR_MAP: Record<ReplayErrorCode, [string, number]> = {
  UNKNOWN_GAME: ['Unknown or non-replayable game', 400],
  INVALID_DATA: ['Invalid replay data', 400],
  TOO_LARGE: ['Replay too large', 413],
  VERIFY_FAILED: ['Replay failed verification', 422],
  FORBIDDEN: ['Forbidden', 403],
};

/**
 * POST /api/replays — submit a replay for a deterministic game.
 * The server re-simulates and stores the derived score (client score is only a
 * fallback for games without a verifier).
 */
export const Route = createFileRoute('/api/replays/')({
  server: {
    handlers: {
      POST: implement(
        submitReplayApi,
        {
          rateLimit: { limit: 20, windowMs: 60_000, prefix: 'replay-submit' },
          body: submitReplayBody,
        },
        async ({ userId, body }) => {
          if (!REPLAYABLE_GAME_IDS.includes(body.game)) {
            return Response.json({ error: 'Unknown or non-replayable game' }, { status: 400 });
          }

          try {
            const saved = await saveReplay({
              userId,
              game: body.game,
              data: body.data,
              score: body.score,
              durationMs: body.durationMs,
              visibility: body.visibility,
            });

            return Response.json(
              { id: saved.id, score: saved.score, url: `/replays/${saved.id}` },
              { status: 201 },
            );
          } catch (error) {
            if (error instanceof ReplayError) {
              const [msg, status] = ERROR_MAP[error.code] ?? ['Replay error', 400];
              return Response.json({ error: msg }, { status });
            }
            throw error;
          }
        },
      ),
    },
  },
});
