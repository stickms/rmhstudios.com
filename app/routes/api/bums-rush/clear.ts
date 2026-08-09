import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { badRequest, defineHandler } from '@/lib/api/handler.server';
import { recordLevelResult } from '@/lib/bums-rush/progress/save.server';
import type { LevelResult } from '@/lib/bums-rush/types';

/**
 * POST /api/bums-rush/clear — one level result (design doc §10.3).
 *
 * Mirrors `LevelResult` (`lib/bums-rush/types.ts`) exactly; the shared
 * persistence in `lib/bums-rush/progress/save.server.ts` applies the §9.8
 * plausibility bounds and upserts `BumsRushLevelClear` keeping the better
 * time and the union of objectives — safe to call repeatedly with the same
 * or a worse result (a no-op), which matters because a flaky connection
 * retrying this POST must never regress or duplicate a record.
 */
const seatSchema = z
  .object({
    seat: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
    userId: z.string().min(1).max(64).nullable(),
  })
  .strict();

const clearBodySchema = z
  .object({
    levelId: z.string().min(1).max(64),
    playerCount: z.number().int().min(1).max(4),
    // §9.8's 2h ceiling is enforced by the validator; this is just an
    // overflow guard so a hostile payload cannot carry a value large enough
    // to misbehave in arithmetic before validation ever runs.
    durationMs: z
      .number()
      .finite()
      .min(0)
      .max(24 * 60 * 60 * 1000),
    deaths: z.number().int().min(0).max(100_000),
    objectiveIds: z.array(z.string().min(1).max(64)).max(3),
    assisted: z.boolean(),
    catUsed: z.boolean(),
    seats: z.array(seatSchema).min(1).max(4),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.seats.length !== value.playerCount) {
      ctx.addIssue({ code: 'custom', message: 'seats must have exactly playerCount entries' });
    }
    const seatIndices = new Set(value.seats.map((s) => s.seat));
    if (seatIndices.size !== value.seats.length) {
      ctx.addIssue({ code: 'custom', message: 'duplicate seat index' });
    }
  });

export const Route = createFileRoute('/api/bums-rush/clear')({
  server: {
    handlers: {
      POST: defineHandler(
        { rateLimit: 'write', body: clearBodySchema },
        async ({ userId, body }) => {
          // A plain HTTP submission carries no room context to check "seats the
          // server saw" against (§9.8) — the socket path has that. The minimum
          // this endpoint can still enforce: the signed-in caller must be one of
          // the seats they are crediting, not an arbitrary third party.
          if (!body.seats.some((seat) => seat.userId === userId)) {
            return badRequest('You can only submit a result that credits your own seat');
          }

          const result: LevelResult = {
            levelId: body.levelId,
            playerCount: body.playerCount,
            durationMs: body.durationMs,
            deaths: body.deaths,
            objectiveIds: body.objectiveIds,
            assisted: body.assisted,
            catUsed: body.catUsed,
            seats: body.seats,
          };

          const outcome = await recordLevelResult(result);
          return Response.json({
            ranked: outcome.ranked,
            reasons: outcome.reasons,
            clear: outcome.perUser[userId] ?? null,
          });
        },
      ),
    },
  },
});
