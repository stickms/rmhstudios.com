import { createFileRoute } from '@tanstack/react-router';
import { implement } from '@/lib/api/implement.server';
import {
  getTempleEfficiencyApi,
  rankTempleEfficiencyApi,
} from '@/lib/temple-of-joy/efficiency.contract';
import { prisma } from '@/lib/prisma.server';
import { submitGameScore } from '@/lib/game/submit.server';
import { EFFICIENCY_GAME_ID, efficiencyFromSave } from '@/lib/temple-of-joy/efficiency';

async function mine(userId: string) {
  const row = await prisma.templeOfJoySave.findUnique({
    where: { userId },
    select: { saveData: true },
  });
  return efficiencyFromSave(row?.saveData);
}

/**
 * GET  /api/temple-of-joy/efficiency — the caller's current efficiency, or null
 *      (under an hour of play).
 * POST /api/temple-of-joy/efficiency — rank it. The figure comes from the stored
 *      save, not the request body; the board keeps each member's best.
 */
export const Route = createFileRoute('/api/temple-of-joy/efficiency')({
  server: {
    handlers: {
      GET: implement(getTempleEfficiencyApi, { rateLimit: 'read' }, async ({ userId }) =>
        Response.json(
          { efficiency: await mine(userId) },
          { headers: { 'Cache-Control': 'private, no-store' } },
        ),
      ),
      POST: implement(rankTempleEfficiencyApi, { rateLimit: 'write' }, async ({ userId }) => {
        const eff = await mine(userId);
        if (!eff) return Response.json({ error: 'Play for an hour first' }, { status: 400 });
        const res = await submitGameScore({
          gameId: EFFICIENCY_GAME_ID,
          userId,
          score: eff.score,
          progress: eff.hours,
          durationMs: eff.durationMs,
        });
        if (!res.ok) return Response.json({ error: res.error }, { status: res.status });
        return { ok: true as const, efficiency: eff };
      }),
    },
  },
});
