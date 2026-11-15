import { apiRoute } from '@/lib/api/route.server';
import { defineHandler } from '@/lib/api/handler.server';
import { getProfile, listProgress, saveProfile } from '@/lib/rmhmusic/learn/progress.server';
import { profileSchema } from '@/lib/rmhmusic/learn/schemas';

/**
 * `/api/rmhmusic/learn/profile` — the learner's instrument, input and goal
 * (GET also returns their lesson progress). GET never creates a row.
 */
export const route = apiRoute('/api/rmhmusic/learn/profile', {
  GET: defineHandler({ rateLimit: 'read' }, async ({ userId }) => {
    const [profile, progress] = await Promise.all([getProfile(userId), listProgress(userId)]);
    return Response.json({ profile, progress });
  }),

  PUT: defineHandler({ rateLimit: 'write', body: profileSchema }, async ({ userId, body }) =>
    Response.json({ profile: await saveProfile(userId, body) }),
  ),
});
