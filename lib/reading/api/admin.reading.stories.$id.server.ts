import { apiRoute } from '@/lib/api/route.server';
import { defineHandler } from '@/lib/api/handler.server';
import { storySchema } from '@/lib/reading/schema';
import { deleteStory, updateStory } from '@/lib/reading/stories.server';

/** PATCH/DELETE /api/admin/reading/stories/:id */
export const route = apiRoute('/api/admin/reading/stories/$id', {
  PATCH: defineHandler(
    { auth: 'admin', rateLimit: 'write', body: storySchema },
    async ({ params, body }) => {
      const story = await updateStory(params.id, body);
      if (!story) return Response.json({ error: 'Not found' }, { status: 404 });
      return Response.json({ story });
    },
  ),
  DELETE: defineHandler({ auth: 'admin', rateLimit: 'write' }, async ({ params }) => {
    const ok = await deleteStory(params.id);
    if (!ok) return Response.json({ error: 'Not found' }, { status: 404 });
    return Response.json({ ok: true });
  }),
});
