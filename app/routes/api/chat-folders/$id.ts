import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { deleteFolder, folderNameSchema, renameFolder } from '@/lib/chat-plus/folders.server';

/** PATCH /api/chat-folders/$id — rename. DELETE — remove the folder (never the chats). */
export const Route = createFileRoute('/api/chat-folders/$id')({
  server: {
    handlers: {
      PATCH: defineHandler(
        { rateLimit: 'write', body: folderNameSchema },
        async ({ userId, params, body }) => {
          const res = await renameFolder(userId, params.id, body.name);
          if (!res.ok) return Response.json({ error: res.error }, { status: res.status });
          return Response.json({ folder: res.value });
        },
      ),
      DELETE: defineHandler({ rateLimit: 'write' }, async ({ userId, params }) => {
        const ok = await deleteFolder(userId, params.id);
        if (!ok) return Response.json({ error: 'Folder not found' }, { status: 404 });
        return Response.json({ success: true });
      }),
    },
  },
});
