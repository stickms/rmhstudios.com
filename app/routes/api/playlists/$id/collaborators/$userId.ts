import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { removeCollaborator } from '@/lib/playlists.server';

/** DELETE /api/playlists/$id/collaborators/$userId — remove a collaborator (owner only). */
export const Route = createFileRoute('/api/playlists/$id/collaborators/$userId')({
  server: {
    handlers: {
      DELETE: defineHandler(
        {
          rateLimit: {
            policy: 'write',
            scope: 'user',
            prefix: 'mutation:playlists/:id/collaborators/:userId',
          },
        },
        async ({ params, session }) => {
          const ok = await removeCollaborator(params.id, session.user.id, params.userId);
          if (!ok) return Response.json({ error: 'Not found' }, { status: 404 });
          return Response.json({ success: true });
        },
      ),
    },
  },
});
