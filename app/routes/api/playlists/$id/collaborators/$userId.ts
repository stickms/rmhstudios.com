import { createFileRoute } from '@tanstack/react-router';
import { implement } from '@/lib/api/implement.server';
import { removePlaylistCollaboratorApi } from '@/lib/playlists/playlists.contract';
import { removeCollaborator } from '@/lib/playlists.server';

/** DELETE /api/playlists/$id/collaborators/$userId — remove a collaborator (owner only). */
export const Route = createFileRoute('/api/playlists/$id/collaborators/$userId')({
  server: {
    handlers: {
      DELETE: implement(
        removePlaylistCollaboratorApi,
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
          return { success: true as const };
        },
      ),
    },
  },
});
