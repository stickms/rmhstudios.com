import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { getClientIp } from '@/lib/rate-limit';
import crypto from 'crypto';

export const Route = createFileRoute('/api/rmharks/$id/comment/$commentId/view')({
  server: {
    handlers: {
      POST: defineHandler({ auth: 'none' }, async ({ request, params }) => {
        const { commentId } = params;

        let userId: string | null = null;
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          userId = session?.user?.id ?? null;
        } catch {
          // Not logged in
        }

        // Derive the client IP at the trusted proxy boundary (Cloudflare / right
        // side of X-Forwarded-For). The previous leftmost-XFF read was
        // attacker-spoofable, letting a client vary the header to dodge the
        // per-IP view dedup below.
        const ip = getClientIp(request);
        const ipHash = crypto.createHash('sha256').update(ip).digest('hex').slice(0, 16);

        if (userId) {
          await prisma.rMHarkCommentView.upsert({
            where: { commentId_userId: { commentId, userId } },
            create: { commentId, userId, ipHash },
            update: {},
          });
        } else {
          await prisma.rMHarkCommentView.upsert({
            where: { commentId_ipHash: { commentId, ipHash } },
            create: { commentId, ipHash },
            update: {},
          });
        }

        return Response.json({ success: true });
      }),
    },
  },
});
