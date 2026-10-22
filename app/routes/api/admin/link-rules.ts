import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { logAdminAction } from '@/lib/admin-audit.server';
import { deleteLinkRule, listLinkRules, upsertLinkRule } from '@/lib/safety/link-risk.server';

/** S6 — admin-editable link-warning domain rules. GET · POST {domain, kind, note?} · DELETE ?domain=. */
export const Route = createFileRoute('/api/admin/link-rules')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'admin', rateLimit: 'read' }, async () =>
        Response.json({ items: await listLinkRules() }),
      ),
      POST: defineHandler(
        {
          auth: 'admin',
          rateLimit: 'write',
          body: z.object({
            domain: z.string().trim().min(3).max(255),
            kind: z.enum(['DENY', 'ALLOW']),
            note: z.string().trim().max(200).optional(),
          }),
        },
        async ({ userId, body }) => {
          const ok = await upsertLinkRule(body.domain, body.kind, body.note || null, userId);
          if (!ok)
            return Response.json(
              { error: 'Enter a bare domain like example.com' },
              { status: 400 },
            );
          await logAdminAction(userId, `linkrule.${body.kind.toLowerCase()}`, {
            targetType: 'domain',
            targetId: body.domain.slice(0, 64),
          });
          return Response.json({ success: true }, { status: 201 });
        },
      ),
      DELETE: defineHandler(
        {
          auth: 'admin',
          rateLimit: 'write',
          query: z.object({ domain: z.string().min(3).max(255) }),
        },
        async ({ userId, query }) => {
          const ok = await deleteLinkRule(query.domain);
          if (ok)
            await logAdminAction(userId, 'linkrule.delete', {
              targetType: 'domain',
              targetId: query.domain.slice(0, 64),
            });
          return Response.json({ success: ok }, { status: ok ? 200 : 404 });
        },
      ),
    },
  },
});
