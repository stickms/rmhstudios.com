import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { saveReplay, ReplayError, type ReplayErrorCode } from '@/lib/replays.server';
import { REPLAYABLE_GAME_IDS } from '@/lib/game/replay';

const schema = z.object({
  game: z.string().min(1).max(32),
  // Payload is re-validated per-game inside saveReplay against the game's own
  // schema; here we only need it to be a JSON object.
  data: z.record(z.string(), z.unknown()),
  score: z.number().finite().optional(),
  durationMs: z
    .number()
    .int()
    .min(0)
    .max(24 * 60 * 60 * 1000),
  visibility: z.enum(['public', 'unlisted']).optional(),
});

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
      POST: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

          const { allowed } = rateLimit(getClientIp(request), {
            limit: 20,
            windowMs: 60_000,
            prefix: 'replay-submit',
          });
          if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

          const body = await request.json().catch(() => ({}));
          const parsed = schema.safeParse(body);
          if (!parsed.success) return Response.json({ error: 'Invalid input' }, { status: 400 });

          if (!REPLAYABLE_GAME_IDS.includes(parsed.data.game)) {
            return Response.json({ error: 'Unknown or non-replayable game' }, { status: 400 });
          }

          const saved = await saveReplay({
            userId: session.user.id,
            game: parsed.data.game,
            data: parsed.data.data,
            score: parsed.data.score,
            durationMs: parsed.data.durationMs,
            visibility: parsed.data.visibility,
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
          console.error('Replay submit error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
