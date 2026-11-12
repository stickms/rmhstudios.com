import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import {
  addPlaylistCollaboratorApi,
  listPlaylistCollaboratorsApi,
} from '@/lib/playlists/playlists.contract';
import { addCollaboratorBody } from '@/lib/playlists/playlists-schema';
import { addCollaborator, listCollaborators } from '@/lib/playlists.server';

/**
 * GET  /api/playlists/$id/collaborators — list collaborators (owner only).
 * POST /api/playlists/$id/collaborators — add one by handle (owner only, max 10).
 */
export const route = apiRoute('/api/playlists/$id/collaborators', {
  GET: implement(listPlaylistCollaboratorsApi, {}, async ({ params, session }) => {
    const collaborators = await listCollaborators(params.id, session.user.id);
    if (!collaborators) return Response.json({ error: 'Not found' }, { status: 404 });
    return { collaborators };
  }),

  POST: implement(
    addPlaylistCollaboratorApi,
    {
      rateLimit: { limit: 20, windowMs: 60_000, prefix: 'playlist-collab-add' },
      body: addCollaboratorBody,
    },
    async ({ params, session, body }) => {
      const result = await addCollaborator(params.id, session.user.id, body.handle);
      if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
      return Response.json({ success: true }, { status: 201 });
    },
  ),
});
