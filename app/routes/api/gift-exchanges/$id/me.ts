import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { updateMemberSchema } from '@/lib/gifting/exchange';
import { updateMember } from '@/lib/gifting/exchange.server';

/** PUT the caller's own exclusions and (mixtape) tracks, while sign-ups are open. */
export const Route = createFileRoute('/api/gift-exchanges/$id/me')({
  server: {
    handlers: {
      PUT: defineHandler(
        { rateLimit: 'write', body: updateMemberSchema },
        async ({ userId, params, body }) => {
          const res = await updateMember(params.id, userId, body);
          if (!res.ok) return Response.json({ error: res.error }, { status: res.status });
          return Response.json({ ok: true });
        },
      ),
    },
  },
});
