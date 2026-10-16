import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { roommateProfileSchema } from '@/lib/homes/roommate';
import { getRoommateProfile, saveRoommateProfile } from '@/lib/homes/roommate.server';

/**
 * GET /api/homes/roommate — the caller's own lifestyle-quiz answers (or null).
 * PUT /api/homes/roommate — save/replace them (F9). Answers are only ever
 * returned to their owner; others see a compatibility percentage.
 */
export const Route = createFileRoute('/api/homes/roommate')({
  server: {
    handlers: {
      GET: defineHandler({ rateLimit: 'read' }, async ({ userId }) =>
        Response.json(
          { profile: await getRoommateProfile(userId) },
          { headers: { 'Cache-Control': 'private, no-store' } },
        ),
      ),
      // Tight on purpose: retaking the quiz in a loop would let a viewer
      // probe a poster's answers one percentage at a time.
      PUT: defineHandler(
        {
          rateLimit: { limit: 10, windowMs: 3_600_000, prefix: 'homes-roommate-quiz' },
          body: roommateProfileSchema,
        },
        async ({ userId, body }) => {
          await saveRoommateProfile(userId, body);
          return Response.json({ success: true });
        },
      ),
    },
  },
});
