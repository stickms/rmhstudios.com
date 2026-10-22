import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { createFolder, folderNameSchema, listFolders } from '@/lib/chat-plus/folders.server';

/**
 * Chat folders (M1).
 * GET  — the viewer's folders with the chats in each.
 * POST — create a folder. Body: { name }.
 */
export const Route = createFileRoute('/api/chat-folders/')({
  server: {
    handlers: {
      GET: defineHandler({ rateLimit: 'read' }, async ({ userId }) =>
        Response.json(
          { folders: await listFolders(userId) },
          { headers: { 'Cache-Control': 'private, no-store' } },
        ),
      ),
      POST: defineHandler(
        { rateLimit: 'write', body: folderNameSchema },
        async ({ userId, body }) => {
          const res = await createFolder(userId, body.name);
          if (!res.ok) return Response.json({ error: res.error }, { status: res.status });
          return Response.json({ folder: res.value }, { status: 201 });
        },
      ),
    },
  },
});
