import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { getClientIp } from '@/lib/rate-limit';
import crypto from 'crypto';

export const Route = createFileRoute('/api/rmharks/$id/comment/$commentId/view')({
  server: {
    handlers: {
      POST: defineHandler(
        {
          // perf: auth 'optional' lets the wrapper resolve the session once
          // (was a hand-rolled getSession); the bucket stops one client from
          // hammering the table with impressions.
          auth: 'optional',
          rateLimit: { limit: 120, windowMs: 60_000, prefix: 'comment-view' },
        },
        async ({ request, params, userId }) => {
          const { commentId } = params;

          // Derive the client IP at the trusted proxy boundary (Cloudflare / right
          // side of X-Forwarded-For). The previous leftmost-XFF read was
          // attacker-spoofable, letting a client vary the header to dodge the
          // per-IP view dedup below.
          const ip = getClientIp(request);
          const ipHash = crypto.createHash('sha256').update(ip).digest('hex').slice(0, 16);

          // perf: one idempotent INSERT ... ON CONFLICT DO NOTHING instead of an
          // upsert (SELECT + INSERT) per impression. A duplicate view (same
          // user/IP, or a different signed-in user behind the same IP) is skipped
          // rather than erroring.
          try {
            await prisma.rMHarkCommentView.createMany({
              data: [userId ? { commentId, userId, ipHash } : { commentId, ipHash }],
              skipDuplicates: true,
            });
          } catch (err) {
            // FK violation = the comment is gone (deleted / bogus id). A view
            // beacon for it is a no-op, not a server error.
            const e = err as { code?: string; message?: string };
            if (e?.code !== 'P2003' && !/foreign key/i.test(e?.message ?? '')) throw err;
          }

          return Response.json({ success: true });
        },
      ),
    },
  },
});
