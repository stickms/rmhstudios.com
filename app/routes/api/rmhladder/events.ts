import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { getClientIp, rateLimit } from '@/lib/rate-limit';
import { readTextBodyLimited, RequestBodyTooLargeError } from '@/lib/http-body.server';

const eventSchema = z.object({
  type: z.enum(['job_impression', 'job_detail', 'save', 'ignore', 'apply_click', 'match_feedback']),
  jobId: z.string().min(1).max(100).optional(),
  metadata: z.record(
    z.string().min(1).max(64),
    z.union([z.string().max(500), z.number().finite(), z.boolean(), z.null()]),
  ).refine((value) => Object.keys(value).length <= 20, 'Too many metadata fields').optional(),
});

const MAX_EVENT_BODY_BYTES = 16 * 1024;

export const Route = createFileRoute('/api/rmhladder/events')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const limited = rateLimit(getClientIp(request), {
          prefix: 'ladder-events',
          limit: 30,
          windowMs: 60_000,
        });
        if (!limited.allowed) {
          return Response.json({ error: 'Too many events' }, {
            status: 429,
            headers: { 'Retry-After': String(limited.retryAfter) },
          });
        }

        let rawBody: string;
        try {
          rawBody = await readTextBodyLimited(request, MAX_EVENT_BODY_BYTES);
        } catch (error) {
          if (!(error instanceof RequestBodyTooLargeError)) throw error;
          return Response.json({ error: 'Event payload too large' }, { status: 413 });
        }
        let body: unknown = null;
        try { body = JSON.parse(rawBody); } catch { /* handled by schema */ }
        const parsed = eventSchema.safeParse(body);
        if (!parsed.success) return Response.json({ error: 'Invalid event' }, { status: 400 });
        const session = await auth.api.getSession({ headers: request.headers });

        // Public browsing should never be an anonymous persistent-write API.
        // The client beacon remains best-effort; signed-in events are the only
        // rows retained for product analytics.
        if (!session?.user) return new Response(null, { status: 204 });

        if (parsed.data.jobId) {
          const exists = await prisma.ladderJob.findUnique({
            where: { id: parsed.data.jobId },
            select: { id: true },
          });
          if (!exists) return Response.json({ error: 'Job not found' }, { status: 404 });
        }

        await prisma.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'rmhladder-event:' + session.user.id}))`;
          const recentCount = await tx.ladderProductEvent.count({
            where: {
              userId: session.user.id,
              createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
            },
          });
          if (recentCount >= 200) return;
          await tx.ladderProductEvent.create({
            data: {
              userId: session.user.id,
              jobId: parsed.data.jobId ?? null,
              type: parsed.data.type,
              metadata: parsed.data.metadata ?? undefined,
            },
          });
        });
        return new Response(null, { status: 204 });
      },
    },
  },
});
