import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { resumeCards, RESUME_LIMIT_DEFAULT, RESUME_LIMIT_MAX } from '@/lib/history/resume.server';

/**
 * GET /api/history/resume — what this account left unfinished (B2).
 *
 * Auth is required rather than optional: every source is per-user, so an
 * anonymous caller has nothing to receive and a 401 is a clearer answer than an
 * empty array that looks like "you have finished everything".
 *
 * No cache layer. The response is per-user and changes the moment anything is
 * saved, read or drafted — an `apiCache` entry keyed by user id would mostly
 * serve a rail that is one action out of date, which is exactly the case
 * ("I just closed that book, why isn't it here") the feature exists to answer.
 */

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(RESUME_LIMIT_MAX).optional(),
});

export const Route = createFileRoute('/api/history/resume')({
  server: {
    handlers: {
      GET: defineHandler({ rateLimit: 'read', query: querySchema }, async ({ userId, query }) => {
        const cards = await resumeCards(userId, query.limit ?? RESUME_LIMIT_DEFAULT);
        return Response.json({ cards });
      }),
    },
  },
});
