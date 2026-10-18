import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { folderItemSchema, setFolderMembership } from '@/lib/chat-plus/folders.server';

/** PUT /api/chat-folders/$id/items — put a chat in, or take it out of, a folder. */
export const Route = createFileRoute('/api/chat-folders/$id/items')({
  server: {
    handlers: {
      PUT: defineHandler(
        { rateLimit: 'write', body: folderItemSchema },
        async ({ userId, params, body }) => {
          const res = await setFolderMembership(userId, params.id, body.chat, body.member);
          if (!res.ok) return Response.json({ error: res.error }, { status: res.status });
          return Response.json(res.value);
        },
      ),
    },
  },
});
