/** Contracts for the news stories index and following a story (s13-12). Client-safe: types only. */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { StoryIndexRow } from '@/lib/reading/stories-index';
import type { storiesQuery } from '@/lib/reading/stories-schema';

export type { StoryIndexRow };

/** Stories with at least one published article, newest first, 30 a page. */
export const listStoriesApi = endpoint<{
  query: z.infer<typeof storiesQuery>;
  res: { stories: StoryIndexRow[]; nextCursor: string | null };
}>()({
  method: 'GET',
  path: '/api/news/stories',
});

/** Whether the signed-in member follows the story. */
export const storyFollowStateApi = endpoint<{ res: { following: boolean } }>()({
  method: 'GET',
  path: '/api/news/stories/$slug/follow',
});

/** Follow a story. Idempotent. */
export const followStoryApi = endpoint<{ res: { following: boolean } }>()({
  method: 'PUT',
  path: '/api/news/stories/$slug/follow',
});

/** Stop following. Idempotent. */
export const unfollowStoryApi = endpoint<{ res: { following: boolean } }>()({
  method: 'DELETE',
  path: '/api/news/stories/$slug/follow',
});
