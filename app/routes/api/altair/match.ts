import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
/**
 * Altair Multiplayer Match Recording API
 *
 * POST -- server-to-server intake (ALTAIR_SERVER_SECRET bearer) for a finished co-op match.
 *
 * It does NOT record what it is given. The body is a CoopRunJob: the hub's trusted setup (seed,
 * roster, wall clock) plus the host's run LOG and CLAIMED result. The run is queued for a
 * headless replay (lib/altair/verify); only if the replay reproduces the claim does the worker
 * write the REPLAY's numbers to AltairMatch / AltairMatchPlayer / the co-op profile. The response is
 * 202: the result is not known yet, and a rejected run is not an error the caller can fix.
 */

import { z } from 'zod';
import { timingSafeStringEqual } from '@/lib/internal-auth';
import { enqueueCoopRun } from '@/lib/altair/verify/queue.server';

const ALTAIR_SERVER_SECRET = process.env.ALTAIR_SERVER_SECRET;

const jobPlayer = z.object({
  userId: z.string().min(1).max(64),
  userName: z.string().max(64),
  classId: z.string().min(1).max(64),
  slot: z.number().int().min(0).max(3),
});

const claimPlayer = z.object({
  userId: z.string().min(1).max(64),
  level: z.number().int().min(0).max(1000),
  kills: z.number().int().min(0).max(10_000_000),
  coins: z.number().int().min(0).max(100_000_000),
  revivesGiven: z.number().int().min(0).max(10_000),
  revivesReceived: z.number().int().min(0).max(10_000),
  wasDowned: z.boolean(),
  wasAliveAtEnd: z.boolean(),
});

const jobSchema = z.object({
  runId: z.string().min(8).max(64),
  lobbyId: z.string().min(1).max(64),
  hostUserId: z.string().min(1).max(64),
  seed: z.number().int().min(0).max(0xffffffff),
  doubleTime: z.boolean(),
  roster: z.array(jobPlayer).min(1).max(4),
  joins: z.array(jobPlayer).max(16),
  wallMs: z.number().min(0).max(6 * 3_600_000),
  // Shape and size are checked by checkRunLog before any step is simulated.
  log: z.unknown(),
  claim: z.object({
    victory: z.boolean(),
    sharedKills: z.number().int().min(0).max(10_000_000),
    bossesDefeated: z.array(z.string().max(64)).max(100),
    players: z.array(claimPlayer).max(20),
  }),
});

export const Route = createFileRoute('/api/altair/match')({
  server: {
    handlers: {
      POST: defineHandler({ auth: 'none' }, async ({ request }) => {
        const authHeader = request.headers.get('authorization');
        if (
          !ALTAIR_SERVER_SECRET ||
          !authHeader ||
          !timingSafeStringEqual(authHeader, `Bearer ${ALTAIR_SERVER_SECRET}`)
        ) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const parsed = jobSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
          return Response.json(
            { error: parsed.error.issues[0]?.message ?? 'Invalid payload' },
            { status: 400 },
          );
        }

        const outcome = await enqueueCoopRun(parsed.data);
        if (outcome === 'rate_limited') return Response.json({ error: 'Too many runs from this host' }, { status: 429 });
        if (outcome === 'backlog_full') return Response.json({ error: 'Verifier is busy' }, { status: 503 });
        if (outcome === 'failed') return Response.json({ error: 'Could not queue the run' }, { status: 500 });
        return Response.json({ success: true, queued: true, runId: parsed.data.runId }, { status: 202 });
      }),
    },
  },
});
