import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler, apiError } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { decodeRunLog } from '@/lib/altair/verify/log-codec.server';
import { MAX_ENCODED_LOG_CHARS } from '@/lib/altair/verify/log-codec';
import { allowSoloSubmission, enqueueSoloRun } from '@/lib/altair/solo/queue.server';

/**
 * POST — hand in a finished (or abandoned) single-player run. Nothing in the body is believed: the log
 * is queued for a headless replay in the jobs worker, and coins / leaderboard rows are written only from
 * what the replay reproduces (lib/altair/solo). Answers 202 (the result is not known yet).
 *
 *   queued | inline  -> verified later; the client polls /api/altair/run/status
 *   unverified       -> the server could not take the log (queue full, rate limited); the run is marked
 *                       so the capped /api/altair/meta fallback may pay it, and the client uses that
 */
const body = z.object({
  runId: z.string().min(8).max(64),
  log: z.object({ enc: z.enum(['gzip-b64', 'json']), data: z.string().min(1).max(MAX_ENCODED_LOG_CHARS) }),
  claim: z.object({
    victory: z.boolean(),
    kills: z.number().int().min(0).max(10_000_000),
    level: z.number().int().min(0).max(1000),
    finalCoins: z.number().int().min(0).max(100_000_000),
  }),
});

export const Route = createFileRoute('/api/altair/run/finish')({
  server: {
    handlers: {
      POST: defineHandler(
        { rateLimit: { limit: 12, windowMs: 60_000, prefix: 'altair-run-finish', scope: 'user' }, body },
        async ({ userId, body }) => {
          const now = new Date();
          const row = await prisma.altairSoloRun.findFirst({ where: { id: body.runId, userId } });
          if (!row) return apiError('Unknown run', 404);
          if (row.status !== 'open') {
            // A repeat of a settled submission changes nothing.
            return Response.json({ status: row.status === 'unverified' ? 'unverified' : 'duplicate', runStatus: row.status });
          }
          if (now > row.expiresAt) {
            await prisma.altairSoloRun.updateMany({ where: { id: row.id, status: 'open' }, data: { status: 'expired', openUserId: null } });
            return apiError('Run expired', 410);
          }
          const log = decodeRunLog(body.log);
          if (!log) return apiError('Bad log', 400);

          // Close the run first: whoever flips open -> submitted owns the submission.
          const wallMs = now.getTime() - row.issuedAt.getTime();
          const closed = await prisma.altairSoloRun.updateMany({
            where: { id: row.id, status: 'open' },
            data: { status: 'submitted', openUserId: null, submittedAt: now },
          });
          if (closed.count === 0) return Response.json({ status: 'duplicate' });

          const unverified = async () => {
            await prisma.altairSoloRun.updateMany({ where: { id: row.id, status: 'submitted' }, data: { status: 'unverified' } });
            return Response.json({ status: 'unverified' }, { status: 202 });
          };
          if (!allowSoloSubmission(userId)) return unverified();
          const queued = await enqueueSoloRun({ runId: row.id, userId, wallMs, log, claim: body.claim });
          if (queued === 'backlog_full' || queued === 'failed') return unverified();
          return Response.json({ status: queued }, { status: 202 });
        },
      ),
    },
  },
});
