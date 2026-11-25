import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { refusalBody } from '@/lib/errors/codes';
import { followStoryApi, storyFollowStateApi, unfollowStoryApi } from '@/lib/reading/stories.contract';
import { followStory, isFollowingStory, unfollowStory } from '@/lib/reading/stories.server';

/** Follow or unfollow a news story, and read whether you do (s13-12). PUT and DELETE are idempotent. */
export const route = apiRoute('/api/news/stories/$slug/follow', {
  GET: implement(storyFollowStateApi, { rateLimit: 'read' }, async ({ userId, params }) => ({
    following: await isFollowingStory(userId, params.slug ?? ''),
  })),
  PUT: implement(followStoryApi, { rateLimit: 'write' }, async ({ userId, params }) => {
    const result = await followStory(userId, params.slug ?? '');
    if (result.ok) return { following: true };
    if (result.code === 'NEWS_STORY_FOLLOW_LIMIT')
      return Response.json(refusalBody('NEWS_STORY_FOLLOW_LIMIT', { max: result.max }), { status: 409 });
    return Response.json(refusalBody('NOT_FOUND'), { status: 404 });
  }),
  DELETE: implement(unfollowStoryApi, { rateLimit: 'write' }, async ({ userId, params }) => {
    await unfollowStory(userId, params.slug ?? '');
    return { following: false };
  }),
});
