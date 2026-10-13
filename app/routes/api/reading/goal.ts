import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { goalSchema } from '@/lib/reading/schema';
import { clearGoal, getGoalProgress, setGoal } from '@/lib/reading/shelves.server';

/**
 * GET    /api/reading/goal?year= — the yearly challenge and its progress (L3).
 * PUT    /api/reading/goal — set the year's goal (books or pages).
 * DELETE /api/reading/goal?year= — drop it.
 */
const yearQuery = z.object({
  year: z.coerce.number().int().min(2000).max(2200).optional(),
});
const currentYear = () => new Date().getUTCFullYear();

export const Route = createFileRoute('/api/reading/goal')({
  server: {
    handlers: {
      GET: defineHandler({ rateLimit: 'read', query: yearQuery }, async ({ userId, query }) => {
        const goal = await getGoalProgress(userId, query.year ?? currentYear());
        return Response.json({ goal }, { headers: { 'Cache-Control': 'private, no-store' } });
      }),
      PUT: defineHandler({ rateLimit: 'write', body: goalSchema }, async ({ userId, body }) => {
        return Response.json({ goal: await setGoal(userId, body) });
      }),
      DELETE: defineHandler({ rateLimit: 'write', query: yearQuery }, async ({ userId, query }) => {
        await clearGoal(userId, query.year ?? currentYear());
        return Response.json({ ok: true });
      }),
    },
  },
});
