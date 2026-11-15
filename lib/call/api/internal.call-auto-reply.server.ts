import { apiRoute } from '@/lib/api/route.server';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { authorizeInternalRequest } from '@/lib/internal-auth';
import { sendCallAutoReply } from '@/lib/call/auto-reply.server';

const bodySchema = z.object({
  callerId: z.string().min(1).max(64),
  calleeId: z.string().min(1).max(64),
  trigger: z.enum(['busy', 'missed', 'unavailable']),
});

/**
 * POST /api/internal/call-auto-reply — the call hub asking the web tier to send
 * a callee's automatic "can't take your call" DM.
 *
 * Server-to-server only: `auth: 'none'` because there is no user session, and the
 * shared secret is checked first thing in the handler. The hub supplies the
 * trigger and nothing else is trusted — `sendCallAutoReply` re-checks the
 * callee's mode, any block/mute/privacy between the two, DM privacy and the
 * per-caller cooldown. Once authorised it answers 200 with the outcome, since
 * "not sent" is routine (most calls never meet a user who asked for this).
 */
export const route = apiRoute('/api/internal/call-auto-reply', {
  POST: defineHandler(
    {
      auth: 'none',
      // Keyed per caller IP (the hub's), so generous: one hub fronts every call.
      rateLimit: { limit: 600, windowMs: 60_000, prefix: 'call-auto-reply' },
      body: bodySchema,
      label: 'call-auto-reply',
    },
    async ({ request, body }) => {
      const authz = authorizeInternalRequest(
        request.headers.get('x-internal-secret'),
        process.env.INTERNAL_API_SECRET,
      );
      if (!authz.ok) return Response.json({ error: 'Unauthorized' }, { status: authz.status });
      return Response.json(await sendCallAutoReply(body));
    },
  ),
});
