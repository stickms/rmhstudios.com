import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { requireChat } from '@/lib/chat-plus/route-helpers.server';
import {
  checklistSchema,
  createChecklist,
  toggleChecklistItem,
} from '@/lib/chat-plus/checklist.server';

const tickSchema = z.object({
  messageId: z.string().min(1).max(40),
  index: z.number().int().min(0).max(19),
});

/**
 * POST /api/chats/$kind/$id/checklist — post a checklist message (M5).
 * PUT  /api/chats/$kind/$id/checklist — tick / untick one item. Anyone in the
 *      chat may; the new state is broadcast on the chat's existing channel.
 */
export const Route = createFileRoute('/api/chats/$kind/$id/checklist')({
  server: {
    handlers: {
      POST: defineHandler(
        {
          rateLimit: { limit: 20, windowMs: 60_000, prefix: 'chat-checklist' },
          body: checklistSchema,
        },
        async ({ params, userId, body }) => {
          const access = await requireChat(params, userId, { write: true });
          if (access instanceof Response) return access;
          const posted = await createChecklist(access, body);
          return Response.json({ message: posted.message, kind: posted.kind }, { status: 201 });
        },
      ),
      PUT: defineHandler(
        { rateLimit: { limit: 120, windowMs: 60_000, prefix: 'chat-tick' }, body: tickSchema },
        async ({ params, userId, body }) => {
          const access = await requireChat(params, userId, { write: true });
          if (access instanceof Response) return access;
          const res = await toggleChecklistItem(access, body.messageId, body.index);
          if (!res.ok) return Response.json({ error: res.error }, { status: res.status });
          return Response.json({ items: res.items });
        },
      ),
    },
  },
});
