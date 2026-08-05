/**
 * `/api/rmhtype/practice-test` — a test weighted toward your worst keys
 * (design G1).
 *
 * Server-side because the weights come from the caller's stored aggregates. The
 * generator itself is pure (`lib/rmhtype/custom-test.ts`) and the response
 * carries the seed, so the same text can be regenerated client-side — and a
 * replay of the run needs to store only `{seed, keystrokes}`, never the passage.
 *
 * The response always says `leaderboardEligible: false`. A test built from your
 * own weaknesses is a different test for every player, so it cannot be a
 * comparable board — and a result that quietly does not count is worse than one
 * that says so.
 */

import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { TYPING_LAYOUTS } from '@/lib/rmhtype/keystats';
import { getKeyAggregates, normalizeLayout } from '@/lib/rmhtype/keystats.server';
import { buildCustomTest, TEST_LENGTH_BOUNDS } from '@/lib/rmhtype/custom-test';

const bodySchema = z.object({
  layout: z.enum(TYPING_LAYOUTS).optional(),
  length: z.number().int().min(TEST_LENGTH_BOUNDS.min).max(TEST_LENGTH_BOUNDS.max).optional(),
  punctuation: z.boolean().optional(),
  numbers: z.boolean().optional(),
  language: z.string().min(2).max(8).optional(),
  seed: z.number().int().min(0).max(0xffffffff).optional(),
});

export const Route = createFileRoute('/api/rmhtype/practice-test')({
  server: {
    handlers: {
      POST: defineHandler(
        {
          rateLimit: { policy: 'read', scope: 'user', prefix: 'rmhtype-practice' },
          body: bodySchema,
          allowEmptyBody: true,
        },
        async ({ userId, body }) => {
          const layout = normalizeLayout(body.layout);
          const stats = await getKeyAggregates(userId, layout);
          const test = buildCustomTest({
            mode: 'practice',
            stats,
            length: body.length,
            punctuation: body.punctuation,
            numbers: body.numbers,
            language: body.language,
            seed: body.seed,
          });
          return Response.json({ test, layout });
        },
      ),
    },
  },
});
