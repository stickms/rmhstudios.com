import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { recordShowdownResult } from '@/lib/bums-rush/progress/save.server';
import type { ShowdownResult } from '@/lib/bums-rush/types';

/**
 * POST /api/bums-rush/showdown — one Showdown match result (design doc
 * §10.3). `auth: 'optional'`: Showdown is playable signed out, and a guest's
 * seat is recorded with `userId: null` (§10.5) rather than rejected.
 */
const playerSchema = z
  .object({
    seat: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
    userId: z.string().min(1).max(64).nullable(),
    roundsWon: z.number().int().min(0).max(99),
    won: z.boolean(),
  })
  .strict();

const showdownBodySchema = z
  .object({
    ranked: z.boolean(),
    teams: z.boolean(),
    rounds: z.number().int().min(1).max(99),
    players: z.array(playerSchema).min(2).max(4),
  })
  .strict()
  .superRefine((value, ctx) => {
    const seatIndices = new Set(value.players.map((p) => p.seat));
    if (seatIndices.size !== value.players.length) {
      ctx.addIssue({ code: 'custom', message: 'duplicate seat index' });
    }
    if (value.players.filter((p) => p.won).length < 1) {
      ctx.addIssue({ code: 'custom', message: 'no winner reported' });
    }
    // Ranked play requires everyone to have an account — a guest has no
    // rating to move (§10.4). A ranked match with any anonymous seat is
    // rejected outright rather than silently downgraded to casual, so the
    // client's own "ranked requires sign-in" gate can't be bypassed by lying
    // about `ranked` after the fact.
    if (value.ranked && value.players.some((p) => p.userId == null)) {
      ctx.addIssue({
        code: 'custom',
        message: 'ranked matches require every seat to be signed in',
      });
    }
  });

export const Route = createFileRoute('/api/bums-rush/showdown')({
  server: {
    handlers: {
      POST: defineHandler(
        { auth: 'optional', rateLimit: 'write', body: showdownBodySchema },
        async ({ userId, body }) => {
          const result: ShowdownResult = {
            ranked: body.ranked,
            teams: body.teams,
            rounds: body.rounds,
            players: body.players,
          };
          const outcome = await recordShowdownResult(result, userId);
          return Response.json(outcome);
        },
      ),
    },
  },
});
