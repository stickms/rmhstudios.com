/**
 * `/api/speedrun/categories` — the boards that exist (design K1).
 *
 * GET is public: a leaderboard nobody can read is not a leaderboard. POST is
 * admin-only and idempotent per `(game, slug, version)`, so seeding the starter
 * catalog twice creates one set of boards, not two.
 */

import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { DEFAULT_SPEEDRUN_CATEGORIES } from '@/lib/speedrun/catalog';
import { listCategories, SpeedrunError, upsertCategory } from '@/lib/speedrun/speedrun.server';
import { speedrunGameIds } from '@/lib/speedrun/verifier';
import { SPEEDRUN_METRICS, type SpeedrunMetric } from '@/lib/speedrun/types';

const querySchema = z.object({
  game: z.string().min(1).max(32).optional(),
  /** Admins only; ignored for everyone else so an inactive board stays hidden. */
  includeInactive: z.enum(['0', '1']).optional(),
});

const categorySchema = z.object({
  game: z.string().min(1).max(32),
  // The slug is part of a URL and of a unique key, so it is constrained rather
  // than trimmed: "Any %" and "any%" must not become two boards for one category.
  slug: z
    .string()
    .min(1)
    .max(32)
    .regex(/^[a-z0-9-]+$/, 'lowercase letters, digits and dashes only'),
  version: z.string().min(1).max(16),
  name: z.string().min(1).max(60),
  rules: z.string().min(1).max(2000),
  metric: z.enum(SPEEDRUN_METRICS as readonly [SpeedrunMetric, ...SpeedrunMetric[]]),
  active: z.boolean().optional(),
});

const bodySchema = z.union([
  categorySchema,
  /** Open every starter board in one call. */
  z.object({ seed: z.literal(true) }),
]);

export const Route = createFileRoute('/api/speedrun/categories')({
  server: {
    handlers: {
      GET: defineHandler(
        { auth: 'optional', rateLimit: 'read', query: querySchema },
        async ({ query, isAdmin }) => {
          const categories = await listCategories({
            game: query.game,
            includeInactive: isAdmin && query.includeInactive === '1',
          });
          return Response.json({ categories, games: speedrunGameIds() });
        },
      ),

      POST: defineHandler(
        { auth: 'admin', rateLimit: 'write', body: bodySchema },
        async ({ body }) => {
          try {
            if ('seed' in body) {
              const categories = [];
              for (const seed of DEFAULT_SPEEDRUN_CATEGORIES) {
                categories.push(await upsertCategory({ ...seed }));
              }
              return Response.json({ categories });
            }
            const category = await upsertCategory(body);
            return Response.json({ category });
          } catch (error) {
            if (error instanceof SpeedrunError && error.code === 'UNKNOWN_GAME') {
              return Response.json(
                { error: 'That game has no speedrun verifier entry.' },
                { status: 400 },
              );
            }
            throw error;
          }
        },
      ),
    },
  },
});
