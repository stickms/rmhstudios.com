/**
 * POST /api/slice-it/ai/search — search the library in a sentence. (Feature 6.)
 *
 * Returns `{ query, songs, interpreted }`. `interpreted` says whether a model
 * was involved, so the UI can show "I read that as: songs over 140 BPM you have
 * not played" rather than leaving the player guessing why these results.
 *
 * **It always returns results.** With no provider the phrase becomes a plain
 * substring search, which is exactly what the search box did before this route
 * existed — so the box never gets worse than it was, only sometimes better.
 *
 * `auth: 'optional'`: anonymous visitors browse the library, so they get search
 * too. What they do not get is a model call — `interpretSearch` is skipped
 * without a session, because a metered call needs an account to charge and
 * `assertAiBudget` explicitly does not gate anonymous callers.
 */

import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { assertAiBudget } from '@/lib/ai/budget.server';
import { SearchRequestZ } from '@/lib/slice-it/ai/api-schemas';
import { interpretSearch, runSearch } from '@/lib/slice-it/ai/discovery.server';
import { isAiConfigured } from '@/lib/slice-it/ai/run.server';
import type { SearchQuery } from '@/lib/slice-it/ai/types';

export const Route = createFileRoute('/api/slice-it/ai/search')({
  server: {
    handlers: {
      POST: defineHandler(
        {
          auth: 'optional',
          body: SearchRequestZ,
          rateLimit: {
            policy: 'ai',
            limit: 20,
            windowMs: 60_000,
            prefix: 'slice-ai-search',
            scope: 'user',
          },
        },
        async ({ userId, body }) => {
          let query: SearchQuery | null = null;

          if (userId && isAiConfigured()) {
            await assertAiBudget(userId);
            query = await interpretSearch(body.phrase, { userId });
          }

          // The fallback is a plain substring search on the whole phrase — the
          // pre-AI behaviour, and the right answer whenever interpretation was
          // skipped or failed.
          const effective: SearchQuery = query ?? {
            terms: [body.phrase],
            interpretation: '',
          };

          const songs = await runSearch(effective, userId);
          return Response.json({
            query: effective,
            songs,
            interpreted: query !== null,
          });
        },
      ),
    },
  },
});
