import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { authorizeInternalRequest } from '@/lib/internal-auth';
import { prisma } from '@/lib/prisma.server';

const bodySchema = z.object({
  sha: z.string().regex(/^[0-9a-f]{4,40}$|^unknown$/),
  status: z.enum(['success', 'rolledback', 'fail']),
  detail: z.string().max(300).optional(),
});

/**
 * POST /api/internal/ops/deploy-event — records a production deploy result for
 * the deploy markers on /admin/alarms. Called by deploy.sh at the end of every
 * deploy. Server-to-server: authorized by the shared internal secret, like the
 * other /api/internal routes.
 */
export const Route = createFileRoute('/api/internal/ops/deploy-event')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authz = authorizeInternalRequest(
          request.headers.get('x-internal-secret'),
          process.env.INTERNAL_API_SECRET,
        );
        if (!authz.ok) {
          return Response.json({ error: 'Unauthorized' }, { status: authz.status });
        }
        const parsed = bodySchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
          return Response.json({ error: 'Invalid input' }, { status: 400 });
        }
        await prisma.opsDeployEvent.create({ data: parsed.data });
        return Response.json({ ok: true });
      },
    },
  },
});
